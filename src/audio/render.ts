import { MixState } from '../types';
import { buildGraph, computeTimeline } from './mix';
import { encodeWav } from './wav';

export interface RenderOptions {
  sampleRate?: number;
  channels?: number;
  includeBgm?: boolean;
  onProgress?: (v: number) => void;
}

export async function renderMix(mix: MixState, opts: RenderOptions = {}): Promise<AudioBuffer> {
  const { sampleRate = 44100, channels = 2, includeBgm = true, onProgress } = opts;
  const effective: MixState = includeBgm ? mix : { ...mix, bgm: { ...mix.bgm, enabled: false } };
  const tl = computeTimeline(effective);
  if (tl.total <= 0) throw new Error('書き出す範囲がありません（トリミング設定を確認してください）');
  const length = Math.max(1, Math.ceil(tl.total * sampleRate));
  const ctx = new OfflineAudioContext(channels, length, sampleRate);
  buildGraph(ctx, effective, ctx.destination, 0, 0);

  // OfflineAudioContext は進捗を通知しないので suspend で刻む
  const steps = 40;
  for (let i = 1; i < steps; i++) {
    const t = (tl.total * i) / steps;
    if (t >= tl.total) break;
    ctx
      .suspend(t)
      .then(() => {
        onProgress?.(i / steps);
        void ctx.resume();
      })
      .catch(() => {});
  }
  const rendered = await ctx.startRendering();
  onProgress?.(1);
  return rendered;
}

export function encodeMp3(buffer: AudioBuffer, kbps: number, onProgress?: (v: number) => void): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./mp3.worker.ts', import.meta.url), { type: 'module' });
    const left = buffer.getChannelData(0).slice();
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).slice() : null;
    worker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        onProgress?.(e.data.value);
      } else if (e.data.type === 'done') {
        onProgress?.(1);
        resolve(e.data.blob as Blob);
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      reject(new Error(`MP3エンコードに失敗しました: ${e.message}`));
      worker.terminate();
    };
    const transfer = right ? [left.buffer, right.buffer] : [left.buffer];
    worker.postMessage({ left, right, sampleRate: buffer.sampleRate, kbps }, transfer);
  });
}

export type ExportFormat = 'mp3-192' | 'mp3-128' | 'mp3-96' | 'wav';

export interface ExportProgress {
  phase: 'render' | 'encode';
  value: number; // 0..1
}

export async function exportMix(
  mix: MixState,
  format: ExportFormat,
  onProgress?: (p: ExportProgress) => void,
): Promise<{ blob: Blob; ext: string }> {
  const rendered = await renderMix(mix, {
    onProgress: (v) => onProgress?.({ phase: 'render', value: v }),
  });
  if (format === 'wav') {
    const blob = await encodeWav(rendered, (v) => onProgress?.({ phase: 'encode', value: v }));
    return { blob, ext: 'wav' };
  }
  const kbps = format === 'mp3-192' ? 192 : format === 'mp3-96' ? 96 : 128;
  const blob = await encodeMp3(rendered, kbps, (v) => onProgress?.({ phase: 'encode', value: v }));
  return { blob, ext: 'mp3' };
}

/** 文字起こしAPI送信用: BGMなし・モノラル・低ビットレートMP3（ファイルサイズ最小化） */
export async function exportVoiceForTranscription(
  mix: MixState,
  onProgress?: (p: ExportProgress) => void,
): Promise<Blob> {
  const rendered = await renderMix(mix, {
    channels: 1,
    sampleRate: 22050,
    includeBgm: false,
    onProgress: (v) => onProgress?.({ phase: 'render', value: v }),
  });
  return encodeMp3(rendered, 32, (v) => onProgress?.({ phase: 'encode', value: v }));
}
