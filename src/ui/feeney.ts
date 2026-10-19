// Mr. Feeney's office: his desk, his drawer and his computer, while he's out walking the
// floor. Laid out like Dale's closet (it borrows the closet's layout styles). When his
// footsteps start, a red banner counts down to him walking back in: slip out in time.

import { co } from './co';
import { PORTRAITS } from './portrait-art';
import { WEAPONS } from '../sim/content';
import { walkbyCountdown } from '../sim/engine';
import { SNOOP, drawerHas, enterOffice, inOffice, leaveOffice, snoopBlocked, snoopProgress, startSnoop, type SnoopId } from '../sim/feeney';
import type { GameEvent, GameState } from '../sim/state';
import type { Sound } from './sound';

const esc = (text: string) => co(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const n = (x: number) => Math.floor(x).toLocaleString('en-US');

/** Where things are in the office picture: [left, top, right, bottom], as fractions. */
const SPOTS: Record<SnoopId, [number, number, number, number]> = {
  calendar: [0.43, 0.25, 0.6, 0.53],
  desk: [0.27, 0.53, 0.73, 0.64],
  drawer: [0.56, 0.66, 0.72, 0.84],
};
const LABEL: Record<SnoopId, string> = { desk: 'His desk', drawer: 'His drawer', calendar: 'His computer' };

export interface FeeneyHooks {
  say(text: string): void;
  bump(which: 'bands' | 'salary'): void;
  opened(): void;
  /** You left: back to your desk, or straight onto your computer. */
  closed(to: 'desk' | 'computer'): void;
}

export class FeeneyView {
  private root: HTMLElement;
  private detail: HTMLElement;
  private alarm: HTMLElement;
  private spots: Record<SnoopId, HTMLButtonElement>;
  private open = false;
  private selected: SnoopId = 'desk';
  private key = '';
  private note: { text: string; ok: boolean } | null = null;

  constructor(
    private get: () => GameState,
    private hooks: FeeneyHooks,
    private sound: Sound,
  ) {
    const place = (b: [number, number, number, number]) => `left:${pct(b[0])};top:${pct(b[1])};width:${pct(b[2] - b[0])};height:${pct(b[3] - b[1])}`;
    this.root = document.createElement('div');
    this.root.className = 'closet feeney-office';
    this.root.id = 'feeney-office';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-labelledby', 'feeney-h');
    const photo = PORTRAITS.feeney?.happy ?? '';
    this.root.innerHTML = `<div class="closet-room">
        <header class="closet-top"><h2 class="closet-h" id="feeney-h">Mr. Feeney’s office</h2>
          <button type="button" class="closet-back" id="feeney-back">Slip out <kbd>Esc</kbd></button></header>
        <div class="closet-stage feeney-stage" style="aspect-ratio:2048 / 1152">
          <div class="closet-bg">${ROOM_SVG}</div>
          ${photo ? `<div class="feeney-photo" aria-hidden="true"><img src="${photo}" alt="" draggable="false"></div>` : ''}
          ${(Object.keys(SPOTS) as SnoopId[]).map((id) => `<button type="button" class="break-spot snoop-spot" data-snoop="${id}" style="${place(SPOTS[id])}"><span class="spot-tag">${LABEL[id]}</span><span class="snoop-bar" hidden><i></i></span></button>`).join('')}
          <p class="feeney-alarm" role="alert" hidden></p>
        </div>
        <aside class="closet-detail break-detail" aria-live="polite"></aside>
      </div>`;
    document.getElementById('app')!.append(this.root);
    this.detail = this.root.querySelector('.break-detail')!;
    this.alarm = this.root.querySelector('.feeney-alarm')!;
    this.spots = {
      desk: this.root.querySelector('[data-snoop="desk"]')!,
      drawer: this.root.querySelector('[data-snoop="drawer"]')!,
      calendar: this.root.querySelector('[data-snoop="calendar"]')!,
    };
    this.root.querySelector('#feeney-back')!.addEventListener('click', () => this.leave());
    this.root.addEventListener('click', (e) => this.onClick(e));
    // A phone that goes to sleep in his office would come back to a write-up: slip out first.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.open) this.leave();
    });
  }

  get isOpen() {
    return this.open;
  }

  show() {
    const s = this.get();
    if (this.open) return;
    const r = enterOffice(s);
    if (!r.ok) return this.hooks.say(r.reason);
    this.open = true;
    this.root.hidden = false;
    this.note = null;
    this.key = '';
    this.selected = drawerHas(s) ? 'drawer' : !snoopBlocked(s, 'desk') ? 'desk' : 'calendar';
    this.sound.drawer();
    this.hooks.opened();
    (this.root.querySelector('#feeney-back') as HTMLElement).focus();
  }

  /** Slip out (onto your computer, if he's on his way). */
  leave() {
    if (!this.open) return;
    const to = leaveOffice(this.get()) ?? 'desk';
    this.shut(to);
  }

  /** Close the view without touching the game (he already caught you, or you left some other way). */
  private shut(to: 'desk' | 'computer') {
    this.open = false;
    this.root.hidden = true;
    this.hooks.closed(to);
  }

  onKey(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'e' || k === 'b') {
      this.leave();
      return true;
    }
    if (e.repeat) return false;
    const map: Record<string, SnoopId> = { '1': 'desk', '2': 'drawer', '3': 'calendar' };
    if (map[k]) {
      this.snoop(map[k]);
      return true;
    }
    return false;
  }

  handle(e: GameEvent) {
    if (e.type === 'snooped' && this.open) {
      this.note = { text: e.text, ok: true };
      this.key = '';
      this.sound.find();
      if (e.what === 'drawer') this.hooks.bump('bands');
    } else if (e.type === 'officeCaught') {
      if (this.open) this.shut('desk');
      this.hooks.say('He found you in his office. That’s a write-up, and he wants his drawer back.');
    }
  }

  private onClick(e: Event) {
    const t = e.target as HTMLElement;
    const spot = t.closest<HTMLButtonElement>('button[data-snoop]');
    if (spot) {
      const id = spot.dataset.snoop as SnoopId;
      if (this.selected === id) this.snoop(id);
      else {
        this.selected = id;
        this.note = null;
        this.key = '';
        this.sound.grab();
        if (window.matchMedia?.('(max-width: 900px)').matches) requestAnimationFrame(() => this.detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      }
      return;
    }
    const b = t.closest<HTMLButtonElement>('.break-detail button[data-go]');
    if (b && !b.disabled) this.snoop(b.dataset.go as SnoopId);
  }

  private snoop(id: SnoopId) {
    const s = this.get();
    this.selected = id;
    const r = startSnoop(s, id);
    this.note = r.ok ? { text: r.text, ok: true } : { text: r.reason, ok: false };
    if (r.ok) this.sound.grab();
    else this.sound.miss();
    this.key = '';
  }

  render() {
    if (!this.open) return;
    const s = this.get();
    if (!inOffice(s)) return this.shut('desk');
    // He's on his way back.
    const cd = walkbyCountdown(s);
    if (cd !== null) {
      this.alarm.textContent = `Footsteps! Slip out! ${Math.ceil(cd)} s`;
      if (this.alarm.hidden) this.alarm.hidden = false;
    } else if (!this.alarm.hidden) this.alarm.hidden = true;
    const busy = s.feeney.busy;
    const prog = snoopProgress(s);
    for (const id of Object.keys(this.spots) as SnoopId[]) {
      const el = this.spots[id];
      el.classList.toggle('selected', id === this.selected);
      el.classList.toggle('spent', !!snoopBlocked(s, id) && busy?.what !== id);
      const bar = el.querySelector<HTMLElement>('.snoop-bar')!;
      const on = busy?.what === id;
      if (bar.hidden === on) bar.hidden = !on;
      if (on) bar.querySelector('i')!.style.width = pct(prog ?? 0);
    }
    const key = [this.selected, this.note?.text ?? '', busy?.what ?? '', (Object.keys(SPOTS) as SnoopId[]).map((id) => snoopBlocked(s, id) ?? '').join(','), s.feeney.seized, s.hr.confiscated?.weapon ?? '', s.hr.writeUps].join('|');
    if (key !== this.key) {
      this.key = key;
      this.detail.innerHTML = this.html(s);
    }
  }

  private html(s: GameState) {
    const id = this.selected;
    const busy = s.feeney.busy;
    const blocked = snoopBlocked(s, id);
    const note = this.note ? `<p class="memo-note${this.note.ok ? ' ok' : ''}" role="status">${esc(this.note.text)}</p>` : '';
    const secs = SNOOP.seconds[id];
    const about =
      id === 'desk'
        ? `<p>Whatever he’s left lying around: petty cash, a box of bands he confiscated from somebody, his calendar (book him a meeting and his next round comes later), or, if you’re lucky, one of your write-ups on its way to HR.</p>`
        : id === 'drawer'
          ? `<p>Where he keeps what he takes from you.${s.feeney.seized >= 1 || s.hr.confiscated ? ` Right now: ${[s.feeney.seized >= 1 ? `<b>${n(s.feeney.seized)} of your bands</b>` : '', s.hr.confiscated ? `<b>your ${esc(WEAPONS.find((w) => w.id === s.hr.confiscated!.weapon)!.name)}</b>` : ''].filter(Boolean).join(' and ')}.` : ' Nothing of yours in it right now: he only takes things when he catches you.'}</p>`
          : `<p>Peek at his calendar and for the next 10 minutes you know exactly when his next round is (it shows on the office).</p>`;
    const verb = id === 'desk' ? 'Search his desk' : id === 'drawer' ? 'Pick the lock' : 'Check his calendar';
    const btn = busy
      ? `<button type="button" class="paper-btn" disabled>${busy.what === id ? 'Working on it…' : 'Busy…'}</button>`
      : `<button type="button" class="paper-btn${blocked ? '' : ' paper-btn-strong'}" data-go="${id}" ${blocked ? 'disabled' : ''}>${verb} (${secs} s) <kbd>${id === 'desk' ? 1 : id === 'drawer' ? 2 : 3}</kbd></button>`;
    return `<h3>${LABEL[id]}</h3>
      ${about}
      ${blocked && !busy ? `<p class="stats">${esc(blocked)}</p>` : ''}
      <div class="detail-act">${btn}</div>
      ${note}
      <p class="hint">He’s out walking the floor. If you hear footsteps, slip out (Esc) before he gets back: you’ll land at your computer. If he finds you in here, it’s a write-up.</p>`;
  }
}

