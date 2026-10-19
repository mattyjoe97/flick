// The Break Room: the coffee maker, the vending machine and the corkboard, with Gail from
// Payroll (the Coffee Club's president) keeping an eye on the good mugs.
//
// Laid out like Dale's closet (it borrows the closet's layout styles): the room on the left,
// the details of whatever you picked up on the right (under it on a phone). Mr. Feeney's
// footsteps send you back to your desk.

import { co } from './co';
import { PORTRAITS } from './portrait-art';
import { BREAK_ART } from './breakroom-art';
import { EXEC_PERKS, PERKS, type ExecId, type PerkId } from '../sim/content';
import { buyExec, buyPerk, execCost, execLevel, execOpen, perkCost } from '../sim/job';
import {
  BREAK,
  SNACKS,
  breakClosed,
  breakYours,
  brewSeconds,
  buySnack,
  caffeinated,
  coffeeSeconds,
  coffeeWait,
  pourCoffee,
  shakeMachine,
  snackLeft,
  snackName,
  snackOn,
  snackPrice,
  snackSeconds,
  type BreakResult,
} from '../sim/breakroom';
import { perk, type GameState } from '../sim/state';
import type { Sound } from './sound';

type Spot = 'coffee' | 'vending' | 'board';

const esc = (text: string) => co(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

const LINES = {
  theirs: ['Coffee Club dues are five dollars. I’ll put you down.', 'Rinse your mug.', 'That’s Diane’s yogurt. Don’t.', 'The pot is communal. The good mugs are not.', 'We’ve held this room since 1998.'],
  yours: ['Fine. It’s your break room now.', 'The good mugs are on the left. Rinse them.', 'We’re still a club. You’re just… also here.', 'I’ve started a new pot. Out of habit.'],
  coffee: ['Careful, it’s hot.', 'That’s the good stuff. Don’t tell anyone.', 'Black. Like my mood.'],
  brewing: ['A watched pot never brews.', 'It’s brewing. Patience.', 'Give it a minute. Or five.'],
  snack: ['Good choice.', 'That machine has a mind of its own.', 'Don’t eat it over the keyboard.'],
  stuck: ['Give it a good shake. Everyone does.', 'Hit it on the side. No, the other side.', 'It does that.'],
  board: ['Résumés go on the corkboard. That’s how it’s always been.', 'Somebody keeps pinning lost-cat flyers up there.'],
  poor: ['Exact change only. And more of it.', 'You’re a little short, hon.'],
};

/** What each thing in the room is called, and the little label under it. */
const NAMES: Record<Spot, string> = { coffee: 'Coffee maker', vending: 'Vending machine', board: 'Corkboard' };

export interface BreakHooks {
  say(text: string): void;
  bump(which: 'bands' | 'salary'): void;
  opened(): void;
  closed(): void;
  /** Add noise from you (false if the safety catch holds it). */
  noise(amount: number): boolean;
}

export class BreakRoomView {
  private root: HTMLElement;
  private bubble: HTMLElement;
  private gail: HTMLImageElement;
  private detail: HTMLElement;
  private spots: Record<Spot, HTMLButtonElement>;
  private open = false;
  private selected: Spot = 'coffee';
  private key = '';
  private note: { text: string; ok: boolean } | null = null;

  constructor(
    private get: () => GameState,
    private hooks: BreakHooks,
    private sound: Sound,
  ) {
    const R = BREAK_ART;
    const place = (b: [number, number, number, number]) => `left:${pct(b[0])};top:${pct(b[1])};width:${pct(b[2] - b[0])};height:${pct(b[3] - b[1])}`;
    this.root = document.createElement('div');
    this.root.className = 'closet breakroom';
    this.root.id = 'breakroom';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-labelledby', 'break-h');
    this.root.innerHTML = `<div class="closet-room">
        <header class="closet-top"><h2 class="closet-h" id="break-h">Break room</h2>
          <button type="button" class="closet-back" id="break-back">Back to your desk <kbd>Esc</kbd></button></header>
        <div class="closet-stage break-stage" style="aspect-ratio:${R.w} / ${R.h}">
          ${R.room ? `<img class="closet-bg" src="${R.room}" alt="" draggable="false">` : `<div class="closet-bg">${ROOM_SVG}</div>`}
          <img class="break-gail" alt="" draggable="false" style="height:${pct(R.gail[1])};left:${pct(R.gail[0])}">
          <p class="dale-say break-say" aria-live="polite"></p>
          <button type="button" class="break-spot" data-spot="board" style="${place(R.board)}">${R.room ? '' : BOARD_SVG}<span class="spot-tag">Corkboard</span></button>
          <button type="button" class="break-spot" data-spot="coffee" style="${place(R.coffee)}">${R.room ? '' : COFFEE_SVG}<span class="spot-tag">Coffee</span><i class="spot-dot" hidden></i></button>
          <button type="button" class="break-spot" data-spot="vending" style="${place(R.vending)}">${R.room ? '' : VENDING_SVG}<span class="spot-tag">Snacks</span></button>
        </div>
        <aside class="closet-detail break-detail" aria-live="polite"></aside>
      </div>`;
    document.getElementById('app')!.append(this.root);
    this.bubble = this.root.querySelector('.break-say')!;
    this.gail = this.root.querySelector('.break-gail')!;
    this.detail = this.root.querySelector('.break-detail')!;
    this.spots = {
      coffee: this.root.querySelector('[data-spot="coffee"]')!,
      vending: this.root.querySelector('[data-spot="vending"]')!,
      board: this.root.querySelector('[data-spot="board"]')!,
    };
    this.root.querySelector('#break-back')!.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => this.onClick(e));
  }

  get isOpen() {
    return this.open;
  }

  /** Go to the break room ('board' etc. picks something up straight away). */
  show(focus?: Spot) {
    const s = this.get();
    if (s.lookBusy) return;
    const closed = breakClosed(s);
    if (closed) return this.hooks.say(closed);
    const was = this.open;
    this.open = true;
    this.root.hidden = false;
    this.note = null;
    this.key = '';
    this.selected = focus ?? (caffeinated(s) <= 0 && coffeeWait(s) <= 0 ? 'coffee' : s.breakroom.stuck ? 'vending' : this.selected);
    this.talk(pick(breakYours(s) ? LINES.yours : LINES.theirs));
    if (was) return;
    this.sound.drawer();
    this.hooks.opened();
    (this.root.querySelector('#break-back') as HTMLElement).focus();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    this.hooks.closed();
  }

  /** Mr. Feeney's footsteps (or the Coffee Club barricading the door): back to your desk. */
  kickOut(text = 'Gail: “Feeney’s coming. Look busy.” Get on your computer (Esc).') {
    if (!this.open) return;
    this.close();
    this.hooks.say(text);
  }

  onKey(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'r' || k === 'b') {
      this.close();
      return true;
    }
    if (e.repeat) return false;
    if (k === 'c') return this.act('coffee'), true;
    if (k === 'v') return this.act('vending'), true;
    return false;
  }

  private talk(text: string) {
    this.bubble.textContent = co(text);
    this.bubble.classList.remove('pop');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('pop');
  }

  private onClick(e: Event) {
    const t = e.target as HTMLElement;
    const spot = t.closest<HTMLButtonElement>('button[data-spot]');
    if (spot) {
      const id = spot.dataset.spot as Spot;
      if (this.selected === id && id !== 'board') this.act(id);
      else {
        this.selected = id;
        this.note = null;
        this.key = '';
        this.sound.grab();
        if (id === 'board') this.talk(pick(LINES.board));
        if (window.matchMedia?.('(max-width: 900px)').matches) requestAnimationFrame(() => this.detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      }
      return;
    }
    const b = t.closest<HTMLButtonElement>('.break-detail button');
    if (!b || b.disabled) return;
    const d = b.dataset;
    const s = this.get();
    if (d.act) this.act(d.act as Spot);
    else if (d.perk) {
      const r = buyPerk(s, d.perk as PerkId);
      this.after(r.ok ? { ok: true, text: `Pinned to your résumé: ${PERKS.find((p) => p.id === d.perk)!.name}.` } : r);
    } else if (d.exec) {
      const r = buyExec(s, d.exec as ExecId);
      this.after(r.ok ? { ok: true, text: `${EXEC_PERKS.find((p) => p.id === d.exec)!.name}, level ${execLevel(s, d.exec as ExecId)}.` } : r);
    }
  }

  /** Use the coffee maker or the vending machine. */
  private act(id: Spot) {
    const s = this.get();
    this.selected = id;
    if (id === 'coffee') {
      const r = pourCoffee(s);
      if (r.ok) {
        this.talk(pick(LINES.coffee));
        this.sound.pour();
        this.pop(this.spots.coffee, 'Caffeinated!');
      } else if (coffeeWait(s) > 0) this.talk(pick(LINES.brewing));
      this.after(r, false);
    } else if (id === 'vending') {
      const stuck = !!s.breakroom.stuck;
      const r = stuck ? shakeMachine(s, (n) => this.hooks.noise(n)) : buySnack(s);
      if (r.ok) {
        if (stuck) {
          this.shake();
          this.sound.thunk();
        } else this.sound.coins();
        if (!stuck) this.hooks.bump('salary');
        if (s.breakroom.stuck) this.talk(pick(LINES.stuck));
        else {
          this.talk(pick(LINES.snack));
          this.pop(this.spots.vending, `${snackName(s.breakroom.snack!.id)}!`);
          this.sound.thunk();
        }
      } else if (r.reason.startsWith('A snack costs')) this.talk(pick(LINES.poor));
      this.after(r, false);
    }
    this.key = '';
  }

  private after(r: BreakResult | { ok: false; reason: string } | { ok: true; text: string }, stamp = true) {
    this.note = r.ok ? { text: r.text, ok: true } : { text: r.reason, ok: false };
    if (stamp) {
      if (r.ok) this.sound.stamp();
      else this.sound.miss();
    } else if (!r.ok) this.sound.miss();
    this.key = '';
  }

  private pop(at: HTMLElement, text: string) {
    const p = document.createElement('span');
    p.className = 'break-pop';
    p.textContent = text;
    at.append(p);
    setTimeout(() => p.remove(), 1100);
  }

  private shake() {
    const v = this.spots.vending;
    v.classList.remove('shaking');
    void v.offsetWidth;
    v.classList.add('shaking');
  }

  render() {
    if (!this.open) return;
    const s = this.get();
    // The Coffee Club barricades the door in Stage 4; Mr. Feeney's footsteps send you back.
    const closed = breakClosed(s);
    if (closed) return this.kickOut(closed.startsWith('Not now') ? undefined : closed);
    const yours = breakYours(s);
    const face = PORTRAITS.gail?.[yours ? 'worried' : 'idle'];
    if (face && this.gail.dataset.face !== face) {
      this.gail.dataset.face = face;
      this.gail.src = face;
    }
    for (const id of Object.keys(this.spots) as Spot[]) this.spots[id].classList.toggle('selected', id === this.selected);
    this.spots.coffee.querySelector<HTMLElement>('.spot-dot')!.hidden = coffeeWait(s) > 0;
    this.spots.vending.classList.toggle('stuck', !!s.breakroom.stuck);
    this.spots.coffee.classList.toggle('brewing', coffeeWait(s) > 0);
    // Rebuild the details only when something on them changes (the timers tick in place).
    const key = [
      this.selected,
      this.note?.text ?? '',
      Math.ceil(coffeeWait(s)) > 0,
      caffeinated(s) > 0,
      snackOn(s) ?? '',
      s.breakroom.stuck?.shakes ?? -1,
      s.salary >= snackPrice(s),
      snackPrice(s),
      s.job.reputation,
      JSON.stringify(s.job.perks),
      JSON.stringify(s.job.exec ?? {}),
      yours,
    ].join('|');
    if (key !== this.key) {
      this.key = key;
      this.detail.innerHTML = this.html(s);
    }
    for (const el of this.detail.querySelectorAll<HTMLElement>('[data-tick]')) {
      const what = el.dataset.tick;
      const secs = what === 'brew' ? coffeeWait(s) : what === 'caf' ? caffeinated(s) : snackLeft(s);
      el.textContent = clock(Math.ceil(secs));
    }
  }

  private html(s: GameState) {
    const note = this.note ? `<p class="memo-note${this.note.ok ? ' ok' : ''}" role="status">${esc(this.note.text)}</p>` : '';
    if (this.selected === 'coffee') {
      const wait = coffeeWait(s);
      const caf = caffeinated(s);
      return `<h3>Coffee maker</h3>
        <p>Pour a cup and you’re <b>Caffeinated</b> for ${Math.round(coffeeSeconds(s))} s: your flicks reload ${Math.round((1 / BREAK.reload - 1) * 100)}% faster and Suspicion cools ${Math.round((BREAK.cool - 1) * 100)}% faster.</p>
        <p class="stats">A fresh pot takes ${Math.round(brewSeconds(s) / 60 * 10) / 10} min${breakYours(s) ? ' (half the time: the room’s yours)' : '. Take the room from Gail in Stage 4 and it brews twice as fast'}.</p>
        ${caf > 0 ? `<p class="hint">Caffeinated: <b data-tick="caf">${clock(caf)}</b> left.</p>` : ''}
        <div class="detail-act">${wait > 0 ? `<button type="button" class="paper-btn" disabled>Brewing… <span data-tick="brew">${clock(wait)}</span></button>` : `<button type="button" class="paper-btn paper-btn-strong" data-act="coffee">Pour a cup <kbd>C</kbd></button>`}</div>
        ${note}`;
    }
    if (this.selected === 'vending') {
      const on = snackOn(s);
      const stuck = s.breakroom.stuck;
      const price = snackPrice(s);
      const list = SNACKS.map((x) => `<li${x.id === on ? ' class="on"' : ''}><b>${esc(x.name)}</b> ${esc(x.does)}</li>`).join('');
      const btn = stuck
        ? `<button type="button" class="paper-btn paper-btn-strong" data-act="vending">Shake it! (${stuck.shakes} / ${BREAK.shakes}) <kbd>V</kbd></button>`
        : `<button type="button" class="paper-btn${s.salary >= price ? ' paper-btn-strong' : ''}" data-act="vending" ${s.salary >= price ? '' : 'disabled'}>Buy a snack · ${money(price)} <kbd>V</kbd></button>`;
      return `<h3>Vending machine</h3>
        <p>A random snack, and every one is a boost for ${Math.round(snackSeconds(s) / 60)} min (one at a time):</p>
        <ul class="snack-list">${list}</ul>
        ${on ? `<p class="hint">${esc(snackName(on))}: <b data-tick="snack">${clock(snackLeft(s))}</b> left.</p>` : ''}
        ${stuck ? (this.note ? '' : `<p class="hint">Your ${esc(snackName(stuck.id))} is stuck on the spiral. Shaking the machine is noisy.</p>`) : `<p class="stats">Sometimes it gets stuck. The price is a few minutes of your pay.</p>`}
        <div class="detail-act">${btn}</div>
        ${note}`;
    }
    // The corkboard: résumé perks, the Break Room's own, and the executive suite.
    const card = (p: (typeof PERKS)[number]) => {
      const level = perk(s, p.id);
      const cost = perkCost(s, p.id);
      const afford = cost !== null && s.job.reputation >= cost;
      return `<li class="pin${level ? ' owned' : ''}"><div><b>${esc(p.name)}</b>${p.max > 1 ? ` <span class="perk-lv">${level}/${p.max}</span>` : level ? ' <span class="perk-lv">Yours</span>' : ''}<p>${esc(p.does)}</p></div>
        ${cost === null ? '<span class="perk-max">Maxed</span>' : `<button type="button" class="paper-btn${afford ? ' paper-btn-strong' : ''}" data-perk="${p.id}" ${afford ? '' : 'disabled'}>${cost} Rep</button>`}</li>`;
    };
    const exec = execOpen(s)
      ? EXEC_PERKS.map((p) => {
          const level = execLevel(s, p.id);
          const cost = execCost(s, p.id);
          const afford = cost !== null && s.job.reputation >= cost;
          return `<li class="pin exec${level ? ' owned' : ''}"><div><b>${esc(p.name)}</b>${level ? ` <span class="perk-lv">Lv ${level}</span>` : ''}<p>${esc(p.does)}</p></div>
            ${cost === null ? '<span class="perk-max">Maxed</span>' : `<button type="button" class="paper-btn${afford ? ' paper-btn-strong' : ''}" data-exec="${p.id}" ${afford ? '' : 'disabled'}>${cost.toLocaleString('en-US')} Rep</button>`}</li>`;
        }).join('')
      : '';
    const none = (s.job.earned ?? 0) === 0;
    return `<h3>Corkboard</h3>
      <p><b>${s.job.reputation.toLocaleString('en-US')} Reputation</b> to spend. Everything pinned here is yours for good, at every job.</p>
      ${none ? '<p class="hint">You earn Reputation when you take a new job (Job Search turns up on your computer once you close HR’s case). The further you get, the more you earn.</p>' : ''}
      ${note}
      <h4 class="board-h">The Break Room</h4>
      <ul class="pins">${PERKS.filter((p) => p.room).map(card).join('')}</ul>
      <h4 class="board-h">Your résumé</h4>
      <ul class="pins">${PERKS.filter((p) => !p.room).map(card).join('')}</ul>
      ${exec ? `<h4 class="board-h">Executive perks</h4><p class="stats">No top level: every level costs more.</p><ul class="pins">${exec}</ul>` : ''}`;
  }
}

