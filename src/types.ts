export const PEAKS_PER_SEC = 50;
export const VOICE_TARGET_DB = -19;
export const BGM_TARGET_DB = -20;

export type TrackId = 'mic' | 'sys';

export interface Track {
  id: TrackId;
  label: string;
  buffer: AudioBuffer; // モノラル化済み
  peaks: Float32Array; // [min,max] x PEAKS_PER_SEC/秒
  gainDb: number;
  suggestedGainDb: number;
}

export interface BgmSettings {
  enabled: boolean;
  buffer: AudioBuffer | null; // 元のチャンネル数のまま
  fileName: string;
  gainDb: number; // イントロ/アウトロでのBGM音量
  suggestedGainDb: number;
  introSec: number; // BGMのみで流す秒数
  outroSec: number; // 本編終了後にBGMを維持する秒数
  duckDb: number; // 本編中のBGM音量の下げ幅（負値）
  duckFadeSec: number; // ダッキングのフェード時間
  fadeOutSec: number; // 最後のフェードアウト時間
}

export interface MixState {
  tracks: Track[];
  duration: number; // 収録音声の長さ（最長トラック）
  trimStart: number;
  trimEnd: number;
  bgm: BgmSettings;
  markers: number[]; // 収録中に打ったマーカー（収録タイムライン秒）
}

export interface Timeline {
  voiceStart: number; // 最終タイムライン上で本編が始まる時刻
  voiceDur: number; // トリミング後の本編の長さ
  total: number; // 完成音源の長さ
}

export interface RecordingResult {
  sessionId: string;
  mic: Blob;
  sys: Blob | null;
  duration: number;
  markers: number[];
}

export type LlmProviderId = 'mock' | 'gemini' | 'openai';

export interface AppSettings {
  provider: LlmProviderId;
  geminiKey: string;
  openaiKey: string;
  template: string;
  titleTemplate: string;
}

export const DEFAULT_TEMPLATE = `【今回の内容】
{summary}

【トピック】
{topics}

【出演】
（出演者名をここに）

ご感想・リクエストは #ハッシュタグ でお寄せください！`;

export const DEFAULT_TITLE_TEMPLATE = '{title}';

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'mock',
  geminiKey: '',
  openaiKey: '',
  template: DEFAULT_TEMPLATE,
  titleTemplate: DEFAULT_TITLE_TEMPLATE,
};

export function defaultBgm(): BgmSettings {
  return {
    enabled: false,
    buffer: null,
    fileName: '',
    gainDb: 0,
    suggestedGainDb: 0,
    introSec: 8,
    outroSec: 8,
    duckDb: -12,
    duckFadeSec: 1.5,
    fadeOutSec: 3,
  };
}

export function dbToLin(db: number): number {
  return Math.pow(10, db / 20);
}

export function linToDb(lin: number): number {
  return 20 * Math.log10(Math.max(lin, 1e-8));
}

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
