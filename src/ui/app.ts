import { BARRAGE, COWORKERS, PROMOTION, ROLES, TARGETS, TUNING, WEAPONS, type CoworkerId, type Role } from '../sim/content';
import {
  assign,
  buyBack,
  buyBackPrice,
  confiscatedLeft,
  canFlick,
  snapBand,
  buyWeapon,
  coworkerAvailable,
  flick,
  orderSupplies,
  priceOf,
  recruit,
  setLookBusy,
  targetDefeated,
  walkbyCountdown,
  type ActionResult,
} from '../sim/engine';
import { isConfiscated, mods, onFinalWarning, weapon } from '../sim/mods';
import { currentTarget, type GameEvent, type GameState } from '../sim/state';
import { fmt, money, officeClock, rate } from './format';
import { Scene } from './scene';
import { Sound } from './sound';
import { Launcher } from './launcher';
import { faceSvg, portrait, portraitViewBox } from './portraits';
import { ComputerView } from './computer';
import { payGrade, ringingCall } from '../sim/work';
import { bigFloater, coinsFor, moneyBurst, onScreen } from './juice';
import { SUPPLIES } from '../sim/supplies';
import { DeliveryView, DrawerView } from './supplies';
import { ClosetView } from './closet';
import { OfficeView } from './office';
import { BallView } from './ball';
import { chatUnread } from '../sim/chat';
import { reviewNeed, reviewReady, TOP_RANK } from '../sim/career';
import { affordable, itemKey, shoppingList } from '../sim/shop';
import { GUN_ART, ICON_ART } from './goods-art';

export interface GameHost {
  state: GameState;
  save(): void;
  exportText(): string;
  importText(text: string): boolean;
  reset(): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

const esc = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const STAGE_NAMES: Record<number, string> = {
  1: 'Stage 1: Desk Skirmish',
  2: 'Stage 2: Cubicle Alliance',
  3: 'Stage 2 complete: the department is yours',
};

export class UI {
  private text = new Map<string, string>();
  private keys = new Map<string, string>();
  private flash: { text: string; until: number } | null = null;
  private launcher!: Launcher;
  private lastFrame = performance.now();
  private sound = new Sound();
  private scene: Scene;
  private computer: ComputerView;
  private drawer: DrawerView;
  private delivery: DeliveryView;
  private closet: ClosetView;
  private office: OfficeView;
  private ball: BallView;
  private lastRing = 0;
  private rolePop: HTMLElement;
  private rolePopFor: CoworkerId | null = null;

  constructor(private host: GameHost) {
    this.scene = new Scene(() => this.s, {
      footstep: () => this.sound.footstep(),
      hit: () => this.sound.hit(),
      handTip: () => this.launcher?.tipClientPoint() ?? null,
    });
    this.launcher = new Launcher(
      {
      canStart: () => {
        const r = canFlick(this.s);
        if (!r.ok && r.reason) this.say(r.reason);
        return r.ok;
      },
      fire: (charge, perfect) => {
        this.act((s) => flick(s, charge, perfect));
        this.pressKey();
      },
      snap: () => {
        snapBand(this.s);
        this.sound.snap();
        this.say('The band snapped. Let go when the meter says Perfect.');
      },
      stretchSound: (c) => this.sound.stretch(c),
      },
      this.scene.handLayer,
    );
    this.office = new OfficeView(() => this.s, {
      say: (t) => this.say(t),
      sound: { howl: () => this.sound.howl(), yip: () => this.sound.yip(), notify: () => this.sound.notify() },
      claimed: (kind, from) => {
        this.sound.capture();
        if (kind === 'ball' || kind === 'bailey') this.bump('bands');
        if (kind === 'bonus' || kind === 'bailey') moneyBurst(from, this.salaryTarget(), 5, 1, () => this.bump('salary'));
      },
    });
    this.ball = new BallView(() => this.s, {
      say: (t) => this.say(t),
      act: (fn) => this.act(fn),
      sound: { wind: (grew) => this.sound.wind(grew) },
    });
    this.computer = new ComputerView(() => this.s, {
      say: (t) => this.say(t),
      ring: () => this.sound.ring(),
      footstep: (near) => this.sound.footstep(0.25 + 0.75 * near),
      notify: () => this.sound.notify(),
      ordered: () => {
        this.sound.coins();
        this.say(`Ordered. The box will be at your desk in ${SUPPLIES.deliverySeconds} seconds.`);
      },
      recruited: (id) => {
        this.sound.capture();
        this.bump('salary');
        this.say(`${COWORKERS.find((c) => c.id === id)!.name} joined your team.`);
      },
      promoted: () => {
        this.sound.grade('A');
        this.sound.kaching();
      },
    }, this.sound);
    const supplyHooks = { say: (t: string) => this.say(t), bump: (w: 'bands' | 'salary') => this.bump(w) };
    this.drawer = new DrawerView(() => this.s, supplyHooks, this.sound);
    this.delivery = new DeliveryView(() => this.s, supplyHooks, this.sound);
    this.closet = new ClosetView(() => this.s, {
      ...supplyHooks,
      opened: () => {
        this.launcher.cancel();
        this.drawer.close();
        document.body.classList.add('in-closet');
      },
      closed: () => {
        document.body.classList.remove('in-closet');
        $('closet-btn').focus();
      },
    }, this.sound);
    this.rolePop = document.createElement('div');
    this.rolePop.className = 'role-pop';
    this.rolePop.id = 'role-pop';
    this.rolePop.hidden = true;
    this.rolePop.setAttribute('role', 'dialog');
    $('app').append(this.rolePop);
    this.bind();
    this.syncSound();
    this.watchTop();
  }

  /** Banners stick just under the top bar and status strip (whatever height they wrap to). */
  private watchTop() {
    const bar = $('topbar');
    const status = $('status');
    const measure = () => {
      const sticky = getComputedStyle(bar).position === 'sticky';
      const hdr = sticky ? bar.offsetHeight : 0;
      const root = document.documentElement.style;
      root.setProperty('--hdr-h', `${hdr}px`);
      root.setProperty('--top-h', `${hdr + status.offsetHeight}px`);
    };
    measure();
    if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(document.body);
    window.addEventListener('resize', measure);
  }

  private syncSound() {
    const b = $('sound-btn');
    const label = this.sound.muted ? 'Sound off' : 'Sound on';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', String(!this.sound.muted));
    b.classList.toggle('muted', this.sound.muted);
  }

  /** A number on the status strip gives a little hop when it jumps. */
  private bump(which: 'bands' | 'salary') {
    if (reducedMotion()) return;
    const el = document.querySelector(which === 'bands' ? '.stat-bands' : '.stat-salary');
    if (!el) return;
    el.classList.remove('bump');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('bump');
  }

