import { BgmSettings, MixState, Timeline, dbToLin } from '../types';

export function computeTimeline(mix: MixState): Timeline {
  const voiceDur = Math.max(0, mix.trimEnd - mix.trimStart);
  if (!mix.bgm.enabled || !mix.bgm.buffer) {
    return { voiceStart: 0, voiceDur, total: voiceDur };
  }
  return {
    voiceStart: mix.bgm.introSec,
    voiceDur,
    total: mix.bgm.introSec + voiceDur + mix.bgm.outroSec,
  };
}

interface EnvPoint {
  t: number;
  v: number;
}

/**
 * BGMのゲインエンベロープ（最終タイムライン秒 → 線形ゲイン）
 *  - 0〜intro: フル音量
 *  - 本編開始直前にダッキング（本編開始時点で下がりきる）
 *  - 本編終了後に復帰、アウトロを維持、最後にフェードアウト
 */
export function bgmEnvelope(bgm: BgmSettings, tl: Timeline): EnvPoint[] {
  const base = dbToLin(bgm.gainDb);
  const duck = dbToLin(bgm.gainDb + bgm.duckDb);
  const voiceEnd = tl.voiceStart + tl.voiceDur;
  const pts: EnvPoint[] = [
    { t: 0, v: 0 },
    { t: 0.03, v: base }, // クリックノイズ防止の極短フェードイン
    { t: tl.voiceStart - bgm.duckFadeSec, v: base },
    { t: tl.voiceStart, v: duck },
    { t: voiceEnd, v: duck },
    { t: voiceEnd + bgm.duckFadeSec, v: base },
    { t: tl.total - bgm.fadeOutSec, v: base },
    { t: tl.total, v: 0 },
  ];
  // 設定次第で時刻が前後し得るので単調増加に矯正
  let prev = 0;
  for (const p of pts) {
    if (p.t < prev) p.t = prev;
    prev = p.t;
  }
  return pts;
}

export function evalEnvelope(pts: EnvPoint[], t: number): number {
  if (pts.length === 0) return 0;
  if (t <= pts[0].t) return pts[0].v;
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].t) {
      const a = pts[i - 1];
      const b = pts[i];
      if (b.t === a.t) return b.v;
      const r = (t - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * r;
    }
  }
  return pts[pts.length - 1].v;
}

function applyEnvelope(param: AudioParam, pts: EnvPoint[], ctxStart: number, offset: number): void {
  param.cancelScheduledValues(0);
  param.setValueAtTime(evalEnvelope(pts, offset), ctxStart);
  for (const p of pts) {
    if (p.t <= offset) continue;
    param.linearRampToValueAtTime(p.v, ctxStart + (p.t - offset));
  }
}

export interface BuiltGraph {
  sources: AudioBufferSourceNode[];
  total: number;
}

/**
 * プレビュー(AudioContext)とレンダリング(OfflineAudioContext)で共用するミックスグラフ。
 * @param ctxStart グラフを開始するコンテキスト時刻
 * @param offset   最終タイムライン上の再生開始位置（秒）
 */
export function buildGraph(
  ctx: BaseAudioContext,
  mix: MixState,
  destination: AudioNode,
  ctxStart: number,
  offset: number,
): BuiltGraph {
  const tl = computeTimeline(mix);
  const sources: AudioBufferSourceNode[] = [];

  // マスターリミッター（クリップ防止）
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 1;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(destination);

  // 音声トラック
  for (const track of mix.tracks) {
    const delayUntilVoice = tl.voiceStart - offset; // 負なら本編の途中から再生
    const skipIntoVoice = Math.max(0, -delayUntilVoice);
    const dur = tl.voiceDur - skipIntoVoice;
    if (dur <= 0) continue;
    const bufOffset = mix.trimStart + skipIntoVoice;
    if (bufOffset >= track.buffer.duration) continue;

    const src = ctx.createBufferSource();
    src.buffer = track.buffer;
    const gain = ctx.createGain();
    gain.gain.value = dbToLin(track.gainDb);
    src.connect(gain);
    gain.connect(limiter);
    src.start(ctxStart + Math.max(0, delayUntilVoice), bufOffset, dur);
    sources.push(src);
  }

  // BGM（ループ + ダッキングエンベロープ）
  if (mix.bgm.enabled && mix.bgm.buffer && offset < tl.total) {
    const src = ctx.createBufferSource();
    src.buffer = mix.bgm.buffer;
    src.loop = true;
    const gain = ctx.createGain();
    applyEnvelope(gain.gain, bgmEnvelope(mix.bgm, tl), ctxStart, offset);
    src.connect(gain);
    gain.connect(limiter);
    src.start(ctxStart, offset % mix.bgm.buffer.duration);
    src.stop(ctxStart + (tl.total - offset));
    sources.push(src);
  }

  return { sources, total: tl.total };
}
