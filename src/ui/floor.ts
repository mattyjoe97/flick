// Your floor: your side of the office, where the people you hire sit. Each team has a
// desk (Danielle has the front desk, Chad has an office), you can watch their work pop
// up as they finish it, and Muffins and Joey come to work with Adam and Danielle. Tap
// someone for their card: hire another seat, send the team to training, or rename them.
//
// Being here counts as working (Mr. Feeney sees you managing your team), like your
// computer: you're safe from walk-bys and your Shooters slow down.

import joeyBall from '../assets/art/pet-joey-ball.webp';
import joeyDerp from '../assets/art/pet-joey-derp.webp';
import joeySit from '../assets/art/pet-joey-sit.webp';
import muffinsLoaf from '../assets/art/pet-muffins-loaf.webp';
import muffinsSleep from '../assets/art/pet-muffins-sleep.webp';
import muffinsSwat from '../assets/art/pet-muffins-swat.webp';
import { PAY_GRADES, STAFF, TEAMS, type Team, type TeamId } from '../sim/content';
import { TOP_RANK } from '../sim/career';
import { hire, leadMult, leadName, pizzaMult, rename, seatCap, seatCost, seats, staffPayPerMin, teamPayPerMin, teamPerMin, teamUnlocked, train, trainCost, trainLevel } from '../sim/staff';
import type { GameState } from '../sim/state';
import { esc, money } from './apps/common';
import { portraitSvg } from './portraits';

const PETS = {
  muffins: { name: 'Muffins', poses: [muffinsLoaf, muffinsLoaf, muffinsSleep, muffinsSwat] },
  joey: { name: 'Joey', poses: [joeySit, joeySit, joeyBall, joeyDerp] },
};

const num = (n: number) => Math.round(n).toLocaleString('en-US');
const one = (does: string) => does.replace(/s$/, '');
const a = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

export interface FloorHooks {
  back(): void;
  computer(): void;
  sound: { stamp(): void; miss(): void; grab(): void };
}

export class FloorView {
  private root: HTMLElement;
  private room: HTMLElement;
  private sum: HTMLElement;
  private sheet: HTMLElement;
  private log: HTMLElement;
  private pcBadge: HTMLElement;
  private open = false;
  private roomKey = '';
  private sheetKey = '';
  private selected: TeamId | null = null;
  private editing = false;
  private outcome = '';
  /** Work done that hasn't popped up yet, and when each team last showed some. */
  private seen: Partial<Record<TeamId, { done: number; at: number }>> = {};
  private nextPose = 0;

