import { BARRAGE, COWORKERS, DEPARTMENTS, HR_DIRECTOR, LADDER, MEMOS, POLITICS, PROMOTION, ROLES, ROOMS, SIEGE, TARGETS, TEAMS, TUNING, WEAPONS, rolesFor, type CoworkerId, type Role } from '../sim/content';
import { setFill } from './fill';
import { co, setCompany } from './co';
import { repDamage, startNewJob } from '../sim/job';
import { tierFloor, tierName, toughness } from '../sim/ladder';
import { claimGolden, GOLDEN, goldenBoostLeft } from '../sim/golden';
import chaosDrill from '../assets/art/icon-chaos-drill.webp';
import chaosOutage from '../assets/art/icon-chaos-outage.webp';
import chaosCake from '../assets/art/icon-chaos-cake.webp';
import chaosInspection from '../assets/art/icon-chaos-inspection.webp';
import { STREAK, streakCount, streakMult } from '../sim/feel';
import { hack, hackLevel, HACKS, pickHack, type HackId } from '../sim/hacks';
import { cutFloss, downRound, fightingTenant, objectionOn, snared, TENANT_RULES, tenantBounty, tenantFloor } from '../sim/tenants';
import { CHAOS, CHAOS_INFO, chaosLeft, chaosOn, type ChaosKind } from '../sim/chaos';

/** Each chaos event's little painted icon, at the front of the pill. */
const CHAOS_ICON: Record<ChaosKind, string> = { drill: chaosDrill, outage: chaosOutage, cake: chaosCake, inspection: chaosInspection };

