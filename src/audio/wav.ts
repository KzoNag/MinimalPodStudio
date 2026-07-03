/** AudioBuffer → 16bit PCM WAV */
export async function encodeWav(buffer: AudioBuffer, onProgress?: (v: number) => void): Promise<Blob> {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = numFrames * blockAlign;

  const header = new ArrayBuffer(44);
  const hv = new DataView(header);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) hv.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  hv.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  hv.setUint32(16, 16, true);
  hv.setUint16(20, 1, true); // PCM
  hv.setUint16(22, numCh, true);
  hv.setUint32(24, sampleRate, true);
  hv.setUint32(28, sampleRate * blockAlign, true);
  hv.setUint16(32, blockAlign, true);
  hv.setUint16(34, 16, true);
  writeStr(36, 'data');
  hv.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

  const parts: BlobPart[] = [header];
  const CHUNK_FRAMES = 1_000_000;
  for (let start = 0; start < numFrames; start += CHUNK_FRAMES) {
    const end = Math.min(start + CHUNK_FRAMES, numFrames);
    const chunk = new Int16Array((end - start) * numCh);
    let idx = 0;
    for (let i = start; i < end; i++) {
      for (let c = 0; c < numCh; c++) {
        const v = Math.max(-1, Math.min(1, channels[c][i]));
        chunk[idx++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
    }
    parts.push(chunk.buffer);
    onProgress?.(end / numFrames);
    await new Promise((r) => setTimeout(r, 0));
  }
  return new Blob(parts, { type: 'audio/wav' });
}