  /** S, or the Scrounge card: the drawer slides out and you pick a band out of the junk. */
  private doScrounge = () => this.drawer.grab();

  /** W, or the computer card: answer a ringing phone, otherwise sit down at your computer. */
  private doWork = () => {
    if (ringingCall(this.s)) this.answerPhone();
    else this.toggleHide(true);
  };

  /** Pick up the desk phone: that puts you at your computer, with the call on screen. */
  private answerPhone() {
    if (!ringingCall(this.s)) return;
    // Sit down first, then pick up: the computer opens the Phone app and takes the call.
    // (Picking up before the computer is open let the Phone app hang up on it.)
    this.toggleHide(true);
    this.computer.answerPhone();
  }

  /** O, or the Order card: open the box on your desk if there is one, otherwise send off an order. */
  private doOrder = () => {
    if (this.s.supplies.box) return this.delivery.openIt();
    const amount = mods(this.s).order.amount;
    if (this.act(orderSupplies)) {
      this.sound.coins();
      void this.delivery.ordered(amount);
      this.say(`Order sent. The box will be at your desk in ${SUPPLIES.deliverySeconds} seconds.`);
    }
  };

  private get s() {
    return this.host.state;
  }

  // ---------------------------------------------------------------- input

  private act(fn: (s: GameState) => ActionResult) {
    const r = fn(this.s);
    if (!r.ok && r.reason) this.say(r.reason);
    else this.flash = null;
    return r.ok;
  }

  private say(text: string) {
    this.flash = { text, until: performance.now() + 3500 };
  }

