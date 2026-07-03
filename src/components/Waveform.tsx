import { useEffect, useRef } from 'react';
import { PEAKS_PER_SEC, Track } from '../types';

const LANE_H = 88;
const LANE_GAP = 6;
const TRACK_COLORS: Record<string, string> = { mic: '#4cc2ff', sys: '#7dd87d' };

const MIN_SPAN_SEC = 2;

interface WaveformProps {
  tracks: Track[];
  duration: number;
  trimStart: number;
  trimEnd: number;
  onTrim: (start: number, end: number) => void;
  view: [number, number];
  onViewChange: (v: [number, number]) => void;
  markers: number[];
  /** 収録タイムライン上の再生位置（表示しない時は null） */
  getPlayhead: () => number | null;
  onSeek: (t: number) => void;
}

export function Waveform(props: WaveformProps) {
  const { tracks, duration, trimStart, trimEnd, onTrim, view, onViewChange, markers, getPlayhead, onSeek } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLDivElement>(null);
  const miniCanvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(0);
  const dragRef = useRef<null | 'start' | 'end'>(null);
  const miniDragRef = useRef(false);

  // props をドラッグ/ホイールハンドラから参照するために ref 化
  const stateRef = useRef({ view, trimStart, trimEnd, duration, onTrim, onSeek, onViewChange });
  stateRef.current = { view, trimStart, trimEnd, duration, onTrim, onSeek, onViewChange };

  const height = tracks.length * LANE_H + Math.max(0, tracks.length - 1) * LANE_GAP;

  const draw = () => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const width = wrap.clientWidth;
    widthRef.current = width;
    if (width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const [vs, ve] = view;
    const span = Math.max(0.001, ve - vs);
    const xOf = (t: number) => ((t - vs) / span) * width;

    tracks.forEach((track, idx) => {
      const laneY = idx * (LANE_H + LANE_GAP);
      ctx.fillStyle = '#10131a';
      ctx.fillRect(0, laneY, width, LANE_H);
      ctx.fillStyle = '#20242e';
      ctx.fillRect(0, laneY + LANE_H / 2, width, 1);

      const peaks = track.peaks;
      const bucketCount = peaks.length / 2;
      const cy = laneY + LANE_H / 2;
      const amp = LANE_H / 2 - 4;
      ctx.fillStyle = TRACK_COLORS[track.id] ?? '#4cc2ff';
      for (let x = 0; x < width; x++) {
        const t0 = vs + (x / width) * span;
        const t1 = vs + ((x + 1) / width) * span;
        let b0 = Math.floor(t0 * PEAKS_PER_SEC);
        let b1 = Math.max(b0 + 1, Math.ceil(t1 * PEAKS_PER_SEC));
        if (b1 <= 0 || b0 >= bucketCount) continue;
        b0 = Math.max(0, b0);
        b1 = Math.min(bucketCount, b1);
        let min = Infinity;
        let max = -Infinity;
        for (let b = b0; b < b1; b++) {
          const lo = peaks[b * 2];
          const hi = peaks[b * 2 + 1];
          if (lo < min) min = lo;
          if (hi > max) max = hi;
        }
        if (min === Infinity) continue;
        const yTop = cy - max * amp;
        const h = Math.max(1, (max - min) * amp);
        ctx.fillRect(x, yTop, 1, h);
      }
    });

    // トリミング範囲外を暗くする
    ctx.fillStyle = 'rgba(4, 6, 9, 0.62)';
    const xs = xOf(trimStart);
    const xe = xOf(trimEnd);
    if (xs > 0) ctx.fillRect(0, 0, Math.min(width, Math.max(0, xs)), height);
    if (xe < width) ctx.fillRect(Math.max(0, xe), 0, width - Math.max(0, xe), height);

    // マーカー
    ctx.fillStyle = '#ffb44c';
    for (const m of markers) {
      const x = xOf(m);
      if (x < 0 || x > width) continue;
      ctx.fillRect(x, 0, 1.5, height);
      ctx.beginPath();
      ctx.moveTo(x - 5, 0);
      ctx.lineTo(x + 6, 0);
      ctx.lineTo(x + 0.5, 8);
      ctx.closePath();
      ctx.fill();
    }
  };

  useEffect(() => {
    draw();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, view, trimStart, trimEnd, markers, height]);

  // ホイール: 縦=ズーム（カーソル位置中心）/ 横=スクロール。preventDefault のため native リスナーで登録
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { view: v, duration: dur, onViewChange: change } = stateRef.current;
      const span = v[1] - v[0];
      const rect = wrap.getBoundingClientRect();
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // 横スクロール（トラックパッド）
        const dt = (e.deltaX / rect.width) * span;
        const vs = Math.max(0, Math.min(dur - span, v[0] + dt));
        change([vs, vs + span]);
      } else {
        // ズーム（マウスホイール / ピンチ）
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const tc = v[0] + ratio * span;
        const factor = Math.exp(e.deltaY * 0.002);
        const minSpan = Math.min(MIN_SPAN_SEC, dur);
        const newSpan = Math.max(minSpan, Math.min(dur, span * factor));
        const vs = Math.max(0, Math.min(dur - newSpan, tc - ratio * newSpan));
        change([vs, vs + newSpan]);
      }
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, []);

  // ミニマップ（全体波形。表示ウィンドウのドラッグで移動）
  const drawMini = () => {
    const canvas = miniCanvasRef.current;
    const mini = miniRef.current;
    if (!canvas || !mini) return;
    const width = mini.clientWidth;
    const h = mini.clientHeight;
    if (width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, h);
    const cy = h / 2;
    const amp = h / 2 - 2;
    tracks.forEach((track) => {
      const peaks = track.peaks;
      const bucketCount = peaks.length / 2;
      ctx.fillStyle = TRACK_COLORS[track.id] ?? '#4cc2ff';
      ctx.globalAlpha = 0.55;
      for (let x = 0; x < width; x++) {
        const b0 = Math.floor((x / width) * duration * PEAKS_PER_SEC);
        const b1 = Math.min(bucketCount, Math.max(b0 + 1, Math.ceil(((x + 1) / width) * duration * PEAKS_PER_SEC)));
        if (b0 >= bucketCount) continue;
        let min = Infinity;
        let max = -Infinity;
        for (let b = b0; b < b1; b++) {
          if (peaks[b * 2] < min) min = peaks[b * 2];
          if (peaks[b * 2 + 1] > max) max = peaks[b * 2 + 1];
        }
        if (min === Infinity) continue;
        ctx.fillRect(x, cy - max * amp, 1, Math.max(1, (max - min) * amp));
      }
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffb44c';
    for (const m of markers) {
      ctx.fillRect((m / duration) * width, 0, 1.5, h);
    }
  };

  useEffect(() => {
    drawMini();
    const mini = miniRef.current;
    if (!mini) return;
    const ro = new ResizeObserver(() => drawMini());
    ro.observe(mini);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, markers, duration]);

  const miniSeek = (e: { clientX: number }) => {
    const mini = miniRef.current;
    if (!mini) return;
    const rect = mini.getBoundingClientRect();
    const { view: v, duration: dur, onViewChange: change } = stateRef.current;
    const span = v[1] - v[0];
    const t = ((e.clientX - rect.left) / rect.width) * dur;
    const vs = Math.max(0, Math.min(dur - span, t - span / 2));
    change([vs, vs + span]);
  };

  // 再生ヘッド（RAFで直接DOM更新）
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = playheadRef.current;
      if (el) {
        const t = getPlayhead();
        const { view: v } = stateRef.current;
        const width = widthRef.current;
        if (t == null || width === 0 || t < v[0] || t > v[1]) {
          el.style.display = 'none';
        } else {
          el.style.display = 'block';
          el.style.left = `${((t - v[0]) / (v[1] - v[0])) * width}px`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getPlayhead]);

  const timeFromEvent = (e: { clientX: number }): number => {
    const wrap = wrapRef.current;
    if (!wrap) return 0;
    const rect = wrap.getBoundingClientRect();
    const { view: v, duration: dur } = stateRef.current;
    const ratio = (e.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(dur, v[0] + ratio * (v[1] - v[0])));
  };

  const handlePointerDown = (which: 'start' | 'end') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = which;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const t = timeFromEvent(e);
    const { trimStart: s, trimEnd: en, onTrim: trim } = stateRef.current;
    if (dragRef.current === 'start') {
      trim(Math.min(t, en - 0.1), en);
    } else {
      trim(s, Math.max(t, s + 0.1));
    }
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const [vs, ve] = view;
  const span = Math.max(0.001, ve - vs);
  const pct = (t: number) => `${((t - vs) / span) * 100}%`;
  const inView = (t: number) => t >= vs && t <= ve;

  return (
    <>
    <div
      ref={wrapRef}
      className="waveform-wrap"
      style={{ height }}
      onPointerDown={(e) => {
        if (dragRef.current) return;
        stateRef.current.onSeek(timeFromEvent(e));
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <canvas ref={canvasRef} />
      {tracks.map((t, i) => (
        <div key={t.id} className="lane-label" style={{ top: i * (LANE_H + LANE_GAP) + 6 }}>
          {t.label}
        </div>
      ))}
      {inView(trimStart) && (
        <div
          className="trim-handle start"
          style={{ left: pct(trimStart) }}
          onPointerDown={handlePointerDown('start')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title="ここから開始"
        />
      )}
      {inView(trimEnd) && (
        <div
          className="trim-handle end"
          style={{ left: pct(trimEnd) }}
          onPointerDown={handlePointerDown('end')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title="ここで終了"
        />
      )}
      <div ref={playheadRef} className="playhead" style={{ display: 'none' }} />
    </div>
    <div
      ref={miniRef}
      className="wave-minimap"
      title="クリック/ドラッグで表示位置を移動"
      onPointerDown={(e) => {
        miniDragRef.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        miniSeek(e);
      }}
      onPointerMove={(e) => {
        if (miniDragRef.current) miniSeek(e);
      }}
      onPointerUp={() => {
        miniDragRef.current = false;
      }}
    >
      <canvas ref={miniCanvasRef} />
      <div
        className="wave-minimap-win"
        style={{ left: `${(vs / duration) * 100}%`, width: `${(span / duration) * 100}%` }}
      />
    </div>
    </>
  );
}
