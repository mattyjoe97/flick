// Sound effects synthesized with Web Audio, so there are no files to ship.
// Audio starts on the first click or key press (browsers require a gesture).

const KEY = 'flick.muted';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<string, number>();
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(KEY) === '1';
    } catch {
      /* storage unavailable: default to sound on */
    }
    const unlock = () => {
      this.ensure();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(KEY, this.muted ? '1' : '0');
    } catch {
      /* fine: the choice just won't be remembered */
    }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC();
    } catch {
      return null;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  /** Skip a sound if the same one played within `gap` ms (keeps rapid fire from turning to mush). */
  private ok(name: string, gap: number) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') {
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return false;
    }
    const now = performance.now();
    if (now - (this.last.get(name) ?? 0) < gap) return false;
    this.last.set(name, now);
    return true;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(freq: number, q: number, dur: number, gain: number, delay = 0) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
  }

  /** Release: a stretched band twangs lower and louder; a Perfect adds a bright ping. */
  flick(charge = 0, perfect = false) {
    if (!this.ok('flick', 40)) return;
    this.tone('triangle', 520 - 160 * charge, 150 - 50 * charge, 0.1 + 0.08 * charge, 0.22 + 0.12 * charge);
    this.noise(2600, 2, 0.03, 0.12 + 0.1 * charge);
    if (perfect) {
      this.tone('sine', 1320, 1320, 0.12, 0.12, 0.03);
      this.tone('sine', 1760, 1760, 0.16, 0.1, 0.09);
    }
  }

  private stretchOsc: OscillatorNode | null = null;
  private stretchGain: GainNode | null = null;

  /** A rising creak while you hold the band; pass null to stop it. */
  stretch(charge: number | null) {
    const c = this.ctx;
    if (!c || !this.master || this.muted || c.state !== 'running') {
      if (charge === null) this.stopStretch();
      return;
    }
    if (charge === null) {
      this.stopStretch();
      return;
    }
    if (!this.stretchOsc) {
      const osc = c.createOscillator();
      const f = c.createBiquadFilter();
      const g = c.createGain();
      osc.type = 'sawtooth';
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 6;
      g.gain.value = 0.0001;
      osc.connect(f).connect(g).connect(this.master);
      osc.start();
      this.stretchOsc = osc;
      this.stretchGain = g;
    }
    const t = c.currentTime;
    this.stretchOsc.frequency.setTargetAtTime(70 + charge * 160, t, 0.03);
    this.stretchGain!.gain.setTargetAtTime(charge > 0 ? 0.015 + charge * 0.05 : 0.0001, t, 0.03);
  }

  private stopStretch() {
    if (!this.stretchOsc || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.stretchGain!.gain.setTargetAtTime(0.0001, t, 0.02);
    this.stretchOsc.stop(t + 0.1);
    this.stretchOsc = null;
    this.stretchGain = null;
  }

  snap() {
    if (!this.ok('snap', 300)) return;
    this.noise(1400, 1, 0.08, 0.35);
    this.tone('square', 260, 90, 0.18, 0.08, 0.04);
  }

  ally() {
    if (!this.ok('ally', 110)) return;
    this.tone('triangle', 640, 230, 0.07, 0.08);
  }

  hit() {
    if (!this.ok('hit', 60)) return;
    this.noise(900, 1.4, 0.07, 0.28);
    this.tone('sine', 160, 70, 0.09, 0.2);
  }

  incoming() {
    if (!this.ok('incoming', 200)) return;
    this.noise(1800, 0.8, 0.18, 0.07);
    this.tone('triangle', 300, 520, 0.12, 0.06);
  }

  /** A heavy loafer on carpet. `volume` below 1 for steps further away (or behind you). */
  footstep(volume = 1) {
    if (!this.ok('step', 200)) return;
    this.tone('sine', 95, 55, 0.09, 0.32 * volume);
    this.noise(300, 1, 0.05, 0.08 * volume);
  }

  /** Bailey bays: she hears Mr. Feeney's shoes before you do. */
  howl() {
    if (!this.ok('howl', 2000)) return;
    this.tone('sine', 520, 760, 0.25, 0.07);
    this.tone('sine', 760, 700, 0.55, 0.07, 0.25);
    this.tone('triangle', 380, 350, 0.7, 0.03, 0.1);
  }

  /** Bailey, happy: two little yips. */
  yip() {
    if (!this.ok('yip', 300)) return;
    this.tone('sine', 900, 1200, 0.07, 0.06);
    this.tone('sine', 950, 1300, 0.07, 0.06, 0.11);
  }

  /** Winding bands onto the ball: a few quick rubbery stretches (and a fanfare when it grows). */
  wind(grew = false) {
    if (!this.ok('wind', 120)) return;
    for (let i = 0; i < 3; i++) this.tone('triangle', 300 + i * 40, 420 + i * 60, 0.06, 0.07, i * 0.06);
    if (grew) {
      this.tone('sine', 660, 660, 0.12, 0.1, 0.2);
      this.tone('sine', 880, 880, 0.12, 0.1, 0.32);
      this.tone('sine', 1320, 1320, 0.25, 0.1, 0.44);
    }
  }

  /** Barrage: a whole office's worth of twangs at once, then the thud of everything landing. */
  barrage() {
    if (!this.ok('barrage', 500)) return;
    for (let i = 0; i < 9; i++) {
      this.tone('triangle', 480 + Math.random() * 200, 150 + Math.random() * 60, 0.09, 0.09, i * 0.035);
      this.noise(2400, 2, 0.03, 0.06, i * 0.035);
    }
    this.noise(700, 0.8, 0.35, 0.35, 0.42);
    this.tone('sine', 120, 50, 0.3, 0.3, 0.42);
  }

  /** Messenger: a message for you. */
  /** Office chaos: a short two-tone office alarm. */
  alarm() {
    if (!this.ok('alarm', 1000)) return;
    [0, 0.18, 0.36].forEach((d, i) => this.tone('square', i % 2 ? 660 : 880, i % 2 ? 660 : 880, 0.14, 0.05, d));
  }
  notify() {
    if (!this.ok('notify', 400)) return;
    this.tone('sine', 880, 880, 0.08, 0.08);
    this.tone('sine', 1175, 1175, 0.12, 0.08, 0.08);
  }

  /** A round graded: a fanfare for an A, a sad trombone for an F. */
  grade(g: 'A' | 'B' | 'C' | 'D' | 'F') {
    if (!this.ok('grade', 300)) return;
    const notes = { A: [784, 988, 1175, 1568], B: [784, 1047], C: [784], D: [523, 440], F: [392, 330, 262] }[g];
    notes.forEach((f, i) => this.tone(g === 'D' || g === 'F' ? 'triangle' : 'sine', f, f, 0.14, 0.11, i * 0.09));
  }

  type() {
    if (!this.ok('type', 30)) return;
    this.noise(3400, 3, 0.025, 0.14);
    this.noise(2200, 3, 0.02, 0.08, 0.035);
  }

  miss() {
    if (!this.ok('miss', 150)) return;
    this.tone('square', 190, 120, 0.14, 0.06);
  }

  ring() {
    if (!this.ok('ring', 900)) return;
    for (let i = 0; i < 2; i++) {
      this.tone('square', 1250, 1250, 0.05, 0.035, i * 0.13);
      this.tone('square', 950, 950, 0.05, 0.035, i * 0.13 + 0.06);
    }
  }

  hide() {
    if (!this.ok('hide', 200)) return;
    this.noise(900, 0.7, 0.16, 0.1);
  }

  caught() {
    if (!this.ok('caught', 1000)) return;
    this.tone('triangle', 420, 140, 0.55, 0.2);
    this.tone('triangle', 330, 110, 0.55, 0.12, 0.12);
  }

  capture() {
    if (!this.ok('capture', 600)) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone('sine', f, f, 0.14, 0.13, i * 0.08));
  }

  coins() {
    if (!this.ok('coins', 60)) return;
    this.tone('sine', 1320, 1320, 0.05, 0.06);
  }

  /** A cash register: money in. */
  kaching() {
    if (!this.ok('kaching', 120)) return;
    this.noise(5000, 3, 0.04, 0.1);
    this.tone('sine', 1568, 1568, 0.09, 0.12, 0.03);
    this.tone('sine', 2093, 2093, 0.18, 0.12, 0.1);
  }

  /** Dale, leaning over your cubicle wall. */
  psst() {
    if (!this.ok('psst', 1000)) return;
    this.noise(5200, 2.5, 0.09, 0.09);
    this.noise(4600, 2.5, 0.12, 0.08, 0.16);
  }

  /** The drawer sliding open: a metal rattle. */
  drawer() {
    if (!this.ok('drawer', 250)) return;
    this.noise(700, 1.2, 0.12, 0.12);
    this.noise(2600, 4, 0.05, 0.05, 0.05);
  }

  /** Picking a band out of the junk. */
  grab() {
    if (!this.ok('grab', 40)) return;
    this.noise(2800, 5, 0.03, 0.08);
    this.tone('triangle', 420, 640, 0.06, 0.05, 0.02);
  }

  /** Something good in the drawer. */
  find() {
    if (!this.ok('find', 300)) return;
    [784, 988, 1319].forEach((f, i) => this.tone('sine', f, f, 0.1, 0.09, i * 0.06));
  }

  /** A rubber stamp coming down on paper. */
  stamp() {
    if (!this.ok('stamp', 150)) return;
    this.tone('sine', 140, 60, 0.12, 0.3);
    this.noise(500, 1, 0.06, 0.15);
  }

  /** A box landing on your desk. */
  thud() {
    if (!this.ok('thud', 300)) return;
    this.tone('sine', 110, 45, 0.22, 0.4);
    this.noise(260, 0.8, 0.12, 0.2);
  }

  /** Packing tape ripping off a box. */
  tear() {
    if (!this.ok('tear', 300)) return;
    this.noise(3000, 0.6, 0.22, 0.12);
    this.noise(1500, 0.9, 0.18, 0.08, 0.06);
  }
}
