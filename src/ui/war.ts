// Stage 3 on screen: the map of the 4th floor (pick who to fight), and the raid alert
// when a department sneaks into Dale's supply closet.
//
// The map is a sheet over your desk, like Dale's closet: the war keeps going while you look
// at it, and Mr. Feeney's footsteps send you back to your desk. Each department card shows
// the boss behind their barricade (the same drawing as the fight), what's left of their
// Resolve and what taking them gets you.

import daleHead from '../assets/art/dale-head.webp';
import { DEPARTMENTS, REMATCH, WAR, type Department, type DeptId } from '../sim/content';
import { closetIsYours } from '../sim/mods';
import { currentTarget, deptMax, deptTaken, deptsTaken, rematchOrder, type GameState } from '../sim/state';
import { chaseRaid, dept, fight } from '../sim/war';
import { TARGET_PEOPLE, PEOPLE, type Mood } from './characters';
import { coverSvg } from './scene';
import { faceSvg, portrait } from './portraits';

const esc = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

/** A little white surrender flag on a ruler (until the painted one arrives). */
const FLAG = `<svg class="dept-flag" viewBox="0 0 64 64" aria-hidden="true"><line x1="16" y1="60" x2="28" y2="6" stroke="#2b2522" stroke-width="7" stroke-linecap="round"/><line x1="16" y1="60" x2="28" y2="6" stroke="#e7c27a" stroke-width="4" stroke-linecap="round"/><path d="M28 8 Q40 2 54 9 Q47 17 56 25 Q41 21 25 27 Z" fill="#fff" stroke="#2b2522" stroke-width="2.5" stroke-linejoin="round"/></svg>`;

/** The boss behind their barricade, cropped from the fight scene. */
function deptPicture(id: string, mood: Mood) {
  const who = TARGET_PEOPLE[id]?.[0];
  const person = who ? `<g transform="translate(313 70) scale(1.45)">${portrait(who, mood)}</g>` : '';
  return `<svg class="dept-pic" viewBox="232 54 336 208" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <rect x="232" y="54" width="336" height="208" fill="#d7dde2"/><rect x="232" y="54" width="336" height="18" fill="#c9d0d6"/>
    ${person}${coverSvg(id)}
    <rect x="232" y="250" width="336" height="12" fill="#c9ced4"/></svg>`;
}

export interface WarHooks {
  say(text: string): void;
  bump(which: 'bands' | 'salary'): void;
  opened(): void;
  closed(): void;
  sound: { grab(): void; capture(): void; notify(): void; miss(): void };
}

export class MapView {
  private root: HTMLElement;
  private grid: HTMLElement;
  private sum: HTMLElement;
  private open = false;
  private key = '';

  constructor(
    private get: () => GameState,
    private hooks: WarHooks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'warmap';
    this.root.id = 'warmap';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-labelledby', 'warmap-h');
    this.root.innerHTML = `
      <div class="warmap-room">
        <header class="warmap-top">
          <h2 class="closet-h" id="warmap-h">The 4th floor</h2>
          <button type="button" class="closet-back" data-go="back">Back to your desk <kbd class="kb">Esc</kbd></button>
        </header>
        <p class="warmap-sum" aria-live="polite"></p>
        <div class="warmap-grid"></div>
      </div>`;
    document.getElementById('app')!.append(this.root);
    this.grid = this.root.querySelector('.warmap-grid')!;
    this.sum = this.root.querySelector('.warmap-sum')!;
    this.root.addEventListener('click', (e) => this.onClick(e));
  }

  get isOpen() {
    return this.open;
  }

  show() {
    const s = this.get();
    if (s.stage < 3 || s.lookBusy) return;
    if (s.walkby.arrivesAt !== null) return this.hooks.say('Not now: Mr. Feeney is coming. Get on your computer (Esc).');
    if (this.open) return;
    this.open = true;
    this.root.hidden = false;
    this.key = '';
    this.render();
    this.hooks.sound.grab();
    this.hooks.opened();
    this.root.querySelector<HTMLElement>('.dept.fighting, .closet-back')?.focus({ preventScroll: true });
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    this.hooks.closed();
  }

