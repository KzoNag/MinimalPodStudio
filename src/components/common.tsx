import { useEffect, useRef } from 'react';
import { LevelReader } from '../audio/recorder';
import { linToDb } from '../types';

/** 音量レベルメーター（RAFで直接DOMを更新） */
export function LevelMeter({ reader }: { reader: LevelReader | null }) {
  const fillRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef<HTMLDivElement>(null);
  const peakHold = useRef(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const fill = fillRef.current;
      const peakEl = peakRef.current;
      if (fill && peakEl) {
        if (reader) {
          const { rms, peak } = reader.read();
          const rmsDb = linToDb(rms);
          const ratio = Math.max(0, Math.min(1, (rmsDb + 60) / 60));
          fill.style.transform = `scaleX(${ratio})`;
          peakHold.current = Math.max(peakHold.current * 0.97, peak);
          const peakDb = linToDb(peakHold.current);
          const peakRatio = Math.max(0, Math.min(1, (peakDb + 60) / 60));
          peakEl.style.left = `${peakRatio * 100}%`;
          peakEl.style.opacity = peakRatio > 0.01 ? '0.85' : '0';
        } else {
          fill.style.transform = 'scaleX(0)';
          peakEl.style.opacity = '0';
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reader]);

  return (
    <div className="meter">
      <div className="fill" ref={fillRef} />
      <div className="peak-mark" ref={peakRef} />
    </div>
  );
}

export function LabeledSlider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  extra?: React.ReactNode;
}) {
  const { label, value, min, max, step, unit = '', onChange, extra } = props;
  return (
    <div className="slider-row">
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider-value">
        {value > 0 && unit === 'dB' ? '+' : ''}
        {value}
        {unit}
      </span>
      {extra ?? <span />}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress">
      <div className="bar" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export function BusyOverlay({ message }: { message: string }) {
  return (
    <div className="overlay">
      <div className="overlay-box">
        <div className="spinner" />
        <div>{message}</div>
      </div>
    </div>
  );
}
