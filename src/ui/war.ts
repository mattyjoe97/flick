// Stages 3 and 4 on screen: the map of the 4th floor (pick who to fight), the raid alert
// when a department sneaks into Dale's supply closet, and (Stage 4) the alert when a
// department tries to take its desks back. In Stage 4 the map shows the two rooms behind
// their filing-cabinet walls, with the sabotage you can buy for each.
//
// The map is a sheet over your desk, like Dale's closet: the war keeps going while you look
// at it, and Mr. Feeney's footsteps send you back to your desk. Each department card shows
// the boss behind their barricade (the same drawing as the fight), what's left of their
// Resolve and what taking them gets you.

import { nextTenant, TENANTS, TENANT_RULES, tenantBounty, tenantFloor, tenantRepBonus } from '../sim/tenants';
import { tierFloor } from '../sim/ladder';
import { youPortrait } from './apps/staffing';
import { RIVAL, rivalCompany, rivalLeft, rivalStage } from '../sim/rival';
import { setFill } from './fill';
import daleHead from '../assets/art/dale-head.webp';
import { co } from './co';
import iconUnplug from '../assets/art/icon-unplug.webp';
import iconReplyAll from '../assets/art/icon-replyall.webp';
import { DEPARTMENTS, HR_DIRECTOR, POLITICS, REMATCH, ROOMS, SIEGE, WAR, type Department, type DeptId, type Room, type RoomId } from '../sim/content';
import { coach, nameOf } from '../sim/politics';
import { closetIsYours, rolePower } from '../sim/mods';
import { currentTarget, deptMax, deptPerk, deptTaken, deptsTaken, reclaimTarget, rematchOrder, type GameState } from '../sim/state';
import { holdLine, sabotage, sabotageCost, sabotaged } from '../sim/siege';
import { chaseRaid, dept, fight } from '../sim/war';
import { rematchBounty } from '../sim/rematch';
import { toughness } from '../sim/ladder';

/** Resolve (or a wall) as you see it: up the career ladder everyone's numbers are bigger. */
const big = (s: GameState, n: number) => Math.round(n * toughness(s)).toLocaleString('en-US');
import { TARGET_PEOPLE, PEOPLE, type Mood } from './characters';
import { coverSvg, WHITE_FLAG } from './scene';
import { faceSvg, portrait } from './portraits';

