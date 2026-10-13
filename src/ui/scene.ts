// The view across the aisle: the back wall (windows, clock, ceiling lights),
// a far row of cubicles Mr. Feeney walks behind, the target peeking over
// their cubicle wall with whatever they're hiding behind, and your allies at
// the edges. Rubber bands fly as little spinning loops.

import { walkbyCountdown } from '../sim/engine';
import { mods } from '../sim/mods';
import { currentTarget, type GameEvent, type GameState } from '../sim/state';
import { PEOPLE, TARGET_PEOPLE, type Mood } from './characters';
import { portrait, portraitStack, setPortraitMood, warmPortraits } from './portraits';

const W = 800;
const H = 420;
const WALL_TOP = 250;
const CX = 76; // wall clock
const CY = 84;

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

interface Projectile {
  el: HTMLElement;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  t0: number;
  dur: number;
  spin: number;
  done: () => void;
}

interface Slot {
  x: number;
  scale: number;
}

/** Where target people stand, by how many there are. */
function targetSlots(n: number): Slot[] {
  if (n === 1) return [{ x: 313, scale: 1.45 }];
  if (n === 2) return [{ x: 232, scale: 1.3 }, { x: 412, scale: 1.3 }];
  return [{ x: 196, scale: 1.12 }, { x: 333, scale: 1.12 }, { x: 470, scale: 1.12 }];
}

const ALLY_SLOTS = [
  { x: 4, y: 270, back: false },
  { x: 88, y: 276, back: false },
  { x: 172, y: 282, back: false },
  { x: 46, y: 236, back: true },
  { x: 130, y: 242, back: true },
  { x: 214, y: 248, back: true },
];

function headPos(slot: Slot) {
  return { x: slot.x + 60 * slot.scale, y: 70 + 58 * slot.scale };
}

export interface SceneHooks {
  footstep(): void;
  hit(): void;
  /** Your fingertip in page coordinates, if the hand is on screen. */
  handTip(): { x: number; y: number } | null;
}

export class Scene {
  private root: HTMLElement;
  private svg!: SVGSVGElement;
  private peopleLayer!: SVGGElement;
  private duckLayer!: SVGGElement;
  private coverLayer!: SVGGElement;
  private allyLayer!: SVGGElement;
  private feeneyG!: SVGGElement;
  private fx!: HTMLElement;
  private bubble!: HTMLElement;
  private feeneyBubble!: HTMLElement;

  private targetId = '';
  private people: string[] = [];
  private moods: Mood[] = [];
  private hitUntil = 0;
  private angryUntil = 0;
  private duckUntil = 0;
  private nextDuck = 0;
  private nextIdleLine = 0;
  private lastBubble = 0;
  private enterAt = 0;
  private allyKey = '';
  private projectiles: Projectile[] = [];
  private minuteKey = -1;
  private nextFlicker = 0;
  private feeney: { phase: 'off' | 'walk' | 'stop' | 'leave'; x: number; t: number; spotted: boolean } = { phase: 'off', x: -140, t: 0, spotted: false };
  private nextStep = 0;

  constructor(
    private getState: () => GameState,
    private hooks: SceneHooks,
  ) {
    this.root = document.getElementById('scene')!;
    this.build();
    warmPortraits();
  }

  // ---------------------------------------------------------------- build