/** For the HUD: what the Caffeinated and snack pills say (null when nothing's on). */
export function breakPills(s: GameState): { coffee: string | null; snack: string | null } {
  const caf = caffeinated(s);
  const on = snackOn(s);
  return {
    coffee: caf > 0 ? `☕ Caffeinated · ${Math.ceil(caf)} s` : null,
    snack: on ? `${snackName(on)} · ${clock(Math.ceil(snackLeft(s)))}` : null,
  };
}

export { NAMES as BREAK_NAMES };

// ---------------------------------------------------------------- drawn stand-ins (until the painted room arrives)

const OL = 'stroke="#332A24" stroke-width="10" stroke-linejoin="round"';

const ROOM_SVG = `<svg viewBox="0 0 2048 1152" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true">
  <rect width="2048" height="1152" fill="#d9c9a3"/>
  <rect y="0" width="2048" height="90" fill="#c9b78f"/>
  <path d="M0 520h2048" stroke="#bfae86" stroke-width="14"/>
  <rect y="860" width="2048" height="292" fill="#8f7a5e"/>
  ${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 256} 860v292" stroke="#7d6a51" stroke-width="6"/>`).join('')}
  <path d="M0 990h2048" stroke="#7d6a51" stroke-width="6"/>
  <rect x="160" y="140" width="380" height="300" rx="10" fill="#9fc4d6" ${OL}/>
  <path d="M350 140v300M160 290h380" ${OL} fill="none"/>
  <rect x="600" y="600" width="820" height="40" fill="#efe6d2" ${OL}/>
  <rect x="620" y="640" width="780" height="230" fill="#b98a57" ${OL}/>
  <path d="M880 640v230M1140 640v230" ${OL}/>
  <circle cx="850" cy="755" r="9" fill="#332A24"/><circle cx="910" cy="755" r="9" fill="#332A24"/><circle cx="1110" cy="755" r="9" fill="#332A24"/><circle cx="1170" cy="755" r="9" fill="#332A24"/>
  <rect x="1100" y="540" width="70" height="60" rx="8" fill="#e8e2d5" ${OL}/>
  <rect x="1190" y="525" width="64" height="75" rx="10" fill="#d8673f" ${OL}/>
  <rect x="1290" y="470" width="90" height="130" rx="10" fill="#f2efe8" ${OL}/>
