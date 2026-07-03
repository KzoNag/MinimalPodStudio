import { MixState } from '../types';
import { getAudioContext } from './decode';
import { buildGraph, computeTimeline } from './mix';

export class PreviewPlayer {
  private sources: AudioBufferSourceNode[] = [];
  private startCtxTime = 0;
  private startOffset = 0;
  playing = false;
  onEnded: (() => void) | null = null;
  private rafId = 0;
  private total = 0;

  play(mix: MixState, offset: number): void {
    this.stop();
    const ctx = getAudioContext();
    const tl = computeTimeline(mix);
    this.total = tl.total;
    if (offset >= tl.total) offset = 0;
    const startAt = ctx.currentTime + 0.05;
    const graph = buildGraph(ctx, mix, ctx.destination, startAt, offset);
    this.sources = graph.sources;
    this.startCtxTime = startAt;
    this.startOffset = offset;
    this.playing = true;
    const tick = () => {
      if (!this.playing) return;
      if (this.position >= this.total) {
        this.stop();
        this.onEnded?.();
        return;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  get position(): number {
    if (!this.playing) return this.startOffset;
    const ctx = getAudioContext();
    return Math.min(this.total, this.startOffset + Math.max(0, ctx.currentTime - this.startCtxTime));
  }

  /** 停止し、現在位置を保持する（pause相当） */
  pause(): number {
    const pos = this.position;
    this.stopSources();
    this.playing = false;
    this.startOffset = pos;
    return pos;
  }

  stop(): void {
    this.stopSources();
    this.playing = false;
  }

  seek(offset: number): void {
    this.startOffset = Math.max(0, offset);
  }

  private stopSources(): void {
    cancelAnimationFrame(this.rafId);
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* 既に停止済み */
      }
      s.disconnect();
    }
    this.sources = [];
  }
}