  private build() {
    const blinds = (x: number, n: number) =>
      Array.from({ length: n }, (_, i) => `<line x1="${x}" x2="${x + 190}" y1="${36 + i * 8}" y2="${36 + i * 8}"/>`).join('');
    const ticks = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<line x1="${CX + Math.sin(a) * 23}" y1="${CY - Math.cos(a) * 23}" x2="${CX + Math.sin(a) * 27}" y2="${CY - Math.cos(a) * 27}"/>`;
    }).join('');
    this.root.innerHTML = `
      <svg class="scene-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop id="sky-top" offset="0" stop-color="#bfe0f7"/>
            <stop id="sky-bot" offset="1" stop-color="#e8f4fb"/>
          </linearGradient>
          <pattern id="fabric" width="5" height="5" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill="#66768a"/>
            <circle cx="1" cy="1" r="0.7" fill="#76869a"/>
            <circle cx="3.5" cy="3.5" r="0.7" fill="#5a6a7e"/>
          </pattern>
          <pattern id="carpet" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="#6f7680"/>
            <rect width="4" height="4" fill="#737a84"/>
            <rect x="4" y="4" width="4" height="4" fill="#6a717b"/>
          </pattern>
          <pattern id="fabric-far" width="5" height="5" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill="#8b97a7"/>
            <circle cx="1" cy="1" r="0.7" fill="#97a3b2"/>
          </pattern>
        </defs>
        <rect width="${W}" height="${H}" fill="#e2dccd"/>
        <rect y="0" width="${W}" height="14" fill="#cfc8b6"/>
        <g class="light" id="light-a"><rect x="230" y="0" width="120" height="12" rx="2" fill="#fbfbf3"/></g>
        <g class="light" id="light-b"><rect x="450" y="0" width="120" height="12" rx="2" fill="#fbfbf3"/></g>
        <g class="window">
          <rect x="146" y="26" width="192" height="132" rx="3" fill="#f2efe6" stroke="#b7ae9a" stroke-width="3"/>
          <rect x="152" y="32" width="180" height="120" fill="url(#sky)"/>
          <rect x="152" y="32" width="180" height="46" fill="#ece6d6" opacity="0.92"/>
          <g stroke="#cfc6b2" stroke-width="1.5">${blinds(152, 6)}</g>
          <line x1="242" y1="32" x2="242" y2="152" stroke="#f2efe6" stroke-width="5"/>
          <path class="cloud" d="M176 112 q10 -14 24 -6 q8 -10 20 0 q14 2 8 12 h-56 q-6 -4 4 -6z" fill="#fff" opacity="0.8"/>
        </g>
        <g class="window">
          <rect x="462" y="26" width="192" height="132" rx="3" fill="#f2efe6" stroke="#b7ae9a" stroke-width="3"/>
          <rect x="468" y="32" width="180" height="120" fill="url(#sky)"/>
          <rect x="468" y="32" width="180" height="30" fill="#ece6d6" opacity="0.92"/>
          <g stroke="#cfc6b2" stroke-width="1.5">${blinds(468, 4)}</g>
          <line x1="558" y1="32" x2="558" y2="152" stroke="#f2efe6" stroke-width="5"/>
        </g>
        <g class="clock">
          <circle cx="${CX}" cy="${CY}" r="32" fill="#fff" stroke="#2b2522" stroke-width="4"/>
          <g stroke="#2b2522" stroke-width="2">${ticks}</g>
          <line id="clock-h" x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY - 16}" stroke="#2b2522" stroke-width="4" stroke-linecap="round"/>
          <line id="clock-m" x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY - 24}" stroke="#2b2522" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="${CX}" cy="${CY}" r="3" fill="#c62f28"/>
        </g>
        <g class="incident-sign">
          <rect x="676" y="30" width="104" height="118" rx="4" fill="#fdfdf8" stroke="#2b2522" stroke-width="3"/>
          <rect x="676" y="30" width="104" height="30" rx="4" fill="#2f6b3c"/>
          <text x="728" y="50" text-anchor="middle" font-family="Libre Franklin, Arial, sans-serif" font-weight="800" font-size="13" fill="#fff">SAFETY FIRST</text>
          <text x="728" y="78" text-anchor="middle" font-family="Libre Franklin, Arial, sans-serif" font-weight="600" font-size="10.5" fill="#2b2522">Days since last</text>
          <text x="728" y="91" text-anchor="middle" font-family="Libre Franklin, Arial, sans-serif" font-weight="600" font-size="10.5" fill="#2b2522">HR meeting</text>
          <rect x="702" y="98" width="52" height="40" rx="3" fill="#1d1f1c"/>
          <text id="incident-days" x="728" y="129" text-anchor="middle" font-family="Libre Franklin, Arial, sans-serif" font-weight="800" font-size="30" fill="#ffd33d">0</text>
        </g>
        <g id="feeney" class="feeney" transform="translate(-140 0)"><g transform="translate(0 98) scale(0.8)">${portrait('feeney', 'idle')}</g></g>
        <rect x="0" y="262" width="${W}" height="${H - 262}" fill="#6f7680"/>
        <rect x="0" y="262" width="${W}" height="${H - 262}" fill="url(#carpet)"/>
        <rect x="0" y="192" width="${W}" height="70" fill="url(#fabric-far)"/>
        <rect x="0" y="186" width="${W}" height="8" fill="#c9ced4"/>
        <g id="duck"><g class="bob"><g id="people"></g></g></g>
        <g id="cover"></g>
        <rect x="150" y="${WALL_TOP + 4}" width="500" height="${H - WALL_TOP}" fill="url(#fabric)"/>
        <rect x="146" y="${WALL_TOP - 4}" width="508" height="10" rx="2" fill="#c9ced4"/>
        <g id="allies"></g>
        <rect id="dusk" width="${W}" height="${H}" fill="#ff9a3c" opacity="0" style="mix-blend-mode:multiply"/>
      </svg>
      <div class="scene-fx" id="scene-fx"></div>
      <div class="bubble" id="bubble" hidden></div>
      <div class="bubble bubble-feeney" id="feeney-bubble" hidden></div>`;
    // Your hand sits in its own layer above the nameplate and labels, so it's always in front.
    const wrap = this.root.parentElement!;
    wrap.querySelector('.hand-svg')?.remove();
    wrap.insertAdjacentHTML(
      'beforeend',
      `<svg class="hand-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g id="hand-layer"></g></svg>`,
    );
    this.svg = this.root.querySelector('svg')!;
    this.peopleLayer = this.svg.querySelector('#people')!;
    this.duckLayer = this.svg.querySelector('#duck')!;
    this.coverLayer = this.svg.querySelector('#cover')!;
    this.allyLayer = this.svg.querySelector('#allies')!;
    this.feeneyG = this.svg.querySelector('#feeney')!;
    this.fx = this.root.querySelector('#scene-fx')!;
    this.bubble = this.root.querySelector('#bubble')!;
    this.feeneyBubble = this.root.querySelector('#feeney-bubble')!;
  }

  // ---------------------------------------------------------------- target

  private setTarget(id: string) {
    this.targetId = id;
    this.people = TARGET_PEOPLE[id] ?? [];
    this.moods = this.people.map(() => 'idle' as Mood);
    this.enterAt = performance.now();
    this.nextDuck = performance.now() + 7000;
    this.drawPeople(true);
    this.coverLayer.innerHTML = cover(id);
    this.bubble.hidden = true;
  }

  private drawPeople(force = false) {
    const slots = targetSlots(this.people.length);
    const want = this.people.map((p) => this.moodFor(p));
    if (force) {
      this.peopleLayer.innerHTML = this.people
        .map((p, i) => `<g transform="translate(${slots[i].x} 70) scale(${slots[i].scale})">${portraitStack(p, want[i])}</g>`)
        .join('');
    } else if (want.every((m, i) => m === this.moods[i])) return;
    else {
      // Only the face changes: flip to the expression that's already loaded.
      const stacks = this.peopleLayer.querySelectorAll('[data-person]');
      this.people.forEach((p, i) => {
        if (want[i] !== this.moods[i] && stacks[i]) setPortraitMood(stacks[i], p, want[i]);
      });
    }
    this.moods = want;
  }

  private moodFor(p: string): Mood {
    const now = performance.now();
    const s = this.getState();
    const t = currentTarget(s);
    if (now < this.hitUntil) return 'hit';
    if (now < this.angryUntil) return 'angry';
    if (t && s.targetResolve / t.resolve < 0.3) return 'worried';
    return PEOPLE[p].rest ?? 'idle';
  }

  private say(text: string, ms = 2200) {
    const b = this.bubble;
    b.textContent = text;
    b.hidden = false;
    b.classList.remove('pop');
    void b.offsetWidth;
    b.classList.add('pop');
    this.lastBubble = performance.now();
    clearTimeout((b as unknown as { _t?: number })._t);
    (b as unknown as { _t?: number })._t = window.setTimeout(() => (b.hidden = true), ms);
  }

  private pickLine(kind: 'hit' | 'idle' | 'fire') {
    const lines = this.people.flatMap((p) => PEOPLE[p].lines?.[kind] ?? []);
    return lines.length ? lines[Math.floor(Math.random() * lines.length)] : null;
  }

  // ---------------------------------------------------------------- events

  handle(e: GameEvent) {
    const now = performance.now();
    if (e.type === 'shot') {
      const head = this.aimPoint();
      const from = e.by === 'you' ? this.fromHand() : this.allyHead(e.allyId);
      if (e.by === 'ally' && e.allyId) this.recoil(e.allyId);
      const big = e.by === 'you' && ((e.charge ?? 0) > 0.6 || e.perfect);
      const dur = e.by === 'you' ? 260 - 90 * (e.charge ?? 0) : 340;
      this.launch(from, head, dur, () => {
        this.burst(head.x + (Math.random() - 0.5) * 50, head.y + (Math.random() - 0.5) * 30, big);
        this.hitUntil = performance.now() + 260;
        if (e.by === 'you') this.hooks.hit();
        if (performance.now() - this.lastBubble > 2600 && Math.random() < (big ? 0.8 : 0.3)) {
          const l = this.pickLine('hit');
          if (l) this.say(l, 1400);
        }
        if (big) this.duckUntil = performance.now() + 500;
      }, big);
    } else if (e.type === 'enemyShot') {
      this.duckUntil = 0;
      this.angryUntil = now + 900;
      const head = this.aimPoint();
      this.launch(head, { x: 330 + Math.random() * 140, y: H + 30 }, 420, () => {});
      const l = this.pickLine('fire');
      if (l && now - this.lastBubble > 1500) this.say(l, 1200);
    } else if (e.type === 'review') {
      this.angryUntil = now + 1500;
      this.say('Let’s set up a quick performance review.', 2400);
    } else if (e.type === 'capture') {
      this.duckUntil = now + 900;
    } else if (e.type === 'walkby') {
      this.feeney = { phase: 'walk', x: -140, t: now, spotted: false };
    } else if (e.type === 'hidden' || e.type === 'spotted') {
      this.feeney = { phase: 'stop', x: this.feeney.x, t: now, spotted: e.type === 'spotted' };
      this.sayFeeney(e.type === 'spotted' ? 'Is that... a rubber band?' : 'Great hustle.');
    } else if (e.type === 'recruit') {
      this.allyKey = '';
    }
  }

  private sayFeeney(text: string) {
    const b = this.feeneyBubble;
    b.textContent = text;
    b.hidden = false;
    setTimeout(() => (b.hidden = true), 1800);
  }

  /** Your fingertip, converted into scene coordinates. */
  private fromHand() {
    const tip = this.hooks.handTip();
    const r = this.root.getBoundingClientRect();
    if (!tip || r.width === 0) return { x: 400, y: H + 30 };
    return { x: ((tip.x - r.left) / r.width) * W, y: ((tip.y - r.top) / r.height) * H };
  }

  private aimPoint() {
    const slots = targetSlots(Math.max(1, this.people.length));
    const sl = slots[Math.floor(Math.random() * slots.length)];
    const h = headPos(sl);
    const ducked = performance.now() < this.duckUntil;
    return { x: h.x + (Math.random() - 0.5) * 20, y: ducked ? WALL_TOP - 8 : h.y };
  }

  private allyHead(id?: string) {
    const s = this.getState();
    const i = Math.max(0, s.allies.findIndex((a) => a.id === id));
    const slot = ALLY_SLOTS[i % ALLY_SLOTS.length];
    return { x: slot.x + 48, y: slot.y + 40 };
  }

  private recoil(id: string) {
    const g = this.allyLayer.querySelector<SVGGElement>(`[data-ally="${id}"]`);
    if (!g || reduced()) return;
    g.classList.remove('fire');
    void (g as unknown as HTMLElement).getBoundingClientRect();
    g.classList.add('fire');
  }

  // ---------------------------------------------------------------- projectiles

  private launch(from: { x: number; y: number }, to: { x: number; y: number }, dur: number, done: () => void, big = false) {
    if (reduced()) {
      done();
      return;
    }
    if (this.projectiles.length > 24) {
      done();
      return;
    }
    const el = document.createElement('span');
    el.className = big ? 'proj big' : 'proj';
    this.fx.appendChild(el);
    this.projectiles.push({
      el,
      x0: from.x,
      y0: from.y,
      x1: to.x,
      y1: to.y,
      cx: (from.x + to.x) / 2 + (Math.random() - 0.5) * 80,
      cy: Math.min(from.y, to.y) - 60 - Math.random() * 40,
      t0: performance.now(),
      dur,
      spin: (Math.random() < 0.5 ? -1 : 1) * (700 + Math.random() * 500),
      done,
    });
  }

  private burst(x: number, y: number, big = false) {
    if (reduced()) return;
    const b = document.createElement('span');
    b.className = big ? 'burst big' : 'burst';
    b.style.left = `${(x / W) * 100}%`;
    b.style.top = `${(y / H) * 100}%`;
    this.fx.appendChild(b);
    setTimeout(() => b.remove(), 320);
  }

  private stepProjectiles(now: number) {
    this.projectiles = this.projectiles.filter((p) => {
      const t = Math.min(1, (now - p.t0) / p.dur);
      const u = 1 - t;
      const x = u * u * p.x0 + 2 * u * t * p.cx + t * t * p.x1;
      const y = u * u * p.y0 + 2 * u * t * p.cy + t * t * p.y1;
      p.el.style.left = `${(x / W) * 100}%`;
      p.el.style.top = `${(y / H) * 100}%`;
      p.el.style.transform = `translate(-50%, -50%) rotate(${(p.spin * (now - p.t0)) / 1000}deg) scale(${1.25 - 0.45 * t})`;
      if (t >= 1) {
        p.el.remove();
        p.done();
        return false;
      }
      return true;
    });
  }

  // ---------------------------------------------------------------- per frame

  render() {
    const s = this.getState();
    const now = performance.now();
    const t = currentTarget(s);

    // Target and cover
    const id = t?.id ?? 'none';
    if (id !== this.targetId) {
      if (this.targetId && this.targetId !== 'none' && now < this.duckUntil) {
        // finish ducking out of sight before the next target pops up
      } else this.setTarget(id);
    }
    if (t) {
      if (now > this.nextDuck && now > this.duckUntil) {
        this.duckUntil = now + 700 + Math.random() * 600;
        this.nextDuck = now + 6000 + Math.random() * 7000;
      }
      if (now > this.nextIdleLine && now - this.lastBubble > 6000) {
        this.nextIdleLine = now + 9000 + Math.random() * 8000;
        const l = this.pickLine('idle');
        if (l && now - this.enterAt > 2500) this.say(l);
      }
    }
    const ducking = now < this.duckUntil || now - this.enterAt < 350;
    this.duckLayer.classList.toggle('ducked', ducking || !t);
    this.drawPeople();

    // Allies
    const key = s.allies.map((a) => a.id).join(',');
    if (key !== this.allyKey) {
      this.allyKey = key;
      const drawAlly = (a: { id: string }, i: number) => {
        const sl = ALLY_SLOTS[i % ALLY_SLOTS.length];
        return `<g class="ally" data-ally="${a.id}"><g transform="translate(${sl.x} ${sl.y}) scale(0.8)">${portrait(a.id)}</g></g>`;
      };
      // Back row first so the front row overlaps it.
      const order = s.allies.map((a, i) => ({ a, i })).sort((p, q) => Number(ALLY_SLOTS[q.i % 6].back) - Number(ALLY_SLOTS[p.i % 6].back));
      this.allyLayer.innerHTML =
        order.map(({ a, i }) => drawAlly(a, i)).join('') +
        `<rect x="0" y="356" width="300" height="${H - 356}" fill="url(#fabric)"/><rect x="-4" y="350" width="308" height="9" rx="2" fill="#c9ced4"/>`;
      this.allyLayer.style.display = s.allies.length ? '' : 'none';
    }

    this.stepProjectiles(now);
    this.stepFeeney(s, now);
    this.stepAmbient(s, now);
  }

  private stepFeeney(s: GameState, now: number) {
    const f = this.feeney;
    const c = walkbyCountdown(s);
    const stopX = 250;
    if (c !== null) {
      if (f.phase !== 'walk') this.feeney = { phase: 'walk', x: -140, t: now, spotted: false };
      const total = mods(s).warning;
      const p = 1 - c / total;
      this.feeney.x = -140 + (stopX + 140) * p;
      if (now > this.nextStep && !s.lookBusy) {
        this.nextStep = now + 420;
        this.hooks.footstep();
      }
    } else if (f.phase === 'stop') {
      if (now - f.t > 1300) this.feeney = { ...f, phase: 'leave', t: now };
    } else if (f.phase === 'leave') {
      f.x = stopX + ((now - f.t) / 2200) * (W + 160 - stopX);
      if (f.x > W + 20) this.feeney = { phase: 'off', x: -140, t: now, spotted: false };
    }
    const x = this.feeney.phase === 'off' ? -140 : this.feeney.x;
    this.feeneyG.setAttribute('transform', `translate(${x.toFixed(1)} ${this.feeney.phase === 'walk' ? Math.abs(Math.sin(now / 140)) * -3 : 0})`);
    this.feeneyBubble.style.left = `${((x + 96) / W) * 100}%`;
  }

  private stepAmbient(s: GameState, now: number) {
    // Clock, sky and late-afternoon light, once per office minute.
    const minute = Math.floor(s.time) % 480;
    if (minute !== this.minuteKey) {
      this.minuteKey = minute;
      const total = 9 * 60 + minute;
      const h = (total / 60) % 12;
      const m = total % 60;
      rotate(this.svg.querySelector('#clock-h')!, h * 30 + m * 0.5);
      rotate(this.svg.querySelector('#clock-m')!, m * 6);
      const day = minute / 480; // 0 = 9 AM, 1 = 5 PM
      const top = mix('#bfe0f7', '#f2a65e', smooth(0.55, 1, day));
      const bot = mix('#e8f4fb', '#f9d9a8', smooth(0.5, 1, day));
      this.svg.querySelector('#sky-top')!.setAttribute('stop-color', top);
      this.svg.querySelector('#sky-bot')!.setAttribute('stop-color', bot);
      this.svg.querySelector('#dusk')!.setAttribute('opacity', (smooth(0.6, 1, day) * 0.22).toFixed(3));
      const since = s.lastCaughtAt === null ? s.time : s.time - s.lastCaughtAt;
      this.svg.querySelector('#incident-days')!.textContent = String(Math.floor(since / 480));
    }
    // A fluorescent tube flickers now and then.
    if (now > this.nextFlicker) {
      this.nextFlicker = now + 15000 + Math.random() * 30000;
      if (!reduced()) {
        const l = this.svg.querySelector(Math.random() < 0.5 ? '#light-a' : '#light-b')!;
        l.classList.add('flicker');
        setTimeout(() => l.classList.remove('flicker'), 900);
      }
    }
  }

  /** The layer your hand is drawn into (on top of everything but the evening light). */
  get handLayer() {
    return this.root.parentElement!.querySelector<SVGGElement>('#hand-layer')!;
  }

  /** The point your hand aims at: the middle of the target's heads, or the wall top when they duck. */
  handAim() {
    const n = this.people.length;
    if (!n) return { x: 400, y: 180 };
    const slots = targetSlots(n);
    const x = slots.reduce((sum, sl) => sum + headPos(sl).x, 0) / n;
    const ducked = performance.now() < this.duckUntil;
    return { x, y: ducked ? WALL_TOP - 10 : headPos(slots[0]).y };
  }

  /** Where damage numbers should float, in percent of the scene. */
  floaterOrigin() {
    const sl = targetSlots(Math.max(1, this.people.length));
    const h = headPos(sl[Math.floor(Math.random() * sl.length)]);
    return { left: (h.x / W) * 100, top: ((h.y - 40) / H) * 100 };
  }
}