</svg>`;

const COFFEE_SVG = `<svg viewBox="0 0 240 300" width="100%" height="100%" aria-hidden="true">
  <rect x="30" y="20" width="180" height="60" rx="14" fill="#3c3c42" ${OL}/>
  <rect x="40" y="80" width="40" height="200" fill="#3c3c42" ${OL}/>
  <rect x="30" y="250" width="180" height="40" rx="8" fill="#3c3c42" ${OL}/>
  <path class="pot" d="M100 140h90l-8 100h-74z" fill="#9fd0e0" fill-opacity="0.7" ${OL}/>
  <path class="brew" d="M106 200h78l-4 38h-70z" fill="#5b3a22"/>
  <path d="M190 160c26 0 26 50 0 50" fill="none" ${OL}/>
  <circle cx="180" cy="50" r="10" fill="#e44"/>
  <path class="steam" d="M130 120c-10-14 10-22 0-38M160 120c-10-14 10-22 0-38" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.85"/>
</svg>`;

const VENDING_SVG = `<svg viewBox="0 0 300 640" width="100%" height="100%" aria-hidden="true">
  <rect x="10" y="10" width="280" height="620" rx="16" fill="#c0392b" ${OL}/>
  <rect x="34" y="40" width="170" height="400" rx="6" fill="#dff1f5" ${OL}/>
  ${[0, 1, 2, 3].map((r) => `<path d="M40 ${130 + r * 95}h158" stroke="#332A24" stroke-width="6"/>` + [0, 1, 2].map((c) => `<rect x="${50 + c * 52}" y="${70 + r * 95}" width="40" height="56" rx="6" fill="${['#f5b041', '#58d68d', '#5dade2', '#f1948a'][(r + c) % 4]}" stroke="#332A24" stroke-width="5"/>`).join('')).join('')}
  <rect x="218" y="60" width="56" height="150" rx="6" fill="#332A24"/>
  ${[0, 1, 2, 3, 4].map((i) => `<rect x="228" y="${72 + i * 26}" width="36" height="16" rx="3" fill="#e5e7e9"/>`).join('')}
  <rect x="226" y="240" width="40" height="70" rx="6" fill="#7f8c8d" stroke="#332A24" stroke-width="5"/>
  <rect x="40" y="480" width="220" height="90" rx="8" fill="#332A24"/>
  <rect x="56" y="494" width="188" height="62" rx="4" fill="#4d4d4d"/>