  private bind() {
    $('scrounge-btn').addEventListener('click', this.doScrounge);
    $('order-btn').addEventListener('click', this.doOrder);
    $('closet-btn').addEventListener('click', () => this.closet.show());
    $('rack').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-slot]');
      if (!b) return;
      if (b.dataset.slot === 'more') this.closet.show(b.dataset.go);
      else this.switchWeapon(Number(b.dataset.slot));
    });
    $('shop-rows').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-go]');
      if (b) this.goShop(b.dataset.go!);
    });
    // Teammates in the office: click one to change their role.
    this.rolePop.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b) return;
      if (b.dataset.role && this.rolePopFor) {
        const id = this.rolePopFor;
        const role = b.dataset.role as Role;
        if (this.act((s) => assign(s, id, role))) {
          this.sound.type();
          this.say(`${COWORKERS.find((c) => c.id === id)!.name} is now your ${ROLES.find((r) => r.id === role)!.name}.`);
        }
      }
      this.closeRolePop();
    });
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.rolePop.hidden && !this.rolePop.contains(e.target as Node)) this.closeRolePop();
      },
      true,
    );
    $('hide-btn').addEventListener('click', () => this.toggleHide());
    $('sound-btn').addEventListener('click', () => {
      this.sound.toggle();
      this.syncSound();
    });
    $('arena').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mini]');
      if (!b) return;
      ({ scrounge: this.doScrounge, work: this.doWork, order: this.doOrder, closet: () => this.closet.show() })[b.dataset.mini as 'scrounge' | 'work' | 'order' | 'closet']();
    });
    $('back-btn').addEventListener('click', () => this.toggleHide(false));
    $('call-answer').addEventListener('click', () => this.answerPhone());

    // Hold the Flick key (or your hand) to stretch the band; let go to fire.
    for (const el of [$('flick-btn'), $('scene')]) {
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const ally = (e.target as Element).closest?.<SVGGElement>('.ally[data-ally]');
        if (ally && !this.launcher.isHolding) {
          e.preventDefault();
          this.openRolePop(ally.dataset.ally as CoworkerId, e.clientX, e.clientY);
          return;
        }
        e.preventDefault();
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* capture is a nicety */
        }
        this.launcher.start();
      });
      el.addEventListener('pointerup', () => this.launcher.release());
      el.addEventListener('pointercancel', () => this.launcher.cancel());
    }
    // Keyboard activation of the button (Enter/Space) is a quick flick.
    $('flick-btn').addEventListener('click', (e) => {
      if ((e as MouseEvent).detail === 0) this.launcher.tap();
    });
    document.addEventListener('keyup', (e) => {
      if (e.key.toLowerCase() === 'f') this.launcher.release();
    });
    window.addEventListener('blur', () => this.launcher.cancel());

    $('caught-buyback').addEventListener('click', () => {
      if (this.act(buyBack)) {
        this.sound.coins();
        $<HTMLDialogElement>('caught-dlg').close();
      }
    });
    $('fired-next').addEventListener('click', () => {
      $('fired-page1').hidden = true;
      $('fired-page2').hidden = false;
      $('fired-h').textContent = 'Welcome back';
      $('fired-next').hidden = true;
      $('fired-ok').hidden = false;
      $('fired-ok').focus();
    });
    $('pane-team').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-recruit]');
      if (b) this.act((s) => recruit(s, b.dataset.recruit as CoworkerId));
    });
    $('pane-team').addEventListener('change', (e) => {
      const sel = e.target as HTMLSelectElement;
      if (sel.dataset.ally) this.act((s) => assign(s, sel.dataset.ally as CoworkerId, sel.value as Role));
    });

    document.addEventListener('keydown', (e) => this.onKey(e));
    // Holding Enter or Space on a focused button would click it ~30 times a second.
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.repeat && (e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).closest('button')) e.preventDefault();
      },
      true,
    );

    // Settings
    const dlg = $<HTMLDialogElement>('settings-dlg');
    $('settings-btn').addEventListener('click', () => {
      $<HTMLTextAreaElement>('export-text').value = this.host.exportText();
      $('import-msg').textContent = '';
      $('reset-confirm').hidden = true;
      dlg.showModal();
    });
    $('copy-btn').addEventListener('click', async () => {
      const ta = $<HTMLTextAreaElement>('export-text');
      try {
        await navigator.clipboard.writeText(ta.value);
        $('copy-btn').querySelector('span')!.textContent = 'Copied';
      } catch {
        ta.focus();
        ta.select();
        $('copy-btn').querySelector('span')!.textContent = 'Selected: press Ctrl+C';
      }
      setTimeout(() => ($('copy-btn').querySelector('span')!.textContent = 'Copy save'), 2500);
    });
    $('import-btn').addEventListener('click', () => {
      const ok = this.host.importText($<HTMLTextAreaElement>('import-text').value);
      $('import-msg').textContent = ok ? 'Save loaded.' : "That doesn't look like a FLICK save. Check that you copied all of it.";
      if (ok) this.invalidate();
    });
    $('reset-btn').addEventListener('click', () => ($('reset-confirm').hidden = false));
    $('reset-no').addEventListener('click', () => ($('reset-confirm').hidden = true));
    $('reset-yes').addEventListener('click', () => {
      this.host.reset();
      this.invalidate();
      dlg.close();
    });
  }

  private onKey(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (document.querySelector('dialog[open]')) return; // dialogs handle their own keys
    const k = e.key.toLowerCase();
    if (!this.rolePop.hidden && k === 'escape') {
      e.preventDefault();
      this.closeRolePop();
      return;
    }
    if (this.closet.isOpen) {
      if (this.closet.onKey(e)) e.preventDefault();
      return;
    }
    if (k === 'escape' || k === 'b') {
      e.preventDefault();
      this.toggleHide();
      return;
    }
    if (this.s.lookBusy) {
      // At your computer: number keys answer emails and calls.
      if (this.computer.onKey(e)) e.preventDefault();
      else if (k === 'w' && ringingCall(this.s) && !e.repeat) this.answerPhone();
      else if (k === 'o' && !e.repeat) this.delivery.openIt(); // the box is on the desk beside your monitor
      return;
    }
    if (e.repeat) return;
    if (k === 'f') {
      this.drawer.close();
      this.launcher.start();
    }
    else if (k === 's') this.doScrounge();
    else if (k === 'w') this.doWork();
    else if (k === 'o') this.doOrder();
    else if (k === 'd') this.closet.show();
    else if (k === 'v') this.ball.barrage();
    else if (/^[1-9]$/.test(k)) this.switchWeapon(Number(k) - 1);
  }

  /** The weapon rack under the Flick key: click a gun (or press 1–4) to switch; no number cycles. */
  private switchWeapon(index?: number) {
    const s = this.s;
    const owned = WEAPONS.filter((w) => s.ownedWeapons.includes(w.id));
    let next = index === undefined ? undefined : owned[index];
    if (index === undefined) {
      const usable = owned.filter((w) => !isConfiscated(s, w.id));
      if (usable.length < 2) return;
      next = usable[(usable.findIndex((w) => w.id === s.weapon) + 1) % usable.length];
    }
    if (!next || next.id === weapon(s).id) return;
    if (isConfiscated(s, next.id)) return this.say(`Your ${next.name} is in Mr. Feeney's drawer. Dale can get it back (D).`);
    this.act((st) => buyWeapon(st, next.id));
    this.sound.type();
  }

  /** A row on the shopping list: straight to Dale with it in hand, or the Org Chart for a coworker. */
  private goShop(go: string) {
    if (go.startsWith('r:')) {
      this.toggleHide(true);
      this.computer.openApp('org');
    } else this.closet.show(go);
  }

  /** Click a teammate in the office: pick their role right there. */
  private openRolePop(id: CoworkerId, x: number, y: number) {
    const s = this.s;
    const ally = s.allies.find((a) => a.id === id);
    if (!ally) return;
    const c = COWORKERS.find((x) => x.id === id)!;
    const rank = ally.rank > 0 ? `${PROMOTION.titles[ally.rank]} ` : '';
    this.rolePopFor = id;
    this.rolePop.setAttribute('aria-label', `${c.name}'s role`);
    this.rolePop.innerHTML = `<header><span class="rp-face">${faceSvg(id, 'happy')}</span><div><b>${esc(c.name)}</b>
        <small>${esc(rank)}${esc(ROLES.find((r) => r.id === ally.role)!.name)} · ${esc(c.trait)}</small></div></header>
      <div class="rp-roles">${ROLES.map(
        (r) => `<button type="button" data-role="${r.id}" aria-pressed="${r.id === ally.role}"><b>${r.name}${r.id === c.traitRole ? ` <i title="Best at this">★ ×${c.mult}</i>` : ''}</b><span>${esc(r.effect)}</span></button>`,
      ).join('')}</div>`;
    this.rolePop.hidden = false;
    const w = this.rolePop.offsetWidth;
    const h = this.rolePop.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2));
    const top = y - h - 14 > 8 ? y - h - 14 : Math.min(window.innerHeight - h - 8, y + 14);
    this.rolePop.style.left = `${left}px`;
    this.rolePop.style.top = `${Math.max(8, top)}px`;
    this.sound.grab();
    this.rolePop.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true });
  }

  private closeRolePop() {
    if (this.rolePop.hidden) return;
    this.rolePop.hidden = true;
    this.rolePopFor = null;
  }

  /** Esc: sit down at your computer, or get back to the war. */
  private toggleHide(force?: boolean) {
    const on = force ?? !this.s.lookBusy;
    if (on) {
      this.launcher.cancel();
      this.drawer.close();
      this.closet.close();
      this.closeRolePop();
    }
    setLookBusy(this.s, on);
    this.syncComputer();
  }

  /** Shows or hides the computer to match the game (answering the phone also sits you down). */
  private syncComputer() {
    const on = this.s.lookBusy;
    const pc = $('computer');
    if (pc.hidden === !on) return;
    pc.hidden = !on;
    document.body.classList.toggle('at-computer', on);
    this.sound.hide();
    $('hide-btn').setAttribute('aria-pressed', String(on));
    if (on) this.computer.opened();
    else {
      this.computer.closed();
      $('hide-btn').focus();
    }
  }

  /** Clears cached keys so every list rebuilds (after loading or resetting). */
  invalidate() {
    this.keys.clear();
    this.text.clear();
    this.syncComputer();
  }

  // ---------------------------------------------------------------- events from the sim

  handleEvents(events: GameEvent[]) {
    for (const e of events) {
      this.scene.handle(e);
      if (e.type === 'shot') {
        this.onShot(e.damage, e.by, e.perfect ?? false);
        if (e.by === 'you') this.sound.flick(e.charge ?? 0, e.perfect ?? false);
        else this.sound.ally();
      } else if (e.type === 'barrage') {
        this.sound.barrage();
        this.onBarrage(e);
      } else if (e.type === 'wound') this.bump('bands');
      else if (e.type === 'caught') {
        this.onCaught(e);
        this.sound.caught();
      } else if (e.type === 'fired') {
        this.onFired(e);
        this.sound.caught();
      } else if (e.type === 'promotion') {
        const a = this.s.allies.find((x) => x.id === e.id);
        const role = ROLES.find((r) => r.id === a?.role)?.name ?? '';
        this.say(`${COWORKERS.find((c) => c.id === e.id)!.name} was promoted to ${PROMOTION.titles[e.rank]} ${role}.`);
        this.sound.capture();
      } else if (e.type === 'weaponBack') {
        this.say(`Your ${WEAPONS.find((w) => w.id === e.weapon)!.name} is back.`);
      } else if (e.type === 'writeUpFaded') {
        this.say('A write-up fell out of your HR file.');
      } else if (e.type === 'spotted') this.say('Mr. Feeney saw that. Next time, get on your computer (Esc) when you hear footsteps.');
      else if (e.type === 'stage') this.onStage(e.stage);
      else if (e.type === 'capture') this.sound.capture();
      else if (e.type === 'enemyShot') {
        this.sound.incoming();
        this.bump('bands');
      } else if (e.type === 'callMissed') this.say('The phone stopped ringing. It was probably nothing.');
      else if (e.type === 'reviewReady') {
        if (!this.s.lookBusy) {
          this.say('Mr. Feeney wants to see you about a promotion. Go to your review in Staffing, on your computer.');
          this.sound.notify();
        }
      } else if (e.type === 'hired') this.sound.capture();
      else if (e.type === 'pay') this.onPay(e);
      else if (e.type === 'walkby') {
        this.closet.kickOut();
        this.closeRolePop();
      }
      else if (e.type === 'dealGone' && e.why === 'walkby') this.say('Dale melted away. Footsteps!');
      else if (e.type === 'boxSpotted') this.say('Mr. Feeney eyed that box on your desk. Open deliveries before he walks by.');
      else if (e.type === 'itemDone') {
        if (e.ok && e.pay > 0) this.sound.kaching();
      } else if (e.type === 'roundDone') this.sound.grade(e.grade);
      this.computer.handle(e);
      this.office.handle(e);
      this.ball.handle(e);
    }
  }

  private shotsThisFrame = 0;

  /** Where your Salary is on screen right now (the taskbar at your computer, the status strip at war). */
  private salaryTarget(): HTMLElement {
    if (this.s.lookBusy) return $('tray-pay');
    return $('status').querySelector<HTMLElement>('.stat-salary')!;
  }

  /** Money in: coins fly from wherever it came from into your Salary. */
  private onPay(e: Extract<GameEvent, { type: 'pay' }>) {
    const to = this.salaryTarget();
    const hop = () => {
      if (to.id === 'tray-pay') {
        to.classList.remove('hop');
        void to.offsetWidth;
        to.classList.add('hop');
      } else this.bump('salary');
    };
    if (e.source === 'bounty') {
      const from = $('nameplate');
      const note = e.note ? e.note.charAt(0).toUpperCase() + e.note.slice(1) : '';
      bigFloater(from, `+${money(e.amount)}`, esc(note));
      moneyBurst(from, to, 6, 3, hop);
      this.sound.kaching();
      return;
    }
    if (e.source === 'team') {
      // Your team's pay drops in quietly: a coin or two from Staffing, or a bump on your Salary.
      if (!this.s.lookBusy) return this.bump('salary');
      const icon = document.querySelector<HTMLElement>('#desktop [data-app="staffing"]');
      moneyBurst(onScreen(icon) ? icon! : $('screen'), to, 2, 0, hop);
      return;
    }
    if (!this.s.lookBusy) return;
    const from = document.querySelector('#window:not([hidden])') ?? $('screen');
    moneyBurst(from, to, coinsFor(e.amount) + Math.min(3, Math.max(0, (e.combo ?? 0) - 1)), 0, hop);
  }

  private onShot(damage: number, by: 'you' | 'ally', perfect: boolean) {
    if (reducedMotion() || this.shotsThisFrame > 3) return;
    this.shotsThisFrame++;
    const plate = $('nameplate');
    plate.classList.remove('hit');
    void plate.offsetWidth;
    plate.classList.add('hit');
    const box = $('floaters');
    if (box.childElementCount > 12) box.firstElementChild?.remove();
    const f = document.createElement('span');
    f.className = by === 'ally' ? 'floater ally' : perfect ? 'floater perfect' : 'floater';
    const n = damage % 1 === 0 ? String(damage) : damage.toFixed(1);
    f.textContent = perfect ? `Perfect! −${n}` : `−${n}`;
    const o = this.scene.floaterOrigin();
    f.style.left = `${o.left + (Math.random() - 0.5) * 14}%`;
    f.style.top = `${o.top}%`;
    // Numbers appear when the band lands, not when it leaves your hand.
    f.style.animationDelay = by === 'you' ? '0.24s' : '0.32s';
    box.appendChild(f);
    setTimeout(() => f.remove(), 1300);
  }

  /** Barrage: one big number when everything lands. */
  private onBarrage(e: Extract<GameEvent, { type: 'barrage' }>) {
    this.bump('bands');
    const box = $('floaters');
    const f = document.createElement('span');
    f.className = 'floater barrage';
    f.innerHTML = `Barrage! <b>−${fmt(Math.round(e.damage))}</b>`;
    const o = this.scene.floaterOrigin();
    f.style.left = `${o.left}%`;
    f.style.top = `${o.top}%`;
    f.style.animationDelay = reducedMotion() ? '0s' : '0.46s';
    box.appendChild(f);
    setTimeout(() => f.remove(), 2200);
    const plate = $('nameplate');
    setTimeout(() => {
      plate.classList.remove('hit');
      void plate.offsetWidth;
      plate.classList.add('hit');
    }, 460);
  }

  /** The Flick key visibly presses down when you fire. */
  private pressKey() {
    const key = $('flick-btn');
    key.classList.add('pressed');
    setTimeout(() => key.classList.remove('pressed'), 90);
  }

  /** The caught moment: Mr. Feeney, a pink slip, and exactly what it cost you. */
  private onCaught(e: Extract<GameEvent, { type: 'caught' }>) {
    const s = this.s;
    const final = e.writeUps >= TUNING.writeUpsToFinal;
    $('caught-feeney').setAttribute('viewBox', portraitViewBox('feeney'));
    $('caught-feeney').innerHTML = portrait('feeney', 'angry');
    const slip = $('caught-slip');
    slip.classList.toggle('final', final);
    slip.innerHTML = final ? 'Final<br>warning' : `Written warning<b>${e.writeUps} of ${TUNING.writeUpsToFinal}</b>`;
    const t = currentTarget(s);
    const items: string[] = [];
    if (e.lostBands > 0) items.push(`He kept ${fmt(e.lostBands)} of your bands.`);
    if (e.confiscated) {
      const w = WEAPONS.find((w) => w.id === e.confiscated)!;
      items.push(`Your ${esc(w.name)} is in his desk drawer for ${Math.round(TUNING.confiscateSeconds / 60)} minutes. Until then you and your Shooters are back to the Finger Flick.`);
    }
    if (t && e.regrouped >= 1) items.push(`${esc(t.name.split(' ')[0])} regrouped while you were gone: +${fmt(Math.round(e.regrouped))} Resolve.`);
    items.push(`No flicking for ${TUNING.caughtFlickLock} s, and your Shooters are "in a training" for ${TUNING.caughtShooterLock} s.`);
    items.push(
      final
        ? `<strong>You're on Final Warning. Get caught again and you're fired.</strong> A write-up fades after ${Math.round(TUNING.writeUpFade / 60)} minutes without getting caught.`
        : `A write-up fades after ${Math.round(TUNING.writeUpFade / 60)} minutes without getting caught. At ${TUNING.writeUpsToFinal} you're on Final Warning.`,
    );
    $('caught-list').innerHTML = items.map((i) => `<li>${i}</li>`).join('');
    const bb = $<HTMLButtonElement>('caught-buyback');
    bb.hidden = !e.confiscated;
    if (e.confiscated) {
      const price = buyBackPrice(s);
      bb.textContent = `Have Dale get it back: ${money(price)}`;
      bb.disabled = s.salary < price;
    }
    this.openDialog('caught-dlg');
  }

  /** Fired, then (on the next page) rehired on Monday. */
  private onFired(e: Extract<GameEvent, { type: 'fired' }>) {
    const caught = $<HTMLDialogElement>('caught-dlg');
    if (caught.open) caught.close();
    const first = TARGETS.find((t) => t.stage === e.stage);
    const rows = [`<dt>Bands left in your drawer</dt><dd>${fmt(TUNING.firedBands)}</dd>`];
    if (e.lostDesks > 0) rows.push(`<dt>Desks handed back</dt><dd>${e.lostDesks}</dd>`);
    if (first && e.stage <= 2) rows.push(`<dt>Stage ${e.stage} progress</dt><dd>back to ${esc(first.name.split(' ')[0])}</dd>`);
    $('fired-lost').innerHTML = rows.join('');
    $('fired-h').textContent = "You're fired.";
    $('fired-page1').hidden = false;
    $('fired-page2').hidden = true;
    $('fired-next').hidden = false;
    $('fired-ok').hidden = true;
    this.openDialog('fired-dlg');
  }

  private openDialog(id: string) {
    const dlg = $<HTMLDialogElement>(id);
    this.launcher.cancel();
    this.drawer.close();
    this.syncComputer();
    if (!dlg.open) dlg.showModal();
  }

  private onStage(stage: number) {
    const dlg = $<HTMLDialogElement>('stage-dlg');
    const s = this.s;
    if (stage === 2) {
      $('stage-dlg-h').textContent = 'Stage 2: Cubicle Alliance';
      $('stage-dlg-body').innerHTML = `
        <p>Gary surrendered and joined your side. His desk is your first captured territory.</p>
        <p>Across the aisle, Brad from Sales is waiting. Coworkers will email you asking to join: recruit them from <strong>Mail</strong> or the <strong>Org Chart</strong> on your computer (Esc). Each one gets a role: Shooter, Gatherer, Lookout, Cover or Engineer. Click a teammate in the office to change it.</p>
        <p>Your Shooters keep firing while you're at your computer, at half speed.</p>
        <p><strong>New: Barrage (V).</strong> You and every Shooter empty your pockets at once: a pile of bands in one huge volley. Loud, and once every ${BARRAGE.cooldown / 60 === 1 ? 'minute' : `${BARRAGE.cooldown} seconds`}. Stockpile bands for it.</p>`;
    } else if (stage === 3) {
      const mins = Math.round((s.stats.stage2At ?? s.time) / 60);
      $('stage-dlg-h').textContent = 'The department is yours';
      $('stage-dlg-body').innerHTML = `
        <p>Rick is out of the office indefinitely. The east side of Floor 4 answers to you, and Accounting has noticed.</p>
        <dl>
          <dt>Time at war</dt><dd>${mins} min</dd>
          <dt>Shots fired</dt><dd>${fmt(s.stats.shots)}</dd>
          <dt>Times caught</dt><dd>${s.stats.caught}</dd>
          <dt>Walk-bys survived</dt><dd>${s.stats.hides} of ${s.stats.hides + s.stats.walkbysSpotted}</dd>
          <dt>Team</dt><dd>${s.allies.length} ${s.allies.length === 1 ? 'coworker' : 'coworkers'}</dd>
        </dl>
        <p>The war is over for now (Stage 3, Department War, comes next), but your career isn't. Keep working, get promoted, and build your team in Staffing. The top of the ladder is CEO.</p>`;
    }
    $('stage-dlg-ok').textContent = stage === 3 ? 'Keep playing' : 'Back to it';
    if (!dlg.open) dlg.showModal();
  }

  // ---------------------------------------------------------------- rendering

  private set(id: string, value: string) {
    if (this.text.get(id) === value) return;
    this.text.set(id, value);
    $(id).textContent = value;
  }

  private rebuild(key: string, value: string, build: () => void) {
    if (this.keys.get(key) === value) return;
    this.keys.set(key, value);
    build();
  }

  render() {
    const s = this.s;
    const m = mods(s);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.shotsThisFrame = 0;

    this.syncComputer();
    this.set('clock', officeClock(s.time));

    // Desk
    this.set('bands', fmt(s.bands));
    this.set('bands-rate', m.bandsPerSec > 0 ? `+${rate(m.bandsPerSec)}/s` : '');
    this.set('salary', money(s.salary));
    this.set('salary-rate', m.salaryPerSec > 0 ? `+$${rate(m.salaryPerSec)}/s` : '');
    const grade = payGrade(s);
    const ready = reviewReady(s);
    this.set('pay-grade', ready ? 'Promotion ready! (Staffing)' : `${grade.title}${grade.mult > 1 ? ` · work ×${grade.mult}` : ''}`);
    const share = s.career.rank >= TOP_RANK ? 1 : Math.min(1, s.career.review / reviewNeed(s.career.rank));
    $('perf-fill').style.width = `${(share * 100).toFixed(1)}%`;
    $('perf').classList.toggle('full', ready);
    const susp = Math.min(100, s.suspicion);
    this.set('susp-num', susp.toFixed(0));
    $('susp-bar').style.width = `${susp.toFixed(1)}%`;
    // The mug on your desk fills from y=114 (empty) to y=18 (full).
    const liquidY = 114 - 96 * (susp / 100);
    $('susp-fill').setAttribute('y', liquidY.toFixed(1));
    $('susp-fill').setAttribute('height', (114 - liquidY).toFixed(1));
    $('susp-foam').setAttribute('y', (liquidY - 2).toFixed(1));
    $('susp-foam').setAttribute('height', susp > 1 ? '3' : '0');
    $('suspicion').setAttribute('aria-valuenow', susp.toFixed(0));
    const level = susp >= 75 ? 'danger' : susp >= 50 ? 'caution' : 'calm';
    $('suspicion').dataset.level = level;
    $('desk-front').dataset.level = level;
    this.set('susp-note', onFinalWarning(s) && susp >= 75 ? "One more and you're fired." : suspicionNote(susp));
    const sup = s.supplies;
    this.set(
      'scrounge-sub',
      sup.find ? 'Something good in there!' : sup.drawer > 0 ? `${fmt(sup.drawer)} band${sup.drawer === 1 ? '' : 's'} inside` : 'Empty for now',
    );
    this.set(
      'order-sub',
      sup.box
        ? 'It’s sitting on your desk'
        : sup.order
          ? `On its way: ${Math.ceil(Math.max(0, sup.order.arriveAt - s.time))} s`
          : `$${m.order.price} for ${m.order.amount} bands`,
    );
    this.set('order-title', sup.box ? 'Open the box' : 'Order');
    $<HTMLButtonElement>('order-btn').disabled = !sup.box && s.salary < m.order.price;

    // HR file
    const ups = s.hr.writeUps;
    const final = onFinalWarning(s);
    document.querySelectorAll('#hr-slips i').forEach((el, i) => el.classList.toggle('on', i < ups));
    $('hr-file').dataset.level = final ? 'final' : ups > 0 ? 'warned' : 'clean';
    $('hr-stamp').hidden = !final;
    const fadeIn = Math.max(0, TUNING.writeUpFade - (s.time - s.hr.lastWriteUpAt));
    this.set(
      'hr-note',
      ups === 0
        ? 'Clean record.'
        : final
          ? `One more and you're fired. Next write-up fades in ${clock(fadeIn)}.`
          : `${ups} write-up${ups > 1 ? 's' : ''}. One fades in ${clock(fadeIn)}.`,
    );


    this.renderFront(s, m.warning);
    this.renderAlerts(s, m.warning);
    this.renderFloor(s);
    this.renderTicker(s);
    this.renderPanes(s);
    this.renderComputerHints(s);
    if (s.lookBusy) {
      this.computer.render();
      this.closeRolePop();
    }
    this.drawer.render();
    this.office.render();
    this.ball.render();
    this.delivery.render();
    this.closet.render();
    this.scene.render();
    this.launcher.update(weapon(s).id, this.scene.handAim(), reducedMotion());
    void dt;
  }

  private renderFront(s: GameState, _warning: number) {
    const t = currentTarget(s);
    this.set('stage-line', STAGE_NAMES[s.stage]);
    const w = weapon(s);
    const flickBtn = $<HTMLButtonElement>('flick-btn');
    if (t) {
      this.set('np-name', t.name);
      this.set('np-title', t.title);
      this.set('position', t.position);
      const r = Math.max(0, s.targetResolve);
      this.set('resolve-num', `${fmt(Math.ceil(r))} / ${fmt(t.resolve)}`);
      $('resolve-fill').style.width = `${(r / t.resolve) * 100}%`;
      const tw = $('twist');
      tw.hidden = !t.twist;
      if (t.twist) this.set('twist', t.twist);
    } else {
      this.set('np-name', 'Floor 4, east side');
      this.set('np-title', 'Under new management');
      this.set('position', 'Nobody left to flick. For now.');
      this.set('resolve-num', '0 / 0');
      $('resolve-fill').style.width = '0%';
      $('twist').hidden = true;
    }
    flickBtn.disabled = !t || s.time < s.flickLockUntil;
    const total = w.damage * w.burst;
    const left = confiscatedLeft(s);
    const taken = s.hr.confiscated && isConfiscated(s, s.weapon) ? WEAPONS.find((x) => x.id === s.hr.confiscated!.weapon)!.name : null;
    this.set(
      'weapon-line',
      taken && left !== null
        ? `${w.name}: your ${taken} is in Mr. Feeney's drawer (${clock(left)})`
        : `${w.name}: ${total} damage, ${w.burst} band${w.burst > 1 ? 's' : ''} per shot`,
    );
    this.renderRack(s, left);
    this.renderShop(s);
    const deal = s.dale.deal;
    this.set('closet-sub', deal && !s.lookBusy ? `Dale has a deal: ${Math.ceil(Math.max(0, deal.until - s.time))} s` : s.hr.confiscated ? 'Dale can get your weapon back' : 'Weapons and band “upgrades”. Don’t ask.');

    // Coach line: a temporary message wins, then the most useful hint.
    const msg = this.flash && this.flash.until > performance.now() ? this.flash.text : coachHint(s);
    this.set('coach', msg);
  }

  /** Your guns on a little rack under the Flick key, numbered 1–4, plus a slot for the next one. */
  private renderRack(s: GameState, left: number | null) {
    const m = mods(s);
    const owned = WEAPONS.filter((w) => s.ownedWeapons.includes(w.id));
    const next = WEAPONS.find((w) => w.price > 0 && !s.ownedWeapons.includes(w.id) && w.stage <= s.stage + 1);
    const locked = next ? (next.stage > s.stage ? `Stage ${next.stage}` : next.needsEngineer && !m.hasEngineer ? 'Engineer' : '') : '';
    const price = next ? priceOf(s, next.price) : 0;
    const eff = weapon(s).id;
    const key = [owned.map((w) => w.id).join(), eff, s.hr.confiscated?.weapon ?? '', left === null ? '' : Math.ceil(left), next?.id ?? '', price, locked].join('|');
    this.rebuild('rack', key, () => {
      const slots = owned.map((w, i) => {
        const gone = isConfiscated(s, w.id);
        const on = eff === w.id;
        return `<button type="button" class="rack-slot${on ? ' on' : ''}${gone ? ' gone' : ''}" data-slot="${i}" aria-pressed="${on}" title="${esc(w.name)} (${i + 1})"
          aria-label="${esc(w.name)}${gone ? ', in Mr. Feeney’s drawer' : ''}"><kbd>${i + 1}</kbd><img src="${GUN_ART[w.id]}" alt="" draggable="false">${gone && left !== null ? `<span class="rack-clock">${clock(left)}</span>` : ''}</button>`;
      });
      if (next) {
        const label = locked || money(price);
        slots.push(`<button type="button" class="rack-slot more${locked ? ' locked' : ''}" data-slot="more" data-go="w:${next.id}" data-price="${locked ? '' : price}"
          title="Next: ${esc(next.name)}, from Dale’s closet" aria-label="Next weapon: ${esc(next.name)}, ${esc(label)}"><span class="rack-plus" aria-hidden="true">+</span><img src="${GUN_ART[next.id]}" alt="" draggable="false"><span class="rack-price">${esc(locked && locked === 'Engineer' ? 'Needs Engineer' : label)}</span></button>`);
      }
      $('rack').innerHTML = slots.join('');
      $('rack').hidden = slots.length < 2 && !next;
    });
    const more = document.querySelector<HTMLElement>('#rack .more[data-price]:not([data-price=""])');
    more?.classList.toggle('afford', s.salary >= Number(more.dataset.price));
  }

  /** The shopping list on your desk: the next weapon, then the cheapest things you could buy. */
  private renderShop(s: GameState) {
    const items = shoppingList(s, 3);
    const key = items.map((i) => `${itemKey(i)}:${i.price}`).join(',');
    this.rebuild('shop', key, () => {
      $('shop-rows').innerHTML = items.length
        ? items
            .map((i) => {
              const pic =
                i.kind === 'recruit'
                  ? `<span class="shop-pic face">${faceSvg(i.id, 'idle')}</span>`
                  : `<span class="shop-pic"><img src="${i.kind === 'weapon' ? GUN_ART[i.id] : ICON_ART[i.id]}" alt="" draggable="false"></span>`;
              const where = i.kind === 'recruit' ? 'the Org Chart' : 'Dale';
              return `<li><button type="button" class="shop-row ${i.kind}" data-go="${itemKey(i)}" data-price="${i.price}" aria-label="${esc(i.name)}, ${money(i.price)}, from ${where}">
                ${pic}<span class="shop-name">${esc(i.name)}</span><span class="shop-price">${money(i.price)}</span><i class="shop-bar" aria-hidden="true"><span></span></i></button></li>`;
            })
            .join('')
        : '<li class="shop-empty">Nothing left to buy. Dale is impressed.</li>';
    });
    document.querySelectorAll<HTMLElement>('#shop-rows .shop-row').forEach((b) => {
      const f = Math.min(1, s.salary / Number(b.dataset.price));
      b.classList.toggle('afford', f >= 1);
      (b.querySelector('.shop-bar span') as HTMLElement).style.width = `${(f * 100).toFixed(1)}%`;
    });
    // How many things in Dale's closet you could buy right now.
    const n = s.lookBusy ? 0 : affordable(s, 'closet');
    for (const id of ['closet-badge', 'mini-closet-badge']) {
      $(id).hidden = n === 0;
      this.set(id, String(n));
    }
  }

  private renderAlerts(s: GameState, warning: number) {
    const c = walkbyCountdown(s);
    const banner = $('walkby');
    const show = c !== null && !s.lookBusy;
    banner.hidden = !show;
    if (show) $('walkby-fill').style.width = `${(c! / warning) * 100}%`;

    const lock = $('lockout');
    const flickLeft = s.flickLockUntil - s.time;
    const shootLeft = s.shooterLockUntil - s.time;
    if (flickLeft > 0 || (shootLeft > 0 && s.allies.some((a) => a.role === 'shooter'))) {
      lock.hidden = false;
      const parts = [];
      if (flickLeft > 0) parts.push(`Written warning: no flicking for ${Math.ceil(flickLeft)} s.`);
      if (shootLeft > 0 && s.allies.some((a) => a.role === 'shooter'))
        parts.push(`Your shooters are "in a training" for ${Math.ceil(shootLeft)} s.`);
      this.set('lockout', parts.join(' '));
    } else lock.hidden = true;
  }

  private renderFloor(s: GameState) {
    this.rebuild('floor', `${s.stage}:${s.targetIndex}`, () => {
      const groups: { label: string; desks: number; state: 'mine' | 'taken' | 'enemy' }[] = [
        { label: 'You', desks: 1, state: 'mine' },
      ];
      const seen = new Set<string>();
      for (const t of TARGETS) {
        if (t.desks === 0) continue;
        const label = t.stage === 1 ? 'Gary' : t.name.replace('The ', '');
        if (seen.has(label)) continue;
        seen.add(label);
        groups.push({ label, desks: t.desks, state: targetDefeated(s, t.id) ? 'taken' : 'enemy' });
      }
      $('floorplan').innerHTML = groups
        .map(
          (g) => `<div class="desk-group" title="${esc(g.label)}: ${g.state === 'enemy' ? 'holding out' : 'yours'}">
            <div class="desks">${`<i class="desk-sq ${g.state === 'enemy' ? '' : g.state}"></i>`.repeat(g.desks)}</div>
            <span>${esc(g.label)}</span></div>`,
        )
        .join('');
      const total = TARGETS.reduce((n, t) => n + t.desks, 0);
      $('floor-note').textContent = `${s.desks} of ${total} desks captured, each +0.25 bands/s`;
    });
  }

  private renderTicker(s: GameState) {
    this.rebuild('ticker', String(s.ticker[0]?.id ?? 0), () => {
      $('ticker').innerHTML = s.ticker
        .slice(0, 4)
        .map((t) => `<li>${esc(t.text)}</li>`)
        .join('');
    });
  }

  /** The badge on the Your computer button, and the phone ringing while you're at war. */
  private renderComputerHints(s: GameState) {
    const mail = s.work.mailWaiting + (s.work.rounds.mail ? s.work.rounds.mail.items - s.work.rounds.mail.done : 0) + s.unread;
    const call = ringingCall(s);
    const chat = chatUnread(s);
    const total = mail + chat + (call ? 1 : 0);
    const hb = $('hide-badge');
    hb.hidden = total === 0 || s.lookBusy;
    this.set('hide-badge', total > 9 ? '9+' : String(total));

    // The desk phone rings at war: a banner to pick it up (which puts you at your computer).
    const banner = $('call-banner');
    banner.hidden = !call || s.lookBusy;
    if (call) {
      const left = Math.max(0, call.until - s.time);
      $('call-fill').style.width = `${(left / 9) * 100}%`;
      if (!s.lookBusy) {
        const now = performance.now();
        if (now - this.lastRing > 1500) {
          this.lastRing = now;
          this.sound.ring();
        }
      }
    }
    $('hide-btn').classList.toggle('alert', !!call);
  }

  private renderPanes(s: GameState) {
    const m = mods(s);

    const shape = JSON.stringify([
      s.stage,
      s.targetIndex,
      s.weapon,
      s.ownedWeapons,
      s.upgrades,
      s.allies.map((a) => a.id + a.role + a.rank),
      m.priceMult,
      s.hr.confiscated?.weapon ?? null,
    ]);
    this.rebuild('panes', shape, () => {
      this.text.delete('conf-left');
      for (const a of s.allies) this.text.delete(`served-${a.id}`);
      this.buildTeam(s);
    });

    // Countdowns tick every frame without rebuilding the lists.
    const left = confiscatedLeft(s);
    if (left !== null && document.getElementById('conf-left')) this.set('conf-left', clock(left));
    for (const a of s.allies) {
      const el = document.getElementById(`served-${a.id}`);
      if (el) this.set(`served-${a.id}`, servedNote(a.served, a.rank));
    }

    // Affordability changes every frame; only toggle disabled states.
    document.querySelectorAll<HTMLButtonElement>('.pane button[data-price]').forEach((b) => {
      const locked = b.dataset.locked === '1';
      b.disabled = locked || s.salary < Number(b.dataset.price);
    });
  }

  private buildTeam(s: GameState) {
    if (s.stage < 2) {
      $('pane-team').innerHTML = '';
      return;
    }
    const cards = COWORKERS.map((c) => {
      const ally = s.allies.find((a) => a.id === c.id);
      const traitRole = ROLES.find((r) => r.id === c.traitRole)!.name;
      const face = `<span class="org-face">${faceSvg(c.id, ally ? 'happy' : 'idle')}</span>`;
      const head = `${face}<h4>${esc(c.name)}</h4><p>${esc(c.who)}. ${esc(c.trait)}: ${traitRole} ×${c.mult}.</p>`;
      if (ally) {
        const roleName = ROLES.find((r) => r.id === ally.role)!.name;
        const rankTag = ally.rank > 0 ? `<span class="rank">${PROMOTION.titles[ally.rank]} ${roleName}</span>` : '';
        const headAlly = `${face}<h4>${esc(c.name)}${rankTag}</h4><p>${esc(c.who)}. ${esc(c.trait)}: ${traitRole} ×${c.mult}.</p><p class="served" id="served-${c.id}"></p>`;
        const options = ROLES.map(
          (r) => `<option value="${r.id}"${r.id === ally.role ? ' selected' : ''}>${r.name}${r.id === c.traitRole ? ' ★' : ''}</option>`,
        ).join('');
        return `<div class="item has-face owned">${headAlly}<div class="act"><label class="tag">Role <select class="role-select" data-ally="${c.id}" id="role-${c.id}">${options}</select></label></div></div>`;
      }
      if (!coworkerAvailable(s, c.id)) {
        const t = TARGETS.find((t) => t.id === c.unlockAfter);
        return `<div class="item has-face">${head}<div class="act"><span class="tag">After ${esc(t?.name ?? '')}</span></div></div>`;
      }
      return `<div class="item has-face">${head}<div class="act"><button type="button" class="buy" data-recruit="${c.id}" data-price="${c.cost}">Recruit ${money(c.cost)}</button></div></div>`;
    });
    const key = ROLES.map((r) => `<dt>${r.name}</dt><dd>${esc(r.effect)}</dd>`).join('');
    $('pane-team').innerHTML =
      `<p class="pane-note">Change roles any time, here or by clicking someone in the office. A ★ marks the role each person is best at. Coworkers are promoted to Senior (+${Math.round((PROMOTION.bonus[1] - 1) * 100)}%) and Lead (+${Math.round((PROMOTION.bonus[2] - 1) * 100)}%) the longer they're on your team.</p>` +
      cards.join('') +
      `<dl class="roles-key">${key}</dl>`;
  }

}

