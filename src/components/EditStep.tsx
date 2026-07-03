import { useEffect, useMemo, useRef, useState } from 'react';
import { suggestGainDb } from '../audio/analysis';
import { decodeBlob } from '../audio/decode';
import { bgmEnvelope, computeTimeline } from '../audio/mix';
import { PreviewPlayer } from '../audio/preview';
import { BGM_TARGET_DB, MixState, dbToLin, formatTime } from '../types';
import { LabeledSlider } from './common';
import { Waveform } from './Waveform';

interface EditStepProps {
  mix: MixState;
  setMix: (updater: (m: MixState) => MixState) => void;
  onNext: () => void;
}

/** 再生位置の時刻表示（RAFで直接更新） */
function TransportTime({ player, total }: { player: PreviewPlayer; total: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (ref.current) {
        ref.current.textContent = `${formatTime(player.position)} / ${formatTime(total)}`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [player, total]);
  return <span className="time" ref={ref} />;
}

/** BGMダッキングの構成図 */
function BgmDiagram({ mix }: { mix: MixState }) {
  const tl = computeTimeline(mix);
  if (!mix.bgm.enabled || !mix.bgm.buffer || tl.total <= 0) return null;
  const pts = bgmEnvelope({ ...mix.bgm, gainDb: 0 }, tl); // 相対形状で描画
  const W = 400;
  const H = 64;
  const maxV = 1;
  const duckV = dbToLin(mix.bgm.duckDb);
  const x = (t: number) => (t / tl.total) * W;
  const y = (v: number) => 6 + (1 - v / maxV) * (H - 22);
  const line = pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const voiceEnd = tl.voiceStart + tl.voiceDur;
  return (
    <svg className="bgm-diagram" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polyline points={line} fill="none" stroke="#b48cff" strokeWidth="2" />
      <rect x={x(tl.voiceStart)} y={H - 12} width={Math.max(1, x(voiceEnd) - x(tl.voiceStart))} height={6} rx={3} fill="#4cc2ff" />
      <text x={4} y={y(1) - 1} fill="#9aa3b2" fontSize="9">BGM 100%</text>
      <text x={4} y={y(duckV) - 2} fill="#9aa3b2" fontSize="9">{`ダッキング ${mix.bgm.duckDb}dB`}</text>
      <text x={x(tl.voiceStart) + 3} y={H - 15} fill="#4cc2ff" fontSize="9">本編</text>
    </svg>
  );
}

export function EditStep({ mix, setMix, onNext }: EditStepProps) {
  const playerRef = useRef<PreviewPlayer | null>(null);
  if (!playerRef.current) playerRef.current = new PreviewPlayer();
  const player = playerRef.current;

  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<[number, number]>([0, mix.duration]);
  const [bgmLoading, setBgmLoading] = useState(false);
  const mixRef = useRef(mix);
  mixRef.current = mix;

  const tl = useMemo(() => computeTimeline(mix), [mix]);

  useEffect(() => {
    player.onEnded = () => setPlaying(false);
    return () => {
      player.stop();
    };
  }, [player]);

  // 再生中にパラメータが変わったら、現在位置から再構築して反映
  const restartTimer = useRef<number>(0);
  useEffect(() => {
    if (!player.playing) return;
    window.clearTimeout(restartTimer.current);
    restartTimer.current = window.setTimeout(() => {
      if (player.playing) player.play(mixRef.current, player.position);
    }, 250);
    return () => window.clearTimeout(restartTimer.current);
  }, [mix, player]);

  const togglePlay = () => {
    if (player.playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play(mix, player.position);
      setPlaying(true);
    }
  };

  const seekFinal = (pos: number) => {
    const p = Math.max(0, Math.min(tl.total, pos));
    if (player.playing) player.play(mixRef.current, p);
    else player.seek(p);
  };

  const recToFinal = (t: number) => tl.voiceStart + (t - mix.trimStart);
  const finalToRec = (p: number) => mix.trimStart + (p - tl.voiceStart);

  const getPlayhead = () => {
    const m = mixRef.current;
    const timeline = computeTimeline(m);
    const pos = player.position;
    const t = m.trimStart + (pos - timeline.voiceStart);
    if (t < m.trimStart - 0.05 || t > m.trimEnd + 0.05) return null;
    return t;
  };

  const setTrim = (start: number, end: number) => {
    setMix((m) => ({
      ...m,
      trimStart: Math.max(0, Math.min(start, m.duration)),
      trimEnd: Math.max(0, Math.min(end, m.duration)),
    }));
  };

  const onBgmFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBgmLoading(true);
    try {
      const buffer = await decodeBlob(file);
      const suggested = suggestGainDb(buffer, BGM_TARGET_DB);
      setMix((m) => ({
        ...m,
        bgm: {
          ...m.bgm,
          enabled: true,
          buffer,
          fileName: file.name,
          gainDb: suggested,
          suggestedGainDb: suggested,
        },
      }));
    } catch (err) {
      alert(`BGMファイルを読み込めませんでした: ${(err as Error).message}`);
    } finally {
      setBgmLoading(false);
    }
  };

  const setViewClamped = (v: [number, number]) => {
    const minSpan = Math.min(2, mix.duration);
    let span = Math.max(minSpan, Math.min(mix.duration, v[1] - v[0]));
    let vs = Math.max(0, Math.min(mix.duration - span, v[0]));
    setView([vs, vs + span]);
  };

  const zoomBy = (factor: number) => {
    const [vs, ve] = view;
    const span = ve - vs;
    const center = (vs + ve) / 2;
    const newSpan = span * factor;
    setViewClamped([center - newSpan / 2, center + newSpan / 2]);
  };

  const zoomButtons = (
    <div className="card-row">
      <button onClick={() => setView([0, mix.duration])}>全体</button>
      <button onClick={() => zoomBy(0.5)} title="ズームイン">🔍＋</button>
      <button onClick={() => zoomBy(2)} title="ズームアウト">🔍−</button>
      <button onClick={() => setViewClamped([mix.trimStart - 5, mix.trimStart + 25])}>冒頭付近</button>
      <button onClick={() => setViewClamped([mix.trimEnd - 25, mix.trimEnd + 5])}>末尾付近</button>
      <span className="hint">
        ホイール/ピンチでズーム・横スクロールで移動。下のミニマップをドラッグしても移動できます
      </span>
    </div>
  );

  return (
    <div>
      <div className="card">
        <h2>波形とトリミング</h2>
        <p className="card-desc">
          最初と最後の不要な部分（準備の雑談、終了後の無音など）をハンドルで切り落とします。
        </p>
        {zoomButtons}
        <Waveform
          tracks={mix.tracks}
          duration={mix.duration}
          trimStart={mix.trimStart}
          trimEnd={mix.trimEnd}
          onTrim={setTrim}
          view={view}
          onViewChange={setViewClamped}
          markers={mix.markers}
          getPlayhead={getPlayhead}
          onSeek={(t) => seekFinal(recToFinal(t))}
        />
        <div className="card-row" style={{ marginTop: 12 }}>
          <label className="hint">
            開始{' '}
            <input
              type="number"
              min={0}
              max={mix.duration}
              step={0.1}
              value={Math.round(mix.trimStart * 10) / 10}
              onChange={(e) => setTrim(Math.min(Number(e.target.value), mix.trimEnd - 0.1), mix.trimEnd)}
              style={{ width: 90 }}
            />{' '}
            秒
          </label>
          <label className="hint">
            終了{' '}
            <input
              type="number"
              min={0}
              max={Math.ceil(mix.duration * 10) / 10}
              step={0.1}
              value={Math.round(mix.trimEnd * 10) / 10}
              onChange={(e) => setTrim(mix.trimStart, Math.max(Number(e.target.value), mix.trimStart + 0.1))}
              style={{ width: 90 }}
            />{' '}
            秒
          </label>
          <span className="hint">
            本編 {formatTime(tl.voiceDur)} / 完成尺 <b>{formatTime(tl.total)}</b>
          </span>
        </div>
        {mix.markers.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <span className="hint">🚩 マーカー: </span>
            {mix.markers.map((m, i) => (
              <span key={i} className="marker-chip" onClick={() => seekFinal(recToFinal(m))}>
                {formatTime(m)}
              </span>
            ))}
          </div>
        )}

        <div className="transport">
          <button className="play primary" onClick={togglePlay}>
            {playing ? '⏸' : '▶'}
          </button>
          <TransportTime player={player} total={tl.total} />
          <button onClick={() => seekFinal(0)}>⏮ 冒頭</button>
          <button onClick={() => seekFinal(tl.voiceStart)}>本編開始</button>
          <button onClick={() => seekFinal(Math.max(0, tl.voiceStart + tl.voiceDur - 5))}>本編終了-5s</button>
          {mix.bgm.enabled && <button onClick={() => seekFinal(tl.voiceStart + tl.voiceDur)}>エンディング</button>}
        </div>
      </div>

      <div className="card">
        <h2>音量バランス</h2>
        <p className="card-desc">
          録音解析に基づいて自動調整済みです。プレビューを聴きながら微調整できます（クリップはリミッターで防止されます）。
        </p>
        {mix.tracks.map((track) => (
          <LabeledSlider
            key={track.id}
            label={track.label}
            value={track.gainDb}
            min={-24}
            max={24}
            step={0.5}
            unit="dB"
            onChange={(v) =>
              setMix((m) => ({
                ...m,
                tracks: m.tracks.map((t) => (t.id === track.id ? { ...t, gainDb: v } : t)),
              }))
            }
            extra={
              <button
                onClick={() =>
                  setMix((m) => ({
                    ...m,
                    tracks: m.tracks.map((t) => (t.id === track.id ? { ...t, gainDb: t.suggestedGainDb } : t)),
                  }))
                }
                title={`解析による推奨値: ${track.suggestedGainDb}dB`}
              >
                自動
              </button>
            }
          />
        ))}
      </div>

      <div className="card">
        <h2>BGM</h2>
        <p className="card-desc">
          BGMは本編と同程度の音量で始まり、イントロ後にダッキング（音量ダウン）して本編が開始。本編終了後に音量が戻り、アウトロを経てフェードアウトします。BGMはループ再生されます。
        </p>
        <div className="card-row">
          <label>
            <input
              type="file"
              accept="audio/*"
              onChange={onBgmFile}
              style={{ display: 'none' }}
              id="bgm-file-input"
            />
            <button onClick={() => document.getElementById('bgm-file-input')?.click()} disabled={bgmLoading}>
              {bgmLoading ? '読み込み中…' : '🎵 BGMファイルを選択'}
            </button>
          </label>
          {mix.bgm.buffer && (
            <>
              <span className="hint">
                {mix.bgm.fileName}（{formatTime(mix.bgm.buffer.duration)}・ループ再生）
              </span>
              <label>
                <input
                  type="checkbox"
                  checked={mix.bgm.enabled}
                  onChange={(e) => setMix((m) => ({ ...m, bgm: { ...m.bgm, enabled: e.target.checked } }))}
                />{' '}
                BGMを使用
              </label>
            </>
          )}
        </div>
        {mix.bgm.buffer && mix.bgm.enabled && (
          <>
            <LabeledSlider
              label="BGM音量"
              value={mix.bgm.gainDb}
              min={-36}
              max={12}
              step={0.5}
              unit="dB"
              onChange={(v) => setMix((m) => ({ ...m, bgm: { ...m.bgm, gainDb: v } }))}
              extra={
                <button
                  onClick={() => setMix((m) => ({ ...m, bgm: { ...m.bgm, gainDb: m.bgm.suggestedGainDb } }))}
                  title={`解析による推奨値: ${mix.bgm.suggestedGainDb}dB`}
                >
                  自動
                </button>
              }
            />
            <LabeledSlider
              label="イントロ（秒）"
              value={mix.bgm.introSec}
              min={0}
              max={30}
              step={0.5}
              onChange={(v) => setMix((m) => ({ ...m, bgm: { ...m.bgm, introSec: v } }))}
            />
            <LabeledSlider
              label="アウトロ（秒）"
              value={mix.bgm.outroSec}
              min={0}
              max={30}
              step={0.5}
              onChange={(v) => setMix((m) => ({ ...m, bgm: { ...m.bgm, outroSec: v } }))}
            />
            <LabeledSlider
              label="ダッキング量"
              value={mix.bgm.duckDb}
              min={-30}
              max={0}
              step={0.5}
              unit="dB"
              onChange={(v) => setMix((m) => ({ ...m, bgm: { ...m.bgm, duckDb: v } }))}
            />
            <LabeledSlider
              label="ダッキング速度（秒）"
              value={mix.bgm.duckFadeSec}
              min={0.2}
              max={5}
              step={0.1}
              onChange={(v) => setMix((m) => ({ ...m, bgm: { ...m.bgm, duckFadeSec: v } }))}
            />
            <LabeledSlider
              label="フェードアウト（秒）"
              value={mix.bgm.fadeOutSec}
              min={0.5}
              max={10}
              step={0.5}
              onChange={(v) => setMix((m) => ({ ...m, bgm: { ...m.bgm, fadeOutSec: v } }))}
            />
            <BgmDiagram mix={mix} />
          </>
        )}
      </div>

      <div className="footer-nav">
        <span />
        <button className="primary big" onClick={() => { player.stop(); setPlaying(false); onNext(); }}>
          仕上げへ進む →
        </button>
      </div>
    </div>
  );
}