/** The short version of what each chaos event does, for the pill on the office picture. */
const CHAOS_EFFECT: Record<ChaosKind, string> = {
  drill: `${CHAOS.drillDamage}× damage, silent`,
  outage: 'silent, team off',
  cake: `${CHAOS.cakeDamage}× damage`,
  inspection: 'hide for a bonus',
};
import viewFloor4 from '../assets/art/view-floor4.webp';
import viewFloor12 from '../assets/art/view-floor12.webp';
import viewFloor30 from '../assets/art/view-floor30.webp';
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
  hitWeakSpot,
  orderSupplies,
  priceOf,
  recruit,
  setLookBusy,
  targetDefeated,
  walkbyCountdown,
  type ActionResult,
} from '../sim/engine';
import { isConfiscated, mods, onFinalWarning, weapon } from '../sim/mods';
import { company, currentTarget, deptPerk, deptTaken, deptsTaken, fightingHr, memoOn, reclaimingDept, roomTaken, type GameEvent, type GameState } from '../sim/state';
import { canSendMemo, nameOf } from '../sim/politics';
import { fightingRoom, inMeeting, sabotaged, wallUp } from '../sim/siege';
import { dept, fightingDept, firewallClock, firewallUp } from '../sim/war';
import { CounterAlert, InterviewAlert, MapView, RaidAlert } from './war';
import { AskCard } from './asks';
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
import { FloorView } from './floor';
import { leadName, seatCap, seatCost, seats, staffPayPerMin, teamUnlocked } from '../sim/staff';
import { chatUnread } from '../sim/chat';
import { reviewNeed, reviewReady, TOP_RANK } from '../sim/career';
import { affordable, bestBuy, itemKey, shoppingList } from '../sim/shop';
import { GUN_ART, ICON_ART, RENO_ART } from './goods-art';

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
  co(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const STAGE_NAMES: Record<number, string> = {
  1: 'Stage 1: Desk Skirmish',
  2: 'Stage 2: Cubicle Alliance',
  3: 'Stage 3: Department War',
  4: 'Stage 4: Floor Domination',
  5: 'Stage 5: Corporate Politics',
  6: 'The 4th floor is yours',
};

export class UI {
  private text = new Map<string, string>();
  private keys = new Map<string, string>();
  /** The coach line's message: what's showing (an error clears when you next do something right), and what's waiting. */
  private flash: { text: string; until: number; shownAt?: number; error?: boolean } | null = null;
  private sayQueue: string[] = [];
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
  private floor: FloorView;
  private map: MapView;
  private raid: RaidAlert;
  private counter: CounterAlert;
  private interview: InterviewAlert;
  private welcoming = false;
  private ask: AskCard;
  /** The Department War's welcome opens the map when you close it. */
  private mapAfterStage = false;
  /** Where you are while you're away from the war: at your computer, or out on your floor. */
  private place: 'pc' | 'floor' = 'pc';
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
      sound: { howl: () => this.sound.howl(), yip: () => this.sound.yip(), notify: () => this.sound.notify(), learned: () => this.sound.grade('A') },
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
    this.floor = new FloorView(() => this.s, {
      back: () => this.toggleHide(false),
      computer: () => this.toggleHide(true),
      sound: { stamp: () => this.sound.stamp(), miss: () => this.sound.miss(), grab: () => this.sound.grab() },
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
      quitJob: (to, tier) => {
        if (!startNewJob(this.s, to, tier).ok) return;
        this.host.save();
        location.reload();
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
    const warHooks = {
      say: (t: string) => this.say(t),
      bump: (w: 'bands' | 'salary') => this.bump(w),
      opened: () => {
        this.launcher.cancel();
        this.drawer.close();
        this.closet.close();
        document.body.classList.add('in-map');
      },
      closed: () => document.body.classList.remove('in-map'),
      sound: { grab: () => this.sound.grab(), capture: () => this.sound.capture(), notify: () => this.sound.notify(), miss: () => this.sound.miss() },
    };
    this.map = new MapView(() => this.s, warHooks);
    this.raid = new RaidAlert(() => this.s, warHooks, () => this.map.isOpen);
    this.counter = new CounterAlert(() => this.s, warHooks, () => this.map.isOpen);
    this.interview = new InterviewAlert(() => this.s, warHooks, () => this.map.isOpen);
    this.ask = new AskCard(() => this.s, {
      say: (t) => this.say(t),
      bump: (w) => this.bump(w),
      sound: { notify: () => this.sound.notify(), stamp: () => this.sound.stamp() },
    });
    this.rolePop = document.createElement('div');
    this.rolePop.className = 'role-pop';
    this.rolePop.id = 'role-pop';
    this.rolePop.hidden = true;
    this.rolePop.setAttribute('role', 'dialog');
    $('app').append(this.rolePop);
    this.bind();
    this.syncSound();
    this.watchTop();
    this.setupInstall();
  }

  private installPrompt: { prompt(): Promise<void> } | null = null;
  private installTipAt = 0;

  /** Settings explains how to put FLICK on your home screen (Android can do it in one tap). */
  private setupInstall() {
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      $('install-text').textContent = 'You’re playing the home screen version. Nice.';
      $('install-how').hidden = true;
      $('install-note').hidden = true;
      return;
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installPrompt = e as unknown as { prompt(): Promise<void> };
      $('install-btn').hidden = false;
    });
    $('install-btn').addEventListener('click', () => {
      void this.installPrompt?.prompt();
      this.installPrompt = null;
      $('install-btn').hidden = true;
    });
    // On a phone, mention it once, a few minutes in.
    let shown = false;
    try {
      shown = localStorage.getItem('flick.installTip') === '1';
    } catch {
      /* no storage: the tip may show again next time, which is fine */
    }
    if (!shown && window.matchMedia?.('(max-width: 760px)').matches) this.installTipAt = 1;
  }

  private maybeInstallTip() {
    if (!this.installTipAt || this.s.time < 300 || this.s.lookBusy || walkbyCountdown(this.s) !== null) return;
    this.installTipAt = 0;
    this.flash = { text: 'Tip: add FLICK to your home screen for full screen. The gear shows how.', until: performance.now() + 9000 };
    try {
      localStorage.setItem('flick.installTip', '1');
    } catch {
      /* fine */
    }
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
      root.setProperty('--bar-h', `${$('bottom-bar').offsetHeight}px`);
      // Where the numbers strip ends on screen (pop-ups on a phone drop in just below it).
      root.setProperty('--strip-b', `${Math.round(status.getBoundingClientRect().bottom)}px`);
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
    const b2 = $('sound-btn-2');
    b2.querySelector('span')!.textContent = this.sound.muted ? 'Sound is off (turn on)' : 'Sound is on (turn off)';
    b2.setAttribute('aria-pressed', String(!this.sound.muted));
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
    if (!r.ok && r.reason) this.sayNow(r.reason, true);
    else if (this.flash?.error) this.flash = null;
    return r.ok;
  }

  /**
   * A message on the coach line. If one is already showing, this one waits its turn (each
   * gets at least 2 s, the last one 3.5 s), so two things happening at once are both read.
   */
  /** The settings button for the safety catch shows whether it's on. */
  private syncSafety() {
    const on = this.s.safety !== false;
    const b = $('safety-btn');
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('span')!.textContent = on ? 'Safety catch is on' : 'Safety catch is off';
  }

  private say(text: string) {
    const t = co(text);
    if (!t) return;
    const now = performance.now();
    const f = this.flash;
    if (!f || f.until <= now || f.error) return this.sayNow(t);
    if (f.text === t || this.sayQueue.includes(t)) return;
    this.sayQueue.push(t);
    if (this.sayQueue.length > 4) this.sayQueue.shift();
    f.until = Math.min(f.until, Math.max(now, (f.shownAt ?? now) + 2000));
  }

  /** Shows a message straight away (errors, from something you just tried, don't wait). */
  private sayNow(text: string, error = false) {
    const now = performance.now();
    this.flash = { text: co(text), until: now + (error ? 3000 : 3500), shownAt: now, error };
  }

  /** The coach line's message right now, moving the queue along. */
  private flashText(now: number) {
    if ((!this.flash || this.flash.until <= now) && this.sayQueue.length) {
      const text = this.sayQueue.shift()!;
      this.flash = { text, until: now + (this.sayQueue.length ? 2500 : 3500), shownAt: now };
    }
    return this.flash && this.flash.until > now ? this.flash.text : null;
  }

  private bind() {
    $('scrounge-btn').addEventListener('click', this.doScrounge);
    $('order-btn').addEventListener('click', this.doOrder);
    $('closet-btn').addEventListener('click', () => this.closet.show());
    $('rack').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-slot]');
      if (!b) return;
      if (b.dataset.slot === 'more' && b.dataset.map !== undefined) this.openMap();
      else if (b.dataset.slot === 'more') this.closet.show(b.dataset.go);
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
    $('floor-btn').addEventListener('click', () => this.openFloor());
    $('map-btn').addEventListener('click', () => this.openMap());
    for (const id of ['sound-btn', 'sound-btn-2'])
      $(id).addEventListener('click', () => {
        this.sound.toggle();
        this.syncSound();
      });
    // The desk buttons (the phone's bottom bar, and the List sheet's close button).
    $('app').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mini]');
      if (!b) return;
      const go = b.dataset.mini as 'scrounge' | 'work' | 'order' | 'closet' | 'floor' | 'map' | 'list';
      if (go !== 'list') this.showList(false);
      ({
        scrounge: this.doScrounge,
        work: this.doWork,
        order: this.doOrder,
        closet: () => this.closet.show(),
        floor: () => this.openFloor(),
        map: () => this.openMap(),
        list: () => this.showList(!document.body.classList.contains('list-open')),
      })[go]();
    });
    $('back-btn').addEventListener('click', () => this.toggleHide(false));
    $<HTMLDialogElement>('stage-dlg').addEventListener('close', () => {
      if (this.welcoming) {
        this.welcoming = false;
        this.s.job.welcomed = true;
      }
      if (!this.mapAfterStage) return;
      this.mapAfterStage = false;
      this.openMap();
    });
    // From Stage 3 the nameplate opens the map of the floor.
    $('nameplate').addEventListener('click', () => this.openMap());
    $('nameplate').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.openMap();
      }
    });
    $('call-answer').addEventListener('click', () => this.answerPhone());
    // The golden stapler: grab it before it's gone.
    $('floss').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.doCutFloss();
    });
    $('hack-chip').addEventListener('click', () => this.openHacks());
    $('hack-cards').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-hack]');
      if (b) this.chooseHack(b.dataset.hack as HackId);
    });
    $<HTMLDialogElement>('hack-dlg').addEventListener('keydown', (e) => {
      const n = Number(e.key);
      const offer = this.s.hacks?.offer;
      if (offer && n >= 1 && n <= offer.length) {
        e.preventDefault();
        this.chooseHack(offer[n - 1]);
      }
    });
    $('weak').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.act(hitWeakSpot)) this.sound.flick(1, true);
    });
    $('golden').addEventListener('pointerdown', (e) => e.stopPropagation());
    $('golden').addEventListener('click', () => {
      if (claimGolden(this.s)) $('golden').hidden = true;
    });

    // No long-press menus on the things you hold.
    for (const el of [$('flick-btn'), $('scene'), $('desk-front'), $('key-row')]) el.addEventListener('contextmenu', (e) => e.preventDefault());
    // On iPhones a long press still brings up the text magnifier unless the touch itself
    // is cancelled. Flick and the office work on pointer events, so they don't need it.
    for (const el of [$('flick-btn'), $('scene')]) el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
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
      this.syncSafety();
      dlg.showModal();
    });
    $('safety-btn').addEventListener('click', () => {
      this.s.safety = this.s.safety === false;
      this.syncSafety();
      this.host.save();
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
    if (this.map.isOpen) {
      if (this.map.onKey(e)) e.preventDefault();
      return;
    }
    if (this.floor.isOpen) {
      // Out on your floor: Esc closes a card, then takes you back to the war.
      if (this.floor.onKey(e)) e.preventDefault();
      else if (k === 'escape' || k === 'b' || k === 't') {
        e.preventDefault();
        this.toggleHide(false);
      } else if (k === 'w' && ringingCall(this.s) && !e.repeat) this.answerPhone();
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
    else if (k === 'x') this.doCutFloss();
    else if (k === 'h') this.openHacks();
    else if (k === 't') this.openFloor();
    else if (k === 'm') this.openMap();
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
      <div class="rp-roles">${rolesFor(s.stage).map(
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
      this.leaveWar();
      this.place = 'pc';
    }
    setLookBusy(this.s, on);
    this.syncComputer();
  }

  /** T, or Your floor in the top bar: go and see your team (that counts as working too). */
  private openFloor() {
    if (!teamUnlocked(this.s, 'temp')) return;
    this.leaveWar();
    this.place = 'floor';
    setLookBusy(this.s, true);
    this.syncComputer();
  }

  /** Phones: the shopping list and what just happened, in a sheet over the bottom bar. */
  private showList(on: boolean) {
    document.body.classList.toggle('list-open', on);
  }

  private leaveWar() {
    this.showList(false);
    this.launcher.cancel();
    this.drawer.close();
    this.closet.close();
    this.map.close();
    this.closeRolePop();
  }

  /** M, or the nameplate (from Stage 3): the map of the floor, to pick who to fight. */
  private openMap() {
    if (this.s.stage < 3 || this.s.lookBusy) return;
    this.showList(false);
    this.map.show();
    if (!this.mapSeen) {
      this.mapSeen = true;
      try {
        localStorage.setItem('flick.mapSeen', '1');
      } catch {
        /* the dot just shows again next time */
      }
    }
  }

  /** The Map button has a dot until you've opened the map once. */
  private mapSeen = (() => {
    try {
      return localStorage.getItem('flick.mapSeen') === '1';
    } catch {
      return false;
    }
  })();

  /** Shows the computer or your floor to match the game (answering the phone also sits you down). */
  private syncComputer() {
    const busy = this.s.lookBusy;
    if (!busy) this.place = 'pc';
    this.floor.setOpen(busy && this.place === 'floor');
    const on = busy && this.place === 'pc';
    const pc = $('computer');
    if (pc.hidden === !on) return;
    pc.hidden = !on;
    document.body.classList.toggle('at-computer', on);
    this.sound.hide();
    $('hide-btn').setAttribute('aria-pressed', String(on));
    if (on) this.computer.opened();
    else {
      this.computer.closed();
      if (!busy) $('hide-btn').focus();
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
    // Idle (nobody's touched it for a minute): your team's shots land without the flying
    // bands and numbers, which nobody is watching.
    const idle = document.documentElement.classList.contains('idle');
    for (const e of events) {
      if (idle && e.type === 'shot' && e.by !== 'you') continue;
      this.scene.handle(e);
      if (e.type === 'shot') {
        this.onShot(e.damage * toughness(this.s), e.by, e.perfect ?? false);
        if (e.by === 'you') this.sound.flick(e.charge ?? 0, e.perfect ?? false);
        if (e.by === 'you' && e.perfect) this.shake();
        else this.sound.ally();
      } else if (e.type === 'barrage') {
        this.sound.barrage();
        this.onBarrage(e);
        this.shake();
      } else if (e.type === 'wound') this.bump('bands');
      else if (e.type === 'rematch' && !this.s.lookBusy) this.say(this.s.ticker[0]?.text ?? '');
      else if (e.type === 'caught') {
        this.onCaught(e);
        this.sound.caught();
      } else if (e.type === 'fired') {
        this.onFired(e);
        this.sound.caught();
      } else if (e.type === 'promotion') {
        // Several at once: one line for all of them.
        const all = events.filter((x): x is Extract<GameEvent, { type: 'promotion' }> => x.type === 'promotion');
        if (all.length > 1) {
          if (e === all[0]) {
            const names = all.map((x) => COWORKERS.find((c) => c.id === x.id)!.name);
            this.say(`${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} were promoted.`);
            this.sound.capture();
          }
        } else {
          const a = this.s.allies.find((x) => x.id === e.id);
          const role = ROLES.find((r) => r.id === a?.role)?.name ?? '';
          this.say(`${COWORKERS.find((c) => c.id === e.id)!.name} was promoted to ${PROMOTION.titles[e.rank]} ${role}.`);
          this.sound.capture();
        }
      } else if (e.type === 'weaponBack') {
        this.say(`Your ${WEAPONS.find((w) => w.id === e.weapon)!.name} is back.`);
      } else if (e.type === 'writeUpFaded') {
        this.say('A write-up fell out of your HR file.');
      } else if (e.type === 'spotted') this.say('Mr. Feeney saw that. Next time, get on your computer (Esc) when you hear footsteps.');
      else if (e.type === 'stage') this.onStage(e.stage);
      else if (e.type === 'wallDown') {
        this.sound.grade('B');
        this.say(`The wall is down! Now ${ROOMS.find((r) => r.room === e.id)!.short} is out in the open.`);
      } else if (e.type === 'roomTaken') {
        this.sound.grade('A');
        const r = ROOMS.find((x) => x.room === e.id)!;
        this.say(`The ${r.label} is yours! You get ${r.perk}.`);
      } else if (e.type === 'trophy') {
        this.sound.grade('A');
        if (!this.s.lookBusy) this.say(e.text ?? '');
      } else if (e.type === 'interviewOver' && e.how === 'lost') {
        this.say(this.s.ticker[0]?.text ?? '');
        this.sound.miss();
      } else if (e.type === 'chaosStart') {
        this.sound.alarm();
        this.say(CHAOS_INFO[e.kind].start);
      } else if (e.type === 'rival') {
        if (e.result === 'won') this.sound.grade('A');
        else this.sound.grade('D');
        this.say(e.text ?? '');
      } else if (e.type === 'tenantsOpen') {
        this.sound.notify();
        this.say(this.s.ticker[0]?.text ?? '');
      } else if (e.type === 'objection') {
        this.sound.stamp();
        if (!this.s.lookBusy) this.say('Objection! Hold your fire for 5 seconds, or your bands bounce back.');
      } else if (e.type === 'ricochet') {
        this.bump('bands');
      } else if (e.type === 'floss') {
        this.sound.miss();
        if (!this.s.lookBusy) this.say(forTouch('Floss! Your launcher is snared: tap the floss (X) to cut it.'));
      } else if (e.type === 'downRound') {
        this.sound.kaching();
        this.say(this.s.ticker[0]?.text ?? '');
      } else if (e.type === 'tenantTaken') {
        this.sound.grade('A');
        this.say(e.text);
      } else if (e.type === 'buildingTaken') {
        this.sound.capture();
        this.sound.grade('A');
        this.say(e.text);
      } else if (e.type === 'dailyNew') {
        this.sound.notify();
        if (!this.s.lookBusy) this.say('Corporate sent today’s three challenges. They’re in the Challenges app on your computer.');
      } else if (e.type === 'dailyDone') {
        this.sound.kaching();
        if (!this.s.lookBusy) this.say(e.text ?? '');
      } else if (e.type === 'dailyAll') {
        this.sound.grade('A');
        this.say(e.text ?? '');
      } else if (e.type === 'goldenSpawn') {
        this.sound.coins();
      } else if (e.type === 'golden') {
        this.sound.kaching();
        this.sound.grade('A');
        this.say(e.text ?? '');
        this.bump(e.kind === 'windfall' ? 'salary' : 'bands');
      } else if (e.type === 'climb') {
        this.sound.grade('A');
        this.say(this.s.ticker[0]?.text ?? '');
      } else if (e.type === 'caseWarning') {
        this.say(this.s.ticker[0]?.text ?? '');
        this.sound.miss();
      } else if (e.type === 'seized') {
        this.say(`HR's case file is full: ${dept(e.dept).label} now reports to HR. Win it back on the map.`);
        this.sound.miss();
      } else if (e.type === 'reclaimed') {
        this.sound.grade('B');
        this.say(`${dept(e.dept).label} is yours again.`);
      } else if (e.type === 'memo' && !this.s.lookBusy) {
        this.say(`Memo sent: ${MEMOS.find((m) => m.id === e.id)!.name}.`);
      } else if (e.type === 'counterOver') {
        if (e.how === 'guards') {
          this.say(this.s.ticker[0]?.text ?? '');
          this.bump('bands');
        } else if (e.how === 'lost') {
          this.say(this.s.ticker[0]?.text ?? '');
          this.sound.miss();
        }
      } else if (e.type === 'deptTaken') {
        this.sound.grade('A');
        this.say(`${dept(e.id).label} surrenders! You get: ${dept(e.id).prize.charAt(0).toLowerCase()}${dept(e.id).prize.slice(1)}.`);
      } else if (e.type === 'raidOver') {
        if (e.how !== 'chased') this.say(this.s.ticker[0]?.text ?? '');
        if (e.how === 'lookout') this.bump('bands');
        if (e.how === 'lost') this.sound.miss();
      } else if (e.type === 'rebrand') this.say(this.s.ticker[0]?.text ?? '');
      else if (e.type === 'askDone' && e.auto) this.say(e.text);

      else if (e.type === 'capture') {
        this.sound.capture();
        if (!this.s.lookBusy) this.popUp(this.s.stage >= 3 ? 'Knocked out!' : 'Surrender!', 'ko', true);
      } else if (e.type === 'weakHit') {
        this.sound.grade('A');
        this.shake();
        this.popUp(`Weak spot! −${fmt(Math.round(e.damage * toughness(this.s)))}`, 'weak');
      } else if (e.type === 'weakSpawn') this.sound.notify();
      else if (e.type === 'hackOffer') {
        this.sound.coins();
        if (!this.s.lookBusy) this.say(forTouch('A new hack to pick! Tap the gold "Pick a hack" chip on the office (H).'));
      } else if (e.type === 'hackPicked') this.say(e.text);
      else if (e.type === 'hackProc') {
        const word = { ricochet: 'Ricochet!', stapler: 'Stapler!', lucky: 'Lucky!', echo: 'Echo volley!' }[e.id as string];
        if (word && !this.s.lookBusy) this.floatWord(word);
      } else if (e.type === 'alibi') {
        this.sound.grade('B');
        this.say(e.text);
      }
      else if (e.type === 'streakMax') {
        this.sound.grade('B');
        this.say(`Hot streak! Every flick hits ${Math.round(STREAK.per * STREAK.max * 100)}% harder while you keep it going.`);
      }
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
    // An Objection upstairs: nothing lands, and your own bands bounce back.
    if (damage <= 0 && by === 'ally') return;
    f.className = damage <= 0 ? 'floater blocked' : by === 'ally' ? 'floater ally' : perfect ? 'floater perfect' : 'floater';
    // Decimals only while the numbers are small; big ones round (and get commas).
    const n = damage < 100 && damage % 1 !== 0 ? damage.toFixed(1) : fmt(Math.round(damage));
    f.textContent = damage <= 0 ? 'Bounced back!' : perfect ? `Perfect! −${n}` : `−${n}`;
    const o = this.scene.floaterOrigin();
    f.style.left = `${o.left + (Math.random() - 0.5) * 24}%`;
    f.style.top = `${o.top + (Math.random() - 0.5) * 8}%`;
    // Numbers appear when the band lands, not when it leaves your hand.
    f.style.animationDelay = by === 'you' ? '0.24s' : '0.32s';
    box.appendChild(f);
    setTimeout(() => f.remove(), 1300);
  }

  /** A word floating up off the boss (a hack going off). */
  private floatWord(word: string) {
    if (reducedMotion()) return;
    const box = $('floaters');
    if (box.childElementCount > 12) box.firstElementChild?.remove();
    const f = document.createElement('span');
    f.className = 'floater perfect';
    f.textContent = word;
    const o = this.scene.floaterOrigin();
    f.style.left = `${o.left + (Math.random() - 0.5) * 30}%`;
    f.style.top = `${o.top - 8}%`;
    f.style.animationDelay = '0.2s';
    box.appendChild(f);
    setTimeout(() => f.remove(), 1300);
  }

  /** Barrage: one big number when everything lands. */
  private onBarrage(e: Extract<GameEvent, { type: 'barrage' }>) {
    this.bump('bands');
    const box = $('floaters');
    const f = document.createElement('span');
    f.className = 'floater barrage';
    f.innerHTML = `Barrage! <b>−${fmt(Math.round(e.damage * toughness(this.s)))}</b>`;
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
    // Seeing a stage's welcome counts for every one before it (no stale welcomes later).
    if (stage >= 3) s.war.announced = true;
    if (stage >= 4) s.war.announced4 = true;
    if (stage >= 5) s.war.politics.announced5 = true;
    if (stage === 2) {
      $('stage-dlg-h').textContent = 'Stage 2: Cubicle Alliance';
      $('stage-dlg-body').innerHTML = `
        <p>Gary surrendered and joined your side. His desk is your first captured territory.</p>
        <p>Across the aisle, Brad from Sales is waiting. Coworkers will email you asking to join: recruit them from <strong>Mail</strong> or the <strong>Org Chart</strong> on your computer (Esc). Each one gets a role: Shooter, Gatherer, Lookout, Cover or Engineer. Click a teammate in the office to change it.</p>
        <p>Your Shooters keep firing while you're at your computer, at half speed.</p>
        <p><strong>New: Barrage (V).</strong> You and every Shooter empty your pockets at once: a pile of bands in one huge volley. Loud, and it reloads in ${BARRAGE.cooldown} seconds, sooner with every flick you land. Stockpile bands for it.</p>`;
    } else if (stage === 3) {
      const mins = s.stats.stage2At ? Math.round(s.stats.stage2At / 60) : 0;
      $('stage-dlg-h').textContent = 'Stage 3: Department War';
      $('stage-dlg-body').innerHTML = `
        <p>Rick is out, and the east side of Floor 4 answers to you${mins ? ` (that took ${mins} min)` : ''}. The rest of the floor does not recognize this.</p>
        <p><strong>Four departments</strong> are left. Pick who to fight on the <strong>map</strong> (${touch() ? 'tap <b>Map</b> at the bottom' : '<b>The 4th floor</b> in the top bar, or press M'}). Each one you take is yours for good:</p>
        <ul class="stage-list">${DEPARTMENTS.map((d) => `<li><b>${esc(d.label)}:</b> ${esc(d.prize.charAt(0).toLowerCase() + d.prize.slice(1))}</li>`).join('')}</ul>
        <p>Each one you take makes the rest tougher. They’ll also raid Dale’s <strong>supply closet</strong>, which pays you bands while it’s yours: chase them off. And your old rivals still want rematches.</p>`;
    } else if (stage === 4) {
      const mins = Math.round(((s.stats.stage3At ?? s.time) - (s.stats.stage2At ?? 0)) / 60);
      $('stage-dlg-h').textContent = 'Stage 4: Floor Domination';
      $('stage-dlg-body').innerHTML = `
        <p>IT, Accounting, the Mailroom and Marketing all answer to you now${mins > 0 ? ` (the Department War took ${mins} min)` : ''}. Their people have fallen back to the floor’s last two shared spaces, behind walls of filing cabinets:</p>
        <ul class="stage-list">${ROOMS.map((r) => `<li><b>The ${esc(r.label)}</b> (${esc(r.name)}): ${esc(r.prize)}</li>`).join('')}</ul>
        <p><strong>Walls come down first.</strong> Normal shots do half to them. The Drill Gatling, Barrages and your Engineers hit them fully.</p>
        <p>Each room has a trick (coffee refills, meetings that pull your Shooters away). <strong>Sabotage</strong> it from the map. And the departments you took will try to take their desks back: hold the line, or make someone a <strong>Guard</strong>. One that gets through switches its prize off for ${SIEGE.counter.lost / 60} minutes.</p>`;
    } else if (stage === 5) {
      const mins = Math.round(((s.stats.stage4At ?? s.time) - (s.stats.stage3At ?? s.time)) / 60);
      $('stage-dlg-h').textContent = 'Stage 5: Corporate Politics';
      $('stage-dlg-body').innerHTML = `
        <p>The Break Room and the Conference Room surrender${mins > 0 ? ` (Floor Domination took ${mins} min)` : ''}. Every desk on Floor 4 answers to you, so <strong>HR has opened an investigation</strong>. Leonard Fisk, Director of Human Resources, fights from behind a fortress of binders.</p>
        <ul class="stage-list">
          <li><b>Plausible Deniability:</b> earned by real work (your rounds, Cover teammates, your teams). Spend it on <b>Memos</b>, a new app on your computer: quiet shots, harder shots, a faster team, cheaper hiring, shredded evidence.</li>
          <li><b>HR’s case file:</b> fills when you get caught, when you’re loud around HR, and when you miss an interview. If it fills, HR takes one of your departments until you win it back.</li>
          <li><b>Interviews:</b> every few minutes someone you beat is called in to HR. Coach them before they talk.</li>
        </ul>
        <p>Close the case either way: flick Fisk’s Resolve to nothing, or win HR over with ${POLITICS.goodwill} Deniability’s worth of memos.</p>`;
    } else if (stage === 6) {
      const mins = Math.round(((s.stats.stage5At ?? s.time) - (s.stats.stage4At ?? s.time)) / 60);
      $('stage-dlg-h').textContent = 'The 4th floor is yours';
      $('stage-dlg-body').innerHTML = `
        <p>HR has closed its investigation. Every desk on Floor 4 answers to you, and HR would like everyone to know that it is on your side now.</p>
        <dl>
          ${mins > 0 ? `<dt>Corporate Politics</dt><dd>${mins} min</dd>` : ''}
          <dt>Memos sent</dt><dd>${s.stats.memos ?? 0}</dd>
          <dt>Witnesses coached</dt><dd>${s.stats.coached ?? 0} of ${(s.stats.coached ?? 0) + (s.stats.interviewsLost ?? 0)}</dd>
          <dt>Desks</dt><dd>${s.desks}</dd>
        </dl>
        <p>Every prize is yours for good. The rematches keep coming, department bosses and ${esc(HR_DIRECTOR.name.split(' ')[0])} included. Keep climbing: the top of the ladder is CEO.</p>
        ${s.job.unlocked && s.job.runs === 0 ? '<p><strong>New: Job Search</strong> on your computer. A recruiter wants to talk: quit for a new company and keep your Reputation, which buys perks that last forever.</p>' : ''}`;
    }
    $('stage-dlg-ok').textContent = stage === 3 || stage === 4 ? 'Open the map' : stage === 5 ? 'Face HR' : stage === 6 ? 'Keep playing' : 'Back to it';
    this.mapAfterStage = stage === 3 || stage === 4;
    $('stage-dlg-h').textContent = co($('stage-dlg-h').textContent ?? '');
    $('stage-dlg-body').innerHTML = co($('stage-dlg-body').innerHTML);
    if (!dlg.open) dlg.showModal();
  }

  /** Day one at a new company: its rules, and the Reputation you brought with you. */
  private onNewJob() {
    const s = this.s;
    const c = company(s);
    this.welcoming = true; // marked as seen when you close it (the page may reload under it first)
    const last = s.job.history[s.job.history.length - 1];
    const tier = s.job.tier ?? 0;
    $('stage-dlg-h').textContent = `Day one at ${c.name}`;
    const times = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}×`;
    const office = tier > 0
      ? `<li><b>${esc(tierName(tier))}, Floor ${tierFloor(tier)}:</b> everyone is ${times(Math.pow(LADDER.toughness, tier))} as tough, work pays ${times(Math.pow(LADDER.pay, tier))} as much, and this job is worth ${times(Math.pow(LADDER.rep, tier))} the Reputation</li>`
      : '';
    const gary = c.id === 'pemberton' ? 'Same company, bigger office. Gary is here too. Nobody knows how.' : `Same floor plan, same kind of people, different names. Gary is here. (He goes by ${esc(co('Gary'))} now.)`;
    $('stage-dlg-body').innerHTML = `
      <p>${esc(c.pitch)} ${gary}</p>
      <ul class="stage-list">${office}${c.rulesText.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <dl>
        ${last ? `<dt>Reputation from your last job</dt><dd>+${last.rep}</dd>` : ''}
        <dt>Reputation to spend</dt><dd>${s.job.reputation}</dd>
        <dt>Your bands hit harder</dt><dd>${repDamage(s) >= 10 ? `×${fmt(Math.round(repDamage(s)))}` : `+${Math.round((repDamage(s) - 1) * 100)}%`}</dd>
      </dl>
      <p>Bailey, your rubber band ball and your names came with you. Spend your Reputation on résumé perks in <strong>Job Search</strong>, on your computer.</p>`;
    $('stage-dlg-ok').textContent = 'Get to work';
    this.mapAfterStage = false;
    const dlg = $<HTMLDialogElement>('stage-dlg');
    if (!dlg.open) dlg.showModal();
  }

  // ---------------------------------------------------------------- rendering

  private set(id: string, value: string) {
    if (this.text.get(id) === value) return;
    this.text.set(id, value);
    $(id).textContent = co(value);
  }

  /**
   * A number on the status strip. The handwriting font's digits are all different widths
   * (a 1 is half as wide as an 8), so each digit gets a slot of its own: counting up never
   * nudges anything sideways.
   */
  private setNum(id: string, value: string) {
    if (this.text.get(id) === value) return;
    this.text.set(id, value);
    $(id).innerHTML = value.replace(/\d/g, (d) => `<i class="dg">${d}</i>`);
  }

  private rebuild(key: string, value: string, build: () => void) {
    if (this.keys.get(key) === value) return;
    this.keys.set(key, value);
    build();
  }

  /** Is something urgent on screen (so the game shouldn't go idle)? Asks, deals and moments wait fine at idle speed. */
  alerting() {
    const s = this.s;
    return (
      s.walkby.arrivesAt !== null ||
      !!ringingCall(s) ||
      !!s.war?.closet.raid ||
      !!s.war?.counter.attack ||
      !!s.war?.politics?.interview ||
      !!document.querySelector('dialog[open]')
    );
  }

  /**
   * Draws the game. `full` is false between simulation steps when nothing else happened:
   * then only the parts that move on their own (flying bands, your hand) are drawn.
   */
  render(full = true) {
    const s = this.s;
    if (!full) {
      this.scene.render();
      this.launcher.update(weapon(s).id, this.scene.handAim(), reducedMotion(), this.scene.handShift());
      return;
    }
    const floor = tierFloor(s.job?.tier ?? 0);
    setCompany(s.job?.company ?? 'pemberton', floor);
    // Up the career ladder the office is on another floor: the labels that name it follow.
    this.rebuild('floor-labels', String(floor), () => {
      this.scene.setView(floor >= 30 ? viewFloor30 : floor >= 12 ? viewFloor12 : viewFloor4);
      $('map-btn').firstChild!.textContent = co('The 4th floor ');
      $('warmap-h').textContent = co('The 4th floor');
    });
    const m = mods(s);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.shotsThisFrame = 0;

    this.syncComputer();
    const clockText = officeClock(s.time);
    if (this.text.get('clock') !== clockText) {
      this.text.set('clock', clockText);
      const [week, day] = clockText.split(', ');
      $('clock').innerHTML = day ? `<span class="clock-week">${esc(week)}, </span>${esc(day)}` : esc(clockText);
    }

    // Desk
    // Small phones: six-digit numbers as 730.2K, so Bands and Salary don't run into each other.
    const narrow = window.innerWidth < 400;
    this.setNum('bands', narrow ? short(s.bands) : fmt(s.bands));
    this.set('bands-rate', m.bandsPerSec > 0 ? `+${rate(m.bandsPerSec)}/s` : '');
    this.setNum('salary', narrow ? `$${short(s.salary)}` : money(s.salary));
    // Your own steady pay plus what your team brings in.
    const perSec = m.salaryPerSec + staffPayPerMin(s) / 60;
    this.set('salary-rate', perSec > 0 ? `+$${rate(perSec)}/s` : '');
    const grade = payGrade(s);
    const ready = reviewReady(s);
    this.set('pay-grade', ready ? 'Promotion ready! (Staffing)' : `${grade.title}${grade.mult > 1 ? ` · work ×${grade.mult}` : ''}`);
    const share = s.career.rank >= TOP_RANK ? 1 : Math.min(1, s.career.review / reviewNeed(s.career.rank));
    setFill($('perf-fill'), share);
    $('perf').classList.toggle('full', ready);
    const susp = Math.min(100, s.suspicion);
    this.setNum('susp-num', susp.toFixed(0));
    setFill($('susp-bar'), susp / 100);
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
    this.set('bar-order', sup.box ? 'Open box' : 'Order');
    $<HTMLButtonElement>('order-btn').disabled = !sup.box && s.salary < m.order.price;

    // HR file
    const ups = s.hr.writeUps;
    const final = onFinalWarning(s);
    document.querySelectorAll('#hr-slips i').forEach((el, i) => el.classList.toggle('on', i < ups));
    $('hr-file').dataset.level = final ? 'final' : ups > 0 ? 'warned' : 'clean';
    $('hr-stamp').hidden = !final;
    const fadeIn = Math.max(0, TUNING.writeUpFade - (s.time - s.hr.lastWriteUpAt));
    const hrCase = $('hr-case');
    hrCase.hidden = s.stage !== 5;
    if (s.stage === 5) {
      const ev = Math.min(100, s.war.politics.evidence);
      setFill($('hr-case-fill'), ev / 100);
      hrCase.classList.toggle('high', ev >= 75);
      hrCase.title = `HR’s case file: ${Math.round(ev)}% full`;
      this.set('hr-case-num', `Case ${Math.round(ev)}%`);
    }
    this.set(
      'hr-note',
      ups === 0
        ? 'Clean record.'
        : final
          ? `One more and you're fired. Next write-up fades in ${clock(fadeIn)}.`
          : `${ups} write-up${ups > 1 ? 's' : ''}. One fades in ${clock(fadeIn)}.`,
    );


    this.maybeInstallTip();
    this.renderFront(s, m.warning);
    this.renderAlerts(s, m.warning);
    this.renderGolden(s);
    this.renderChaos(s);
    this.renderTenant(s);
    this.renderFeel(s);
    this.renderFloor(s);
    this.renderTicker(s);
    this.renderPanes(s);
    this.renderComputerHints(s);
    if (s.lookBusy) {
      this.computer.render();
      this.closeRolePop();
    }
    this.map.render();
    this.raid.render();
    this.counter.render();
    this.interview.render();
    this.ask.render();
    // Old saves that were already past Rick get the Department War's welcome once.
    if (s.stage === 3 && !s.war.announced && !s.lookBusy && !document.querySelector('dialog[open]')) this.onStage(3);
    // ...and saves that had already taken the four departments get Stage 4's.
    else if (s.stage === 4 && !s.war.announced4 && !s.lookBusy && !document.querySelector('dialog[open]')) this.onStage(4);
    else if (s.stage === 5 && !s.war.politics.announced5 && !s.lookBusy && !document.querySelector('dialog[open]')) this.onStage(5);
    else if (!s.job.welcomed && !document.querySelector('dialog[open]')) this.onNewJob();
    this.drawer.render();
    this.office.render();
    this.ball.render();
    this.floor.render();
    this.delivery.render();
    this.closet.render();
    this.scene.render();
    this.launcher.update(weapon(s).id, this.scene.handAim(), reducedMotion(), this.scene.handShift());
    void dt;
  }

  private renderFront(s: GameState, _warning: number) {
    const t = currentTarget(s);
    const fd = fightingDept(s);
    const fr = fightingRoom(s);
    const back = reclaimingDept(s);
    this.set(
      'stage-line',
      fd
        ? `${STAGE_NAMES[3]} · ${deptsTaken(s)} of 4 taken`
        : fr
          ? `${STAGE_NAMES[4]} · ${ROOMS.filter((r) => roomTaken(s, r.room)).length} of 2 taken`
          : fightingHr(s)
            ? `${STAGE_NAMES[5]} · case file ${Math.round(s.war.politics.evidence)}%`
            : back
              ? `Stage 5 · Winning back ${dept(back).label}`
              : fightingTenant(s)
                ? `Stage 6: Building Takeover · Floor ${tenantFloor(s, s.tenants.taken)}`
              : s.stage >= 3 && s.rematch
                ? `${s.stage < 6 ? `Stage ${s.stage} · ` : ''}Rematches · round ${s.rematch.round}`
                : STAGE_NAMES[s.stage],
    );
    // From Stage 3 the nameplate is a button: it opens the map.
    this.rebuild('np-map', String(s.stage >= 3), () => {
      const on = s.stage >= 3;
      const plate = $('nameplate');
      $('np-map').hidden = !on;
      plate.classList.toggle('opens-map', on);
      if (on) {
        plate.setAttribute('role', 'button');
        plate.tabIndex = 0;
        plate.title = 'The map of the floor (M)';
      } else {
        plate.removeAttribute('role');
        plate.removeAttribute('tabindex');
        plate.removeAttribute('title');
      }
    });
    const w = weapon(s);
    const flickBtn = $<HTMLButtonElement>('flick-btn');
    if (t) {
      this.set('np-name', t.name);
      this.set('np-title', t.title);
      // IT's firewall: when it's up, and when it's coming.
      const meeting = !!fr && inMeeting(s);
      if (fd === 'it') {
        const c = Math.ceil(firewallClock(s));
        this.set('position', firewallUp(s) ? `Firewall up! Down in ${c} s` : `${t.position}. Firewall in ${c} s`);
      } else if (meeting) this.set('position', `Your Shooters are in Victoria’s meeting: back in ${Math.ceil(s.war.meetingUntil - s.time)} s`);
      else if (fightingHr(s) && memoOn(s, 'teambuilding')) this.set('position', `Team-building exercise: your shots are silent for ${clock(s.war.politics.memos.teambuilding.until - s.time)}`);
      else if (fr && wallUp(s)) this.set('position', 'Behind a wall of filing cabinets');
      else this.set('position', t.position);
      $('position').classList.toggle('alarm', firewallUp(s) || meeting);
      $('position').classList.toggle('calm', fightingHr(s) && memoOn(s, 'teambuilding'));
      // A Stage 4 room: the wall's bar comes first, then their Resolve.
      const walled = wallUp(s);
      const room = fr ? ROOMS.find((x) => x.room === fr)! : null;
      const r = walled && room ? s.war.rooms[room.room].wall : Math.max(0, s.targetResolve);
      const max = walled && room ? room.wall : t.resolve;
      this.set('resolve-label', walled ? 'Wall' : 'Resolve');
      this.rebuild('resolve-wall', String(walled), () => $('resolve-box').classList.toggle('wall', walled));
      // Up the career ladder everyone's Resolve is shown that many times bigger.
      const k = toughness(s);
      this.set('resolve-num', `${fmt(Math.ceil(r * k))} / ${fmt(Math.round(max * k))}`);
      setFill($('resolve-fill'), r / max);
      const tw = $('twist');
      // A rematch says what it's worth (and keeps its old twist, like Gary's fan).
      const twist = fd
        ? `${t.twist} Prize: ${dept(fd).prize.charAt(0).toLowerCase()}${dept(fd).prize.slice(1)}.`
        : fightingHr(s)
          ? `${t.twist} ${memoOn(s, 'teambuilding') ? 'Team-Building is on: shoot freely.' : 'Send a Team-Building memo for cover.'}`
        : room
          ? walled
            ? 'Wall first: the Drill Gatling, Barrages and Engineers hit it hardest.'
            : sabotaged(s, room.room)
              ? `${room.sabotage.does.charAt(0).toUpperCase()}${room.sabotage.does.slice(1)}: ${clock(s.war.rooms[room.room].sabotageUntil - s.time)} left.`
              : `${t.twist} Sabotage it from the map.`
        : fightingTenant(s)
          ? `${t.twist} Take Floor ${tenantFloor(s, s.tenants.taken)}: ${money(tenantBounty(s, s.tenants.taken))}, and this job is worth more Reputation.`
        : s.stage >= 3
          ? `${t.twist ? `${t.twist} ` : ''}Worth ${money(t.bounty)} and some Performance.`
          : t.twist;
      tw.hidden = !twist;
      if (twist) this.set('twist', twist);
    } else {
      this.set('np-name', 'Floor 4, east side');
      this.set('np-title', 'Under new management');
      this.set('position', 'Nobody left to flick. For now.');
      this.set('resolve-num', '0 / 0');
      this.set('resolve-label', 'Resolve');
      setFill($('resolve-fill'), 0);
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
    const msg = this.flashText(performance.now()) ?? coachHint(s);
    this.set('coach', forTouch(msg));
  }

  /** Your guns on a little rack under the Flick key, numbered 1–4, plus a slot for the next one. */
  private renderRack(s: GameState, left: number | null) {
    const m = mods(s);
    const owned = WEAPONS.filter((w) => s.ownedWeapons.includes(w.id));
    const next = WEAPONS.find((w) => w.price > 0 && !s.ownedWeapons.includes(w.id) && w.stage <= s.stage + 1);
    const locked = next
      ? next.stage > s.stage
        ? `Stage ${next.stage}`
        : next.needsDept && !deptTaken(s, next.needsDept)
          ? `Take ${dept(next.needsDept).label}`
          : next.needsEngineer && !m.hasEngineer
            ? 'Engineer'
            : ''
      : '';
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
        const toMap = !!next.needsDept && s.stage === 3 && !deptTaken(s, next.needsDept);
        slots.push(`<button type="button" class="rack-slot more${locked ? ' locked' : ''}" data-slot="more" data-go="w:${next.id}"${toMap ? ' data-map' : ''} data-price="${locked ? '' : price}"
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
    let items = shoppingList(s, 3);
    // The best buy right now always makes the list (in place of the last row if it has to).
    const best = bestBuy(s);
    if (best && !items.some((i) => itemKey(i) === itemKey(best.item))) items = [...items.slice(0, 2), best.item];
    const bestKey = best ? itemKey(best.item) : '';
    const key = items.map((i) => `${itemKey(i)}:${i.price}`).join(',') + `|${bestKey}:${best?.why}`;
    this.rebuild('shop', key, () => {
      $('shop-rows').innerHTML = items.length
        ? items
            .map((i) => {
              const pic =
                i.kind === 'recruit'
                  ? `<span class="shop-pic face">${faceSvg(i.id, 'idle')}</span>`
                  : `<span class="shop-pic"><img src="${i.kind === 'weapon' ? GUN_ART[i.id] : i.kind === 'renovation' ? RENO_ART[i.id] : ICON_ART[i.id]}" alt="" draggable="false"></span>`;
              const where = i.kind === 'recruit' ? 'the Org Chart' : 'Dale';
              const star = itemKey(i) === bestKey;
              const why = best?.why === 'quiet' ? 'quieter: you’ve been caught lately' : best?.why === 'damage' ? 'hits harder' : 'pays more';
              return `<li><button type="button" class="shop-row ${i.kind}${star ? ' best' : ''}" data-go="${itemKey(i)}" data-price="${i.price}" aria-label="${esc(i.name)}, ${money(i.price)}, from ${where}${star ? `. Best buy right now (${why})` : ''}"${star ? ` title="Best buy right now: ${why}"` : ''}>
                ${pic}<span class="shop-name">${star ? '<b class="shop-best" aria-hidden="true">★</b>' : ''}${esc(i.name)}</span><span class="shop-price">${money(i.price)}</span><i class="shop-bar" aria-hidden="true"><span></span></i></button></li>`;
            })
            .join('')
        : '<li class="shop-empty">Nothing left to buy. Dale is impressed.</li>';
    });
    document.querySelectorAll<HTMLElement>('#shop-rows .shop-row').forEach((b) => {
      const f = Math.min(1, s.salary / Number(b.dataset.price));
      b.classList.toggle('afford', f >= 1);
      setFill(b.querySelector<HTMLElement>('.shop-bar span'), f);
    });
    // How many things in Dale's closet you could buy right now.
    const n = s.lookBusy ? 0 : affordable(s, 'closet');
    for (const id of ['closet-badge', 'mini-closet-badge']) {
      $(id).hidden = n === 0;
      this.set(id, String(n));
    }
  }

  /** The golden stapler (while it's out), and the bonus it's running. */
  private renderGolden(s: GameState) {
    const g = s.golden?.shown;
    const el = $('golden');
    const show = !!g && !s.lookBusy;
    if (show && el.hidden) {
      el.style.left = `${(g!.x * 100).toFixed(1)}%`;
      el.style.top = `${(g!.y * 100).toFixed(1)}%`;
      el.hidden = false;
    } else if (!show && !el.hidden) el.hidden = true;
    const left = goldenBoostLeft(s);
    const pill = $('boost-pill');
    const b = s.golden?.boost;
    if (b && left > 0) {
      this.set('boost-pill', b.kind === 'frenzy' ? `★ Frenzy ${GOLDEN.frenzy.damage}× · ${Math.ceil(left)} s` : `★ Overtime ${GOLDEN.overtime.team}× · ${Math.ceil(left)} s`);
      if (pill.hidden) pill.hidden = false;
    } else if (!pill.hidden) pill.hidden = true;
  }

  /** The weak spot on the boss, your hot streak, and the boss reacting as their Resolve runs down. */
  private renderFeel(s: GameState) {
    const w = s.weak?.shown;
    const el = $('weak');
    const show = !!w && !s.lookBusy;
    if (show && el.hidden) {
      el.style.left = `${(w!.x * 100).toFixed(1)}%`;
      el.style.top = `${(w!.y * 100).toFixed(1)}%`;
      el.hidden = false;
    } else if (!show && !el.hidden) el.hidden = true;
    const n = s.lookBusy ? 0 : streakCount(s);
    const pill = $('streak-pill');
    if (n >= 3) {
      const bonus = Math.round((streakMult(s) - 1) * 100);
      this.set('streak-pill', `Streak ${n} · +${bonus}%`);
      const heat = n > STREAK.max ? 'max' : n >= 10 ? 'hot' : 'warm';
      if (pill.dataset.heat !== heat) pill.dataset.heat = heat;
      if (pill.hidden) pill.hidden = false;
    } else if (!pill.hidden) pill.hidden = true;
    // A hack waiting to be picked: the gold chip.
    const h = s.hacks;
    const chip = $('hack-chip');
    const want = !!h?.offer && !s.lookBusy;
    if (want) this.set('hack-chip', h.pending > 1 ? `Pick a hack (${h.pending})` : 'Pick a hack');
    if (chip.hidden === want) chip.hidden = !want;
    // The boss reacts as their Resolve runs down: halfway, and nearly there.
    const t = currentTarget(s);
    if (t && !s.lookBusy) {
      const share = Math.max(0, s.targetResolve) / t.resolve;
      const id = `${t.id}:${s.rematch?.round ?? 0}:${s.tenants?.taken ?? 0}`;
      const last = this.bossMark.id === id ? this.bossMark.share : 1;
      if (this.bossMark.id === id) {
        if (last > 0.5 && share <= 0.5 && share > 0) this.popUp('Halfway!', 'half');
        else if (last > 0.25 && share <= 0.25 && share > 0) this.popUp('Almost there!', 'near');
      }
      this.bossMark = { id, share };
    }
  }

  private bossMark = { id: '', share: 1 };

  /** The hack picker: three cards, and the hacks you already have. */
  private openHacks() {
    const s = this.s;
    const offer = s.hacks?.offer;
    if (!offer) return;
    if (s.walkby.arrivesAt !== null) return this.say('Footsteps! Pick your hack once Mr. Feeney has gone.');
    // Mr. Feeney gives you a few seconds to choose.
    s.walkby.nextAt = Math.max(s.walkby.nextAt, s.time + 8);
    const kindName = { fight: 'Fighting', flow: 'Sneaking', money: 'Money', wild: 'Wild card' } as const;
    $('hack-cards').innerHTML = offer
      .map((id, i) => {
        const h = hack(id);
        const next = hackLevel(s, id) + 1;
        return `<button type="button" class="hack-card" data-kind="${h.kind}" data-hack="${id}">
          <span class="hack-key" aria-hidden="true">${i + 1}</span>
          <span class="hack-kind">${kindName[h.kind]}${next > 1 ? ` · level ${next}` : ''}</span>
          <b class="hack-name">${esc(h.name)}</b>
          <span class="hack-does">${esc(h.does(next))}</span>
        </button>`;
      })
      .join('');
    const owned = HACKS.filter((x) => hackLevel(s, x.id) > 0).map((x) => `${x.name}${hackLevel(s, x.id) > 1 ? ` ${hackLevel(s, x.id)}` : ''}`);
    $('hack-owned').textContent = owned.length ? `Your hacks: ${owned.join(', ')}.` : 'Your first hack. You get a new pick after nearly every boss.';
    $('hack-sub').textContent = s.hacks.pending > 1 ? `One of three, for the rest of this job (${s.hacks.pending} picks waiting).` : 'One of three, for the rest of this job.';
    const dlg = $<HTMLDialogElement>('hack-dlg');
    if (!dlg.open) dlg.showModal();
  }

  private chooseHack(id: HackId) {
    if (!pickHack(this.s, id)) return;
    this.sound.grade('A');
    const dlg = $<HTMLDialogElement>('hack-dlg');
    // Another pick waiting: show the next three straight away.
    if (this.s.hacks.offer) this.openHacks();
    else dlg.close();
  }

  /** A big word over the office (halfway, nearly, a knockout), and a little shake. */
  private popUp(text: string, kind: string, shake = false) {
    const el = $('pop');
    el.textContent = text;
    el.dataset.kind = kind;
    el.hidden = false;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
    clearTimeout(this.popTimer);
    this.popTimer = window.setTimeout(() => (el.hidden = true), 1300);
    if (shake) this.shake();
  }

  private popTimer = 0;

  private shake() {
    if (reducedMotion()) return;
    const wrap = document.querySelector('.scene-wrap');
    if (!wrap) return;
    wrap.classList.remove('shake');
    void (wrap as HTMLElement).offsetWidth;
    wrap.classList.add('shake');
  }

  /** Stage 6: Hargrove's Objections, Dr. Gleam's floss and Disruptr's funding, on the office picture. */
  private renderTenant(s: GameState) {
    const t = s.lookBusy ? null : fightingTenant(s);
    const pill = $('tenant-pill');
    let kind = '';
    let text = '';
    if (t?.tenant === 'law' && objectionOn(s)) {
      kind = 'objection';
      text = `Objection! Hold fire · ${Math.ceil(s.tenants.objection.until - s.time)} s`;
    } else if (t?.tenant === 'dental' && snared(s)) {
      kind = 'floss';
      text = `Floss · flicks ½ speed · ${Math.ceil(s.tenants.floss.until - s.time)} s`;
    } else if (t?.tenant === 'startup') {
      if (downRound(s)) {
        kind = 'down';
        text = `Down round! ${TENANT_RULES.funding.downDamage}× · ${Math.ceil(s.tenants.funding.downUntil - s.time)} s`;
      } else {
        kind = 'funded';
        text = `Funded ${Math.round(s.tenants.funding.level * 100)}%`;
      }
    }
    if (kind) {
      if (pill.dataset.kind !== kind) pill.dataset.kind = kind;
      this.set('tenant-pill', text);
      if (pill.hidden) pill.hidden = false;
    } else if (!pill.hidden) pill.hidden = true;
    const floss = $('floss');
    const tied = t?.tenant === 'dental' && snared(s);
    if (floss.hidden === tied) floss.hidden = !tied;
    if (tied) this.set('floss-label', `Snared! Tap to cut (${TENANT_RULES.floss.cuts - s.tenants.floss.cuts} left)`);
  }

  private doCutFloss = () => {
    if (cutFloss(this.s)) {
      this.sound.snap();
      if (!snared(this.s)) this.say('You cut through the floss. Back to full speed.');
    }
  };

  /** Office chaos: what's going on and for how long, and the lights going out. */
  private renderChaos(s: GameState) {
    const kind = chaosOn(s);
    const pill = $('chaos-pill');
    if (kind) {
      const left = Math.ceil(chaosLeft(s));
      if (pill.dataset.left !== `${kind}${left}`) {
        pill.dataset.left = `${kind}${left}`;
        pill.innerHTML = `<img class="ch-ico" src="${CHAOS_ICON[kind]}" alt="">${CHAOS_INFO[kind].name}<span class="ch-eff"> · ${CHAOS_EFFECT[kind]}</span> · ${left} s`;
      }
      if (pill.dataset.kind !== kind) pill.dataset.kind = kind;
      if (pill.hidden) pill.hidden = false;
    } else if (!pill.hidden) pill.hidden = true;
    const dark = kind === 'outage';
    const outage = $('outage');
    if (outage.hidden === dark) {
      outage.hidden = !dark;
      outage.parentElement!.classList.toggle('dark', dark);
    }
  }

  private renderAlerts(s: GameState, warning: number) {
    const c = walkbyCountdown(s);
    const banner = $('walkby');
    const show = c !== null && !s.lookBusy;
    banner.hidden = !show;
    if (show) setFill($('walkby-fill'), c! / warning);

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
    const lost = s.stage === 4 || s.stage === 5 ? DEPARTMENTS.filter((d) => !deptPerk(s, d.dept)).map((d) => d.dept).join(',') : '';
    const rooms = s.stage >= 4 ? ROOMS.filter((r) => roomTaken(s, r.room)).length : 0;
    this.rebuild('floor', `${s.stage}:${s.targetIndex}:${deptsTaken(s)}:${rooms}:${lost}`, () => {
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
      // From Stage 3, the rest of the floor.
      if (s.stage >= 3) for (const d of DEPARTMENTS) groups.push({ label: d.label, desks: d.desks, state: deptTaken(s, d.dept) && (s.stage < 4 || deptPerk(s, d.dept)) ? 'taken' : 'enemy' });
      // From Stage 4, the two rooms.
      if (s.stage >= 4) for (const r of ROOMS) groups.push({ label: r.label, desks: r.desks, state: roomTaken(s, r.room) ? 'taken' : 'enemy' });
      if (s.stage >= 5) groups.push({ label: 'HR', desks: HR_DIRECTOR.desks, state: s.stage >= 6 ? 'taken' : 'enemy' });
      $('floorplan').innerHTML = groups
        .map(
          (g) => `<div class="desk-group" title="${esc(g.label)}: ${g.state === 'enemy' ? 'holding out' : 'yours'}">
            <div class="desks">${`<i class="desk-sq ${g.state === 'enemy' ? '' : g.state}"></i>`.repeat(g.desks)}</div>
            <span>${esc(g.label)}</span></div>`,
        )
        .join('');
      const total =
        TARGETS.reduce((n, t) => n + t.desks, 0) +
        (s.stage >= 3 ? DEPARTMENTS.reduce((n, d) => n + d.desks, 0) : 0) +
        (s.stage >= 4 ? ROOMS.reduce((n, r) => n + r.desks, 0) : 0) +
        (s.stage >= 5 ? HR_DIRECTOR.desks : 0);
      $('floor-note').textContent = `${s.desks} of ${total} desks captured, each +0.25 bands/s`;
      $('floor-h').textContent = co(s.stage >= 3 ? 'Floor 4' : 'Floor 4, east side');
    });
  }

  private renderTicker(s: GameState) {
    this.rebuild('ticker', String(s.ticker[0]?.id ?? 0), () => {
      const html = s.ticker
        .slice(0, 4)
        .map((t) => `<li>${esc(t.text)}</li>`)
        .join('');
      $('ticker').innerHTML = html;
      $('ticker-2').innerHTML = html;
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
    this.floor.setComputerBadge(total, !!call);
    // Your floor opens up with your first hire, with a dot when there's someone you could hire.
    const floorBtn = $('floor-btn');
    const canHire = TEAMS.some((t) => teamUnlocked(s, t.id) && seats(s, t.id) < seatCap(s, t.id) && s.salary >= seatCost(s, t.id));
    floorBtn.hidden = !teamUnlocked(s, 'temp');
    floorBtn.classList.toggle('dot', canHire);
    $('bar-floor').hidden = floorBtn.hidden;
    $('bar-floor-dot').hidden = !canHire;
    // From Stage 3: the map of the floor.
    const war = s.stage >= 3;
    $('map-btn').hidden = !war;
    $('map-btn').classList.toggle('dot', war && !this.mapSeen);
    $('bar-map').hidden = !war;
    $('bar-map-dot').hidden = !war || this.mapSeen;

    // The desk phone rings at war: a banner to pick it up (which puts you at your computer).
    const banner = $('call-banner');
    banner.hidden = !call || s.lookBusy;
    if (call) {
      const left = Math.max(0, call.until - s.time);
      setFill($('call-fill'), left / 9);
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
        const options = rolesFor(s.stage).map(
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
    const key = rolesFor(s.stage).map((r) => `<dt>${r.name}</dt><dd>${esc(r.effect)}</dd>`).join('');
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

/** On a phone there are no keys to press: tips talk about the buttons instead. */
const touch = () => window.matchMedia?.('(max-width: 760px)').matches ?? false;
function forTouch(text: string) {
  if (!text || !touch()) return text;
  return text
    .replace(/press F or click Flick/g, 'tap Flick')
    .replace(/hold Flick \(or F\)/gi, (m) => (m[0] === 'H' ? 'Hold Flick' : 'hold Flick'))
    .replace(/[Pp]ress Esc to get on your computer/g, (m) => (m[0] === 'P' ? 'Tap Computer' : 'tap Computer'))
    .replace(/[Pp]ress W to answer/g, (m) => (m[0] === 'P' ? 'Tap Answer' : 'tap Answer'))
    .replace(/Dale sells it in the supply closet: press D/g, 'Dale sells it in the supply closet: tap Closet')
    .replace(/ ?\((?:Esc|[A-Z])\)/g, '')
    .replace(/ \(or [A-Z]\)/g, '');
}

function coachHint(s: GameState): string {
  const t = currentTarget(s);
  const w = weapon(s);
  const m = mods(s);
  if (walkbyCountdown(s) !== null && !s.lookBusy) return 'Footsteps! Press Esc to get on your computer before Mr. Feeney arrives.';
  if (s.lookBusy && s.walkby.arrivesAt === null && s.suspicion < 10) return '';
  if (teamUnlocked(s, 'temp') && seats(s, 'temp') === 0) return `You can hire people now. Go to Your floor (T) and hire ${leadName(s, TEAMS[0])}, the Temp.`;
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
  // Noise is what limits you now: full stretches get three times the damage out of the same Suspicion.
  if (s.suspicion >= 70 && s.stats.shots > 50 && s.stats.charged < s.stats.shots * 0.3)
    return 'Hold Flick instead of tapping: it keeps firing full stretches on its own, 5× the damage for barely more noise.';
  if (s.suspicion >= 70 && fightingHr(s)) return 'HR hears everything. Send a Team-Building memo (Memos, on your computer) for two minutes of silent shots.';
  if (s.suspicion >= 70) return 'Suspicion is high. Get on your computer (Esc) and do some work until it cools.';
  if (!s.ownedWeapons.includes('ruler')) {
    return s.salary >= 15
      ? 'You can afford the Ruler Launcher. Dale sells it in the supply closet: press D.'
      : 'Earn $15 for the Ruler Launcher: press Esc to get on your computer and answer some emails.';
  }
  if (s.stats.shots >= 6 && s.stats.charged === 0)
    return 'Tip: hold Flick (or F). At full stretch it fires on its own (5\u00d7 damage) and starts the next one; let go right at full stretch for a Perfect (6\u00d7).';
  if (s.stats.walkbysSpotted + s.stats.hides === 0 && s.time > 60)
    return 'Mr. Feeney walks the floor every few minutes. When you hear footsteps, press Esc to get on your computer.';
  if (s.stage === 2 && s.allies.length < 3) return 'Coworkers email you when they want in: recruit them from Mail or the Org Chart on your computer (Esc).';
  if (s.stage === 2 && s.allies.length >= 2 && s.time - (s.stats.stage1At ?? 0) < 240) return 'Tip: click a teammate in the office to change their role.';
  if (s.stats.tasksDone === 0 && s.time > 90) return 'Your computer (Esc) is where you work: emails and expense reports pay Salary, and Mr. Feeney can’t catch you there.';
  if (s.stage === 2 && w.id !== 'repeater' && s.ownedWeapons.includes('clothespin') && targetDefeated(s, 'printer'))
    return 'Assign Dave as Engineer to unlock the Binder-Clip Repeater.';
  if (s.stage === 2 && TARGETS[s.targetIndex]?.id === 'rick' && s.ownedWeapons.includes('repeater'))
    return 'Beat Rick and the rest of the 4th floor opens up: four departments to take, and the Drill Gatling.';
  // Corporate Politics.
  if (s.stage === 5) {
    const p = s.war.politics;
    if (p.interview) return `HR has called ${nameOf(p.interview.who)} in for an interview! Coach them before they talk.`;
    const seized = DEPARTMENTS.find((d) => s.war.depts[d.dept].seized);
    if (seized && !reclaimingDept(s)) return touch() ? `HR took ${seized.label}. Tap Map and win it back.` : `HR took ${seized.label}. Open the map (M) and win it back.`;
    const ready = MEMOS.filter((x) => canSendMemo(s, x.id).ok);
    if (fightingHr(s) && !memoOn(s, 'teambuilding') && ready.some((x) => x.id === 'teambuilding'))
      return 'Shots at HR are louder. Send a Team-Building memo first (Memos, on your computer): two minutes of silent shots.';
    if (p.evidence >= 60 && ready.some((x) => x.id === 'retention')) return `HR’s case file is at ${Math.round(p.evidence)}%. A Document Retention memo shreds a quarter of it.`;
    if ((s.stats.memos ?? 0) === 0 && s.time - (s.stats.stage4At ?? 0) > 60)
      return 'Real work earns Plausible Deniability. Spend it in Memos, the new app on your computer (Esc).';
    if (ready.length >= 2 && s.lookBusy) return `${ready.length} memos are ready to send. Every one you send wins HR over a little.`;
  }
  // Floor Domination.
  if (s.stage === 4) {
    const a = s.war.counter.attack;
    if (a) return `${dept(a.dept).label} is trying to take its desks back! Hold the line before the clock runs out.`;
    const fr = fightingRoom(s);
    if (fr && inMeeting(s)) return 'Your Shooters are stuck in Victoria’s meeting. A reply-all storm (on the map) cancels her meetings for 3 minutes.';
    if (fr && wallUp(s)) {
      if (!m.hasEngineer) return 'Make someone an Engineer (tap them in the office): Engineers take the wall apart on their own.';
      if (w.id !== 'gatling' && s.ownedWeapons.includes('gatling')) return 'Switch to the Drill Gatling: it does full damage to walls, normal shots only half. Barrages (V) do full damage too.';
    }
    if (fr === 'breakroom' && !wallUp(s) && !sabotaged(s, fr) && (s.stats.sabotages ?? 0) === 0)
      return touch() ? 'The Coffee Club keeps topping up. Tap Map and unplug their coffee machine.' : 'The Coffee Club keeps topping up. Open the map (M) and unplug their coffee machine.';
    if ((s.stats.countersLost ?? 0) > 0 && !s.allies.some((x) => x.role === 'guard'))
      return 'Make someone a Guard (tap them in the office): Guards stop most attempts to take desks back.';
    if (s.time - (s.stats.stage3At ?? 0) < 120)
      return touch() ? 'Tap Map to see both rooms, their walls, and what you can sabotage.' : 'Open the map (M) to see both rooms, their walls, and what you can sabotage.';
  }
  // The Department War.
  if (s.war.closet.raid) return `${dept(s.war.closet.raid.dept).label} is raiding the supply closet! Chase them off before they get away.`;
  const fd = fightingDept(s);
  if (fd === 'accounting' && s.stats.charged < 30) return 'Doris only feels stretched shots: hold Flick and let go at full stretch.';
  if (fd === 'it' && firewallUp(s)) return 'The firewall is up: your shots do half. A good moment for a Barrage (V), which goes straight through.';
  if (s.stage === 3 && deptsTaken(s) === 0 && s.time - (s.stats.stage2At ?? 0) < 300)
    return touch() ? 'Tap Map (at the bottom) to pick a department to fight. Each one you take is yours for good.' : 'Open the map (M, or The 4th floor up top) to pick a department to fight. Each one you take is yours for good.';
  if (s.stage === 3 && !deptTaken(s, 'it') && fightingDept(s) !== 'it' && s.ownedWeapons.includes('repeater') && s.stats.depts === 0)
    return touch() ? 'Want the Drill Gatling? Take IT first: tap Map and pick IT.' : 'Want the Drill Gatling? Take IT first: open the map (M) and pick IT.';
  if (deptTaken(s, 'it') && !s.ownedWeapons.includes('gatling')) {
    if (!m.hasEngineer) return 'IT is yours. To build the Drill Gatling, make Dave (or anyone) an Engineer: tap them in the office.';
    const price = priceOf(s, WEAPONS.find((x) => x.id === 'gatling')!.price);
    return s.salary >= price ? 'IT is yours: Dale has the Drill-Powered Gatling for you now. Supply closet (D).' : `IT is yours: the Drill Gatling is ${money(price)} from Dale. Save up (your computer pays).`;
  }
  return '';
}

/** 730,190 → 730.2K (and millions as usual): for the status strip on small phones. */
function short(n: number) {
  const v = Math.floor(n);
  return v >= 100_000 && v < 1_000_000 ? `${(v / 1000).toFixed(1)}K` : fmt(v);
}