  onKey(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'm' || k === 'b') {
      this.close();
      return true;
    }
    return false;
  }

  private onClick(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || b.disabled) return;
    const s = this.get();
    if (b.dataset.go === 'back') return this.close();
    if (b.dataset.chase !== undefined) {
      const r = chaseRaid(s);
      if (r.ok) {
        this.hooks.sound.capture();
        this.hooks.bump('bands');
        this.hooks.say(s.ticker[0]?.text ?? '');
      }
      this.key = '';
      return;
    }
    const to = b.dataset.fight as DeptId | 'rematch' | undefined;
    if (!to) return;
    if (s.war.fighting === to) return this.close();
    const r = fight(s, to);
    if (!r.ok) {
      this.hooks.sound.miss();
      return this.hooks.say(r.reason);
    }
    this.hooks.sound.grab();
    this.hooks.say(to === 'rematch' ? 'Back to the rematches.' : `You turn your desk toward ${dept(to).label}.`);
    this.close();
  }

  render() {
    if (!this.open) return;
    const s = this.get();
    if (s.lookBusy || s.stage < 3) return this.close();
    if (s.walkby.arrivesAt !== null) {
      this.close();
      this.hooks.say('Footsteps! Mr. Feeney is coming. Get on your computer (Esc).');
      return;
    }
    // Rebuild only when something changes shape (a tap must never land on a card that's
    // just been replaced); the bars and clocks update in place every frame.
    const raid = s.war.closet.raid;
    const rm = s.rematch;
    const key = [
      s.stage,
      s.war.fighting,
      DEPARTMENTS.map((d) => (deptTaken(s, d.dept) ? 'T' : '')).join(','),
      raid ? `${raid.dept}:${raid.until}` : '',
      closetIsYours(s),
      rm ? `${rm.round}:${rm.index}:${rm.bounty}` : '',
    ].join('|');
    if (key !== this.key) {
      this.key = key;
      const taken = deptsTaken(s);
      this.sum.textContent =
        s.stage >= 4
          ? 'The whole floor is yours. The rematches never stop.'
          : `${taken} of 4 taken. Switch any time: they keep the damage you’ve done. Each one you take makes the rest ${Math.round((WAR.reinforce - 1) * 100)}% tougher.`;
      this.grid.innerHTML = [...DEPARTMENTS.map((d) => this.deptCard(s, d)), this.closetCard(s), this.rematchCard(s)].join('');
    }
    for (const d of DEPARTMENTS) {
      if (deptTaken(s, d.dept)) continue;
      const share = this.share(s, d);
      const bar = this.grid.querySelector<HTMLElement>(`[data-bar="${d.dept}"]`);
      if (bar) bar.style.width = `${(share * 100).toFixed(1)}%`;
      this.text(`[data-left="${d.dept}"]`, `${Math.round(share * deptMax(s, d.dept)).toLocaleString('en-US')} Resolve left`);
    }
    if (raid) this.text('[data-clock="raid"]', `${Math.ceil(Math.max(0, raid.until - s.time))} s`);
    else if (!closetIsYours(s)) this.text('[data-clock="lost"]', clock(Math.max(0, s.war.closet.lostUntil - s.time)));
    if (rm) {
      const on = s.stage >= 4 || s.war.fighting === 'rematch';
      const left = (on ? Math.max(0, s.targetResolve) : rm.left ?? rm.resolve) / rm.resolve;
      const bar = this.grid.querySelector<HTMLElement>('[data-bar="rematch"]');
      if (bar) bar.style.width = `${(Math.min(1, left) * 100).toFixed(1)}%`;
    }
  }

  private text(sel: string, value: string) {
    const el = this.grid.querySelector(sel);
    if (el && el.textContent !== value) el.textContent = value;
  }

  /** How much of a department's Resolve is left (the live number if you're fighting it). */
  private share(s: GameState, d: Department) {
    if (deptTaken(s, d.dept)) return 0;
    if (s.stage === 3 && s.war.fighting === d.dept) return Math.max(0, s.targetResolve) / deptMax(s, d.dept);
    return s.war.depts[d.dept].share;
  }

  private deptCard(s: GameState, d: Department) {
    const taken = deptTaken(s, d.dept);
    const on = s.stage === 3 && s.war.fighting === d.dept;
    const share = this.share(s, d);
    const mood: Mood = taken ? 'worried' : on ? 'angry' : PEOPLE[TARGET_PEOPLE[d.id][0]]?.rest ?? 'idle';
    const left = Math.round(share * deptMax(s, d.dept));
    const act = taken ? 'Yours' : on ? 'Fighting now' : 'Attack';
    return `<button type="button" class="dept${on ? ' fighting' : ''}${taken ? ' taken' : ''}" data-fight="${d.dept}" ${taken ? 'aria-disabled="true"' : ''}
      aria-label="${esc(d.label)}: ${esc(d.name)}. ${taken ? `Yours. ${esc(d.prize)}.` : `${Math.round(share * 100)}% Resolve left. Take it for: ${esc(d.prize)}.`} ${act}.">
      <span class="dept-label">${esc(d.label)}</span>
      <span class="dept-scene">${deptPicture(d.id, mood)}${taken ? FLAG : ''}</span>
      <span class="dept-who"><b>${esc(d.name)}</b> <small>${esc(d.title)}</small></span>
      ${taken ? '' : `<span class="dept-bar" aria-hidden="true"><i data-bar="${d.dept}" style="width:${(share * 100).toFixed(1)}%"></i></span><span class="dept-left" data-left="${d.dept}">${left.toLocaleString('en-US')} Resolve left</span>`}
      <span class="dept-prize${taken ? ' got' : ''}">${taken ? 'You have: ' : 'Take it: '}${esc(d.prize)}</span>
      <span class="dept-act">${act}</span>
    </button>`;
  }

  private closetCard(s: GameState) {
    const raid = s.war.closet.raid;
    const yours = closetIsYours(s);
    let status: string;
    let btn = '';
    if (raid) {
      status = `<b class="raid-now">${esc(dept(raid.dept).label)} is raiding it!</b> <span data-clock="raid">${Math.ceil(Math.max(0, raid.until - s.time))} s</span> to stop them.`;
      btn = '<span class="dept-act raid" >Chase them off</span>';
    } else if (!yours) status = `A raid got away. It’s theirs for <span data-clock="lost">${clock(Math.max(0, s.war.closet.lostUntil - s.time))}</span>.`;
    else status = `Yours: +${WAR.closet.bonus} bands a second.${s.stage === 3 ? ' Departments you haven’t taken will try to raid it.' : ''}`;
    const inner = `<span class="dept-label">Supply closet</span>
      <span class="dept-scene closet-scene"><img src="${daleHead}" alt="" draggable="false">${raid ? `<span class="raider">${faceSvg(TARGET_PEOPLE[raid.dept][0], 'smug')}</span>` : ''}</span>
      <span class="dept-who"><b>Dale’s closet</b> <small>Contested ground</small></span>
      <span class="dept-prize">${status}</span>${btn}`;
    return raid
      ? `<button type="button" class="dept closet-card raided" data-chase>${inner}</button>`
      : `<div class="dept closet-card${yours ? '' : ' lost'}">${inner}</div>`;
  }

  private rematchCard(s: GameState) {
    const r = s.rematch;
    const on = s.stage >= 4 || s.war.fighting === 'rematch';
    const id = r ? rematchOrder(s)[r.index] : REMATCH.order[0];
    const who = TARGET_PEOPLE[id]?.[0] ?? 'gary';
    const t = on ? currentTarget(s) : undefined;
    const name = (t ?? DEPARTMENTS.find((d) => d.id === id))?.name ?? { gary4: 'Gary', brad: 'Brad', printer: 'Janet & Ron', taskforce: 'The Q3 Task Force', rick: 'Rick' }[id] ?? 'Gary';
    const left = r ? (on ? Math.max(0, s.targetResolve) : r.left ?? r.resolve) / r.resolve : 1;
    return `<button type="button" class="dept rematch-card${on ? ' fighting' : ''}" data-fight="rematch" aria-label="Rematches: round ${r?.round ?? 1}, ${esc(name)}. ${on ? 'Fighting now' : 'Rematch'}.">
      <span class="dept-label">Old rivals</span>
      <span class="dept-scene rematch-scene">${faceSvg(who, on ? 'angry' : 'smug')}</span>
      <span class="dept-who"><b>Rematch: ${esc(name)}</b> <small>Round ${r?.round ?? 1}</small></span>
      <span class="dept-bar" aria-hidden="true"><i data-bar="rematch" style="width:${(Math.min(1, left) * 100).toFixed(1)}%"></i></span>
      <span class="dept-prize">Worth ${money(r?.bounty ?? 0)} and some Performance each</span>
      <span class="dept-act">${on ? 'Fighting now' : 'Rematch'}</span>
    </button>`;
  }
}

