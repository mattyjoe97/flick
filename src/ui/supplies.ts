// Bands you get with your own hands: the desk drawer (Scrounge), and supply orders
// (the requisition going out, the box coming back).
//
// The drawer slides out at the bottom of the screen, full of junk and a few stray
// bands. Your hand reaches in and picks one out. Supply orders get stamped and sent
// off in an inter-office envelope; a few seconds later the box lands on your desk.

import drawerArt from '../assets/art/drawer-open.webp';
import drawerClosed from '../assets/art/drawer-closed.webp';
import handReach from '../assets/art/hand-reach.webp';
import handPinch from '../assets/art/hand-pinch.webp';
import bandA from '../assets/art/prop-band_a.webp';
import bandB from '../assets/art/prop-band_b.webp';
import bandC from '../assets/art/prop-band_c.webp';
import tangle from '../assets/art/prop-tangle.webp';
import ball from '../assets/art/prop-ball.webp';
import stapler from '../assets/art/prop-stapler.webp';
import clips from '../assets/art/prop-clips.webp';
import pen from '../assets/art/prop-pen.webp';
import pencil from '../assets/art/prop-pencil.webp';
import sticky from '../assets/art/prop-sticky.webp';
import menu from '../assets/art/prop-menu.webp';
import binder from '../assets/art/prop-binder.webp';
import eraser from '../assets/art/prop-eraser.webp';
import granola from '../assets/art/prop-granola.webp';
import change from '../assets/art/prop-change.webp';
import formArt from '../assets/art/form.webp';
import stampArt from '../assets/art/stamp.webp';
import envelopeArt from '../assets/art/envelope.webp';
import boxClosed from '../assets/art/box-closed.webp';
import boxOpen from '../assets/art/box-open.webp';
import bulkClosed from '../assets/art/bulk-closed.webp';
import bulkOpen from '../assets/art/bulk-open.webp';

import { DRAWER, HAND, PROPS, type PropId } from './art';
import { openBox, scrounge } from '../sim/engine';
import { mods } from '../sim/mods';
import { SUPPLIES, type FindKind } from '../sim/supplies';
import type { GameState } from '../sim/state';
import type { Sound } from './sound';

const SRC: Record<PropId, string> = {
  band_a: bandA,
  band_b: bandB,
  band_c: bandC,
  tangle,
  ball,
  stapler,
  clips,
  pen,
  pencil,
  sticky,
  menu,
  binder,
  eraser,
  granola,
  change,
};
const FIND_PROP: Record<FindKind, PropId> = { tangle: 'tangle', ball: 'ball', change: 'change' };
const FIND_NAME: Record<FindKind, string> = { tangle: 'A tangle of bands', ball: 'A rubber band ball', change: 'Loose change' };
const JUNK: PropId[] = ['stapler', 'menu', 'sticky', 'granola', 'pen', 'pencil', 'clips', 'binder', 'eraser'];

/** Drawer width / height: turns a width fraction into a height fraction. */
const ASPECT = DRAWER.w / DRAWER.h;
const MAX_SLOTS = SUPPLIES.drawerCap * 2;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const touch = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export interface SuppliesHooks {
  say(text: string): void;
  bump(which: 'bands' | 'salary'): void;
}

interface Placed {
  x: number; // centre, fraction of the drawer's width
  y: number; // centre, fraction of the drawer's height
  r: number; // degrees
}

/** Spreads things over the drawer floor, keeping each new one as far from the others as it can. */
function scatter(count: number, size: number, taken: Placed[]): Placed[] {
  const [x0, y0, x1, y1] = DRAWER.floor;
  const hx = size / 2;
  const hy = (size / 2) * ASPECT * 0.6;
  const out: Placed[] = [];
  for (let i = 0; i < count; i++) {
    let best: Placed | null = null;
    let bestD = -1;
    for (let k = 0; k < 24; k++) {
      const p = { x: x0 + hx + Math.random() * (x1 - x0 - 2 * hx), y: y0 + hy + Math.random() * (y1 - y0 - 2 * hy), r: Math.random() * 120 - 60 };
      const d = Math.min(1, ...[...taken, ...out].map((q) => Math.hypot(p.x - q.x, (p.y - q.y) / ASPECT)));
      if (d > bestD) {
        best = p;
        bestD = d;
      }
    }
    out.push(best!);
  }
  return out;
}