</svg>`;

const BOARD_SVG = `<svg viewBox="0 0 420 300" width="100%" height="100%" aria-hidden="true">
  <rect x="10" y="10" width="400" height="280" rx="10" fill="#c58e52" ${OL}/>
  <rect x="30" y="30" width="360" height="240" fill="#b77b43"/>
  <rect x="50" y="48" width="100" height="120" fill="#fffdf4" stroke="#332A24" stroke-width="5" transform="rotate(-4 100 108)"/>
  <rect x="170" y="56" width="90" height="90" fill="#fdeb87" stroke="#332A24" stroke-width="5" transform="rotate(3 215 101)"/>
  <rect x="280" y="44" width="92" height="130" fill="#fffdf4" stroke="#332A24" stroke-width="5" transform="rotate(5 326 109)"/>
  <rect x="80" y="180" width="120" height="70" fill="#aee0f5" stroke="#332A24" stroke-width="5" transform="rotate(2 140 215)"/>
  <rect x="230" y="176" width="110" height="80" fill="#f8c8d4" stroke="#332A24" stroke-width="5" transform="rotate(-3 285 216)"/>
  ${[[100, 52], [215, 60], [326, 48], [140, 184], [285, 180]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#e74c3c" stroke="#332A24" stroke-width="4"/>`).join('')}
  <path d="M68 80h60M68 100h50M68 120h56M298 80h56M298 100h40M298 120h50" stroke="#9a8f80" stroke-width="6"/>
</svg>`;
