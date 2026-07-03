import { PEAKS_PER_SEC } from '../types';

let sharedCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext();
  if (sharedCtx.state === 'suspended') void sharedCtx.resume();
  return sharedCtx;
}

/** UIをブロックしないため定期的にイベントループへ処理を返す */
async function yieldToUi(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const arr = await blob.arrayBuffer();
  return ctx.decodeAudioData(arr);
}

/** 複数チャンネルをモノラルにミックスダウンする（メモリ節約のため音声トラックはモノラル運用） */
export async function toMono(buffer: AudioBuffer): Promise<AudioBuffer> {
  if (buffer.numberOfChannels === 1) return buffer;
  const ctx = getAudioContext();
  const out = ctx.createBuffer(1, buffer.length, buffer.sampleRate);
  const dst = out.getChannelData(0);
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  const inv = 1 / channels.length;
  const CHUNK = 4_000_000;
  for (let start = 0; start < buffer.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, buffer.length);
    for (let i = start; i < end; i++) {
      let s = 0;
      for (const ch of channels) s += ch[i];
      dst[i] = s * inv;
    }
    if (end < buffer.length) await yieldToUi();
  }
  return out;
}

/** 波形描画用の min/max ピーク列（PEAKS_PER_SEC バケット/秒） */
export async function computePeaks(buffer: AudioBuffer): Promise<Float32Array> {
  const data = buffer.getChannelData(0);
  const samplesPerBucket = Math.max(1, Math.floor(buffer.sampleRate / PEAKS_PER_SEC));
  const buckets = Math.ceil(data.length / samplesPerBucket);
  const peaks = new Float32Array(buckets * 2);
  const CHUNK_BUCKETS = 20000;
  for (let b0 = 0; b0 < buckets; b0 += CHUNK_BUCKETS) {
    const b1 = Math.min(b0 + CHUNK_BUCKETS, buckets);
    for (let b = b0; b < b1; b++) {
      const start = b * samplesPerBucket;
      const end = Math.min(start + samplesPerBucket, data.length);
      let min = Infinity;
      let max = -Infinity;
      for (let i = start; i < end; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      peaks[b * 2] = min === Infinity ? 0 : min;
      peaks[b * 2 + 1] = max === -Infinity ? 0 : max;
    }
    if (b1 < buckets) await yieldToUi();
  }
  return peaks;
}