const esc = (text: string) =>
  co(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
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

/** A Stage 4 room's Attack button. */
function attackButton(r: Room, on: boolean) {
  return `<button type="button" class="dept-act" data-fight="${r.room}">${on ? 'Fighting now' : 'Attack'}</button>`;
}

/** A Stage 4 room's sabotage button (its label and price are filled in every frame). */
function trickButton(r: Room) {
  const icon = r.room === 'breakroom' ? iconUnplug : iconReplyAll;
  return `<button type="button" class="dept-act sab" data-sabotage="${r.room}" title="${esc(r.sabotage.label)}: ${esc(r.sabotage.does)}"><img src="${icon}" alt="" draggable="false"><span class="sab-label">&nbsp;</span></button>`;
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
    if (b.dataset.defend !== undefined) {
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
    const to = b.dataset.fight as DeptId | RoomId | 'hr' | 'rematch' | 'tenant' | undefined;
    if (!to) return;
    if (s.war.fighting === to) return this.close();
    const r = fight(s, to);
    if (!r.ok) {
      this.hooks.sound.miss();
      return this.hooks.say(r.reason);
    }
    this.hooks.sound.grab();
    const room = ROOMS.find((x) => x.room === to);
    this.hooks.say(
      to === 'rematch'
        ? 'Back to the rematches.'
        : to === 'tenant'
          ? `You take the stairs up to ${nextTenant(s)?.company ?? 'the next floor'}.`
        : to === 'hr'
          ? 'You turn your desk toward HR.'
          : room
            ? `You turn your desk toward the ${room.label}.`
            : s.stage === 5
              ? `You go to win back ${dept(to as DeptId).label}.`
              : `You turn your desk toward ${dept(to as DeptId).label}.`,
    );
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
    const politics = s.stage === 5;
    const atk = s.war.counter.attack;
    const key = [
      politics ? DEPARTMENTS.map((d) => (s.war.depts[d.dept].seized ? 'S' : '')).join('') : '',
      siege ? ROOMS.map((r) => { const w = s.war.rooms[r.room]; return `${w.taken ? 'T' : ''}${w.wall > 0 ? 'W' : ''}${sabotaged(s, r.room) ? 'S' : ''}`; }).join(',') : '',
      siege ? DEPARTMENTS.map((d) => (deptPerk(s, d.dept) ? '' : 'L')).join('') + (atk ? `${atk.dept}:${atk.until}` : '') + `g${rolePower(s, 'guard').toFixed(2)}` : '',
      s.stage,
      s.war.fighting,
      DEPARTMENTS.map((d) => (deptTaken(s, d.dept) ? 'T' : '')).join(','),
      raid ? `${raid.dept}:${raid.until}` : '',
      closetIsYours(s),
      rm ? `${rm.round}:${rm.index}` : '',
      s.rival?.race ? `${s.rival.race.stage}:${s.rival.race.result}:${s.rival.race.company}` : '',
      s.stage >= 6 ? `t${s.tenants?.taken}:${s.job?.tier}` : '',
    ].join('|');
    if (key !== this.key) {
      this.key = key;
      const taken = deptsTaken(s);
      this.sum.textContent =
        s.stage >= 6
          ? nextTenant(s)
            ? 'The whole floor is yours. The other companies in the building are next, one floor at a time (or quit any time: every floor you take makes this job worth more).'
            : 'The whole building is yours. The rematches never stop.'
          : politics
            ? `HR has opened an investigation. Close it either way: flick ${HR_DIRECTOR.name} down, or win HR over by sending memos from your computer. If HR’s case file fills, HR takes one of your departments.`
          : siege
            ? `Two rooms left, behind walls of filing cabinets: knock the wall down, then them. The Drill Gatling, Barrages and Engineers hit walls hardest. Take both and the floor is yours.`
            : `${taken} of 4 taken. Switch any time: they keep the damage you’ve done. Each one you take makes the rest ${Math.round((WAR.reinforce - 1) * 100)}% tougher.`;
      this.grid.innerHTML = politics
        ? [this.raceCard(s), this.hrCard(s), ...DEPARTMENTS.filter((d) => s.war.depts[d.dept].seized).map((d) => this.reclaimCard(s, d)), this.rematchCard(s), this.atStakeCard(s)].join('')
        : siege
          ? [this.raceCard(s), ...ROOMS.map((r) => this.roomCard(s, r)), this.rematchCard(s), this.holdingCard(s)].join('')
          : [this.raceCard(s), ...(s.stage >= 6 ? [this.buildingCard(s)] : []), ...DEPARTMENTS.map((d) => this.deptCard(s, d)), ...(s.stage >= 6 ? ROOMS.map((r) => this.roomCard(s, r)) : []), this.closetCard(s), this.rematchCard(s)].join('');
    }
    if (politics) this.updatePolitics(s);
    else if (siege) this.updateSiege(s);
    else this.updateDepts(s, raid);
    const ten = nextTenant(s);
    if (ten && s.stage >= 6) {
      const share = s.war.fighting === 'tenant' ? Math.max(0, s.targetResolve) / ten.resolve : s.tenants.share;
      setFill(this.grid.querySelector<HTMLElement>('[data-bar="tenant"]'), share);
      this.text('[data-left="tenant"]', `${big(s, share * ten.resolve)} Resolve left`);
    }
    if (s.rival?.race && !s.rival.race.result) {
      setFill(this.grid.querySelector<HTMLElement>('[data-bar="chad"]'), Math.min(1, s.time / s.rival.race.target));
      this.text('[data-chad-left]', raceClock(rivalLeft(s)));
    }
    if (rm) {
      const on = s.stage >= 6 || s.war.fighting === 'rematch';
      const left = (on ? Math.max(0, s.targetResolve) : rm.left ?? rm.resolve) / rm.resolve;
      const bar = this.grid.querySelector<HTMLElement>('[data-bar="rematch"]');
      setFill(bar, left);
      this.text('[data-rematch-prize]', money(rm.bounty));
    }
  }

  private updateDepts(s: GameState, raid: GameState['war']['closet']['raid']) {
    for (const d of DEPARTMENTS) {
      if (deptTaken(s, d.dept)) continue;
      const share = this.share(s, d);
      const bar = this.grid.querySelector<HTMLElement>(`[data-bar="${d.dept}"]`);
      setFill(bar, share);
      this.text(`[data-left="${d.dept}"]`, `${big(s, share * deptMax(s, d.dept))} Resolve left`);
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
      setFill(wallBar, w.wall / r.wall);
      this.text(`[data-left="wall-${r.room}"]`, `Wall: ${big(s, w.wall)} left`);
      const share = this.roomShare(s, r);
      const bar = this.grid.querySelector<HTMLElement>(`[data-bar="${r.room}"]`);
      setFill(bar, share);
      this.text(`[data-left="${r.room}"]`, `Resolve: ${big(s, share * r.resolve)} left`);
      const btn = this.grid.querySelector<HTMLButtonElement>(`[data-sabotage="${r.room}"]`);
      if (btn) {
        const on = sabotaged(s, r.room);
        const label = on ? `${r.room === 'breakroom' ? 'Unplugged' : 'Reply-all storm'}: ${clock(w.sabotageUntil - s.time)}` : `${r.sabotage.label} · ${money(cost)}`;
        const span = btn.querySelector(".sab-label");
        if (span && span.textContent !== label) span.textContent = label;
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

  /** Stage 5, every frame: HR's Resolve, goodwill and case file, and anything you're winning back. */
  private updatePolitics(s: GameState) {
    const p = s.war.politics;
    const hr = s.war.fighting === 'hr' ? Math.max(0, s.targetResolve) / HR_DIRECTOR.resolve : p.hrShare;
    const bar = (key: string, share: number) => {
      const el = this.grid.querySelector<HTMLElement>(`[data-bar="${key}"]`);
      setFill(el, share);
    };
    bar('hr', hr);
    bar('goodwill', p.goodwill / POLITICS.goodwill);
    bar('evidence', p.evidence / POLITICS.evidence.full);
    this.text('[data-left="hr"]', `Resolve: ${big(s, hr * HR_DIRECTOR.resolve)} left`);
    this.text('[data-left="goodwill"]', `HR goodwill: ${Math.floor(p.goodwill)} of ${POLITICS.goodwill} (send memos)`);
    this.text('[data-left="evidence"]', `HR’s case file: ${Math.round(p.evidence)}% full`);
    for (const d of DEPARTMENTS) {
      if (!s.war.depts[d.dept].seized) continue;
      const max = reclaimTarget(d.dept).resolve;
      const share = s.war.fighting === d.dept ? Math.max(0, s.targetResolve) / max : s.war.depts[d.dept].share;
      bar(d.dept, share);
      this.text(`[data-left="${d.dept}"]`, `${big(s, share * max)} Resolve left`);
    }
  }

  /** The HR Director: his Resolve, HR's goodwill (the other way to win) and the case file. */
  private hrCard(s: GameState) {
    const on = s.war.fighting === 'hr';
    const mood: Mood = on ? 'angry' : 'idle';
    return `<button type="button" class="dept hr-card${on ? ' fighting' : ''}" data-fight="hr" aria-label="HR: ${esc(HR_DIRECTOR.name)}. ${on ? 'Fighting now' : 'Attack'}.">
      <span class="dept-label">HR</span>
      <span class="dept-scene">${deptPicture('hr', mood)}</span>
      <span class="dept-who"><b>${esc(HR_DIRECTOR.name)}</b> <small>${esc(HR_DIRECTOR.title)}</small></span>
      <span class="dept-bar" aria-hidden="true"><i data-bar="hr"></i></span><span class="dept-left" data-left="hr"></span>
      <span class="dept-bar goodwill" aria-hidden="true"><i data-bar="goodwill"></i></span><span class="dept-left" data-left="goodwill"></span>
      <span class="dept-bar evidence" aria-hidden="true"><i data-bar="evidence"></i></span><span class="dept-left" data-left="evidence"></span>
      <span class="dept-prize">Close the case: the whole floor is yours for good.</span>
      <span class="dept-act">${on ? 'Fighting now' : 'Attack'}</span>
    </button>`;
  }

  /** A department HR took: win it back. */
  private reclaimCard(s: GameState, d: Department) {
    const on = s.war.fighting === d.dept;
    return `<button type="button" class="dept reclaim-card${on ? ' fighting' : ''}" data-fight="${d.dept}" aria-label="${esc(d.label)} reports to HR now. Win it back: ${esc(d.prize)}.">
      <span class="dept-label">${esc(d.label)}</span>
      <span class="dept-scene">${deptPicture(d.id, on ? 'angry' : 'smug')}</span>
      <span class="dept-who"><b>${esc(d.name)}</b> <small>Reports to HR now</small></span>
      <span class="dept-bar" aria-hidden="true"><i data-bar="${d.dept}"></i></span><span class="dept-left" data-left="${d.dept}"></span>
      <span class="dept-prize">Win it back: ${esc(d.prize)}</span>
      <span class="dept-act raid">${on ? 'Fighting now' : 'Win it back'}</span>
    </button>`;
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
      : `<span class="room-acts">${attackButton(r, on)}${trickButton(r)}</span>
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
    const hold = a ? `<button type="button" class="dept-act raid" data-defend>Hold the line · <span data-clock="counter">${Math.ceil(Math.max(0, a.until - s.time))} s</span></button>` : '';
    return `<div class="dept holding-card${a ? ' raided' : ''}">
      <span class="dept-label">Your departments</span>
      <ul class="holding">${rows}</ul>
      <span class="dept-prize">${guards ? `${guards} Guard${guards > 1 ? 's' : ''} on duty: they stop about ${stop}% of attempts.` : 'They’ll try to take their desks back. Make someone a Guard (tap them in the office) to stop most attempts.'} One that gets through switches its prize off for ${SIEGE.counter.lost / 60} minutes.</span>
      ${hold}
    </div>`;
  }

  /** Stage 6: the building's other companies, a floor at a time, with the elevator panel beside them. */
  private buildingCard(s: GameState) {
    const st = s.tenants;
    const t = nextTenant(s);
    const on = s.war.fighting === 'tenant';
    const mine = tierFloor(s.job?.tier ?? 0);
    const floors = TENANTS.map((x, i) => {
      const state = i < st.taken ? 'yours' : i === st.taken ? (on ? 'now' : 'next') : 'locked';
      const note = state === 'yours' ? 'Yours' : state === 'now' ? 'Fighting now' : state === 'next' ? 'Next' : 'Locked';
      return `<li class="${state}"><b>${tenantFloor(s, i)}</b><span>${esc(x.company)}<small>${note}</small></span></li>`;
    })
      .reverse()
      .join('');
    const panel = `<ol class="elevator">${floors}<li class="yours"><b>${mine}</b><span>You<small>Yours</small></span></li></ol>`;
    const boss = t
      ? `<button type="button" class="bld-boss${on ? ' fighting' : ''}" data-fight="tenant" aria-label="${esc(t.company)}: ${esc(t.name)}. ${on ? 'Fighting now' : 'Attack'}.">
          <span class="dept-scene">${deptPicture(t.id, on ? 'angry' : 'smug')}</span>
          <span class="dept-who"><b>${esc(t.name)}</b> <small>${esc(t.title)}, ${esc(t.company)}</small></span>
          <span class="dept-bar" aria-hidden="true"><i data-bar="tenant"></i></span><span class="dept-left" data-left="tenant"></span>
          <span class="dept-prize">${esc(t.twist ?? '')} Take Floor ${tenantFloor(s, st.taken)}: ${money(tenantBounty(s, st.taken))}, and this job is worth +${Math.round(TENANT_RULES.repEach * 100)}% Reputation${st.taken === TENANTS.length - 1 ? ` (+${Math.round((TENANT_RULES.repEach + TENANT_RULES.repAll) * 100)}% for the last floor)` : ''}.</span>
          <span class="dept-act">${on ? 'Fighting now' : 'Attack'}</span>
        </button>`
      : `<p class="bld-done">Every floor from ${mine} to ${tenantFloor(s, TENANTS.length - 1)} is yours. This job is worth ${Math.round(tenantRepBonus(s) * 100)}% more Reputation.</p>`;
    return `<div class="dept building-card"><span class="dept-label">The building</span><div class="bld">${panel}${boss}</div></div>`;
  }

  /** Chad's race to close HR's case first (from your second job on). */
  private raceCard(s: GameState) {
    const race = s.rival?.race;
    if (!race) return '';
    const yours = s.stage >= 6 ? 1 : (s.stage - 1) / 5;
    const his = rivalStage(s);
    const prize =
      race.result === 'won'
        ? `<span class="dept-prize got">You beat him! This job pays ${Math.round(RIVAL.rep * 100)}% more Reputation when you leave.</span>`
        : race.result === 'lost'
          ? `<span class="dept-prize">Chad closed his case first. No bonus this time: get him on the next job.</span>`
          : `<span class="dept-prize">Close HR’s case before he does: this job pays ${Math.round(RIVAL.rep * 100)}% more Reputation when you leave.</span>`;
    const record = s.rival.wins || s.rival.losses ? ` <small>You ${s.rival.wins}–${s.rival.losses} Chad</small>` : '';
    return `<div class="dept race-card${race.result ? ` ${race.result}` : ''}">
      <span class="dept-label">The race${record}</span>
      <span class="race-row"><span class="race-face">${faceSvg(youPortrait(s.career.rank), race.result === 'won' ? 'happy' : 'idle')}</span><b>You</b><span class="dept-bar" aria-hidden="true"><i style="width:${(yours * 100).toFixed(1)}%"></i></span><small>${s.stage >= 6 ? 'Case closed' : `Stage ${s.stage}`}</small></span>
      <span class="race-row chad"><span class="race-face">${faceSvg('chad', race.result === 'lost' ? 'happy' : race.result === 'won' ? 'worried' : 'smug')}</span><b>Chad</b><span class="dept-bar" aria-hidden="true"><i data-bar="chad" style="width:${(Math.min(1, s.time / race.target) * 100).toFixed(1)}%"></i></span><small>${race.result === 'lost' || his >= 6 ? 'Case closed' : `Stage ${his} at ${esc(rivalCompany(s))} · done in <span data-chad-left>${raceClock(rivalLeft(s))}</span>`}</small></span>
      ${prize}
    </div>`;
  }

  /** Stage 5: your four departments, and which (if any) HR has taken. */
  private atStakeCard(s: GameState) {
    const rows = DEPARTMENTS.map((d) => {
      const seized = s.war.depts[d.dept].seized;
      return `<li class="${seized ? 'lost' : 'ok'}"><span class="hold-face">${faceSvg(TARGET_PEOPLE[d.id][0], seized ? 'smug' : 'worried')}</span><span><b>${esc(d.label)}</b><small>${seized ? 'Taken by HR: win it back' : 'Holding'}</small></span></li>`;
    }).join('');
    return `<div class="dept holding-card">
      <span class="dept-label">Your departments</span>
      <ul class="holding">${rows}</ul>
      <span class="dept-prize">If HR’s case file fills, HR takes one of these (and its prize) until you win it back. A Document Retention Policy memo shreds some of it.</span>
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
    const left = big(s, share * deptMax(s, d.dept));
    const act = taken ? 'Yours' : on ? 'Fighting now' : 'Attack';
    return `<button type="button" class="dept${on ? ' fighting' : ''}${taken ? ' taken' : ''}" data-fight="${d.dept}" ${taken ? 'aria-disabled="true"' : ''}
      aria-label="${esc(d.label)}: ${esc(d.name)}. ${taken ? `Yours. ${esc(d.prize)}.` : `${Math.round(share * 100)}% Resolve left. Take it for: ${esc(d.prize)}.`} ${act}.">
      <span class="dept-label">${esc(d.label)}</span>
      <span class="dept-scene">${deptPicture(d.id, mood)}${taken ? FLAG : ''}</span>
      <span class="dept-who"><b>${esc(d.name)}</b> <small>${esc(d.title)}</small></span>
      ${taken ? '' : `<span class="dept-bar" aria-hidden="true"><i data-bar="${d.dept}" style="width:${(share * 100).toFixed(1)}%"></i></span><span class="dept-left" data-left="${d.dept}">${left} Resolve left</span>`}
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
      <span class="dept-who"><b>Dale’s closet</b> <small>${s.stage >= 4 ? 'Nobody raids it now' : 'Contested ground'}</small></span>
      <span class="dept-prize">${status}</span>${btn}`;
    return raid
      ? `<button type="button" class="dept closet-card raided" data-chase>${inner}</button>`
      : `<div class="dept closet-card${yours ? '' : ' lost'}">${inner}</div>`;
  }

  private rematchCard(s: GameState) {
    const r = s.rematch;
    const on = s.stage >= 6 || s.war.fighting === 'rematch';
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
      <span class="dept-prize">Worth <span data-rematch-prize>${money(rematchBounty(s))}</span> and some Performance each</span>
      <span class="dept-act">${on ? 'Fighting now' : 'Rematch'}</span>
    </button>`;
  }
}

/** Chad's clock: minutes (and hours) left. */
function raceClock(seconds: number) {
  const m = Math.ceil(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
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
    setFill(fill, (raid.until - s.time) / WAR.closet.seconds);
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
    this.root.className = 'raid-pop retake-pop';
    this.root.id = 'retake-pop';
    this.root.hidden = true;
    this.root.setAttribute('role', 'alert');
    this.root.innerHTML = `<div class="raid-bubble"><p class="raid-text"></p>
        <div class="psst-actions"><button type="button" class="paper-btn paper-btn-strong" data-defend>Hold the line</button></div>
        <div class="psst-clock"><span></span></div></div><span class="raid-face"></span>`;
    document.getElementById('app')!.append(this.root);
    this.root.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('button[data-defend]')) return;
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
    setFill(fill, (a.until - s.time) / SIEGE.counter.seconds);
  }
}

/** Stage 5: HR has called someone you beat in for an interview. Coach them before the clock runs out. */
export class InterviewAlert {
  private root: HTMLElement;
  private shownFor = '';

  constructor(
    private get: () => GameState,
    private hooks: WarHooks,
    private blocked: () => boolean,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'raid-pop interview-pop';
    this.root.id = 'interview-pop';
    this.root.hidden = true;
    this.root.setAttribute('role', 'alert');
    this.root.innerHTML = `<div class="raid-bubble"><p class="raid-text"></p>
        <div class="psst-actions"><button type="button" class="paper-btn paper-btn-strong" data-coach>Coach them</button></div>
        <div class="psst-clock"><span></span></div></div><span class="raid-face"></span>`;
    document.getElementById('app')!.append(this.root);
    this.root.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('button[data-coach]')) return;
      const s = this.get();
      if (!coach(s).ok) return;
      this.hooks.sound.capture();
      this.hooks.say(s.ticker[0]?.text ?? '');
    });
  }

  render() {
    const s = this.get();
    const iv = s.stage === 5 ? s.war?.politics?.interview : null;
    const show = !!iv && !s.lookBusy && !this.blocked();
    if (!show || !iv) {
      if (!this.root.hidden) this.root.hidden = true;
      this.shownFor = '';
      return;
    }
    const id = `${iv.who}:${iv.until}`;
    if (this.shownFor !== id) {
      this.shownFor = id;
      this.root.hidden = false;
      this.root.querySelector('.raid-text')!.textContent = `HR has called ${nameOf(iv.who)} in for an interview!`;
      this.root.querySelector('.raid-face')!.innerHTML = faceSvg(TARGET_PEOPLE[iv.who]?.[0] ?? 'gary', 'worried');
      this.hooks.sound.notify();
    }
    const fill = this.root.querySelector<HTMLElement>('.psst-clock span')!;
    setFill(fill, (iv.until - s.time) / POLITICS.interview.seconds);
  }
}
