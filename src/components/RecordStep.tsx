import { useEffect, useRef, useState } from 'react';
import { DEFAULT_MIC_OPTIONS, MicOptions, RecorderEngine } from '../audio/recorder';
import { SessionMeta, deleteAllSessionsExcept, deleteSession, getRecoverableSession, loadSessionBlobs } from '../db';
import { RecordingResult, formatTime } from '../types';
import { LevelMeter } from './common';

interface RecordStepProps {
  onComplete: (result: RecordingResult) => void;
  onImport: (files: File[]) => void;
}

export function RecordStep({ onComplete, onImport }: RecordStepProps) {
  const engineRef = useRef<RecorderEngine | null>(null);
  if (!engineRef.current) engineRef.current = new RecorderEngine();
  const engine = engineRef.current;

  const [micReady, setMicReady] = useState(false);
  const [sysReady, setSysReady] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [micOpts, setMicOpts] = useState<MicOptions>({ ...DEFAULT_MIC_OPTIONS });
  const [recording, setRecording] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [markerCount, setMarkerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recoverMeta, setRecoverMeta] = useState<SessionMeta | null>(null);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    void getRecoverableSession().then((meta) => {
      if (meta && meta.status === 'recorded' && meta.duration > 3) setRecoverMeta(meta);
      else if (meta && meta.status === 'recording') setRecoverMeta(meta); // クラッシュ復元
    });
    return () => {
      engine.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setElapsed(engine.elapsed), 250);
    return () => window.clearInterval(id);
  }, [recording, engine]);

  const refreshDevices = async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(all.filter((d) => d.kind === 'audioinput'));
  };

  const initMic = async (opts: MicOptions) => {
    setMicBusy(true);
    setError(null);
    try {
      await engine.initMic(opts);
      setMicReady(true);
      await refreshDevices();
    } catch (e) {
      setError(`マイクを取得できませんでした: ${(e as Error).message}`);
      setMicReady(false);
    } finally {
      setMicBusy(false);
    }
  };

  const changeMicOpts = (patch: Partial<MicOptions>) => {
    const next = { ...micOpts, ...patch };
    setMicOpts(next);
    if (micReady && !recording) void initMic(next);
  };

  const initSys = async () => {
    setError(null);
    try {
      engine.onSysEnded = () => {
        setSysReady(false);
        if (!engine.recording) return;
        setError('画面共有が終了したため、相手の音声の録音が停止しました（マイクの録音は継続中です）');
      };
      await engine.initSys();
      setSysReady(true);
    } catch (e) {
      if ((e as Error).name === 'NotAllowedError') return; // ユーザーがキャンセル
      setError((e as Error).message);
      setSysReady(false);
    }
  };

  const startRecording = async () => {
    if (!sysReady) {
      const ok = window.confirm(
        '相手の音声（システム音声）が設定されていません。\nマイクのみで収録を開始しますか？\n\n※Discord等の相手の声も録音する場合は「画面共有で取得」を先に設定してください。',
      );
      if (!ok) return;
    }
    setError(null);
    try {
      await engine.start();
      await deleteAllSessionsExcept(engine.sessionId);
      setRecoverMeta(null);
      setMarkerCount(0);
      setElapsed(0);
      setRecording(true);
    } catch (e) {
      setError(`録音を開始できませんでした: ${(e as Error).message}`);
    }
  };

  const stopRecording = async () => {
    setStopping(true);
    try {
      const result = await engine.stop();
      engine.stopMic();
      engine.stopSys();
      setRecording(false);
      onComplete(result);
    } catch (e) {
      setError(`録音の停止に失敗しました: ${(e as Error).message}`);
      setStopping(false);
    }
  };

  const recover = async () => {
    if (!recoverMeta) return;
    setRecovering(true);
    setError(null);
    try {
      const { mic, sys } = await loadSessionBlobs(recoverMeta.id, recoverMeta.mimeType);
      if (!mic || mic.size === 0) throw new Error('復元可能な音声データが見つかりませんでした');
      onComplete({
        sessionId: recoverMeta.id,
        mic,
        sys: sys && sys.size > 0 ? sys : null,
        duration: recoverMeta.duration || 0,
        markers: recoverMeta.markers ?? [],
      });
    } catch (e) {
      setError(`復元に失敗しました: ${(e as Error).message}`);
      setRecovering(false);
    }
  };

  const discardRecover = async () => {
    if (!recoverMeta) return;
    if (!window.confirm('前回の収録データを削除します。よろしいですか？')) return;
    await deleteSession(recoverMeta.id);
    setRecoverMeta(null);
  };

  return (
    <div>
      {recoverMeta && (
        <div className="recover-banner">
          <span>
            💾 前回の収録データがあります（{new Date(recoverMeta.startedAt).toLocaleString('ja-JP')}
            {recoverMeta.duration ? ` / ${formatTime(recoverMeta.duration)}` : ''}）
          </span>
          <button className="primary" onClick={recover} disabled={recovering}>
            {recovering ? '復元中…' : '復元して編集へ'}
          </button>
          <button className="danger" onClick={discardRecover} disabled={recovering}>
            削除
          </button>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>1. 自分のマイク</h2>
        <p className="card-desc">収録に使うマイクを有効化し、レベルメーターで入力を確認してください。</p>
        <div className="card-row">
          {!micReady ? (
            <button className="primary" onClick={() => initMic(micOpts)} disabled={micBusy}>
              {micBusy ? '取得中…' : '🎙️ マイクを有効化'}
            </button>
          ) : (
            <>
              <span className="status-pill on">● 有効</span>
              <select
                value={micOpts.deviceId ?? ''}
                disabled={recording}
                onChange={(e) => changeMicOpts({ deviceId: e.target.value || null })}
                style={{ maxWidth: 320 }}
              >
                <option value="">既定のマイク</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `マイク (${d.deviceId.slice(0, 6)}…)`}
                  </option>
                ))}
              </select>
            </>
          )}
          <LevelMeter reader={micReady ? engine.micLevel : null} />
        </div>
        {micReady && (
          <div className="card-row hint">
            <label>
              <input
                type="checkbox"
                checked={micOpts.noiseSuppression}
                disabled={recording}
                onChange={(e) => changeMicOpts({ noiseSuppression: e.target.checked })}
              />{' '}
              ノイズ抑制
            </label>
            <label>
              <input
                type="checkbox"
                checked={micOpts.echoCancellation}
                disabled={recording}
                onChange={(e) => changeMicOpts({ echoCancellation: e.target.checked })}
              />{' '}
              エコーキャンセル（スピーカー使用時のみON推奨）
            </label>
            <label>
              <input
                type="checkbox"
                checked={micOpts.autoGainControl}
                disabled={recording}
                onChange={(e) => changeMicOpts({ autoGainControl: e.target.checked })}
              />{' '}
              自動音量調整
            </label>
          </div>
        )}
      </div>

      <div className="card">
        <h2>2. 相手の音声（システム音声）</h2>
        <p className="card-desc">
          Discord などで通話中の相手の声を、画面共有経由で別トラックとして録音します。ソロ収録の場合はスキップできます。
        </p>
        <div className="card-row">
          {!sysReady ? (
            <button onClick={initSys} disabled={recording}>
              🖥️ 画面共有で取得
            </button>
          ) : (
            <>
              <span className="status-pill on">● 取得中</span>
              <button onClick={() => { engine.stopSys(); setSysReady(false); }} disabled={recording}>
                解除
              </button>
            </>
          )}
          <LevelMeter reader={sysReady ? engine.sysLevel : null} />
        </div>
        <div className="hint">
          Chrome のダイアログで「<b>画面全体</b>」を選択し「<b>システム音声も共有</b>」をONにしてください（Discord
          アプリの音声を含めるため）。ブラウザ版 Discord ならそのタブを選んで「タブの音声も共有」でもOKです。
        </div>
        <div className="warn">
          🎧 <b>ヘッドホン/イヤホンの使用を強く推奨。</b>
          スピーカーで再生すると相手の声がマイクに回り込み、二重に録音されます。
        </div>
      </div>

      <div className="card">
        <h2>3. 収録</h2>
        {!recording ? (
          <div className="rec-controls">
            <button className="record" onClick={startRecording} disabled={!micReady || stopping}>
              ● 収録開始
            </button>
            {!micReady && <span className="hint">先にマイクを有効化してください</span>}
          </div>
        ) : (
          <>
            <div className="rec-controls">
              <span className="rec-timer">
                <span className="rec-dot" />
                {formatTime(elapsed)}
              </span>
              <button
                className="big"
                onClick={() => {
                  engine.addMarker();
                  setMarkerCount(engine.markers.length);
                }}
                title="あとで編集時に位置がわかるように印を付けます"
              >
                🚩 マーカー {markerCount > 0 ? `(${markerCount})` : ''}
              </button>
              <button className="record" onClick={stopRecording} disabled={stopping}>
                {stopping ? '処理中…' : '■ 収録終了'}
              </button>
            </div>
            <div className="card-row">
              <span className="device-label">マイク</span>
              <LevelMeter reader={engine.micLevel} />
            </div>
            {sysReady && (
              <div className="card-row">
                <span className="device-label">相手の音声</span>
                <LevelMeter reader={engine.sysLevel} />
              </div>
            )}
            <div className="hint">録音データは1秒ごとにブラウザ内(IndexedDB)へ自動保存されます。万一クラッシュしても復元できます。</div>
          </>
        )}
      </div>

      <div className="card">
        <h2>収録せずに編集する（ファイル読み込み）</h2>
        <p className="card-desc">
          別のツールで録音済みの音声ファイルを読み込んで、トリミング・音量調整・BGM・書き出しだけ行うこともできます。
          2ファイル選ぶと別トラック（自分/相手など）として音量バランスを個別に調整できます。
        </p>
        <div className="card-row">
          <input
            type="file"
            accept="audio/*"
            multiple
            id="import-audio-input"
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length > 0) onImport(files);
            }}
          />
          <button onClick={() => document.getElementById('import-audio-input')?.click()} disabled={recording}>
            📂 音声ファイルを読み込んで編集へ
          </button>
          <span className="hint">対応形式: MP3 / WAV / M4A / WebM など（最大2ファイル）</span>
        </div>
      </div>
    </div>
  );
}
