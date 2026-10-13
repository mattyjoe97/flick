import { COWORKERS, PROMOTION, ROLES, TARGETS, TUNING, UPGRADES, WEAPONS, type CoworkerId, type Role, type UpgradeId, type WeaponId } from '../sim/content';
import {
  assign,
  buyBack,
  buyBackPrice,
  buyUpgrade,
  confiscatedLeft,
  canFlick,
  snapBand,
  buyWeapon,
  coworkerAvailable,
  flick,
  orderSupplies,
  priceOf,
  recruit,
  scrounge,
  setLookBusy,
  targetDefeated,
  upgradeAvailable,
  walkbyCountdown,
  type ActionResult,
} from '../sim/engine';
import { has, isConfiscated, mods, onFinalWarning, weapon } from '../sim/mods';
import { currentTarget, type GameEvent, type GameState } from '../sim/state';
import { fmt, money, officeClock, officeTime, rate } from './format';
import { Scene } from './scene';
import { SheetView } from './sheet';
import { Sound } from './sound';
import { Launcher } from './launcher';
import { drawPerson, PEOPLE } from './characters';
import { WorkView } from './workview';
import { overdueCount, ringingCall } from '../sim/work';

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
  private tab: 'armory' | 'reqs' | 'team' = 'armory';
  private launcher!: Launcher;
  private lastFrame = performance.now();
  private seenTeam = false;
  private sound = new Sound();
  private scene: Scene;
  private sheet: SheetView;
  private work: WorkView;

  constructor(private host: GameHost) {
    this.scene = new Scene(() => this.s, {
      footstep: () => this.sound.footstep(),
      hit: () => this.sound.hit(),
      handTip: () => this.launcher?.tipClientPoint() ?? null,
    });
    this.sheet = new SheetView(() => this.s, {
      onFix: (_pay, streak) => {
        this.sound.fix(streak);
        this.bump('salary');
      },
      onMiss: () => this.sound.miss(),
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
    this.work = new WorkView(() => this.s, {
      done: (r) => {
        if (r.ok) this.sound.coins();
        else this.sound.miss();
        if (r.pay > 0) this.bump('salary');
        if (r.bonusBands) this.bump('bands');
      },
      say: (t) => this.say(t),
      ring: () => this.sound.ring(),
      beforeOpen: () => this.launcher.cancel(),
    });
    this.bind();
    this.syncSound();
  }

  private syncSound() {
    const b = $('sound-btn');
    b.textContent = this.sound.muted ? 'Sound off' : 'Sound on';
    b.setAttribute('aria-pressed', String(!this.sound.muted));
  }

  /** A sticky note gives a little hop when its number jumps. */
  private bump(which: 'bands' | 'salary') {
    if (reducedMotion()) return;
    const el = document.querySelector(which === 'bands' ? '.sticky-bands' : '.sticky-salary');
    if (!el) return;
    el.classList.remove('bump');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('bump');
  }

  private doScrounge = () => {
    if (this.act(scrounge)) {
      this.bump('bands');
      this.sound.type();
    }
  };

  /** Do work: opens the next task in your queue (a ringing phone first). */
  private doWork = () => {
    this.sound.type();
    this.work.openNext();
  };

  private doOrder = () => {
    if (this.act(orderSupplies)) {
      this.bump('bands');
      this.sound.coins();
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
    $('work-btn').addEventListener('click', this.doWork);
    $('order-btn').addEventListener('click', this.doOrder);
    $('hide-btn').addEventListener('click', () => this.toggleHide());
    $('sound-btn').addEventListener('click', () => {
      this.sound.toggle();
      this.syncSound();
    });
    $('arena').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mini]');
      if (!b) return;
      ({ scrounge: this.doScrounge, work: this.doWork, order: this.doOrder })[b.dataset.mini as 'scrounge' | 'work' | 'order']();
    });
    $('sheet-close').addEventListener('click', () => this.toggleHide(false));
    $('phone-btn').addEventListener('click', this.doWork);
    $('call-answer').addEventListener('click', this.doWork);

    // Hold the Flick key (or your hand) to stretch the band; let go to fire.
    for (const el of [$('flick-btn'), $('scene')]) {
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
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

    for (const t of ['armory', 'reqs', 'team'] as const) {
      $(`tab-${t}`).addEventListener('click', () => this.showTab(t));
    }
    $('tab-armory').parentElement!.addEventListener('keydown', (e) => this.tabKeys(e));

    $('pane-armory').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('button[data-buyback]')) {
        if (this.act(buyBack)) this.sound.coins();
        return;
      }
      const b = el.closest<HTMLButtonElement>('button[data-weapon]');
      if (b) this.act((s) => buyWeapon(s, b.dataset.weapon as WeaponId));
    });
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
    $('pane-reqs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-upgrade]');
      if (b) this.act((s) => buyUpgrade(s, b.dataset.upgrade as UpgradeId));
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
    if (k === 'escape' || k === 'b') {
      e.preventDefault();
      this.toggleHide();
      return;
    }
    if (e.repeat) return;
    if (k === 'f') this.launcher.start();
    else if (k === 's') this.doScrounge();
    else if (k === 'w') this.doWork();
    else if (k === 'o') this.doOrder();
  }

  private tabKeys(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = (['armory', 'reqs', 'team'] as const).filter((t) => !$(`tab-${t}`).hidden);
    const i = tabs.indexOf(this.tab);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    this.showTab(next);
    $(`tab-${next}`).focus();
  }

  private showTab(t: 'armory' | 'reqs' | 'team') {
    this.tab = t;
    for (const x of ['armory', 'reqs', 'team'] as const) {
      $(`tab-${x}`).setAttribute('aria-selected', String(x === t));
      $(`tab-${x}`).tabIndex = x === t ? 0 : -1;
      $(`pane-${x}`).hidden = x !== t;
    }
    if (t === 'team') {
      this.seenTeam = true;
      $('tab-team').classList.remove('fresh');
    }
  }

  private toggleHide(force?: boolean) {
    const on = force ?? !this.s.lookBusy;
    setLookBusy(this.s, on);
    this.syncSheet();
  }

  private syncSheet() {
    const on = this.s.lookBusy;
    const sheet = $('sheet');
    if (sheet.hidden === !on) return;
    sheet.hidden = !on;
    this.sound.hide();
    $('hide-btn').setAttribute('aria-pressed', String(on));
    if (on) $('sheet-close').focus();
    else $('hide-btn').focus();
  }

  /** Clears cached keys so every list rebuilds (after loading or resetting). */
  invalidate() {
    this.keys.clear();
    this.text.clear();
    this.syncSheet();
  }

  // ---------------------------------------------------------------- events from the sim

  handleEvents(events: GameEvent[]) {
    for (const e of events) {
      this.scene.handle(e);
      if (e.type === 'shot') {
        this.onShot(e.damage, e.by, e.perfect ?? false);
        if (e.by === 'you') this.sound.flick(e.charge ?? 0, e.perfect ?? false);
        else this.sound.ally();
      } else if (e.type === 'caught') {
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
      } else if (e.type === 'spotted') this.say('Mr. Feeney saw that. Next time, look busy when you hear footsteps.');
      else if (e.type === 'stage') this.onStage(e.stage);
      else if (e.type === 'capture') this.sound.capture();
      else if (e.type === 'enemyShot') {
        this.sound.incoming();
        this.bump('bands');
      } else if (e.type === 'mail' && e.kind !== 'flavor') this.wobblePhone();
      else if (e.type === 'callMissed') {
        this.sound.miss();
        this.say('You missed a call. The whole floor heard it ring out.');
      }
      else if (e.type === 'sheetMiss' && e.reason === 'expired') this.sound.miss();
    }
  }

  private shotsThisFrame = 0;

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

  /** New story mail: the phone's message light blinks (calls ring for real; see WorkView). */
  private wobblePhone() {
    if (reducedMotion()) return;
    const ph = $('phone');
    ph.classList.remove('ring');
    void (ph as unknown as HTMLElement).getBoundingClientRect();
    ph.classList.add('ring');
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
    $('caught-feeney').innerHTML = drawPerson(PEOPLE.feeney, 'angry');
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
      bb.textContent = `Lost and Found: buy it back for ${money(price)}`;
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
    const workDlg = $<HTMLDialogElement>('work-dlg');
    if (workDlg.open) workDlg.close();
    this.launcher.cancel();
    if (this.s.lookBusy) this.toggleHide(false);
    if (!dlg.open) dlg.showModal();
  }

  private onStage(stage: number) {
    const dlg = $<HTMLDialogElement>('stage-dlg');
    const s = this.s;
    if (stage === 2) {
      $('stage-dlg-h').textContent = 'Stage 2: Cubicle Alliance';
      $('stage-dlg-body').innerHTML = `
        <p>Gary surrendered and joined your side. His desk is your first captured territory.</p>
        <p>Across the aisle, Brad from Sales is waiting. Open the new <strong>Team</strong> tab to recruit coworkers and give each one a role: Shooter, Gatherer, Lookout, Cover or Engineer.</p>`;
      $('tab-team').classList.add('fresh');
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
        <p>That's the end of this first build. Stage 3, Department War, comes next. You can keep the game running, or start over from Settings.</p>`;
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

    this.syncSheet();
    this.set('clock', officeClock(s.time));

    // Desk
    this.set('bands', fmt(s.bands));
    this.set('bands-rate', m.bandsPerSec > 0 ? `+${rate(m.bandsPerSec)}/s` : '');
    this.set('salary', money(s.salary));
    this.set('salary-rate', m.salaryPerSec > 0 ? `+$${rate(m.salaryPerSec)}/s` : '');
    const susp = Math.min(100, s.suspicion);
    this.set('susp-num', susp.toFixed(0));
    // The mug fills from y=114 (empty) to y=18 (full).
    const liquidY = 114 - 96 * (susp / 100);
    $('susp-fill').setAttribute('y', liquidY.toFixed(1));
    $('susp-fill').setAttribute('height', (114 - liquidY).toFixed(1));
    $('susp-foam').setAttribute('y', (liquidY - 2).toFixed(1));
    $('susp-foam').setAttribute('height', susp > 1 ? '3' : '0');
    $('suspicion').setAttribute('aria-valuenow', susp.toFixed(0));
    const level = susp >= 75 ? 'danger' : susp >= 50 ? 'caution' : 'calm';
    $('suspicion').dataset.level = level;
    this.set('susp-note', onFinalWarning(s) && susp >= 75 ? "One more and you're fired." : suspicionNote(susp));
    this.set('scrounge-sub', `+${m.scrounge} band${m.scrounge > 1 ? 's' : ''}`);
    this.set('order-sub', `$${m.order.price} for ${m.order.amount} bands`);
    $<HTMLButtonElement>('order-btn').disabled = s.salary < m.order.price;

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

    this.set(
      'mini',
      `Bands ${fmt(s.bands)}    Salary ${money(s.salary)}    Suspicion ${susp.toFixed(0)}${ups ? `    Write-ups ${ups}/${TUNING.writeUpsToFinal}${final ? ' (final!)' : ''}` : ''}`,
    );

    this.renderFront(s, m.warning);
    this.renderAlerts(s, m.warning);
    this.renderFloor(s);
    this.renderTicker(s);
    this.renderMail(s);
    this.renderPanes(s);
    this.sheet.render();
    this.work.render();
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

    // Coach line: a temporary message wins, then the most useful hint.
    const msg = this.flash && this.flash.until > performance.now() ? this.flash.text : coachHint(s);
    this.set('coach', msg);
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

  private renderMail(s: GameState) {
    this.rebuild('mail', `${s.inbox[0]?.id ?? 0}:${s.inbox.length}`, () => {
      const newest = s.inbox[0]?.t ?? 0;
      $('mail').innerHTML = s.inbox
        .map(
          (m) => `<li class="${m.kind}${m.t >= newest - 2 && s.time - m.t < 10 ? ' fresh' : ''}">
          <div class="slip-print"><span>${m.kind === 'flavor' ? 'Memo' : 'While you were out'}${m.kind === 'warning' ? ' <span class="urgent">\u2611 Urgent</span>' : ''}</span><time>${officeTime(m.t)}</time></div>
          <span class="slip-from">${esc(m.from)}</span>
          <span class="slip-subj">${esc(m.subject)}</span>
          <p>${esc(m.body)}</p></li>`,
        )
        .join('');
      setTimeout(() => $('mail').querySelectorAll('.fresh').forEach((el) => el.classList.remove('fresh')), 6000);
    });
  }

  private renderPanes(s: GameState) {
    const m = mods(s);
    $('tab-team').hidden = s.stage < 2;
    if (s.stage >= 2 && !this.seenTeam && !$('tab-team').classList.contains('fresh')) $('tab-team').classList.add('fresh');

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
      this.buildArmory(s);
      this.buildReqs(s);
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

  private buildArmory(s: GameState) {
    const m = mods(s);
    const rows = WEAPONS.filter((w) => w.stage <= s.stage + 1).map((w) => {
      const owned = s.ownedWeapons.includes(w.id);
      const equipped = s.weapon === w.id;
      const price = priceOf(s, w.price);
      let act: string;
      if (isConfiscated(s, w.id)) {
        const bb = buyBackPrice(s);
        act = `<span class="conf">In Mr. Feeney's drawer <span id="conf-left"></span></span> <button type="button" class="buy" data-buyback="1" data-price="${bb}">Lost and Found ${money(bb)}</button>`;
      } else if (equipped) act = '<span class="stamp blue">Equipped</span>';
      else if (owned) act = `<button type="button" class="buy" data-weapon="${w.id}">Equip</button>`;
      else if (w.stage > s.stage) act = `<span class="tag">Stage ${w.stage}</span>`;
      else if (w.needsEngineer && !m.hasEngineer)
        act = `<button type="button" class="buy" data-weapon="${w.id}" data-price="${price}" data-locked="1" title="Assign someone as Engineer first">Needs an Engineer</button>`;
      else act = `<button type="button" class="buy" data-weapon="${w.id}" data-price="${price}">Buy ${money(price)}</button>`;
      return `<div class="item${owned ? ' owned' : ''}">
        <h4>${esc(w.name)}</h4>
        <p>${esc(w.blurb)}</p>
        <p class="stats">${w.damage * w.burst} damage, ${w.burst} band${w.burst > 1 ? 's' : ''} per shot, noise ${w.noise.toFixed(1)}</p>
        <div class="act">${act}</div></div>`;
    });
    $('pane-armory').innerHTML =
      `<p class="pane-note">Your Shooters always use your equipped weapon. Louder weapons raise Suspicion faster.</p>` + rows.join('');
  }

  private buildReqs(s: GameState) {
    const open: string[] = [];
    const done: string[] = [];
    for (const u of UPGRADES) {
      if (u.stage > s.stage) continue;
      const price = priceOf(s, u.price);
      if (has(s, u.id)) {
        done.push(`<div class="item owned"><h4>${esc(u.name)}</h4><p>${esc(u.effect)}</p><div class="act"><span class="stamp">Approved</span></div></div>`);
      } else if (!upgradeAvailable(s, u.id)) {
        const t = TARGETS.find((t) => t.id === u.unlockAfter);
        open.push(`<div class="item"><h4>${esc(u.name)}</h4><p>${esc(u.effect)}</p><div class="act"><span class="tag">After ${esc(t?.name ?? '')}</span></div></div>`);
      } else {
        open.push(`<div class="item"><h4>${esc(u.name)}</h4><p>${esc(u.effect)}</p><div class="act"><button type="button" class="buy" data-upgrade="${u.id}" data-price="${price}">Approve ${money(price)}</button></div></div>`);
      }
    }
    $('pane-reqs').innerHTML =
      `<p class="pane-note">Requisitions are permanent. Procurement approves anything with a form attached.</p>` + open.join('') + done.join('');
  }

  private buildTeam(s: GameState) {
    if (s.stage < 2) {
      $('pane-team').innerHTML = '';
      return;
    }
    const cards = COWORKERS.map((c) => {
      const ally = s.allies.find((a) => a.id === c.id);
      const traitRole = ROLES.find((r) => r.id === c.traitRole)!.name;
      const head = `<h4>${esc(c.name)}</h4><p>${esc(c.who)}. ${esc(c.trait)}: ${traitRole} ×${c.mult}.</p>`;
      if (ally) {
        const roleName = ROLES.find((r) => r.id === ally.role)!.name;
        const rankTag = ally.rank > 0 ? `<span class="rank">${PROMOTION.titles[ally.rank]} ${roleName}</span>` : '';
        const headAlly = `<h4>${esc(c.name)}${rankTag}</h4><p>${esc(c.who)}. ${esc(c.trait)}: ${traitRole} ×${c.mult}.</p><p class="served" id="served-${c.id}"></p>`;
        const options = ROLES.map(
          (r) => `<option value="${r.id}"${r.id === ally.role ? ' selected' : ''}>${r.name}${r.id === c.traitRole ? ' ★' : ''}</option>`,
        ).join('');
        return `<div class="item owned">${headAlly}<div class="act"><label class="tag">Role <select class="role-select" data-ally="${c.id}" id="role-${c.id}">${options}</select></label></div></div>`;
      }
      if (!coworkerAvailable(s, c.id)) {
        const t = TARGETS.find((t) => t.id === c.unlockAfter);
        return `<div class="item">${head}<div class="act"><span class="tag">After ${esc(t?.name ?? '')}</span></div></div>`;
      }
      return `<div class="item">${head}<div class="act"><button type="button" class="buy" data-recruit="${c.id}" data-price="${c.cost}">Recruit ${money(c.cost)}</button></div></div>`;
    });
    const key = ROLES.map((r) => `<dt>${r.name}</dt><dd>${esc(r.effect)}</dd>`).join('');
    $('pane-team').innerHTML =
      `<p class="pane-note">Change roles any time. A ★ marks the role each person is best at. Coworkers are promoted to Senior (+${Math.round((PROMOTION.bonus[1] - 1) * 100)}%) and Lead (+${Math.round((PROMOTION.bonus[2] - 1) * 100)}%) the longer they're on your team.</p>` +
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
  if (walkbyCountdown(s) !== null && !s.lookBusy) return 'Footsteps! Press Esc to look busy before Mr. Feeney arrives.';
  if (s.lookBusy && s.walkby.arrivesAt === null && s.suspicion < 10) return '';
  if (!t) return '';
  if (ringingCall(s)) return 'Your phone is ringing! Press W (or tap the phone) to answer before it rings out.';
  if (s.stats.shots === 0) return 'Gary started it. Flick back: press F or click Flick.';
  if (s.stats.tasksDone + s.stats.tasksWrong === 0 && s.work.queue.length > 0)
    return 'You have work waiting. Press W (or Do work) to do it: work pays and lowers Suspicion.';
  if (overdueCount(s) > 0) return 'Work is overdue: your Suspicion won’t cool down until you catch up. Press W.';
  if (onFinalWarning(s)) return "Final Warning: one more catch and you're fired. Look busy when you hear footsteps.";
  if (s.hr.confiscated && s.salary >= buyBackPrice(s))
    return `Lost and Found will sell your ${WEAPONS.find((x) => x.id === s.hr.confiscated!.weapon)!.name} back for ${money(buyBackPrice(s))} (Armory).`;
  if (s.bands < w.burst) {
    return s.salary >= m.order.price
      ? 'Out of bands. Order supplies (O) or scrounge your drawer (S).'
      : 'Out of bands. Scrounge your drawer (S), or do some work (W) to afford a supply order.';
  }
  if (s.suspicion >= 70) return 'Suspicion is high. Do some work (W) or look busy in a spreadsheet (Esc) until it cools.';
  if (!s.ownedWeapons.includes('ruler')) {
    return s.salary >= 15
      ? 'You can afford the Ruler Launcher. Buy it in the Armory below.'
      : 'Do your work (W) to earn $15 for the Ruler Launcher. Work also lowers Suspicion.';
  }
  if (s.stats.shots >= 6 && s.stats.charged === 0)
    return 'Tip: hold Flick (or F) to stretch the band. Let go at full stretch for a Perfect shot: 6\u00d7 damage from one band.';
  if (s.stats.walkbysSpotted + s.stats.hides === 0 && s.time > 60)
    return 'Mr. Feeney walks the floor every few minutes. When you hear footsteps, press Esc to look busy.';
  if (s.stage === 2 && s.allies.length < 3) return 'Recruit coworkers on the Team tab. Each one has a role they are best at.';
  if (s.stage === 2 && w.id !== 'repeater' && s.ownedWeapons.includes('clothespin') && targetDefeated(s, 'printer'))
    return 'Assign Dave as Engineer to unlock the Binder-Clip Repeater.';
  return '';
}
