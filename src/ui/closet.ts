// The supply closet: Dale from Facilities and the office black market.
//
// Dale sells every rubber band gun and the band "upgrades" Procurement would never
// approve, and he can get your weapon back out of Mr. Feeney's drawer. Every few
// minutes he also leans over your cubicle wall ("Psst") with a deal for 30 seconds.
// The closet closes the moment Mr. Feeney's footsteps start.

import rulerArt from '../assets/art/ruler-loaded.webp';
import clothespinArt from '../assets/art/clothespin-loaded.webp';
import repeaterArt from '../assets/art/repeater-loaded.webp';

import { SPRITES } from './art';
import { drawPerson, PEOPLE, type Mood } from './characters';
import { DALE, TARGETS, UPGRADES, WEAPONS, type UpgradeId, type WeaponId } from '../sim/content';
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
} from '../sim/engine';
import { has, isConfiscated, mods } from '../sim/mods';
import type { GameState } from '../sim/state';
import type { Sound } from './sound';

const GUN_ART: Partial<Record<WeaponId, string>> = {
  ruler: rulerArt,
  clothespin: clothespinArt,
  repeater: repeaterArt,
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
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Stand-in for Dale's painted art: the code-drawn bust. */
const daleBust = (mood: Mood) => `<svg viewBox="0 0 120 150" aria-hidden="true">${drawPerson(PEOPLE.dale, mood)}</svg>`;

/** A held weapon sprite, cropped to just the weapon (left of your wrist). Stand-in until the hand-free art arrives. */
function gunPicture(id: WeaponId) {
  const src = GUN_ART[id];
  const sp = SPRITES[id as keyof typeof SPRITES];
  if (!src || !sp) return `<div class="gun-pic gun-none" aria-hidden="true"></div>`;
  const keep = Math.min(sp.w, sp.wrist[0] * 0.64); // just left of your fingers
  return `<div class="gun-pic" style="padding-top:${((sp.h / keep) * 100).toFixed(2)}%" aria-hidden="true"><img src="${src}" alt="" draggable="false" style="width:${((sp.w / keep) * 100).toFixed(1)}%"></div>`;
}

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
  private guns: HTMLElement;
  private goods: HTMLElement;
  private dealNote: HTMLElement;
  private psst: HTMLElement;
  private open = false;
  private key = '';
  private talkUntil = 0;
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
        <div class="closet-dale"><div class="dale-art"></div><p class="dale-say" aria-live="polite"></p></div>
        <section class="closet-guns" aria-label="Rubber band guns"><h3>On the pegboard</h3><div class="peg-items"></div></section>
        <section class="closet-goods" aria-label="Band upgrades"><h3>Under the table</h3><p class="closet-deal" hidden></p><div class="table-items"></div></section>
      </div>`,
    );
    this.root.id = 'closet';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-labelledby', 'closet-h');
    this.dale = this.root.querySelector('.dale-art')!;
    this.bubble = this.root.querySelector('.dale-say')!;
    this.guns = this.root.querySelector('.peg-items')!;
    this.goods = this.root.querySelector('.table-items')!;
    this.dealNote = this.root.querySelector('.closet-deal')!;

    this.psst = el(
      'div',
      'psst',
      `<div class="psst-dale">${daleBust('smug')}</div>
       <div class="psst-bubble"><p class="psst-text"></p>
         <div class="psst-actions"><button type="button" class="paper-btn paper-btn-strong" data-psst="take"></button><button type="button" class="paper-btn" data-psst="pass">Not now</button></div>
         <div class="psst-clock"><span></span></div></div>`,
    );
    this.psst.id = 'psst';
    this.psst.hidden = true;
    this.psst.setAttribute('role', 'alert');
    const app = document.getElementById('app')!;
    app.append(this.root, this.psst);
    document.getElementById('closet-btn')?.insertAdjacentHTML('beforeend', `<span class="card-art dale-card">${daleBust('smug')}</span>`);

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

  show() {
    const s = this.get();
    if (this.open || s.lookBusy) return;
    if (s.walkby.arrivesAt !== null) return this.hooks.say('Not now: Mr. Feeney is coming. Get on your computer (Esc).');
    this.open = true;
    this.root.hidden = false;
    this.key = '';
    this.talk(pick(LINES.greet), 'smug');
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

  private talk(text: string, mood: Mood = 'happy') {
    this.bubble.textContent = text;
    this.dale.innerHTML = daleBust(mood);
    this.talkUntil = performance.now() + 2600;
    this.bubble.classList.remove('pop');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('pop');
  }

  // ---------------------------------------------------------------- buying

  private onClick(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || b.disabled) return;
    const s = this.get();
    const d = b.dataset;
    if (d.weapon) {
      const id = d.weapon as WeaponId;
      const owned = s.ownedWeapons.includes(id);
      const r = buyWeapon(s, id);
      if (!r.ok) return this.talk(r.reason.startsWith('Costs') ? pick(LINES.poor) : r.reason, 'idle');
      this.talk(pick(owned ? LINES.equip : LINES.buy));
      this.sound.coins();
      if (!owned) this.hooks.bump('salary');
    } else if (d.upgrade) {
      const r = buyUpgrade(s, d.upgrade as UpgradeId);
      if (!r.ok) return this.talk(r.reason.startsWith('Costs') ? pick(LINES.poor) : r.reason, 'idle');
      this.talk(pick(LINES.buy));
      this.sound.coins();
      this.hooks.bump('salary');
    } else if (d.buyback) {
      const r = buyBack(s);
      if (!r.ok) return this.talk(pick(LINES.poor), 'idle');
      this.talk(pick(LINES.back));
      this.sound.coins();
    } else if (d.deal) this.take();
  }

  private take() {
    const s = this.get();
    const r = takeDeal(s);
    if (!r.ok) {
      this.hooks.say(r.reason);
      if (this.open) this.talk(r.reason.startsWith('Dale wants') ? pick(LINES.poor) : r.reason, 'idle');
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

  private gunItems(s: GameState) {
    const m = mods(s);
    const deal = s.dale.deal;
    const items: string[] = [];
    if (s.hr.confiscated) {
      const w = WEAPONS.find((x) => x.id === s.hr.confiscated!.weapon)!;
      const price = buyBackPrice(s);
      items.push(`<article class="peg-item lost">${gunPicture(w.id)}
        <div class="hang-tag"><h4>Your ${esc(w.name)}</h4><p>Dale "found" it in Mr. Feeney's drawer. It comes back on its own in <span class="conf-left"></span>.</p>
        <button type="button" class="buy" data-buyback="1" data-price="${price}">Get it back ${money(price)}</button></div></article>`);
    }
    for (const w of WEAPONS) {
      if (w.price === 0 || w.stage > s.stage + 1) continue;
      const owned = s.ownedWeapons.includes(w.id);
      const price = priceOf(s, w.price);
      let act: string;
      if (isConfiscated(s, w.id)) act = `<span class="tag-note">In Mr. Feeney's drawer</span>`;
      else if (s.weapon === w.id) act = `<span class="stamp blue">Equipped</span>`;
      else if (owned) act = `<button type="button" class="buy" data-weapon="${w.id}">Equip</button>`;
      else if (w.stage > s.stage) act = `<span class="tag-note">Stage ${w.stage}</span>`;
      else if (w.needsEngineer && !m.hasEngineer) act = `<span class="tag-note">Needs an Engineer to build it</span>`;
      else act = `<button type="button" class="buy" data-weapon="${w.id}" data-price="${price}">Buy ${money(price)}</button>`;
      const onDeal = deal && deal.kind === 'weapon' && deal.id === w.id && !owned;
      items.push(`<article class="peg-item${owned ? ' owned' : ''}${onDeal ? ' on-deal' : ''}">${gunPicture(w.id)}
        <div class="hang-tag"><h4>${esc(w.name)}</h4><p>${esc(w.blurb)}</p>
        <p class="stats">${w.damage * w.burst} damage, ${w.burst} band${w.burst > 1 ? 's' : ''} a shot, noise ${w.noise.toFixed(1)}</p>
        ${onDeal ? `<button type="button" class="buy deal" data-deal="1" data-price="${deal!.price}">Deal: ${money(deal!.price)}</button>` : ''}${act}</div></article>`);
    }
    return items.join('');
  }

  private goodsItems(s: GameState) {
    const deal = s.dale.deal;
    return UPGRADES.filter((u) => u.seller === 'dale' && u.stage <= s.stage)
      .map((u) => {
        const owned = has(s, u.id);
        const price = priceOf(s, u.price);
        const after = u.unlockAfter ? TARGETS.find((t) => t.id === u.unlockAfter) : undefined;
        let act: string;
        if (owned) act = `<span class="stamp">Yours</span>`;
        else if (!upgradeAvailable(s, u.id)) act = `<span class="tag-note">${after && !targetDefeated(s, after.id) ? `After ${esc(after.name.split(' ')[0])}` : `Stage ${u.stage}`}</span>`;
        else act = `<button type="button" class="buy" data-upgrade="${u.id}" data-price="${price}">Buy ${money(price)}</button>`;
        const onDeal = deal && deal.kind === 'upgrade' && deal.id === u.id && !owned;
        return `<article class="good${owned ? ' owned' : ''}${onDeal ? ' on-deal' : ''}"><h4>${esc(u.name)}</h4><p>${esc(u.effect)}</p>
          ${onDeal ? `<button type="button" class="buy deal" data-deal="1" data-price="${deal!.price}">${deal!.early ? 'Early' : 'Deal'}: ${money(deal!.price)}</button>` : ''}${act}</article>`;
      })
      .join('');
  }

  render() {
    const s = this.get();
    this.renderPsst(s);
    if (!this.open) return;
    if (s.lookBusy) return this.close();
    if (s.walkby.arrivesAt !== null) return this.kickOut();

    const deal = s.dale.deal;
    const key = [
      s.stage,
      s.targetIndex,
      s.weapon,
      s.ownedWeapons.join(),
      s.upgrades.join(),
      s.hr.confiscated?.weapon ?? '',
      mods(s).hasEngineer,
      mods(s).priceMult,
      deal ? `${deal.id}:${deal.price}` : '',
    ].join('|');
    if (key !== this.key) {
      this.key = key;
      this.guns.innerHTML = this.gunItems(s);
      this.goods.innerHTML = this.goodsItems(s);
      this.dealNote.hidden = !deal;
      if (deal) this.dealNote.textContent = deal.early ? `Psst: the ${dealName(deal)}, before Procurement would ever let you have it.` : `Today only: the ${dealName(deal)}.`;
    }
    this.root.querySelectorAll<HTMLButtonElement>('button[data-price]').forEach((b) => {
      b.disabled = s.salary < Number(b.dataset.price);
    });
    const left = confiscatedLeft(s);
    this.root.querySelectorAll<HTMLElement>('.conf-left').forEach((e) => {
      const t = left === null ? '' : clock(left);
      if (e.textContent !== t) e.textContent = t;
    });
    if (this.talkUntil && performance.now() > this.talkUntil) {
      this.talkUntil = 0;
      this.dale.innerHTML = daleBust('smug');
    }
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
