// Stages 3 and 4 on screen: the map of the 4th floor (pick who to fight), the raid alert
// when a department sneaks into Dale's supply closet, and (Stage 4) the alert when a
// department tries to take its desks back. In Stage 4 the map shows the two rooms behind
// their filing-cabinet walls, with the sabotage you can buy for each.
//
// The map is a sheet over your desk, like Dale's closet: the war keeps going while you look
// at it, and Mr. Feeney's footsteps send you back to your desk. Each department card shows
// the boss behind their barricade (the same drawing as the fight), what's left of their
// Resolve and what taking them gets you.

import daleHead from '../assets/art/dale-head.webp';
import { DEPARTMENTS, REMATCH, ROOMS, SIEGE, WAR, type Department, type DeptId, type Room, type RoomId } from '../sim/content';
import { closetIsYours, rolePower } from '../sim/mods';
import { currentTarget, deptMax, deptPerk, deptTaken, deptsTaken, rematchOrder, type GameState } from '../sim/state';
import { holdLine, sabotage, sabotageCost, sabotaged } from '../sim/siege';
import { chaseRaid, dept, fight } from '../sim/war';
import { TARGET_PEOPLE, PEOPLE, type Mood } from './characters';
import { coverSvg, WHITE_FLAG } from './scene';
import { faceSvg, portrait } from './portraits';

const esc = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

/** The white flag on a ruler that goes up over a department you've taken. */
const FLAG = `<img class="dept-flag" src="${WHITE_FLAG}" alt="" draggable="false">`;

