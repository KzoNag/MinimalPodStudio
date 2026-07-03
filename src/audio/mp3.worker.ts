/// <reference lib="webworker" />
import * as lamejs from '@breezystack/lamejs';

interface EncodeRequest {
  left: Float32Array;
  right: Float32Array | null;
  sampleRate: number;
  kbps: number;
}

function floatToInt16(src: Float32Array, dst: Int16Array, offset: number, len: number): void {
  for (let i = 0; i < len; i++) {
    const v = Math.max(-1, Math.min(1, src[offset + i]));
    dst[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
}

self.onmessage = (e: MessageEvent<EncodeRequest>) => {
  const { left, right, sampleRate, kbps } = e.data;
  const channels = right ? 2 : 1;
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
  const BLOCK = 1152 * 32;
  const l16 = new Int16Array(BLOCK);
  const r16 = right ? new Int16Array(BLOCK) : null;
  const parts: Uint8Array[] = [];
  const total = left.length;
  let lastReport = 0;

  for (let offset = 0; offset < total; offset += BLOCK) {
    const len = Math.min(BLOCK, total - offset);
    floatToInt16(left, l16, offset, len);
    let out: Uint8Array | Int8Array;
    if (right && r16) {
      floatToInt16(right, r16, offset, len);
      out = encoder.encodeBuffer(l16.subarray(0, len), r16.subarray(0, len));
    } else {
      out = encoder.encodeBuffer(l16.subarray(0, len));
    }
    if (out.length > 0) parts.push(new Uint8Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)));
    const progress = (offset + len) / total;
    if (progress - lastReport >= 0.02) {
      lastReport = progress;
      (self as unknown as Worker).postMessage({ type: 'progress', value: progress });
    }
  }
  const tail = encoder.flush();
  if (tail.length > 0) parts.push(new Uint8Array(tail.buffer.slice(tail.byteOffset, tail.byteOffset + tail.byteLength)));

  const blob = new Blob(parts as BlobPart[], { type: 'audio/mpeg' });
  (self as unknown as Worker).postMessage({ type: 'done', blob });
};