// ---------------------------------------------------------------- the drawer

export class DrawerView {
  private root: HTMLElement;
  private tray: HTMLElement;
  private items: HTMLElement;
  private hand: HTMLElement;
  private tip: HTMLElement;
  private findEl: HTMLButtonElement;
  private slots: HTMLButtonElement[] = [];
  private shown = new Set<number>();
  private findKind: FindKind | null = null;
  private open = false;
  private closeAt = 0;
  private run = 0;
  private holding: HTMLElement | null = null;

  constructor(
    private get: () => GameState,
    private hooks: SuppliesHooks,
    private sound: Sound,
  ) {
    this.root = el('div', 'drawer');
    this.root.id = 'drawer';
    this.root.hidden = true;
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Your desk drawer');
    this.tray = el('div', 'drawer-tray', `<img class="drawer-bg" src="${drawerArt}" alt="" draggable="false">`);
    this.items = el('div', 'drawer-items');
    this.hand = el('div', 'drawer-hand', `<img class="reach" src="${handReach}" alt="" draggable="false"><img class="pinch" src="${handPinch}" alt="" draggable="false">`);
    this.hand.setAttribute('aria-hidden', 'true');
    this.hand.style.width = `${HAND.dw * 100}%`;
    this.tip = el('p', 'drawer-tip');
    this.findEl = el('button', 'drawer-item drawer-find');
    this.findEl.type = 'button';
    this.findEl.hidden = true;
    this.tray.append(this.items, this.hand);
    this.root.append(this.tray, this.tip);
    document.getElementById('app')!.append(this.root);
    document.getElementById('scrounge-btn')?.insertAdjacentHTML('beforeend', `<img class="card-art" src="${drawerClosed}" alt="" draggable="false">`);
    this.layout();

    this.items.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const slot = t.closest<HTMLElement>('[data-slot]');
      if (slot) return this.grab(Number(slot.dataset.slot));
      if (t.closest('.drawer-find')) return this.grab('find');
      const junk = t.closest<HTMLElement>('.junk');
      if (junk && !reducedMotion()) {
        const r = junk.style.getPropertyValue('--r');
        junk.animate(
          [{ rotate: '0deg' }, { rotate: '6deg' }, { rotate: '-4deg' }, { rotate: '0deg' }].map((k) => ({ transform: `translate(-50%, -50%) rotate(calc(${r} + ${k.rotate}))` })),
          { duration: 260 },
        );
        this.sound.grab();
        this.keepOpen();
      }
    });
    // Clicking anywhere else puts the drawer away (the Scrounge buttons open it again).
    document.addEventListener('pointerdown', (e) => {
      if (!this.open) return;
      const t = e.target as HTMLElement;
      if (this.root.contains(t) || t.closest('#scrounge-btn, [data-mini="scrounge"]')) return;
      this.close();
    });
  }

  get isOpen() {
    return this.open;
  }

  /** Junk first (underneath), then the stray bands on top, then the spot where finds turn up. */
  private layout() {
    const junk = JUNK.filter(() => Math.random() < 0.8);
    const spots = scatter(junk.length, 0.16, []);
    junk.forEach((id, i) => {
      const p = spots[i];
      const e = el('span', 'drawer-item junk', `<img src="${SRC[id]}" alt="" draggable="false">`);
      e.setAttribute('aria-hidden', 'true');
      this.place(e, id, p, id === 'pen' || id === 'pencil' ? Math.random() * 360 : p.r * 0.5);
      this.items.append(e);
    });
    const bands = scatter(MAX_SLOTS, 0.11, []);
    const variants: PropId[] = ['band_a', 'band_b', 'band_c'];
    bands.forEach((p, i) => {
      const v = variants[i % 3];
      const b = el('button', 'drawer-item band', `<img src="${SRC[v]}" alt="" draggable="false">`);
      b.type = 'button';
      b.dataset.slot = String(i);
      b.setAttribute('aria-label', 'Rubber band');
      b.hidden = true;
      this.place(b, v, p, p.r * 1.5);
      this.slots.push(b);
      this.items.append(b);
    });
    const [spot] = scatter(1, 0.15, bands.slice(0, 12));
    this.findEl.dataset.x = String(spot.x);
    this.findEl.dataset.y = String(spot.y);
    this.items.append(this.findEl);
  }

  private place(e: HTMLElement, id: PropId, p: Placed, r: number) {
    e.style.left = `${p.x * 100}%`;
    e.style.top = `${p.y * 100}%`;
    e.style.width = `${PROPS[id].dw * 100}%`;
    e.style.setProperty('--r', `${r.toFixed(1)}deg`);
  }

  // ---------------------------------------------------------------- open and close

  show() {
    if (this.open) return this.keepOpen();
    if (this.get().lookBusy) return;
    this.open = true;
    this.root.hidden = false;
    this.sync(true);
    void this.root.offsetWidth;
    this.root.classList.add('open');
    this.sound.drawer();
    this.keepOpen();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('open');
    this.dropHeld();
    setTimeout(() => {
      if (!this.open) this.root.hidden = true;
    }, 220);
  }

  private keepOpen(ms = 2800) {
    this.closeAt = performance.now() + ms;
  }

  /** Shows as many bands as are really in the drawer, and whatever's been found. */
  private sync(instant: boolean) {
    const s = this.get();
    const want = Math.min(s.supplies.drawer, MAX_SLOTS);
    while (this.shown.size > want) {
      const i = [...this.shown][Math.floor(Math.random() * this.shown.size)];
      this.shown.delete(i);
      this.slots[i].hidden = true;
    }
    if (this.shown.size < want) {
      const hidden = this.slots.map((_, i) => i).filter((i) => !this.shown.has(i) && this.slots[i] !== this.holding);
      while (this.shown.size < want && hidden.length) {
        const i = hidden.splice(Math.floor(Math.random() * hidden.length), 1)[0];
        this.shown.add(i);
        const b = this.slots[i];
        b.hidden = false;
        b.classList.toggle('arrive', !instant && !reducedMotion());
      }
    }
    const find = s.supplies.find;
    if (find !== this.findKind && this.findEl !== this.holding) {
      this.findKind = find;
      this.findEl.hidden = !find;
      if (find) {
        const id = FIND_PROP[find];
        this.findEl.innerHTML = `<img src="${SRC[id]}" alt="" draggable="false"><i class="sparkle" aria-hidden="true"></i>`;
        this.findEl.setAttribute('aria-label', FIND_NAME[find]);
        this.place(this.findEl, id, { x: Number(this.findEl.dataset.x), y: Number(this.findEl.dataset.y), r: 0 }, -12);
        if (!instant) this.sound.find();
      }
    }
  }

  // ---------------------------------------------------------------- grabbing

  /** S, or a tap on something in the drawer. With no target, the good stuff comes out first. */
  grab(target?: number | 'find') {
    const s = this.get();
    if (s.lookBusy) return;
    if (!this.open) this.show();
    this.keepOpen();
    if (target === undefined) {
      const shown = [...this.shown];
      // Bands near the front of the drawer come out first, the way you'd actually grab them.
      shown.sort((a, b) => parseFloat(this.slots[b].style.top) - parseFloat(this.slots[a].style.top));
      target = s.supplies.find ? 'find' : shown.slice(0, 4)[Math.floor(Math.random() * Math.min(4, shown.length))];
    }
    const r = scrounge(s, target === 'find' ? 'find' : 'band');
    if (!r.ok) {
      this.hooks.say(r.reason);
      this.tip.classList.remove('nudge');
      void this.tip.offsetWidth;
      this.tip.classList.add('nudge');
      return;
    }
    let item: HTMLElement | null = null;
    if (target === 'find') {
      item = this.findEl;
      this.findKind = null;
    } else if (target !== undefined && this.shown.has(target)) {
      item = this.slots[target];
      this.shown.delete(target);
    }
    this.sync(false);
    if (r.item === 'band') this.sound.grab();
    else this.sound.coins();
    this.hooks.bump(r.salary > 0 ? 'salary' : 'bands');
    const label = r.item === 'change' ? `+$${r.salary}` : r.item === 'band' ? `+${r.bands}` : `+${r.bands} bands!`;
    if (item) void this.pickUp(item, label, r.item !== 'band');
    else this.floater(label, 0.55, 0.5, false);
  }

  /** The hand reaches in, pinches, and pulls the thing out of the drawer. */
  private async pickUp(item: HTMLElement, label: string, big: boolean) {
    const id = ++this.run;
    this.dropHeld();
    this.holding = item;
    const tray = this.tray.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    const tx = box.left + box.width / 2 - tray.left;
    const ty = box.top + box.height / 2 - tray.top;
    this.floater(label, tx / tray.width, ty / tray.height, big);
    if (reducedMotion()) {
      this.dropHeld();
      return;
    }
    const hw = HAND.dw * tray.width;
    const hh = (hw * HAND.h) / HAND.w;
    const left = tx - HAND.pinch[0] * hw;
    const top = ty - HAND.pinch[1] * hh;
    const away = tray.height - top + 12; // far enough down that the hand is out of the drawer
    this.hand.style.left = `${left}px`;
    this.hand.style.top = `${top}px`;
    this.hand.classList.remove('pinching');
    this.hand.classList.add('on');
    this.hand.getAnimations().forEach((a) => a.cancel());
    const reach = this.hand.animate([{ transform: `translateY(${away}px)` }, { transform: 'translateY(0)' }], { duration: 130, easing: 'cubic-bezier(.2,.7,.3,1)' });
    await reach.finished.catch(() => undefined);
    if (id !== this.run) return;
    this.hand.classList.add('pinching');
    item.classList.add('held');
    await wait(55);
    if (id !== this.run) return;
    const r = item.style.getPropertyValue('--r');
    const back = { duration: 170, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' as const };
    const pull = this.hand.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${away}px)` }], back);
    item.animate(
      [{ transform: `translate(-50%, -50%) rotate(${r})` }, { transform: `translate(-50%, calc(-50% + ${away}px)) rotate(${r})` }],
      back,
    );
    await pull.finished.catch(() => undefined);
    if (id !== this.run) return;
    this.dropHeld();
    this.hand.classList.remove('on', 'pinching');
  }

  /** Whatever the hand was carrying is gone (it's in your band pile now). */
  private dropHeld() {
    const h = this.holding;
    if (!h) return;
    this.holding = null;
    h.getAnimations().forEach((a) => a.cancel());
    h.classList.remove('held', 'arrive');
    h.hidden = true;
  }

  private floater(text: string, fx: number, fy: number, big: boolean) {
    const f = el('span', big ? 'drawer-floater big' : 'drawer-floater');
    f.textContent = text;
    f.style.left = `${fx * 100}%`;
    f.style.top = `${Math.max(0.12, fy - 0.08) * 100}%`;
    this.tray.append(f);
    setTimeout(() => f.remove(), 900);
  }

  // ---------------------------------------------------------------- every frame

  render() {
    if (!this.open) return;
    const s = this.get();
    if (s.lookBusy || performance.now() > this.closeAt) return this.close();
    this.sync(false);
    const n = s.supplies.drawer;
    const per = mods(s).scrounge;
    this.tip.textContent =
      n > 0 || s.supplies.find
        ? `${s.supplies.find ? `${FIND_NAME[s.supplies.find]}! ` : ''}${touch() ? 'Tap a band to grab it' : 'Click a band or press S'}${per > 1 ? ` (${per} at a time)` : ''}.`
        : 'Empty. Strays turn up every few seconds, or order supplies (O).';
  }
}

// ---------------------------------------------------------------- orders and deliveries

const REASONS = ['Team building', 'Q3 initiative', 'Ergonomics', 'Strategic reserve', 'Don’t ask', 'Morale', 'Synergy'];

export class DeliveryView {
  private paper: HTMLElement;
  private box: HTMLButtonElement;
  private boxImg: HTMLImageElement;
  private boxLabel: HTMLElement;
  private boxShown = false;
  private bulk = false;
  private opening = false;
  private paperRun = 0;

  constructor(
    private get: () => GameState,
    private hooks: SuppliesHooks,
    private sound: Sound,
  ) {
    this.paper = el(
      'div',
      'order-paper',
      `<div class="op-form"><img src="${formArt}" alt="" draggable="false">
         <div class="op-text"><b>Supply requisition</b><span class="op-item"></span><span class="op-qty"></span><span class="op-why"></span><span class="op-sign">J. Doe</span></div>
         <span class="op-mark">Approved</span></div>
       <img class="op-stamp" src="${stampArt}" alt="" draggable="false">
       <img class="op-env" src="${envelopeArt}" alt="" draggable="false">`,
    );
    this.paper.setAttribute('aria-hidden', 'true');
    this.paper.hidden = true;
    this.box = el('button', 'desk-box', `<img alt="" draggable="false"><span class="box-label"></span>`);
    this.box.type = 'button';
    this.box.id = 'desk-box';
    this.box.hidden = true;
    this.boxImg = this.box.querySelector('img')!;
    this.boxLabel = this.box.querySelector('.box-label')!;
    const app = document.getElementById('app')!;
    app.append(this.paper, this.box);
    document.getElementById('order-btn')?.insertAdjacentHTML('beforeend', `<img class="card-art" src="${boxClosed}" alt="" draggable="false">`);
    this.box.addEventListener('click', () => this.openIt());
  }

  /** You placed an order from the desk: fill in the form, stamp it, send it off. */
  async ordered(amount: number) {
    if (reducedMotion()) return;
    const id = ++this.paperRun;
    const p = this.paper;
    p.querySelector('.op-item')!.textContent = 'Rubber bands, assorted';
    p.querySelector('.op-qty')!.textContent = `Qty: ${amount}`;
    p.querySelector('.op-why')!.textContent = `Reason: ${REASONS[Math.floor(Math.random() * REASONS.length)]}`;
    p.hidden = false;
    p.className = 'order-paper';
    void p.offsetWidth;
    p.classList.add('in');
    await wait(260);
    if (id !== this.paperRun) return;
    p.classList.add('stamping');
    await wait(150);
    if (id !== this.paperRun) return;
    p.classList.add('stamped');
    this.sound.stamp();
    await wait(280);
    if (id !== this.paperRun) return;
    p.classList.add('filed');
    await wait(420);
    if (id !== this.paperRun) return;
    p.classList.add('sent');
    await wait(420);
    if (id === this.paperRun) p.hidden = true;
  }

  /** O, or a click on the box. */
  openIt() {
    if (this.opening) return;
    const r = openBox(this.get());
    if (!r.ok) return;
    this.opening = true;
    this.boxImg.src = this.bulk ? bulkOpen : boxOpen;
    this.box.classList.add('opened');
    this.boxLabel.hidden = true;
    this.sound.tear();
    this.hooks.bump('bands');
    const f = el('span', 'box-floater', `+${r.amount.toLocaleString('en-US')} bands`);
    this.box.append(f);
    if (!reducedMotion()) {
      const n = Math.min(10, 3 + Math.floor(r.amount / 50));
      for (let i = 0; i < n; i++) {
        const b = el('img', 'box-band') as HTMLImageElement;
        b.src = [bandA, bandB, bandC][i % 3];
        b.alt = '';
        b.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
        b.style.setProperty('--dy', `${-60 - Math.random() * 90}px`);
        b.style.setProperty('--rot', `${(Math.random() - 0.5) * 300}deg`);
        b.style.animationDelay = `${i * 30}ms`;
        this.box.append(b);
      }
    }
    setTimeout(() => {
      this.box.classList.add('gone');
      setTimeout(() => {
        this.box.hidden = true;
        this.box.classList.remove('opened', 'gone', 'landed');
        this.box.querySelectorAll('.box-band, .box-floater').forEach((e) => e.remove());
        this.boxShown = false;
        this.opening = false;
      }, 260);
    }, reducedMotion() ? 500 : 900);
  }

  render() {
    const s = this.get();
    const box = s.supplies.box;
    if (this.opening) return;
    if (!box) {
      if (this.boxShown) {
        this.box.hidden = true;
        this.boxShown = false;
      }
      return;
    }
    const bulk = box.amount >= SUPPLIES.bulkAt;
    if (!this.boxShown || bulk !== this.bulk) {
      this.bulk = bulk;
      this.boxImg.src = bulk ? bulkClosed : boxClosed;
      this.box.classList.toggle('bulk', bulk);
      this.box.setAttribute('aria-label', `A box of ${box.amount} rubber bands on your desk. Open it (O).`);
      this.boxLabel.hidden = false;
    }
    this.boxLabel.textContent = box.free ? 'Attn: you' : `${box.amount} bands`;
    if (!this.boxShown) {
      this.boxShown = true;
      this.box.hidden = false;
      this.box.classList.remove('landed');
      void this.box.offsetWidth;
      this.box.classList.add('landed');
      this.sound.thud();
    }
  }
}