// ---------------------------------------------------------------- drawn stand-in

const OL = 'stroke="#332A24" stroke-width="10" stroke-linejoin="round"';

const ROOM_SVG = `<svg viewBox="0 0 2048 1152" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true">
  <rect width="2048" height="1152" fill="#b9c4b0"/>
  <rect width="2048" height="80" fill="#a6b29d"/>
  <rect y="880" width="2048" height="272" fill="#6f5a48"/>
  <path d="M0 880h2048" stroke="#4f3f33" stroke-width="10"/>
  <rect x="120" y="150" width="420" height="380" rx="8" fill="#cfe3ea" ${OL}/>
  ${Array.from({ length: 12 }, (_, i) => `<path d="M126 ${180 + i * 29}h408" stroke="#9aa9ad" stroke-width="9"/>`).join('')}
  <rect x="1620" y="430" width="250" height="460" rx="8" fill="#8d99a0" ${OL}/>
  ${[0, 1, 2].map((i) => `<rect x="1640" y="${450 + i * 145}" width="210" height="125" rx="6" fill="#a7b2b8" stroke="#332A24" stroke-width="7"/><rect x="1715" y="${500 + i * 145}" width="60" height="16" rx="6" fill="#332A24"/>`).join('')}
  <rect x="1660" y="120" width="300" height="220" rx="6" fill="#f5f1e6" ${OL}/>
  <path d="M1700 180h220M1700 220h180M1700 260h200" stroke="#c7bfae" stroke-width="12"/>
  <circle cx="1810" cy="300" r="18" fill="#d9a441"/>
  <rect x="1262" y="140" width="268" height="290" rx="6" fill="#c9a24e" ${OL}/>
  <rect x="1290" y="168" width="212" height="234" fill="#e9e1cf"/>
  <path d="M760 360c-50 0-50 0-60 70l-10 60h140l-10-60c-10-70-10-70-60-70z" fill="#4a3b31" ${OL}/>
  <rect x="680" y="240" width="160" height="150" rx="40" fill="#3f3229" ${OL}/>
  <rect x="540" y="610" width="960" height="40" fill="#8a5a34" ${OL}/>
  <rect x="560" y="650" width="380" height="240" fill="#7a4e2c" ${OL}/>
  <rect x="1140" y="650" width="340" height="240" fill="#7a4e2c" ${OL}/>
  <rect x="1150" y="760" width="320" height="200" fill="#865733" ${OL}/>
  <rect x="1270" y="840" width="80" height="18" rx="8" fill="#d9b25a" stroke="#332A24" stroke-width="6"/>
  <circle cx="1310" cy="805" r="10" fill="#332A24"/>
  <rect x="890" y="300" width="330" height="230" rx="12" fill="#2f3438" ${OL}/>
  <rect x="912" y="322" width="286" height="186" fill="#cfe9f2"/>
  ${[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4].map((c) => `<rect x="${922 + c * 55}" y="${355 + r * 37}" width="48" height="30" fill="${(r * 5 + c) % 4 === 1 ? '#f4c26b' : '#fff'}" stroke="#7aa" stroke-width="2"/>`).join('')).join('')}
  <rect x="912" y="322" width="286" height="26" fill="#3b6ea5"/>
  <rect x="1030" y="530" width="50" height="60" fill="#2f3438" ${OL}/>
  <rect x="980" y="580" width="150" height="30" rx="6" fill="#2f3438" ${OL}/>
  <rect x="610" y="560" width="200" height="50" rx="4" fill="#f5f1e6" stroke="#332A24" stroke-width="7" transform="rotate(-3 710 585)"/>
  <rect x="630" y="540" width="190" height="50" rx="4" fill="#fffdf6" stroke="#332A24" stroke-width="7" transform="rotate(4 725 565)"/>
  <rect x="1280" y="540" width="70" height="70" rx="10" fill="#c0392b" ${OL}/>
  <path d="M1350 560c24 0 24 34 0 34" fill="none" ${OL}/>
  <rect x="1380" y="575" width="110" height="35" rx="4" fill="#d9b25a" ${OL}/>
</svg>`;
