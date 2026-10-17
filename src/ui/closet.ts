// The supply closet: Dale from Facilities and the office black market, and the only shop.
//
// Dale stands in his closet with rubber band guns hanging on the pegboard and his band
// "upgrades" on (and under) the folding table. Office upgrades are on the Procurement
// clipboard by the door: forms his cousin pre-stamps. Tap something and he tells you
// about it; the panel beside the closet has the price. He also gets confiscated weapons back out of
// Mr. Feeney's drawer, and every few minutes he leans over your cubicle wall ("Psst")
// with a deal for 30 seconds. The closet closes the moment Mr. Feeney's footsteps start.

import roomArt from '../assets/art/closet.webp';
import { co } from './co';
import daleIdle from '../assets/art/dale-idle.webp';
import daleTalk from '../assets/art/dale-talk.webp';
import daleOpen from '../assets/art/dale-open.webp';
import daleHead from '../assets/art/dale-head.webp';
import dalePsst from '../assets/art/dale-psst.webp';
import clipboardArt from '../assets/art/clipboard.webp';

import { CLOSET_ART } from './portrait-art';
import { DALE, RENOVATIONS, TARGETS, UPGRADES, WEAPONS, type RenovationId, type UpgradeId, type WeaponId } from '../sim/content';
import { buyRenovation, renoCost, renoLevel, renovationsOpen } from '../sim/ladder';
import {
  buyBack,
  buyBackPrice,
  buyUpgrade,
  buyWeapon,
  confiscatedLeft,
  dealName,
  passDeal,
  priceOf,
  takeDeal,
  targetDefeated,
  upgradeAvailable,
  weaponAvailable,
} from '../sim/engine';
import { has, isConfiscated, mods } from '../sim/mods';
import type { GameState } from '../sim/state';
import type { Sound } from './sound';
import { GUN_ART, ICON_ART, RENO_ART } from './goods-art';

/** What a renovation adds up to at a level ("bands hit 30% harder"). */
function renoNow(id: RenovationId, lv: number) {
  const r = RENOVATIONS.find((x) => x.id === id)!;
  if (id === 'panels') return `${Math.round((1 - Math.pow(1 - r.each, lv)) * 100)}% quieter`;
  const pct = Math.round(r.each * lv * 100);
  return id === 'window' ? `bands hit ${pct}% harder` : id === 'espresso' ? `your team works ${pct}% faster` : `work pays ${pct}% more`;
}

/** What Dale says when you pick something up. */
const PITCH: Record<string, string> = {
  ruler: 'Twelve inches. Well. Six now.',
  clothespin: 'Hot-glued it myself. Mostly.',
  repeater: 'Dave’s design. I just sell it. Three bands a pull.',
  gatling: 'IT’s drill. Don’t ask how I got it. Six bands a spin.',
  rummage: 'Bring a light. You’d be amazed what’s back there.',
  waxed: 'Waxed. Smooth draw, late snap.',
  silent: 'Fingerless. For the professional.',
  closet: 'Copy of my key. Don’t lose it. I’ll know.',
  training: 'Your people shoot faster, or the whistle gets it.',
  thick: 'Double-thick. Leaves a mark.',
  calendar: 'Feeney’s got a lot of meetings now. He doesn’t know why.',
  lost: 'Feeney’s drawer has a lock. Had a lock.',
  forms: 'Procurement forms. Pre-stamped. My cousin’s in Procurement.',
};

const LINES = {
  greet: ['Close the door.', 'You didn’t see me. I didn’t see you.', 'What’ll it be?', 'Keep your voice down.', 'Everything here is legit. Mostly.', 'Wipe your feet. This is a place of business.'],
  buy: ['You didn’t get this from me.', 'Pleasure doing business.', 'No receipts.', 'Tell nobody. Especially Gary.', 'Use it in good health.'],
  poor: ['Come back when you’re liquid.', 'That’s not how money works, friend.', 'I don’t do layaway.'],
  equip: ['Looks good on you.', 'Classic choice.'],
  back: ['Got it back from Feeney’s drawer. Don’t ask how.', 'His drawer has a lock. Had a lock.'],
  closed: 'Closet’s closed. Go. Go!',
};

