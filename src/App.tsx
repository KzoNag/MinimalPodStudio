import { useEffect, useState } from 'react';
import { suggestGainDb } from './audio/analysis';
import { computePeaks, decodeBlob, getAudioContext, toMono } from './audio/decode';
import { BusyOverlay } from './components/common';
import { EditStep } from './components/EditStep';
import { FinishStep } from './components/FinishStep';
import { RecordStep } from './components/RecordStep';
import { SettingsModal } from './components/SettingsModal';
import { deleteSession } from './db';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  MixState,
  RecordingResult,
  Track,
  TrackId,
  VOICE_TARGET_DB,
  defaultBgm,
} from './types';

const SETTINGS_KEY = 'podcast-studio-settings';

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* 破損時は既定値 */
  }
  return { ...DEFAULT_SETTINGS };
}

const STEPS = ['収録', '編集', '仕上げ・投稿'] as const;

export default function App() {
  const [step, setStep] = useState(0);
  const [mix, setMixState] = useState<MixState | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const setMix = (updater: (m: MixState) => MixState) => {
    setMixState((m) => (m ? updater(m) : m));
  };

  const handleRecordingComplete = async (result: RecordingResult) => {
    try {
      const tracks: Track[] = [];

      setBusy('マイク音声をデコード中…（長い収録は少し時間がかかります）');
      const micBuffer = await toMono(await decodeBlob(result.mic));
      setBusy('マイク音声を解析中…');
      tracks.push({
        id: 'mic',
        label: '自分の声（マイク）',
        buffer: micBuffer,
        peaks: await computePeaks(micBuffer),
        suggestedGainDb: suggestGainDb(micBuffer, VOICE_TARGET_DB),
        gainDb: suggestGainDb(micBuffer, VOICE_TARGET_DB),
      });

      if (result.sys) {
        setBusy('相手の音声をデコード中…');
        const sysBuffer = await toMono(await decodeBlob(result.sys));
        setBusy('相手の音声を解析中…');
        tracks.push({
          id: 'sys',
          label: '相手の音声',
          buffer: sysBuffer,
          peaks: await computePeaks(sysBuffer),
          suggestedGainDb: suggestGainDb(sysBuffer, VOICE_TARGET_DB),
          gainDb: suggestGainDb(sysBuffer, VOICE_TARGET_DB),
        });
      }

      const duration = Math.max(...tracks.map((t) => t.buffer.duration));
      setMixState({
        tracks,
        duration,
        trimStart: 0,
        trimEnd: duration,
        bgm: defaultBgm(),
        markers: result.markers,
      });
      setSessionId(result.sessionId);
      setStep(1);
    } catch (e) {
      alert(`録音データの読み込みに失敗しました: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  // 録音済みの音声ファイルを読み込んで編集から始める（1〜2トラック）
  const loadFromFiles = async (files: File[]) => {
    const picked = files.slice(0, 2);
    if (picked.length === 0) return;
    if (files.length > 2) alert('読み込めるのは2ファイルまでです。最初の2つを使用します。');
    try {
      const tracks: Track[] = [];
      const ids: TrackId[] = ['mic', 'sys'];
      for (let i = 0; i < picked.length; i++) {
        const file = picked[i];
        setBusy(`${file.name} をデコード中…`);
        const buffer = await toMono(await decodeBlob(file));
        setBusy(`${file.name} を解析中…`);
        const gain = suggestGainDb(buffer, VOICE_TARGET_DB);
        tracks.push({
          id: ids[i],
          label: file.name.replace(/\.[^.]+$/, ''),
          buffer,
          peaks: await computePeaks(buffer),
          suggestedGainDb: gain,
          gainDb: gain,
        });
      }
      const duration = Math.max(...tracks.map((t) => t.buffer.duration));
      setMixState({
        tracks,
        duration,
        trimStart: 0,
        trimEnd: duration,
        bgm: defaultBgm(),
        markers: [],
      });
      setSessionId(null);
      setStep(1);
    } catch (e) {
      alert(`音声ファイルの読み込みに失敗しました: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  // 動作確認用のデモデータ（合成音声2トラック + 合成BGM）
  const loadDemo = async () => {
    setBusy('デモデータを生成中…');
    try {
      const ctx = getAudioContext();
      const sr = ctx.sampleRate;
      const dur = 90;

      const makeVoice = (freq: number, seed: number) => {
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        let phase = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const talking = Math.sin(t * 0.5 + seed) > -0.2 && Math.sin(t * 1.7 + seed * 2) > -0.5;
          phase += ((freq + 40 * Math.sin(t * 3 + seed)) / sr) * 2 * Math.PI;
          const env = talking ? 0.3 + 0.15 * Math.sin(t * 13 + seed) : 0.004;
          d[i] = Math.sin(phase) * env * (0.7 + 0.3 * Math.sin(t * 31));
        }
        return buf;
      };

      const makeBgm = () => {
        const loopDur = 8;
        const buf = ctx.createBuffer(2, sr * loopDur, sr);
        for (let c = 0; c < 2; c++) {
          const d = buf.getChannelData(c);
          for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            d[i] =
              0.12 *
              (Math.sin(2 * Math.PI * 220 * t) +
                0.6 * Math.sin(2 * Math.PI * 277.2 * t) +
                0.5 * Math.sin(2 * Math.PI * 329.6 * t)) *
              (0.6 + 0.4 * Math.sin(2 * Math.PI * t / loopDur + c));
          }
        }
        return buf;
      };

      const tracks: Track[] = [];
      for (const [id, label, freq, seed] of [
        ['mic', '自分の声（マイク）', 150, 0],
        ['sys', '相手の音声', 230, 3.7],
      ] as const) {
        const buffer = makeVoice(freq, seed);
        tracks.push({
          id,
          label,
          buffer,
          peaks: await computePeaks(buffer),
          suggestedGainDb: suggestGainDb(buffer, VOICE_TARGET_DB),
          gainDb: suggestGainDb(buffer, VOICE_TARGET_DB),
        });
      }
      const bgmBuffer = makeBgm();
      setMixState({
        tracks,
        duration: dur,
        trimStart: 2,
        trimEnd: dur - 2,
        bgm: {
          ...defaultBgm(),
          enabled: true,
          buffer: bgmBuffer,
          fileName: 'デモBGM（合成）',
          gainDb: suggestGainDb(bgmBuffer, VOICE_TARGET_DB - 1),
          suggestedGainDb: suggestGainDb(bgmBuffer, VOICE_TARGET_DB - 1),
        },
        markers: [15, 42],
      });
      setSessionId(null);
      setStep(1);
    } finally {
      setBusy(null);
    }
  };

  const handleFinish = () => {
    if (sessionId) void deleteSession(sessionId);
    setMixState(null);
    setSessionId(null);
    setStep(0);
  };

  const canGo = (i: number) => i === 0 || mix !== null;

  return (
    <>
      <header className="app-header">
        <div className="app-title">
          <span className="mic-emoji">🎙️</span>Minimal Pod Studio
        </div>
        <button onClick={() => setShowSettings(true)}>⚙️ 設定</button>
      </header>

      <nav className="steps">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={[
              'step-chip',
              i === step ? 'active' : '',
              i < step ? 'done' : '',
              canGo(i) && i !== step ? 'clickable' : '',
            ].join(' ')}
            onClick={() => {
              if (canGo(i)) setStep(i);
            }}
          >
            <span className="num">{i < step ? '✓' : i + 1}</span>
            {label}
          </div>
        ))}
      </nav>

      {step === 0 && (
        <>
          <RecordStep onComplete={handleRecordingComplete} onImport={loadFromFiles} />
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button className="hint" style={{ border: 'none', background: 'none' }} onClick={loadDemo}>
              🔧 デモデータで編集画面を試す（動作確認用）
            </button>
          </div>
        </>
      )}
      {step === 1 && mix && <EditStep mix={mix} setMix={setMix} onNext={() => setStep(2)} />}
      {step === 2 && mix && <FinishStep mix={mix} settings={settings} onFinish={handleFinish} />}

      {showSettings && (
        <SettingsModal settings={settings} onSave={setSettings} onClose={() => setShowSettings(false)} />
      )}
      {busy && <BusyOverlay message={busy} />}
    </>
  );
}
