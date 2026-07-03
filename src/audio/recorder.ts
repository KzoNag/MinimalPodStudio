import { appendChunk, putSession } from '../db';

export interface MicOptions {
  deviceId: string | null;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export const DEFAULT_MIC_OPTIONS: MicOptions = {
  deviceId: null,
  echoCancellation: false,
  noiseSuppression: true,
  autoGainControl: false,
};

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

export interface LevelReader {
  /** 0..1 の RMS と ピーク値を返す */
  read(): { rms: number; peak: number };
}

function makeLevelReader(ctx: AudioContext, stream: MediaStream): { reader: LevelReader; source: MediaStreamAudioSourceNode } {
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const reader: LevelReader = {
    read() {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i];
        sum += v * v;
        const a = Math.abs(v);
        if (a > peak) peak = a;
      }
      return { rms: Math.sqrt(sum / buf.length), peak };
    },
  };
  return { reader, source };
}

export class RecorderEngine {
  private ctx: AudioContext | null = null;
  micStream: MediaStream | null = null;
  sysStream: MediaStream | null = null; // 音声トラックのみ
  private sysDisplayStream: MediaStream | null = null; // 元の getDisplayMedia ストリーム
  micLevel: LevelReader | null = null;
  sysLevel: LevelReader | null = null;

  private recorders: MediaRecorder[] = [];
  private chunks: Record<string, Blob[]> = { mic: [], sys: [] };
  private seq: Record<string, number> = { mic: 0, sys: 0 };
  private saveQueue: Promise<void> = Promise.resolve();

  mimeType = pickMimeType();
  sessionId: string | null = null;
  recording = false;
  private startedAt = 0;
  markers: number[] = [];

  onSysEnded: (() => void) | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  async initMic(opts: MicOptions): Promise<void> {
    this.stopMic();
    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: opts.deviceId ? { exact: opts.deviceId } : undefined,
        echoCancellation: opts.echoCancellation,
        noiseSuppression: opts.noiseSuppression,
        autoGainControl: opts.autoGainControl,
        channelCount: 1,
      },
    };
    this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
    this.micLevel = makeLevelReader(this.getCtx(), this.micStream).reader;
  }

  async initSys(): Promise<void> {
    this.stopSys();
    const options = {
      video: { frameRate: 1, width: 640 },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        suppressLocalAudioPlayback: false,
      },
      systemAudio: 'include',
      selfBrowserSurface: 'exclude',
    };
    const display = await navigator.mediaDevices.getDisplayMedia(options as MediaStreamConstraints);
    const audioTracks = display.getAudioTracks();
    if (audioTracks.length === 0) {
      display.getTracks().forEach((t) => t.stop());
      throw new Error(
        '共有した画面に音声が含まれていません。「画面全体」を選び「システム音声も共有」をON にするか、音声付きのタブを共有してください。',
      );
    }
    // 映像は不要なので無効化（トラック自体は残す: 停止すると共有全体が終了する環境があるため）
    display.getVideoTracks().forEach((t) => (t.enabled = false));
    this.sysDisplayStream = display;
    this.sysStream = new MediaStream(audioTracks);
    audioTracks[0].addEventListener('ended', () => {
      this.stopSys();
      this.onSysEnded?.();
    });
    this.sysLevel = makeLevelReader(this.getCtx(), this.sysStream).reader;
  }

  stopMic(): void {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.micLevel = null;
  }

  stopSys(): void {
    this.sysDisplayStream?.getTracks().forEach((t) => t.stop());
    this.sysDisplayStream = null;
    this.sysStream = null;
    this.sysLevel = null;
  }

  get elapsed(): number {
    return this.recording ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  async start(): Promise<void> {
    if (!this.micStream) throw new Error('マイクが有効化されていません');
    this.sessionId = `rec-${Date.now()}`;
    this.chunks = { mic: [], sys: [] };
    this.seq = { mic: 0, sys: 0 };
    this.markers = [];
    this.recorders = [];

    await putSession({
      id: this.sessionId,
      startedAt: Date.now(),
      status: 'recording',
      markers: [],
      duration: 0,
      mimeType: this.mimeType,
    });

    const makeRecorder = (stream: MediaStream, track: 'mic' | 'sys') => {
      const rec = new MediaRecorder(stream, {
        mimeType: this.mimeType || undefined,
        audioBitsPerSecond: 128000,
      });
      rec.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        this.chunks[track].push(e.data);
        const seq = this.seq[track]++;
        const sid = this.sessionId!;
        // 書き込みは直列化してチャンク順序を保証
        this.saveQueue = this.saveQueue
          .then(() => appendChunk(sid, track, seq, e.data))
          .catch((err) => console.warn('IndexedDB への保存に失敗:', err));
      };
      return rec;
    };

    this.recorders.push(makeRecorder(this.micStream, 'mic'));
    if (this.sysStream) this.recorders.push(makeRecorder(this.sysStream, 'sys'));

    this.startedAt = performance.now();
    this.recording = true;
    for (const rec of this.recorders) rec.start(1000);
  }

  addMarker(): number {
    const t = this.elapsed;
    this.markers.push(t);
    return t;
  }

  async stop(): Promise<{ mic: Blob; sys: Blob | null; duration: number; markers: number[]; sessionId: string }> {
    if (!this.recording || !this.sessionId) throw new Error('録音していません');
    const duration = this.elapsed;
    this.recording = false;

    await Promise.all(
      this.recorders.map(
        (rec) =>
          new Promise<void>((resolve) => {
            if (rec.state === 'inactive') {
              resolve();
              return;
            }
            rec.onstop = () => resolve();
            rec.stop();
          }),
      ),
    );
    await this.saveQueue; // IndexedDB への書き込み完了を待つ

    const sessionId = this.sessionId;
    await putSession({
      id: sessionId,
      startedAt: Date.now(),
      status: 'recorded',
      markers: this.markers,
      duration,
      mimeType: this.mimeType,
    });

    const mic = new Blob(this.chunks.mic, { type: this.mimeType });
    const sys = this.chunks.sys.length > 0 ? new Blob(this.chunks.sys, { type: this.mimeType }) : null;
    return { mic, sys, duration, markers: [...this.markers], sessionId };
  }

  dispose(): void {
    this.stopMic();
    this.stopSys();
    void this.ctx?.close();
    this.ctx = null;
  }
}