// ------------------------------------------------------------------ helpers

function rotate(el: Element, deg: number) {
  el.setAttribute('transform', `rotate(${deg.toFixed(1)} ${CX} ${CY})`);
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** Whatever the target is hiding behind, drawn on their desk above the wall. */
function cover(id: string): string {
  const o = 'stroke="#2b2522" stroke-width="3" stroke-linejoin="round"';
  const postits = () => {
    const colors = ['#ffe36e', '#ff9fb2', '#9fe0a0', '#8fd0f5', '#ffc46b'];
    let out = '';
    let k = 0;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 8; col++) {
        const x = 318 + col * 21 + (row % 2) * 6;
        const y = 168 + row * 21;
        const rot = ((k * 37) % 9) - 4;
        out += `<rect x="${x}" y="${y}" width="20" height="20" fill="${colors[k % colors.length]}" stroke="rgba(0,0,0,0.2)" transform="rotate(${rot} ${x + 10} ${y + 10})"/>`;
        k++;
      }
    }
    return out;
  };
  switch (id) {
    case 'gary2':
      return `<rect x="322" y="166" width="156" height="100" rx="8" fill="#3b3f45" ${o}/><rect x="334" y="176" width="132" height="6" rx="3" fill="#4b5058"/><circle cx="400" cy="214" r="10" fill="#4b5058"/>`;
    case 'gary3':
      return postits();
    case 'gary4':
      return `${postits()}<g transform="translate(520 196)"><rect x="-6" y="20" width="12" height="40" fill="#cfd5db" ${o}/><circle r="40" fill="#e9eef2" ${o}/><g class="fan-blades">${[0, 120, 240]
        .map((a) => `<ellipse rx="10" ry="30" cy="-17" fill="#9fc6e8" stroke="#2b2522" stroke-width="2" transform="rotate(${a})"/>`)
        .join('')}</g><circle r="7" fill="#3b3f45"/><g fill="none" stroke="#2b2522" stroke-width="1.5" opacity="0.5"><circle r="28"/><circle r="16"/></g></g>`;
    case 'brad':
      return `<g transform="translate(250 214) rotate(-12)"><rect x="0" y="0" width="16" height="36" fill="#3b3f45" ${o}/><path d="M-6 30 Q-8 48 14 48 L40 48 Q46 40 30 34 L16 30 Z" fill="#5a3a22" ${o}/></g><g transform="translate(282 206) rotate(-8)"><rect x="0" y="0" width="16" height="42" fill="#3b3f45" ${o}/><path d="M-6 36 Q-8 54 14 54 L40 54 Q46 46 30 40 L16 36 Z" fill="#5a3a22" ${o}/></g>`;
    case 'printer':
      return `<g ${o}>${[
        [300, 214, 70, 40],
        [372, 214, 70, 40],
        [444, 214, 70, 40],
        [336, 176, 70, 40],
        [408, 176, 70, 40],
      ]
        .map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#c9a66b"/><text x="${x + w / 2}" y="${y + 25}" text-anchor="middle" font-family="Libre Franklin, Arial, sans-serif" font-weight="800" font-size="13" fill="#2b2522" stroke="none">TONER</text>`)
        .join('')}</g>`;
    case 'taskforce':
      return `<g><rect x="270" y="214" width="260" height="34" rx="3" fill="#fff" ${o}/><text x="400" y="238" text-anchor="middle" font-family="Kalam, cursive" font-weight="700" font-size="21" fill="#c62f28">Q3 TASK FORCE</text></g>`;
    case 'rick':
      return `<g><rect x="232" y="56" width="336" height="196" fill="rgba(170,210,235,0.32)" stroke="#9fb3c2" stroke-width="5"/><line x1="400" y1="56" x2="400" y2="252" stroke="#9fb3c2" stroke-width="5"/><g stroke="#ffffff" stroke-opacity="0.55" stroke-width="3">${Array.from({ length: 7 }, (_, i) => `<line x1="236" x2="396" y1="${62 + i * 9}" y2="${62 + i * 9}"/>`).join('')}</g><path d="M250 210 L300 120 M262 230 L330 110" stroke="#fff" stroke-opacity="0.5" stroke-width="4"/><rect x="408" y="150" width="6" height="26" rx="2" fill="#7c8a96"/></g>`;
    default:
      return '';
  }
}