  constructor(
    private get: () => GameState,
    private hooks: FloorHooks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'floor';
    this.root.id = 'floor';
    this.root.hidden = true;
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', 'Your floor');
    this.root.innerHTML = `
      <header class="floor-bar">
        <h2 class="floor-title">Your floor</h2>
        <p class="floor-sum" aria-live="polite"></p>
        <div class="floor-nav">
          <button type="button" class="tool-btn floor-pc" data-go="pc">Your computer<span class="hide-badge" hidden></span></button>
          <button type="button" class="hide-btn" data-go="war">Back to the war <kbd>Esc</kbd></button>
        </div>
      </header>
      <div class="floor-room"></div>
      <p class="floor-log" aria-live="polite"></p>
      <div class="floor-sheet" role="dialog" aria-modal="false" aria-label="Team" hidden></div>`;
    document.getElementById('app')!.append(this.root);
    this.room = this.root.querySelector('.floor-room')!;
    this.sum = this.root.querySelector('.floor-sum')!;
    this.sheet = this.root.querySelector('.floor-sheet')!;
    this.log = this.root.querySelector('.floor-log')!;
    this.pcBadge = this.root.querySelector('.floor-pc .hide-badge')!;

    this.root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const b = el.closest<HTMLButtonElement>('button');
      if (!b || b.disabled) {
        // A tap outside the card closes it.
        if (!el.closest('.floor-sheet') && this.selected) this.select(null);
        return;
      }
      const d = b.dataset;
      if (d.go === 'war') return this.hooks.back();
      if (d.go === 'pc') return this.hooks.computer();
      if (d.team) return this.select(d.team as TeamId);
      if (d.close !== undefined) return this.select(null);
      if (d.rename !== undefined) {
        this.editing = true;
        this.sheetKey = '';
        this.render();
        const input = this.sheet.querySelector<HTMLInputElement>('input.rename');
        input?.focus();
        input?.select();
        return;
      }
      const s = this.s;
      if (d.hire) {
        const r = hire(s, d.hire as TeamId);
        this.outcome = r.ok ? '' : r.why;
        if (r.ok) this.hooks.sound.stamp();
        else this.hooks.sound.miss();
      } else if (d.train) {
        const r = train(s, d.train as TeamId);
        this.outcome = r.ok ? '' : r.why;
        if (r.ok) this.hooks.sound.stamp();
        else this.hooks.sound.miss();
      }
      this.sheetKey = '';
      this.roomKey = '';
    });
    // Renaming: Enter or leaving the box saves; Escape cancels.
    const save = (input: HTMLInputElement) => {
      if (!this.editing || !this.selected) return;
      rename(this.s, this.selected, input.value);
      this.editing = false;
      this.sheetKey = '';
      this.roomKey = '';
    };
    this.sheet.addEventListener('keydown', (e) => {
      const input = (e.target as HTMLElement).closest<HTMLInputElement>('input.rename');
      if (!input) return;
      if (e.key === 'Enter') save(input);
      else if (e.key === 'Escape') {
        this.editing = false;
        this.sheetKey = '';
      }
      e.stopPropagation();
    });
    this.sheet.addEventListener('focusout', (e) => {
      const input = (e.target as HTMLElement).closest<HTMLInputElement>('input.rename');
      if (input) save(input);
    });
  }

  private get s() {
    return this.get();
  }

  get isOpen() {
    return this.open;
  }

  /** Esc closes the card first, then the floor. Returns true if it used the key. */
  onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && this.selected) {
      this.select(null);
      return true;
    }
    return false;
  }

  setOpen(on: boolean) {
    if (on === this.open) return;
    this.open = on;
    this.root.hidden = !on;
    document.body.classList.toggle('on-floor', on);
    if (on) {
      this.roomKey = '';
      this.seen = {};
      this.root.scrollTop = 0;
      this.root.querySelector<HTMLButtonElement>('[data-go="war"]')?.focus({ preventScroll: true });
    } else this.select(null);
  }

  private select(id: TeamId | null) {
    this.selected = id;
    this.editing = false;
    this.outcome = '';
    this.sheetKey = '';
    this.sheet.hidden = !id;
    this.root.querySelectorAll('.station').forEach((el) => el.classList.toggle('on', (el as HTMLElement).dataset.team === id));
    if (id) this.hooks.sound.grab();
  }

  // ---------------------------------------------------------------- every frame

  render() {
    if (!this.open) return;
    const s = this.s;
    this.renderRoom(s);
    this.renderSummary(s);
    this.renderSheet(s);
    this.popWork(s);
    this.posePets();
    this.log.textContent = s.ticker[0]?.text ?? '';
  }

  /** The badge on Your computer (mail, chat, a ringing phone). */
  setComputerBadge(n: number, ringing: boolean) {
    this.pcBadge.hidden = n === 0;
    this.pcBadge.textContent = n > 9 ? '9+' : String(n);
    this.root.querySelector('.floor-pc')!.classList.toggle('alert', ringing);
  }

  private renderSummary(s: GameState) {
    const steady = staffPayPerMin(s, true);
    const lead = leadMult(s);
    const pizza = pizzaMult(s);
    const bits = [
      `Salary <b>${money(s.salary)}</b>`,
      steady > 0 ? `your team makes <b>${money(staffPayPerMin(s))}/min</b>` : 'nobody works here yet',
      lead > 1 ? `following your lead ×${lead.toFixed(1).replace(/\.0$/, '')}` : '',
      pizza > 1 ? `pizza ×${pizza}` : '',
    ].filter(Boolean);
    const html = bits.join(' · ');
    if (this.sum.innerHTML !== html) this.sum.innerHTML = html;
  }

  /** Every desk on the floor: rebuilt only when something about them changes. */
  private renderRoom(s: GameState) {
    const key = TEAMS.map((t) => `${seats(s, t.id)}.${trainLevel(s, t.id)}.${teamUnlocked(s, t.id) ? 1 : 0}.${s.salary >= seatCost(s, t.id) ? 1 : 0}.${seats(s, t.id) < seatCap(s, t.id) ? 1 : 0}`).join(',') + JSON.stringify(s.names) + (this.selected ?? '');
    if (key !== this.roomKey) {
      this.roomKey = key;
      this.room.innerHTML = TEAMS.map((t) => this.stationHtml(s, t)).join('');
    }
    // Rates and moods tick along without rebuilding.
    for (const t of TEAMS) {
      const cell = this.room.querySelector<HTMLElement>(`[data-cell="${t.id}"]`);
      if (!cell) continue;
      const n = seats(s, t.id);
      const rate = cell.querySelector('.st-rate');
      if (rate && n > 0) {
        const text = t.job ? `${num(teamPerMin(s, t.id))} ${t.does}/min · ${money(teamPayPerMin(s, t.id))}/min` : `Every team +${Math.round(STAFF.managerBoost * n * 100)}%`;
        if (rate.textContent !== text) rate.textContent = text;
      }
      cell.classList.toggle('busy', n > 0 && (leadMult(s) > 1 || pizzaMult(s) > 1));
    }
  }

  private stationHtml(s: GameState, t: Team) {
    const n = seats(s, t.id);
    const unlocked = teamUnlocked(s, t.id);
    const name = leadName(s, t);
    const kind = t.id === 'receptionist' ? 'front' : t.id === 'manager' ? 'office' : 'cube';
    const state = n > 0 ? 'hired' : unlocked ? 'open' : 'locked';
    const cost = seatCost(s, t.id);
    const canHire = unlocked && n < seatCap(s, t.id) && s.salary >= cost;
    const person = n > 0 ? `<span class="st-person">${portraitSvg(t.portrait, 'idle')}</span><span class="st-person st-happy">${portraitSvg(t.portrait, 'happy')}</span>` : '<span class="st-chair" aria-hidden="true"></span>';
    // Muffins lies on Adam's desk; Joey lies on the floor by the front desk. Each casts a little shadow.
    const pet = t.pet && n > 0 ? `<span class="st-pet ${t.pet}" title="${PETS[t.pet].name}"><i class="st-shadow" aria-hidden="true"></i><img src="${PETS[t.pet].poses[0]}" alt="${PETS[t.pet].name}" draggable="false"></span>` : '';
    const plate =
      state === 'hired'
        ? `<span class="st-plate"><b>${esc(name)}</b><small>${esc(t.title)}</small></span>`
        : state === 'open'
          ? `<span class="st-sign"><b>${esc(t.title)} wanted</b><small>${money(cost)}</small></span>`
          : `<span class="st-sign locked"><b>${esc(t.title)}</b><small>when you’re ${esc(PAY_GRADES[t.unlockRank].title)}</small></span>`;
    // One little desk for each seat on the team.
    const desks = n > 1 ? `<span class="st-seats" aria-hidden="true">${'<i></i>'.repeat(Math.min(n, 12))}${n > 12 ? '<em>…</em>' : ''}</span>` : '';
    const label = state === 'hired' ? `${name}, ${t.title}${n > 1 ? `, and ${n - 1} more` : ''}` : state === 'open' ? `Hire ${a(t.title.toLowerCase())}: ${money(cost)}` : `${t.title}: opens when you’re ${PAY_GRADES[t.unlockRank].title}`;
    const meta =
      state === 'hired'
        ? `<p class="st-meta">${n > 1 ? `<span>${esc(name.split(' ')[0])} + ${n - 1}</span>` : ''}<span class="st-rate"></span></p>`
        : state === 'open'
          ? `<p class="st-meta"><span>${t.job ? `Does your ${esc(t.does)} for you` : 'Makes every team faster'}</span></p>`
          : '<p class="st-meta"></p>';
    return `<div class="st-cell" data-cell="${t.id}">
      <button type="button" class="station ${kind} ${state}${canHire ? ' afford' : ''}${this.selected === t.id ? ' on' : ''}" data-team="${t.id}" aria-label="${esc(label)}">
        <span class="st-back" aria-hidden="true"></span>
        ${person}
        <span class="st-top" aria-hidden="true"></span>
        <span class="st-front" aria-hidden="true"></span>
        <span class="st-floor" aria-hidden="true"></span>
        ${pet}
        ${plate}
        ${desks}
        <span class="st-pops" aria-hidden="true"></span>
      </button>
      ${meta}
    </div>`;
  }

  /** The card for whoever you tapped: what they do, hire, train, rename. */
  private renderSheet(s: GameState) {
    const id = this.selected;
    if (!id) return;
    if (this.editing && this.sheet.querySelector('input.rename')) return; // don't redraw under your typing
    const t = TEAMS.find((x) => x.id === id)!;
    const n = seats(s, id);
    const cost = seatCost(s, id);
    const tc = trainCost(s, id);
    const key = [id, n, trainLevel(s, id), s.salary >= cost, tc !== null && s.salary >= tc, Math.round(teamPayPerMin(s, id)), this.outcome, JSON.stringify(s.names), this.editing, s.career.rank].join('|');
    if (key === this.sheetKey) return;
    this.sheetKey = key;
    const unlocked = teamUnlocked(s, id);
    const cap = seatCap(s, id);
    const full = n >= cap;
    const name = leadName(s, t);
    const level = trainLevel(s, id);
    const nameHtml = this.editing
      ? `<input class="rename" type="text" maxlength="20" value="${esc(name)}" aria-label="New name" autocomplete="off" spellcheck="false">`
      : `${esc(n > 0 ? name : `${cap1(a(t.title.toLowerCase()))}`)}${n > 0 ? `<button type="button" class="pencil" data-rename aria-label="Change ${esc(name)}’s name" title="Change name">✎</button>` : ''}`;
    const does = t.job
      ? n > 0
        ? `<b>${num(teamPerMin(s, id))} ${esc(t.does)} a minute</b>, worth <b>${money(teamPayPerMin(s, id))}/min</b>.`
        : `Does your ${esc(t.does)} for you, about ${t.perMin} a minute per seat.`
      : n > 0
        ? `Every other team works <b>${Math.round(STAFF.managerBoost * n * 100)}% faster</b>.`
        : `Makes every other team ${Math.round(STAFF.managerBoost * 100)}% faster per seat.`;
    const hireLabel = n === 0 ? `Hire ${esc(name)}` : `Add ${esc(a(t.title.toLowerCase()))}`;
    const actions = unlocked
      ? `<div class="fs-actions">
          <button type="button" class="paper-btn${n === 0 ? ' paper-btn-strong' : ''}" data-hire="${id}"${full || s.salary < cost ? ' disabled' : ''}>${hireLabel} · ${money(cost)}</button>
          ${tc !== null ? `<button type="button" class="paper-btn" data-train="${id}"${s.salary < tc ? ' disabled' : ''}>${esc(STAFF.training[level])} · ${money(tc)} <small>(+${Math.round((STAFF.trainBoost - 1) * 100)}%)</small></button>` : ''}
        </div>
        <p class="fs-cap">Headcount ${n} of ${cap}${full && s.career.rank < TOP_RANK ? ' · a promotion adds a seat' : ''}${level > 0 ? ` · trained: ${esc(STAFF.training[level - 1])}` : ''}</p>`
      : `<p class="fs-cap">You can hire ${a(t.title.toLowerCase())} once you’re ${esc(PAY_GRADES[t.unlockRank].title)}.</p>`;
    const pet = t.pet && n > 0 ? `<img class="fs-pet" src="${PETS[t.pet].poses[0]}" alt="" draggable="false">` : '';
    this.sheet.innerHTML = `
      <button type="button" class="fs-close" data-close aria-label="Close">×</button>
      <div class="fs-face">${portraitSvg(t.portrait, n > 0 ? 'happy' : 'idle')}${pet}</div>
      <div class="fs-body">
        <h3>${nameHtml}</h3>
        <p class="fs-title">${esc(t.title)}${n > 1 ? ` and ${n - 1} more` : ''}${t.pet && n > 0 ? ` · ${PETS[t.pet].name} comes too` : ''}</p>
        <p class="fs-does">${does}</p>
        <p class="fs-quote">“${esc(t.pitch)}”</p>
        ${actions}
        ${this.outcome ? `<p class="fs-bad">${esc(this.outcome)}</p>` : ''}
      </div>`;
  }

  /** Finished work floats up from each desk, a bit at a time. */
  private popWork(s: GameState) {
    const now = performance.now();
    for (const t of TEAMS) {
      if (!t.job) continue;
      const st = s.staff[t.id];
      if (!st || st.seats === 0) continue;
      const seen = (this.seen[t.id] ??= { done: st.done, at: now });
      const fresh = st.done - seen.done;
      if (fresh < 1 || now - seen.at < 1400) continue;
      const k = Math.floor(fresh);
      seen.done += k;
      seen.at = now;
      const pay = (teamPayPerMin(s, t.id) / Math.max(1e-9, teamPerMin(s, t.id))) * k;
      const box = this.room.querySelector(`[data-team="${t.id}"] .st-pops`);
      if (!box || box.childElementCount > 3) continue;
      const p = document.createElement('span');
      p.className = 'st-pop';
      p.innerHTML = `+${num(k)} ${esc(k === 1 ? one(t.does) : t.does)}<b>+${money(pay)}</b>`;
      // Off to the side of their face, over the cubicle wall.
      p.style.left = `${(Math.random() < 0.5 ? 20 : 74) + Math.random() * 8}%`;
      box.append(p);
      setTimeout(() => p.remove(), 1800);
      // They look pleased with themselves for a moment.
      const station = box.parentElement!;
      station.classList.add('done');
      setTimeout(() => station.classList.remove('done'), 900);
    }
  }

  /** Muffins and Joey shift around now and then. */
  private posePets() {
    const now = performance.now();
    if (now < this.nextPose) return;
    this.nextPose = now + 6000 + Math.random() * 8000;
    this.room.querySelectorAll<HTMLImageElement>('.st-pet img').forEach((img) => {
      const pet = img.parentElement!.classList.contains('muffins') ? 'muffins' : 'joey';
      const poses = PETS[pet].poses;
      img.src = poses[Math.floor(Math.random() * poses.length)];
    });
  }
}

const cap1 = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