/** The boss behind their barricade, cropped from the fight scene. */
function deptPicture(id: string, mood: Mood, broken = false) {
  const who = TARGET_PEOPLE[id]?.[0];
  const person = who ? `<g transform="translate(313 70) scale(1.45)">${portrait(who, mood)}</g>` : '';
  return `<svg class="dept-pic" viewBox="224 50 352 212" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <rect x="224" y="50" width="352" height="212" fill="#d7dde2"/><rect x="224" y="50" width="352" height="18" fill="#c9d0d6"/>
    ${person}${coverSvg(id, broken)}
    <rect x="224" y="250" width="352" height="12" fill="#c9ced4"/></svg>`;
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
    this.root.querySelector<HTMLElement>('button.dept.fighting, .room-card.fighting [data-fight], .closet-back')?.focus({ preventScroll: true });
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
    if (b.dataset.sabotage) {
      const id = b.dataset.sabotage as RoomId;
      const r = sabotage(s, id);
      if (!r.ok) {
        this.hooks.sound.miss();
        return this.hooks.say(r.reason);
      }
      this.hooks.sound.capture();
      this.hooks.bump('salary');
      this.hooks.say(s.ticker[0]?.text ?? '');
      this.key = '';
      return;
    }
    if (b.dataset.hold !== undefined) {
      if (holdLine(s).ok) {
        this.hooks.sound.capture();
        this.hooks.bump('bands');
        this.hooks.say(s.ticker[0]?.text ?? '');
      }
      this.key = '';
      return;
    }
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
    const to = b.dataset.fight as DeptId | RoomId | 'rematch' | undefined;
    if (!to) return;
    if (s.war.fighting === to) return this.close();
    const r = fight(s, to);
    if (!r.ok) {
      this.hooks.sound.miss();
      return this.hooks.say(r.reason);
    }
    this.hooks.sound.grab();
    const room = ROOMS.find((x) => x.room === to);
    this.hooks.say(to === 'rematch' ? 'Back to the rematches.' : room ? `You turn your desk toward the ${room.label}.` : `You turn your desk toward ${dept(to as DeptId).label}.`);
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
    const siege = s.stage === 4;
    const atk = s.war.counter.attack;
    const key = [
      siege ? ROOMS.map((r) => { const w = s.war.rooms[r.room]; return `${w.taken ? 'T' : ''}${w.wall > 0 ? 'W' : ''}${sabotaged(s, r.room) ? 'S' : ''}`; }).join(',') : '',
      siege ? DEPARTMENTS.map((d) => (deptPerk(s, d.dept) ? '' : 'L')).join('') + (atk ? `${atk.dept}:${atk.until}` : '') + `g${rolePower(s, 'guard').toFixed(2)}` : '',
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
        s.stage >= 5
          ? 'The whole floor is yours. The rematches never stop.'
          : siege
            ? `Two rooms left, behind walls of filing cabinets: knock the wall down, then them. The Drill Gatling, Barrages and Engineers hit walls hardest. Take both and the floor is yours.`
            : `${taken} of 4 taken. Switch any time: they keep the damage you’ve done. Each one you take makes the rest ${Math.round((WAR.reinforce - 1) * 100)}% tougher.`;
      this.grid.innerHTML = siege
        ? [...ROOMS.map((r) => this.roomCard(s, r)), this.rematchCard(s), this.holdingCard(s)].join('')
        : [...DEPARTMENTS.map((d) => this.deptCard(s, d)), this.closetCard(s), this.rematchCard(s)].join('');
    }
    if (siege) this.updateSiege(s);
    else this.updateDepts(s, raid);
    if (rm) {
      const on = s.stage >= 5 || s.war.fighting === 'rematch';
      const left = (on ? Math.max(0, s.targetResolve) : rm.left ?? rm.resolve) / rm.resolve;
      const bar = this.grid.querySelector<HTMLElement>('[data-bar="rematch"]');
      if (bar) bar.style.width = `${(Math.min(1, left) * 100).toFixed(1)}%`;
    }
  }

  private updateDepts(s: GameState, raid: GameState['war']['closet']['raid']) {
    for (const d of DEPARTMENTS) {
      if (deptTaken(s, d.dept)) continue;
      const share = this.share(s, d);
      const bar = this.grid.querySelector<HTMLElement>(`[data-bar="${d.dept}"]`);
      if (bar) bar.style.width = `${(share * 100).toFixed(1)}%`;
      this.text(`[data-left="${d.dept}"]`, `${Math.round(share * deptMax(s, d.dept)).toLocaleString('en-US')} Resolve left`);
    }
    if (raid) this.text('[data-clock="raid"]', `${Math.ceil(Math.max(0, raid.until - s.time))} s`);
    else if (!closetIsYours(s)) this.text('[data-clock="lost"]', clock(Math.max(0, s.war.closet.lostUntil - s.time)));
  }

  /** Stage 4, every frame: the walls, the Resolve, the sabotage buttons and your departments' clocks. */
  private updateSiege(s: GameState) {
    const cost = sabotageCost(s);
    for (const r of ROOMS) {
      const w = s.war.rooms[r.room];
      if (w.taken) continue;
      const wallBar = this.grid.querySelector<HTMLElement>(`[data-bar="wall-${r.room}"]`);
      if (wallBar) wallBar.style.width = `${((w.wall / r.wall) * 100).toFixed(1)}%`;
      this.text(`[data-left="wall-${r.room}"]`, `Wall: ${Math.ceil(w.wall).toLocaleString('en-US')} left`);
      const share = this.roomShare(s, r);
      const bar = this.grid.querySelector<HTMLElement>(`[data-bar="${r.room}"]`);
      if (bar) bar.style.width = `${(share * 100).toFixed(1)}%`;
      this.text(`[data-left="${r.room}"]`, `Resolve: ${Math.round(share * r.resolve).toLocaleString('en-US')} left`);
      const btn = this.grid.querySelector<HTMLButtonElement>(`[data-sabotage="${r.room}"]`);
      if (btn) {
        const on = sabotaged(s, r.room);
        const label = on ? `${r.room === 'breakroom' ? 'Unplugged' : 'Reply-all storm'}: ${clock(w.sabotageUntil - s.time)}` : `${r.sabotage.label} · ${money(cost)}`;
        if (btn.textContent !== label) btn.textContent = label;
        const off = on || s.salary < cost;
        if (btn.classList.contains('cant') !== off) btn.classList.toggle('cant', off);
      }
    }
    for (const d of DEPARTMENTS) {
      const lost = s.war.depts[d.dept].lostUntil - s.time;
      if (lost > 0) this.text(`[data-clock="dept-${d.dept}"]`, clock(lost));
    }
    const a = s.war.counter.attack;
    if (a) this.text('[data-clock="counter"]', `${Math.ceil(Math.max(0, a.until - s.time))} s`);
  }

  private roomShare(s: GameState, r: Room) {
    const w = s.war.rooms[r.room];
    if (w.taken) return 0;
    if (s.war.fighting === r.room) return Math.max(0, Math.min(1, s.targetResolve / r.resolve));
    return w.share;
  }

  private roomCard(s: GameState, r: Room) {
    const w = s.war.rooms[r.room];
    const taken = w.taken;
    const on = s.war.fighting === r.room;
    const share = this.roomShare(s, r);
    const mood: Mood = taken ? 'worried' : on ? 'angry' : PEOPLE[TARGET_PEOPLE[r.id][0]]?.rest ?? 'idle';
    const wallUp = w.wall > 0;
    const bars = taken
      ? ''
      : `${wallUp ? `<span class="dept-bar wall" aria-hidden="true"><i data-bar="wall-${r.room}" style="width:${((w.wall / r.wall) * 100).toFixed(1)}%"></i></span><span class="dept-left" data-left="wall-${r.room}"></span>` : ''}
        <span class="dept-bar" aria-hidden="true"><i data-bar="${r.room}" style="width:${(share * 100).toFixed(1)}%"></i></span><span class="dept-left" data-left="${r.room}"></span>`;
    const actions = taken
      ? `<span class="dept-act">Yours</span>`
      : `<span class="room-acts"><button type="button" class="dept-act" data-fight="${r.room}">${on ? 'Fighting now' : 'Attack'}</button>
          <button type="button" class="dept-act sab" data-sabotage="${r.room}" title="${esc(r.sabotage.label)}: ${esc(r.sabotage.does)}"></button></span>
        <span class="dept-sab-note">Sabotage: ${esc(r.sabotage.does)}.</span>`;
    return `<div class="dept room-card${on ? ' fighting' : ''}${taken ? ' taken' : ''}" role="group" aria-label="${esc(r.label)}: ${esc(r.name)}. ${taken ? `Yours. ${esc(r.prize)}.` : `${wallUp ? 'Behind a wall. ' : ''}${Math.round(share * 100)}% Resolve left. Take it for: ${esc(r.prize)}.`}">
      <span class="dept-label">${esc(r.label)}</span>
      <span class="dept-scene">${deptPicture(r.id, mood, !wallUp)}${taken ? FLAG : ''}</span>
      <span class="dept-who"><b>${esc(r.name)}</b> <small>${esc(r.title)}</small></span>
      ${bars}
      <span class="dept-prize${taken ? ' got' : ''}">${taken ? 'You have: ' : 'Take it: '}${esc(r.prize)}</span>
      ${actions}
    </div>`;
  }

  /** Stage 4: the departments you took, and whether they're holding. */
  private holdingCard(s: GameState) {
    const a = s.war.counter.attack;
    const guards = s.allies.filter((x) => x.role === 'guard').length;
    const stop = Math.round(Math.min(SIEGE.counter.guardMax, rolePower(s, 'guard') * SIEGE.counter.guardEach) * 100);
    const rows = DEPARTMENTS.map((d) => {
      const lost = s.war.depts[d.dept].lostUntil > s.time;
      const now = a?.dept === d.dept;
      const state = now ? `<b class="raid-now">Under attack!</b>` : lost ? `Took its desks back: prize off for <span data-clock="dept-${d.dept}">${clock(s.war.depts[d.dept].lostUntil - s.time)}</span>` : 'Holding';
      return `<li class="${now ? 'attack' : lost ? 'lost' : 'ok'}"><span class="hold-face">${faceSvg(TARGET_PEOPLE[d.id][0], now ? 'smug' : lost ? 'happy' : 'worried')}</span><span><b>${esc(d.label)}</b><small>${state}</small></span></li>`;
    }).join('');
    const hold = a ? `<button type="button" class="dept-act raid" data-hold>Hold the line · <span data-clock="counter">${Math.ceil(Math.max(0, a.until - s.time))} s</span></button>` : '';
    return `<div class="dept holding-card${a ? ' raided' : ''}">
      <span class="dept-label">Your departments</span>
      <ul class="holding">${rows}</ul>
      <span class="dept-prize">${guards ? `${guards} Guard${guards > 1 ? 's' : ''} on duty: they stop about ${stop}% of attempts.` : 'They’ll try to take their desks back. Make someone a Guard (tap them in the office) to stop most attempts.'} One that gets through switches its prize off for ${SIEGE.counter.lost / 60} minutes.</span>
      ${hold}
    </div>`;
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
    const on = s.stage >= 5 || s.war.fighting === 'rematch';
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

/** Stage 4: a department trying to take its desks back. Hold the line before the clock runs out. */
export class CounterAlert {
  private root: HTMLElement;
  private shownFor = '';

  constructor(
    private get: () => GameState,
    private hooks: WarHooks,
    private blocked: () => boolean,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'raid-pop counter-pop';
    this.root.id = 'counter-pop';
    this.root.hidden = true;
    this.root.setAttribute('role', 'alert');
    this.root.innerHTML = `<div class="raid-bubble"><p class="raid-text"></p>
        <div class="psst-actions"><button type="button" class="paper-btn paper-btn-strong" data-hold>Hold the line</button></div>
        <div class="psst-clock"><span></span></div></div><span class="raid-face"></span>`;
    document.getElementById('app')!.append(this.root);
    this.root.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('button[data-hold]')) return;
      const s = this.get();
      if (!holdLine(s).ok) return;
      this.hooks.sound.capture();
      this.hooks.bump('bands');
      this.hooks.say(s.ticker[0]?.text ?? '');
    });
  }

  render() {
    const s = this.get();
    const a = s.stage === 4 ? s.war?.counter.attack : null;
    const show = !!a && !s.lookBusy && !this.blocked();
    if (!show || !a) {
      if (!this.root.hidden) this.root.hidden = true;
      this.shownFor = '';
      return;
    }
    const id = `${a.dept}:${a.until}`;
    if (this.shownFor !== id) {
      this.shownFor = id;
      this.root.hidden = false;
      const d = dept(a.dept);
      this.root.querySelector('.raid-text')!.textContent = `${d.short} and ${d.label} are trying to take their desks back!`;
      this.root.querySelector('.raid-face')!.innerHTML = faceSvg(TARGET_PEOPLE[d.id][0], 'angry');
      this.hooks.sound.notify();
    }
    const fill = this.root.querySelector<HTMLElement>('.psst-clock span')!;
    fill.style.width = `${Math.max(0, Math.min(1, (a.until - s.time) / SIEGE.counter.seconds)) * 100}%`;
  }
}