// ------------------------------------------------------------------ copy helpers

/** 2:05 style countdown. */
function clock(secs: number) {
  const t = Math.ceil(secs);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function servedNote(served: number, rank: number) {
  const mins = Math.floor(served / 60);
  if (rank >= PROMOTION.after.length) return `On the team ${mins} min. Top of the org chart.`;
  const next = Math.ceil((PROMOTION.after[rank] - served) / 60);
  return `On the team ${mins} min. ${PROMOTION.titles[rank + 1]} in ${next} min.`;
}

function suspicionNote(v: number) {
  if (v < 20) return 'Nobody suspects a thing.';
  if (v < 50) return 'A few raised eyebrows.';
  if (v < 75) return 'HR has your name on a sticky note.';
  if (v < 90) return 'Mr. Feeney wants to circle back.';
  return 'One more flick and you are in a meeting.';
}

function coachHint(s: GameState): string {
  const t = currentTarget(s);
  const w = weapon(s);
  const m = mods(s);
  if (walkbyCountdown(s) !== null && !s.lookBusy) return 'Footsteps! Press Esc to get on your computer before Mr. Feeney arrives.';
  if (s.lookBusy && s.walkby.arrivesAt === null && s.suspicion < 10) return '';
  if (!t) return '';
  if (ringingCall(s)) return 'Your desk phone is ringing. Press W to answer: it puts you at your computer.';
  if (s.stats.shots === 0) return 'Gary started it. Flick back: press F or click Flick.';
  if (onFinalWarning(s)) return "Final Warning: one more catch and you're fired. Get on your computer (Esc) when you hear footsteps.";
  if (s.hr.confiscated && s.salary >= buyBackPrice(s))
    return `Dale can get your ${WEAPONS.find((x) => x.id === s.hr.confiscated!.weapon)!.name} back for ${money(buyBackPrice(s))}. Supply closet (D).`;
  if (s.supplies.box) return 'A box of bands is on your desk. Open it (O) before Mr. Feeney walks by and asks about it.';
  if (s.bands < w.burst) {
    if (s.supplies.order) return 'Your order is on its way. Scrounge your drawer (S) or do some work (Esc) while you wait.';
    return s.salary >= m.order.price
      ? 'Out of bands. Order supplies (O) or scrounge your drawer (S).'
      : 'Out of bands. Scrounge your drawer (S), or earn some Salary on your computer (Esc) for a supply order.';
  }
  if (s.suspicion >= 70) return 'Suspicion is high. Get on your computer (Esc) and do some work until it cools.';
  if (!s.ownedWeapons.includes('ruler')) {
    return s.salary >= 15
      ? 'You can afford the Ruler Launcher. Dale sells it in the supply closet: press D.'
      : 'Earn $15 for the Ruler Launcher: press Esc to get on your computer and answer some emails.';
  }
  if (s.stats.shots >= 6 && s.stats.charged === 0)
    return 'Tip: hold Flick (or F) to stretch the band. Let go at full stretch for a Perfect shot: 6\u00d7 damage from one band.';
  if (s.stats.walkbysSpotted + s.stats.hides === 0 && s.time > 60)
    return 'Mr. Feeney walks the floor every few minutes. When you hear footsteps, press Esc to get on your computer.';
  if (s.stage === 2 && s.allies.length < 3) return 'Coworkers email you when they want in: recruit them from Mail or the Org Chart on your computer (Esc).';
  if (s.stage === 2 && s.allies.length >= 2 && s.time - (s.stats.stage1At ?? 0) < 240) return 'Tip: click a teammate in the office to change their role.';
  if (s.stats.tasksDone === 0 && s.time > 90) return 'Your computer (Esc) is where you work: emails and expense reports pay Salary, and Mr. Feeney can’t catch you there.';
  if (s.stage === 2 && w.id !== 'repeater' && s.ownedWeapons.includes('clothespin') && targetDefeated(s, 'printer'))
    return 'Assign Dave as Engineer to unlock the Binder-Clip Repeater.';
  return '';
}
