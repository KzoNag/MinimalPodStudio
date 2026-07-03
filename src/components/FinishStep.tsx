import { useEffect, useRef, useState } from 'react';
import { computeTimeline } from '../audio/mix';
import { ExportFormat, ExportProgress, exportMix, exportVoiceForTranscription } from '../audio/render';
import { getProvider } from '../llm';
import { AppSettings, MixState, formatBytes, formatTime } from '../types';
import { ProgressBar } from './common';

interface FinishStepProps {
  mix: MixState;
  settings: AppSettings;
  onFinish: () => void;
}

const SPOTIFY_WIZARD_URL = 'https://creators.spotify.com/pod/dashboard/episodes/wizard';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export function FinishStep({ mix, settings, onFinish }: FinishStepProps) {
  const tl = computeTimeline(mix);
  const provider = getProvider(settings);

  // --- 書き出し ---
  const [format, setFormat] = useState<ExportFormat>('mp3-128');
  const [fileName, setFileName] = useState(`episode-${todayStr()}`);
  const [exporting, setExporting] = useState<ExportProgress | null>(null);
  const [exportResult, setExportResult] = useState<{ url: string; size: number; name: string } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const runExport = async () => {
    setExportError(null);
    setExporting({ phase: 'render', value: 0 });
    try {
      const { blob, ext } = await exportMix(mix, format, (p) => setExporting({ ...p }));
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setExportResult({ url, size: blob.size, name: `${fileName || 'episode'}.${ext}` });
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  // --- 文字起こし ---
  const [transcribeStatus, setTranscribeStatus] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  const runTranscribe = async () => {
    setTranscribeError(null);
    setTranscribeStatus('準備中…');
    try {
      let audio: Blob = new Blob();
      if (provider.id !== 'mock') {
        setTranscribeStatus('音声を書き出し中…（API送信用にBGMなし・低ビットレートで生成）');
        audio = await exportVoiceForTranscription(mix, (p) =>
          setTranscribeStatus(
            p.phase === 'render'
              ? `音声をレンダリング中… ${Math.round(p.value * 100)}%`
              : `音声を圧縮中… ${Math.round(p.value * 100)}%`,
          ),
        );
      }
      const text = await provider.transcribe(audio, (msg) => setTranscribeStatus(msg));
      setTranscript(text);
    } catch (e) {
      setTranscribeError((e as Error).message);
    } finally {
      setTranscribeStatus(null);
    }
  };

  // --- 説明文生成 ---
  const [template, setTemplate] = useState(settings.template);
  const [titleTemplate, setTitleTemplate] = useState(settings.titleTemplate);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const runGenerate = async () => {
    setGenerateError(null);
    setGenerating(true);
    try {
      const result = await provider.generateDescription(transcript, {
        title: titleTemplate,
        description: template,
      });
      setTitle(result.title);
      setDescription(result.description);
    } catch (e) {
      setGenerateError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div>
      <div className="card">
        <h2>音声の書き出し</h2>
        <p className="card-desc">
          完成尺 {formatTime(tl.total)}。ミックス（音量調整・トリミング・BGMダッキング）を適用した完成音源を書き出します。
        </p>
        <div className="card-row">
          <input
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            style={{ width: 240 }}
            placeholder="ファイル名"
          />
          <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            <option value="mp3-128">MP3 128kbps（推奨）</option>
            <option value="mp3-192">MP3 192kbps（高音質）</option>
            <option value="mp3-96">MP3 96kbps（軽量）</option>
            <option value="wav">WAV 16bit（無圧縮・大容量）</option>
          </select>
          <button className="primary" onClick={runExport} disabled={!!exporting}>
            {exporting ? '書き出し中…' : '📦 書き出す'}
          </button>
        </div>
        {exporting && (
          <div className="card-row">
            <span className="hint" style={{ minWidth: 110 }}>
              {exporting.phase === 'render' ? 'ミックス処理中' : 'エンコード中'}
            </span>
            <ProgressBar value={exporting.value} />
            <span className="hint">{Math.round(exporting.value * 100)}%</span>
          </div>
        )}
        {exportError && <div className="error-banner">{exportError}</div>}
        {exportResult && (
          <div className="ok-banner">
            ✅ 書き出し完了（{formatBytes(exportResult.size)}） —{' '}
            <a className="dl-button" href={exportResult.url} download={exportResult.name}>
              ⬇ {exportResult.name} をダウンロード
            </a>
          </div>
        )}
      </div>

      <div className="card">
        <h2>文字起こし</h2>
        <p className="card-desc">
          使用プロバイダ: <b>{provider.label}</b>（設定画面で変更できます）
        </p>
        <div className="card-row">
          <button className="primary" onClick={runTranscribe} disabled={!!transcribeStatus}>
            {transcribeStatus ? '実行中…' : '📝 文字起こしを実行'}
          </button>
          {transcribeStatus && <span className="hint">{transcribeStatus}</span>}
        </div>
        {transcribeError && <div className="error-banner">{transcribeError}</div>}
        {transcript && (
          <>
            <textarea
              rows={10}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="文字起こし結果"
            />
            <div className="card-row">
              <span className="hint">{transcript.length.toLocaleString()} 文字（編集可能）</span>
              <button onClick={() => copy('transcript', transcript)}>コピー</button>
              {copied === 'transcript' && <span className="copy-feedback">✓ コピーしました</span>}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>エピソード説明文</h2>
        <p className="card-desc">
          文字起こしを元に、タイトルと説明文を生成します。説明文はテンプレートを雛形として全体が生成されます。
        </p>
        <details className="template-box">
          <summary>テンプレートを編集（このエピソードのみ。既定は設定画面で変更）</summary>
          <div className="form-row">
            <label>タイトルテンプレート（{'{title}'} が生成タイトルに置き換わります。例:「【番組名】{'{title}'} #12」）</label>
            <input
              type="text"
              value={titleTemplate}
              onChange={(e) => setTitleTemplate(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-row">
            <label>説明文テンプレート（この雛形に沿って説明文全体が生成されます。穴埋めや書き方の指示もOK）</label>
            <textarea rows={8} value={template} onChange={(e) => setTemplate(e.target.value)} />
          </div>
        </details>
        <div className="card-row">
          <button className="primary" onClick={runGenerate} disabled={generating || !transcript}>
            {generating ? '生成中…' : '✨ 説明文を生成'}
          </button>
          {!transcript && <span className="hint">先に文字起こしを実行してください</span>}
        </div>
        {generateError && <div className="error-banner">{generateError}</div>}
        {(title || description) && (
          <>
            <div className="form-row">
              <label>タイトル</label>
              <div className="card-row" style={{ margin: 0 }}>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1 }} />
                <button onClick={() => copy('title', title)}>コピー</button>
                {copied === 'title' && <span className="copy-feedback">✓</span>}
              </div>
            </div>
            <div className="form-row">
              <label>説明文</label>
              <textarea rows={10} value={description} onChange={(e) => setDescription(e.target.value)} />
              <div className="card-row">
                <button onClick={() => copy('description', description)}>コピー</button>
                {copied === 'description' && <span className="copy-feedback">✓ コピーしました</span>}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Spotify へ投稿</h2>
        <p className="card-desc">
          Spotify（旧 Spotify for
          Podcasters）にはエピソードを自動投稿できる公開APIがないため、書き出した音声をアップロードして投稿します。
        </p>
        <ol className="publish-steps">
          <li>上の「音声の書き出し」からMP3をダウンロード</li>
          <li>タイトルと説明文をコピー</li>
          <li>Spotify for Creators の新規エピソード画面で音声をアップロードし、貼り付けて公開</li>
        </ol>
        <div className="card-row">
          <button className="primary" onClick={() => window.open(SPOTIFY_WIZARD_URL, '_blank')}>
            🎧 Spotify for Creators を開く
          </button>
          {title && <button onClick={() => copy('title', title)}>タイトルをコピー</button>}
          {description && <button onClick={() => copy('description', description)}>説明文をコピー</button>}
        </div>
      </div>

      <div className="card">
        <h2>完了</h2>
        <p className="card-desc">
          投稿が終わったらセッションを完了します。ブラウザ内に保存された収録データ（IndexedDB）を削除します。
        </p>
        <button
          className="danger"
          onClick={() => {
            if (window.confirm('収録データを削除して最初の画面に戻ります。よろしいですか？\n（書き出したファイルは残ります）')) {
              onFinish();
            }
          }}
        >
          🗑 セッションを完了して削除
        </button>
      </div>
    </div>
  );
}
