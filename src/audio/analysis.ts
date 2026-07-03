import { linToDb } from '../types';

/**
 * 有音部分のみの平均RMS（dBFS）を推定する。
 * 無音フレームを除外することで、話していない時間が長くても適正な音量が測れる。
 */
export function activeRmsDb(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const frameLen = Math.floor(buffer.sampleRate * 0.09); // 約90ms
  if (frameLen === 0 || data.length === 0) return -Infinity;
  const gateDb = -50;
  let sumSquares = 0;
  let activeSamples = 0;
  for (let start = 0; start + frameLen <= data.length; start += frameLen) {
    let s = 0;
    for (let i = start; i < start + frameLen; i++) {
      const v = data[i];
      s += v * v;
    }
    const rms = Math.sqrt(s / frameLen);
    if (linToDb(rms) > gateDb) {
      sumSquares += s;
      activeSamples += frameLen;
    }
  }
  if (activeSamples === 0) return -Infinity;
  return linToDb(Math.sqrt(sumSquares / activeSamples));
}

/** 目標ラウドネスに合わせる推奨ゲイン(dB)。無音なら0。 */
export function suggestGainDb(buffer: AudioBuffer, targetDb: number): number {
  const rms = activeRmsDb(buffer);
  if (!isFinite(rms)) return 0;
  const gain = targetDb - rms;
  return Math.round(Math.max(-24, Math.min(24, gain)) * 10) / 10;
}