const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const esc = (text: string) =>
  co(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

// Where things go in the closet, as fractions of the room picture.
const ROOM = CLOSET_ART.room;
const PEG = ROOM.pegboard;
const TABLE = ROOM.table;
const AR = ROOM.w / ROOM.h;
/** Pegboard hooks for the guns: [centre x, centre y, width], as fractions of the room. */
const GUN_SPOTS: Record<string, [number, number, number]> = {
  ruler: [PEG[0] + (PEG[2] - PEG[0]) * 0.27, PEG[1] + (PEG[3] - PEG[1]) * 0.25, 0.23],
  clothespin: [PEG[0] + (PEG[2] - PEG[0]) * 0.73, PEG[1] + (PEG[3] - PEG[1]) * 0.28, 0.23],
  repeater: [PEG[0] + (PEG[2] - PEG[0]) * 0.32, PEG[1] + (PEG[3] - PEG[1]) * 0.62, 0.18],
  gatling: [PEG[0] + (PEG[2] - PEG[0]) * 0.73, PEG[1] + (PEG[3] - PEG[1]) * 0.66, 0.21],
};
const GUN_ORDER: WeaponId[] = ['ruler', 'clothespin', 'repeater', 'gatling'];
/** Four things on the table top, three on the floor underneath it. */
function goodsSpot(i: number): [number, number, number] {
  const w = 0.075;
  if (i < 4) {
    const x = TABLE[0] + (TABLE[2] - TABLE[0]) * (0.13 + i * 0.25);
    return [x, TABLE[1] + 0.012, w];
  }
  const x = TABLE[0] + (TABLE[2] - TABLE[0]) * (0.25 + (i - 4) * 0.25);
  return [x, 0.93, w];
}

/** How Dale refers to whoever you have to beat first. */
function shortName(targetId: string) {
  const names: Record<string, string> = { printer: 'the Printer', taskforce: 'the Task Force' };
  return names[targetId] ?? TARGETS.find((t) => t.id === targetId)!.name.split(' ')[0];
}

type ItemKey = `w:${WeaponId}` | `u:${UpgradeId}` | 'lost' | 'forms';

/** Where the Procurement clipboard leans: [centre x, bottom, width], as fractions of the room. */
const FORMS_SPOT: [number, number, number] = [0.9, 0.95, 0.085];
const isOffice = (id: string) => UPGRADES.some((u) => u.id === id && u.seller !== 'dale');

export interface ClosetHooks {
  say(text: string): void;
  bump(which: 'bands' | 'salary'): void;
  opened(): void;
  closed(): void;
}

export class ClosetView {
  private root: HTMLElement;
  private dale: HTMLElement;
  private bubble: HTMLElement;
  private items: HTMLElement;
  private detail: HTMLElement;
  private psst: HTMLElement;
  private open = false;
  private key = '';
  private selected: ItemKey | null = null;
  /** The office upgrade to point at on the clipboard (from the shopping list). */
  private formsFocus: string | null = null; // an office upgrade or a renovation id
  private talkUntil = 0;
  private openUntil = 0;
  private psstShown = false;

  constructor(
    private get: () => GameState,
    private hooks: ClosetHooks,
    private sound: Sound,
  ) {
    this.root = el(
      'div',
      'closet',
      `<div class="closet-room">
        <header class="closet-top"><h2 class="closet-h" id="closet-h">Supply closet</h2>
          <button type="button" class="closet-back" id="closet-back">Back to your desk <kbd>Esc</kbd></button></header>
        <div class="closet-stage" style="aspect-ratio:${ROOM.w} / ${ROOM.h}">
          <img class="closet-bg" src="${roomArt}" alt="" draggable="false">
          <div class="closet-dale" aria-hidden="true">
            <img data-pose="idle" src="${daleIdle}" alt="" draggable="false">
            <img data-pose="talk" src="${daleTalk}" alt="" draggable="false" hidden>
            <img data-pose="open" src="${daleOpen}" alt="" draggable="false" hidden>
          </div>
          <p class="dale-say" aria-live="polite"></p>
          <div class="closet-items" role="group" aria-label="Dale's goods"></div>
        </div>
        <aside class="closet-detail" aria-live="polite"></aside>
      </div>`,
    );
    this.root.id = 'closet';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-labelledby', 'closet-h');
    this.dale = this.root.querySelector('.closet-dale')!;
    this.bubble = this.root.querySelector('.dale-say')!;
    this.items = this.root.querySelector('.closet-items')!;
    this.detail = this.root.querySelector('.closet-detail')!;
    // Dale stands in front of the shelves, waist-up, about four-fifths of the room tall.
    const dh = 0.82;
    this.dale.style.height = pct(dh);
    this.dale.style.width = pct((dh * CLOSET_ART.dale.w) / CLOSET_ART.dale.h / AR);

    this.psst = el(
      'div',
      'psst',
      `<img class="psst-dale" src="${dalePsst}" alt="" draggable="false">
       <div class="psst-bubble"><p class="psst-text"></p>
         <div class="psst-actions"><button type="button" class="paper-btn paper-btn-strong" data-psst="take"></button><button type="button" class="paper-btn" data-psst="pass">Not now</button></div>
         <div class="psst-clock"><span></span></div></div>`,
    );
    this.psst.id = 'psst';
    this.psst.hidden = true;
    this.psst.setAttribute('role', 'alert');
    const app = document.getElementById('app')!;
    app.append(this.root, this.psst);
    document.getElementById('closet-btn')?.insertAdjacentHTML('beforeend', `<img class="card-art dale-card" src="${daleHead}" alt="" draggable="false">`);

    this.root.querySelector('#closet-back')!.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.psst.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-psst]');
      if (!b) return;
      if (b.dataset.psst === 'take') this.take();
      else passDeal(this.get());
    });
  }

  get isOpen() {
    return this.open;
  }

  /** Open the closet; `focus` ('w:ruler', 'u:chair') picks something up straight away. */
  show(focus?: string) {
    const s = this.get();
    if (s.lookBusy) return;
    if (s.walkby.arrivesAt !== null) return this.hooks.say('Not now: Mr. Feeney is coming. Get on your computer (Esc).');
    const wasOpen = this.open;
    this.open = true;
    this.root.hidden = false;
    this.key = '';
    this.formsFocus = null;
    if ((focus?.startsWith('u:') && isOffice(focus.slice(2))) || focus?.startsWith('n:')) {
      this.selected = 'forms';
      this.formsFocus = focus.slice(2);
    } else if (focus?.startsWith('w:') || focus?.startsWith('u:')) this.selected = focus as ItemKey;
    else this.selected = this.defaultPick(s);
    if (focus && this.selected) {
      const k = this.selected === 'forms' || this.selected === 'lost' ? this.selected : this.selected.slice(2);
      this.talk(PITCH[k] ?? pick(LINES.greet));
    } else this.talk(pick(LINES.greet));
    if (wasOpen) return;
    this.openUntil = performance.now() + 1800; // he opens his jacket to show you the goods
    this.sound.drawer();
    this.hooks.opened();
    (this.root.querySelector('#closet-back') as HTMLElement).focus();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    this.hooks.closed();
  }

  /** Mr. Feeney's footsteps: Dale shoos you out. */
  kickOut() {
    if (!this.open) return;
    this.close();
    this.hooks.say(`Dale: "${LINES.closed}" Get on your computer (Esc).`);
  }

  private talk(text: string) {
    this.bubble.textContent = text;
    this.talkUntil = performance.now() + Math.min(2600, 700 + text.length * 35);
    this.bubble.classList.remove('pop');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('pop');
  }

  /** The deal if there is one, otherwise the first thing you could buy right now. */
  private defaultPick(s: GameState): ItemKey | null {
    const deal = s.dale.deal;
    if (deal) return deal.kind === 'weapon' ? `w:${deal.id as WeaponId}` : `u:${deal.id as UpgradeId}`;
    if (s.hr.confiscated) return 'lost';
    for (const id of GUN_ORDER) {
      const w = WEAPONS.find((x) => x.id === id)!;
      if (!s.ownedWeapons.includes(id) && weaponAvailable(s, id) && s.salary >= priceOf(s, w.price)) return `w:${id}`;
    }
    for (const u of this.goods(s)) if (!has(s, u.id) && upgradeAvailable(s, u.id) && s.salary >= priceOf(s, u.price)) return `u:${u.id}`;
    if (this.forms(s).some((u) => !has(s, u.id) && upgradeAvailable(s, u.id) && s.salary >= priceOf(s, u.price))) return 'forms';
    return null;
  }

  private goods(s: GameState) {
    return UPGRADES.filter((u) => u.seller === 'dale' && u.stage <= s.stage + 1);
  }

  /** Office upgrades: the forms on the Procurement clipboard. */
  private forms(s: GameState) {
    return UPGRADES.filter((u) => u.seller !== 'dale' && u.stage <= s.stage + 1);
  }

  // ---------------------------------------------------------------- buying

  private onClick(e: Event) {
    const t = e.target as HTMLElement;
    const item = t.closest<HTMLButtonElement>('button[data-item]');
    if (item) {
      this.selected = item.dataset.item as ItemKey;
      this.formsFocus = null;
      this.key = '';
      const k = this.selected === 'lost' || this.selected === 'forms' ? this.selected : this.selected.slice(2);
      this.talk(PITCH[k] ?? pick(LINES.greet));
      this.sound.grab();
      // On a phone the details are under the picture: bring them into view.
      if (window.matchMedia?.('(max-width: 900px)').matches) requestAnimationFrame(() => this.detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      return;
    }
    const b = t.closest<HTMLButtonElement>('.closet-detail button');
    if (!b || b.disabled) return;
    const s = this.get();
    const d = b.dataset;
    if (d.weapon) {
      const id = d.weapon as WeaponId;
      const owned = s.ownedWeapons.includes(id);
      const r = buyWeapon(s, id);
      if (!r.ok) return this.talk(r.reason.startsWith('Costs') ? pick(LINES.poor) : r.reason);
      this.talk(pick(owned ? LINES.equip : LINES.buy));
      this.sound.coins();
      if (!owned) this.hooks.bump('salary');
    } else if (d.upgrade) {
      const r = buyUpgrade(s, d.upgrade as UpgradeId);
      if (!r.ok) return this.talk(r.reason.startsWith('Costs') ? pick(LINES.poor) : r.reason);
      this.talk(pick(LINES.buy));
      this.sound.coins();
      this.hooks.bump('salary');
    } else if (d.reno) {
      const r = buyRenovation(s, d.reno as RenovationId);
      if (!r.ok) return this.talk(r.reason.startsWith('That costs') ? pick(LINES.poor) : r.reason);
      this.talk(pick(LINES.buy));
      this.sound.coins();
      this.hooks.bump('salary');
      this.formsFocus = d.reno;
      this.key = '';
    } else if (d.buyback) {
      const r = buyBack(s);
      if (!r.ok) return this.talk(pick(LINES.poor));
      this.talk(pick(LINES.back));
      this.sound.coins();
      this.selected = null;
    } else if (d.deal) this.take();
  }

  private take() {
    const s = this.get();
    const r = takeDeal(s);
    if (!r.ok) {
      this.hooks.say(r.reason);
      if (this.open) this.talk(r.reason.startsWith('Dale wants') ? pick(LINES.poor) : r.reason);
      return;
    }
    this.sound.coins();
    this.hooks.bump('salary');
    if (this.open) this.talk(pick(LINES.buy));
    else this.hooks.say('Dale: "You didn’t get this from me."');
  }

  onKey(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'd' || k === 'b') {
      this.close();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- drawing

  /** The little tag hanging off each thing: its price, or what's stopping you. */
  private sticker(s: GameState, key: ItemKey): { text: string; cls: string } {
    const deal = s.dale.deal;
    if (key === 'lost') return { text: money(buyBackPrice(s)), cls: 'lost' };
    if (key === 'forms') {
      const open = this.forms(s).filter((u) => !has(s, u.id) && upgradeAvailable(s, u.id));
      const can = open.filter((u) => s.salary >= priceOf(s, u.price)).length;
      if (can) return { text: `${can} you can afford`, cls: 'afford' };
      if (open.length) return { text: `${open.length} form${open.length > 1 ? 's' : ''}`, cls: '' };
      if (renovationsOpen(s)) return { text: 'Renovations', cls: RENOVATIONS.some((r) => (renoCost(s, r.id) ?? Infinity) <= s.salary) ? 'afford' : '' };
      return { text: 'Office upgrades', cls: 'locked' };
    }
    if (key.startsWith('w:')) {
      const w = WEAPONS.find((x) => x.id === key.slice(2))!;
      if (isConfiscated(s, w.id)) return { text: 'Feeney has it', cls: 'gone' };
      if (s.weapon === w.id) return { text: 'Equipped', cls: 'mine' };
      if (s.ownedWeapons.includes(w.id)) return { text: 'Yours', cls: 'mine' };
      if (deal?.kind === 'weapon' && deal.id === w.id) return { text: `Deal ${money(deal.price)}`, cls: 'deal' };
      if (w.stage > s.stage) return { text: `Stage ${w.stage}`, cls: 'locked' };
      if (!weaponAvailable(s, w.id)) return { text: 'Take IT first', cls: 'locked' };
      if (w.needsEngineer && !mods(s).hasEngineer) return { text: 'Needs an Engineer', cls: 'locked' };
      return { text: money(priceOf(s, w.price)), cls: s.salary >= priceOf(s, w.price) ? 'afford' : '' };
    }
    const u = UPGRADES.find((x) => x.id === key.slice(2))!;
    if (has(s, u.id)) return { text: 'Yours', cls: 'mine' };
    if (deal?.kind === 'upgrade' && deal.id === u.id) return { text: `${deal.early ? 'Early' : 'Deal'} ${money(deal.price)}`, cls: 'deal' };
    if (!upgradeAvailable(s, u.id)) {
      const after = u.unlockAfter ? TARGETS.find((t) => t.id === u.unlockAfter) : undefined;
      return { text: after && u.stage <= s.stage && !targetDefeated(s, after.id) ? `After ${shortName(after.id)}` : `Stage ${u.stage}`, cls: 'locked' };
    }
    return { text: money(priceOf(s, u.price)), cls: s.salary >= priceOf(s, u.price) ? 'afford' : '' };
  }

  private buildItems(s: GameState) {
    const html: string[] = [];
    for (const id of GUN_ORDER) {
      const w = WEAPONS.find((x) => x.id === id)!;
      if (w.stage > s.stage + 1) continue;
      const [cx, cy, wd] = GUN_SPOTS[id];
      const key: ItemKey = `w:${id}`;
      const st = this.sticker(s, key);
      const gone = isConfiscated(s, id);
      const ar = CLOSET_ART[`gun_${id}` as 'gun_ruler'];
      const hFrac = (wd * ar.h) / ar.w * AR;
      html.push(`<button type="button" class="closet-item gun ${st.cls}${this.selected === key ? ' selected' : ''}${gone ? ' missing' : ''}" data-item="${key}"
        style="left:${pct(cx - wd / 2)};top:${pct(cy - hFrac / 2)};width:${pct(wd)};height:${pct(hFrac)}" aria-label="${esc(w.name)}: ${esc(st.text)}">
        <span class="hook" aria-hidden="true"></span><img src="${GUN_ART[id]}" alt="" draggable="false"><span class="sticker">${esc(st.text)}</span></button>`);
    }
    if (s.hr.confiscated) {
      const w = WEAPONS.find((x) => x.id === s.hr.confiscated!.weapon)!;
      const st = this.sticker(s, 'lost');
      html.push(`<button type="button" class="closet-item note${this.selected === 'lost' ? ' selected' : ''}" data-item="lost"
        style="left:${pct(PEG[0] + (PEG[2] - PEG[0]) * 0.64)};top:${pct(PEG[1] + (PEG[3] - PEG[1]) * 0.58)};width:${pct(0.12)}" aria-label="Lost and Found: your ${esc(w.name)}, ${esc(st.text)}">
        <b>Lost &amp; Found</b><span class="sticker lost">${esc(st.text)}</span></button>`);
    }
    {
      const [cx, base, wd] = FORMS_SPOT;
      const st = this.sticker(s, 'forms');
      const hFrac = (wd * CLOSET_ART.clipboard.h) / CLOSET_ART.clipboard.w * AR;
      html.push(`<button type="button" class="closet-item good forms ${st.cls}${this.selected === 'forms' ? ' selected' : ''}" data-item="forms"
        style="left:${pct(cx - wd / 2)};top:${pct(base - hFrac)};width:${pct(wd)};height:${pct(hFrac)}" aria-label="Procurement forms (office upgrades): ${esc(st.text)}">
        <img src="${clipboardArt}" alt="" draggable="false"><span class="sticker">${esc(st.text)}</span></button>`);
    }
    this.goods(s).forEach((u, i) => {
      const [cx, base, wd] = goodsSpot(i);
      const key: ItemKey = `u:${u.id}`;
      const st = this.sticker(s, key);
      const ar = CLOSET_ART[`icon_${u.id}` as 'icon_silent'];
      const hFrac = (wd * ar.h) / ar.w * AR;
      html.push(`<button type="button" class="closet-item good ${st.cls}${this.selected === key ? ' selected' : ''}" data-item="${key}"
        style="left:${pct(cx - wd / 2)};top:${pct(base - hFrac)};width:${pct(wd)};height:${pct(hFrac)}" aria-label="${esc(u.name)}: ${esc(st.text)}">
        <img src="${ICON_ART[u.id]}" alt="" draggable="false"><span class="sticker">${esc(st.text)}</span></button>`);
    });
    this.items.innerHTML = html.join('');
  }

  private buildDetail(s: GameState): void {
    const key = this.selected;
    const deal = s.dale.deal;
    const dealBtn = (on: boolean) =>
      on && deal ? `<button type="button" class="buy deal" data-deal="1" data-price="${deal.price}">${deal.early ? 'Early' : 'Deal'}: ${money(deal.price)}</button>` : '';
    if (!key) {
      this.detail.innerHTML = `<h3>Dale’s</h3><p>Weapons on the pegboard, band upgrades on the table, office upgrades on the clipboard by the door. Tap something to take a look.</p><p class="hint">No refunds. No receipts. No questions.</p>`;
      return;
    }
    if (key === 'forms') return this.buildForms(s);
    if (key === 'lost') {
      const c = s.hr.confiscated;
      if (!c) {
        this.selected = null;
        return this.buildDetail(s);
      }
      const w = WEAPONS.find((x) => x.id === c.weapon)!;
      const price = buyBackPrice(s);
      this.detail.innerHTML = `<h3>Your ${esc(w.name)}</h3><p>In Mr. Feeney’s desk drawer. It comes back on its own in <span class="conf-left"></span>, or Dale can fetch it now.</p>
        <button type="button" class="buy" data-buyback="1" data-price="${price}">Get it back ${money(price)}</button>`;
      return;
    }
    if (key.startsWith('w:')) {
      const w = WEAPONS.find((x) => x.id === key.slice(2))!;
      const owned = s.ownedWeapons.includes(w.id);
      const price = priceOf(s, w.price);
      const onDeal = !!deal && deal.kind === 'weapon' && deal.id === w.id && !owned;
      let act = '';
      if (isConfiscated(s, w.id)) act = `<p class="tag-note">In Mr. Feeney's drawer</p>`;
      else if (s.weapon === w.id) act = `<span class="stamp blue">Equipped</span>`;
      else if (owned) act = `<button type="button" class="buy" data-weapon="${w.id}">Equip</button>`;
      else if (w.stage > s.stage) act = `<p class="tag-note">${w.needsDept ? 'Stage 3: beat Rick, then take IT on the map. IT has the parts.' : `Stage ${w.stage}`}</p>`;
      else if (!weaponAvailable(s, w.id)) act = '<p class="tag-note">IT has the parts. Take IT first (on the map).</p>';
      else if (w.needsEngineer && !mods(s).hasEngineer) act = `<p class="tag-note">Needs someone assigned as Engineer to build it</p>`;
      else act = `${dealBtn(onDeal)}<button type="button" class="buy" data-weapon="${w.id}" data-price="${price}">Buy ${money(price)}</button>`;
      this.detail.innerHTML = `<h3>${esc(w.name)}</h3><p>${esc(w.blurb)}</p>
        <p class="stats">${w.damage * w.burst} damage, ${w.burst} band${w.burst > 1 ? 's' : ''} a shot, noise ${w.noise.toFixed(1)}</p><div class="detail-act">${act}</div>`;
      return;
    }
    const u = UPGRADES.find((x) => x.id === key.slice(2))!;
    const owned = has(s, u.id);
    const price = priceOf(s, u.price);
    const onDeal = !!deal && deal.kind === 'upgrade' && deal.id === u.id && !owned;
    let act = '';
    if (owned) act = `<span class="stamp">Yours</span>`;
    else if (!upgradeAvailable(s, u.id)) act = `${dealBtn(onDeal)}<p class="tag-note">${esc(this.sticker(s, key).text)}</p>`;
    else act = `${dealBtn(onDeal)}<button type="button" class="buy" data-upgrade="${u.id}" data-price="${price}">Buy ${money(price)}</button>`;
    this.detail.innerHTML = `<h3>${esc(u.name)}</h3><p>${esc(u.effect)}</p><div class="detail-act">${act}</div>`;
  }

  /** The Procurement clipboard: every office upgrade, pre-stamped, with its own Buy button. */
  private buildForms(s: GameState) {
    const rows: string[] = [];
    const done: string[] = [];
    for (const u of this.forms(s)) {
      if (has(s, u.id)) {
        done.push(esc(u.name));
        continue;
      }
      const price = priceOf(s, u.price);
      const avail = upgradeAvailable(s, u.id);
      const act = avail
        ? `<button type="button" class="buy" data-upgrade="${u.id}" data-price="${price}">${money(price)}</button>`
        : `<span class="tag-note">${esc(this.sticker(s, `u:${u.id}`).text)}</span>`;
      rows.push(`<li class="form-row${avail ? '' : ' locked'}${this.formsFocus === u.id ? ' focus' : ''}" data-form="${u.id}">
        <img src="${ICON_ART[u.id]}" alt="" draggable="false"><div><b>${esc(u.name)}</b><span>${esc(u.effect)}</span></div>${act}</li>`);
    }
    // Renovations: from the Department War on, every level a new form (and a bigger bill).
    const renos = renovationsOpen(s)
      ? RENOVATIONS.map((r) => {
          const lv = renoLevel(s, r.id);
          const price = renoCost(s, r.id);
          const act = price === null ? '<span class="tag-note">Done</span>' : `<button type="button" class="buy" data-reno="${r.id}" data-price="${price}">${money(price)}</button>`;
          return `<li class="form-row reno${this.formsFocus === r.id ? ' focus' : ''}" data-form="${r.id}">
            <img src="${RENO_ART[r.id]}" alt="" draggable="false"><div><b>${esc(r.name)}${lv ? ` <small class="reno-lv">level ${lv}</small>` : ''}</b><span>${esc(r.does)}${lv ? ` Now: ${esc(renoNow(r.id, lv))}.` : ''}</span></div>${act}</li>`;
        })
      : [];
    this.detail.innerHTML = `<h3>Procurement forms</h3><p>Office upgrades. Dale’s cousin pre-stamps them, so nobody asks what they’re for.</p>
      ${rows.length ? `<ul class="forms-list">${rows.join('')}</ul>` : renos.length ? '' : '<p class="hint">Every form is filed. Procurement is starting to wonder.</p>'}
      ${renos.length ? `<h4 class="forms-h">Renovations</h4><p class="hint">As many times as you like; every level costs more. They stay with the office if you leave.</p><ul class="forms-list">${renos.join('')}</ul>` : ''}
      ${done.length ? `<p class="forms-done"><b>Approved:</b> ${done.join(', ')}</p>` : ''}`;
    const focus = this.formsFocus && this.detail.querySelector('.form-row.focus');
    if (focus) requestAnimationFrame(() => focus.scrollIntoView({ block: 'nearest' }));
  }

  render() {
    const s = this.get();
    this.renderPsst(s);
    if (!this.open) return;
    if (s.lookBusy) return this.close();
    if (s.walkby.arrivesAt !== null) return this.kickOut();

    const deal = s.dale.deal;
    const key = [
      this.selected,
      this.formsFocus,
      s.stage,
      s.targetIndex,
      s.weapon,
      s.ownedWeapons.join(),
      s.upgrades.join(),
      JSON.stringify(s.renovations),
      s.hr.confiscated?.weapon ?? '',
      mods(s).hasEngineer,
      mods(s).priceMult,
      Math.floor(s.salary / 5), // affordability stickers
      deal ? `${deal.id}:${deal.price}` : '',
    ].join('|');
    if (key !== this.key) {
      this.key = key;
      this.buildItems(s);
      this.buildDetail(s);
    }
    this.root.querySelectorAll<HTMLButtonElement>('.closet-detail button[data-price]').forEach((b) => {
      b.disabled = s.salary < Number(b.dataset.price);
    });
    const left = confiscatedLeft(s);
    this.root.querySelectorAll<HTMLElement>('.conf-left').forEach((e) => {
      const t = left === null ? '' : clock(left);
      if (e.textContent !== t) e.textContent = t;
    });

    // Dale holds one pose at a time: jacket open while he greets you, mid-sentence while he's
    // pitching something, arms crossed otherwise. No flapping between them.
    const now = performance.now();
    const pose = now < this.openUntil ? 'open' : now < this.talkUntil ? 'talk' : 'idle';
    this.dale.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      const on = img.dataset.pose === pose;
      if (img.hidden === on) img.hidden = !on;
    });
    this.bubble.hidden = now > this.talkUntil + 2500;
  }

  /** "Psst": Dale leans in from the left with a deal while it lasts. */
  private renderPsst(s: GameState) {
    const deal = s.dale.deal;
    const show = !!deal && !s.lookBusy && !this.open;
    if (show !== this.psstShown) {
      this.psstShown = show;
      this.psst.hidden = !show;
      if (show) this.sound.psst();
    }
    if (!show || !deal) return;
    const text = `Psst. ${dealName(deal)}, ${money(deal.price)}. ${deal.early ? 'Procurement would make you wait. I don’t.' : 'Today only.'}`;
    const p = this.psst.querySelector('.psst-text')!;
    if (p.textContent !== text) p.textContent = text;
    const take = this.psst.querySelector<HTMLButtonElement>('[data-psst="take"]')!;
    const label = `Deal (${money(deal.price)})`;
    if (take.textContent !== label) take.textContent = label;
    take.disabled = s.salary < deal.price;
    const fill = this.psst.querySelector<HTMLElement>('.psst-clock span')!;
    fill.style.width = `${Math.max(0, Math.min(1, (deal.until - s.time) / DALE.dealSeconds)) * 100}%`;
  }
}