/** A department sneaking into the supply closet: chase them off before the clock runs out. */
export class RaidAlert {
  private root: HTMLElement;
  private shownFor = '';

  constructor(
    private get: () => GameState,
    private hooks: WarHooks,
    private blocked: () => boolean,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'raid-pop';
    this.root.id = 'raid-pop';
    this.root.hidden = true;
    this.root.setAttribute('role', 'alert');
    this.root.innerHTML = `<div class="raid-bubble"><p class="raid-text"></p>
        <div class="psst-actions"><button type="button" class="paper-btn paper-btn-strong" data-chase>Chase them off</button></div>
        <div class="psst-clock"><span></span></div></div><span class="raid-face"></span>`;
    document.getElementById('app')!.append(this.root);
    this.root.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('button[data-chase]')) return;
      const s = this.get();
      const r = chaseRaid(s);
      if (!r.ok) return;
      this.hooks.sound.capture();
      this.hooks.bump('bands');
      this.hooks.say(s.ticker[0]?.text ?? '');
    });
  }

  render() {
    const s = this.get();
    const raid = s.war?.closet.raid;
    const show = !!raid && !s.lookBusy && !this.blocked();
    if (!show || !raid) {
      if (!this.root.hidden) this.root.hidden = true;
      this.shownFor = '';
      return;
    }
    const id = `${raid.dept}:${raid.until}`;
    if (this.shownFor !== id) {
      this.shownFor = id;
      this.root.hidden = false;
      const d = dept(raid.dept);
      this.root.querySelector('.raid-text')!.textContent = `${d.short} from ${d.label} is raiding Dale’s closet!`;
      this.root.querySelector('.raid-face')!.innerHTML = faceSvg(TARGET_PEOPLE[d.id][0], 'smug');
      this.hooks.sound.notify();
    }
    const fill = this.root.querySelector<HTMLElement>('.psst-clock span')!;
    fill.style.width = `${Math.max(0, Math.min(1, (raid.until - s.time) / WAR.closet.seconds)) * 100}%`;
  }
}
