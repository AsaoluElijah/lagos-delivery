/**
 * Tiny synthesised sound effects — no audio assets to download.
 *
 * The AudioContext is created lazily on the first cue (which always follows a
 * user gesture) so browsers never block it.
 */

export type Cue =
  | "order"
  | "pickup"
  | "deliver"
  | "fail"
  | "crash"
  | "gameover"
  | "beep"
  | "go"
  | "ui";

interface Note {
  freq: number;
  /** Seconds from the cue start. */
  at: number;
  dur: number;
  gain: number;
  type: OscillatorType;
}

const CUES: Record<Cue, Note[]> = {
  ui: [{ freq: 520, at: 0, dur: 0.07, gain: 0.16, type: "square" }],
  order: [
    { freq: 660, at: 0, dur: 0.1, gain: 0.18, type: "square" },
    { freq: 880, at: 0.1, dur: 0.14, gain: 0.16, type: "square" },
  ],
  pickup: [
    { freq: 740, at: 0, dur: 0.08, gain: 0.2, type: "triangle" },
    { freq: 988, at: 0.08, dur: 0.12, gain: 0.18, type: "triangle" },
  ],
  deliver: [
    { freq: 659, at: 0, dur: 0.1, gain: 0.2, type: "square" },
    { freq: 831, at: 0.09, dur: 0.1, gain: 0.2, type: "square" },
    { freq: 988, at: 0.18, dur: 0.1, gain: 0.2, type: "square" },
    { freq: 1319, at: 0.27, dur: 0.22, gain: 0.18, type: "triangle" },
  ],
  fail: [
    { freq: 420, at: 0, dur: 0.14, gain: 0.2, type: "sawtooth" },
    { freq: 300, at: 0.13, dur: 0.2, gain: 0.18, type: "sawtooth" },
    { freq: 190, at: 0.3, dur: 0.3, gain: 0.16, type: "sawtooth" },
  ],
  crash: [
    { freq: 150, at: 0, dur: 0.16, gain: 0.26, type: "square" },
    { freq: 96, at: 0.05, dur: 0.22, gain: 0.2, type: "sawtooth" },
  ],
  gameover: [
    { freq: 523, at: 0, dur: 0.18, gain: 0.2, type: "triangle" },
    { freq: 392, at: 0.18, dur: 0.2, gain: 0.2, type: "triangle" },
    { freq: 311, at: 0.38, dur: 0.24, gain: 0.2, type: "triangle" },
    { freq: 262, at: 0.62, dur: 0.5, gain: 0.2, type: "triangle" },
  ],
  beep: [{ freq: 600, at: 0, dur: 0.1, gain: 0.18, type: "square" }],
  go: [
    { freq: 784, at: 0, dur: 0.1, gain: 0.22, type: "square" },
    { freq: 1047, at: 0.1, dur: 0.26, gain: 0.2, type: "square" },
  ],
};

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
    } catch {
      return null;
    }
    return this.ctx;
  }

  play(cue: Cue) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    for (const n of CUES[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type;
      osc.frequency.setValueAtTime(n.freq, now + n.at);
      if (cue === "crash") osc.frequency.exponentialRampToValueAtTime(n.freq * 0.4, now + n.at + n.dur);

      // Quick attack, exponential tail — reads as a chiptune blip.
      gain.gain.setValueAtTime(0.0001, now + n.at);
      gain.gain.exponentialRampToValueAtTime(n.gain, now + n.at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.dur);

      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now + n.at);
      osc.stop(now + n.at + n.dur + 0.02);
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
    }
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }
}
