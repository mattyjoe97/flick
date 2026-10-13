import { COWORKERS, ROLES, TARGETS, UPGRADES, WEAPONS, type CoworkerId, type Role, type UpgradeId, type WeaponId } from '../sim/content';
import {
  assign,
  buyUpgrade,
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
  work,
  type ActionResult,
} from '../sim/engine';
import { has, mods, weapon } from '../sim/mods';
import { currentTarget, type GameEvent, type GameState } from '../sim/state';
import { fmt, money, officeClock, officeTime, rate } from './format';

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
  private pull = 0;
  private pullVel = 0;
  private holding = false;
  private lastFrame = performance.now();
  private sheetBuilt = false;
  private seenTeam = false;

  constructor(private host: GameHost) {
    this.bind();
  }

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
    $('flick-btn').addEventListener('click', () => this.act(flick));
    $('scrounge-btn').addEventListener('click', () => this.act(scrounge));
    $('work-btn').addEventListener('click', () => this.act(work));
    $('order-btn').addEventListener('click', () => this.act(orderSupplies));
    $('hide-btn').addEventListener('click', () => this.toggleHide());
    $('arena').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mini]');
      if (!b) return;
      const fn = { scrounge, work, order: orderSupplies }[b.dataset.mini as 'scrounge' | 'work' | 'order'];
      this.act(fn);
    });
    $('sheet-close').addEventListener('click', () => this.toggleHide(false));

    // Holding the Flick button pulls the band back; releasing fires.
    const fb = $('flick-btn');
    fb.addEventListener('pointerdown', () => (this.holding = true));
    const release = () => (this.holding = false);
    fb.addEventListener('pointerup', release);
    fb.addEventListener('pointerleave', release);
    fb.addEventListener('pointercancel', release);

    for (const t of ['armory', 'reqs', 'team'] as const) {
      $(`tab-${t}`).addEventListener('click', () => this.showTab(t));
    }
    $('tab-armory').parentElement!.addEventListener('keydown', (e) => this.tabKeys(e));

    $('pane-armory').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-weapon]');
      if (b) this.act((s) => buyWeapon(s, b.dataset.weapon as WeaponId));
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
    if (k === 'f') {
      this.act(flick);
      this.kick();
    } else if (k === 's') this.act(scrounge);
    else if (k === 'w') this.act(work);
    else if (k === 'o') this.act(orderSupplies);
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
    if (on) this.buildSheet();
    sheet.hidden = !on;
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
      if (e.type === 'shot') this.onShot(e.damage, e.by);
      else if (e.type === 'caught') this.say('Caught. Mr. Feeney took 40% of your bands.');
      else if (e.type === 'spotted') this.say('Mr. Feeney saw that. Next time, look busy when you hear footsteps.');
      else if (e.type === 'stage') this.onStage(e.stage);
    }
  }

  private shotsThisFrame = 0;

  private onShot(damage: number, by: 'you' | 'ally') {
    if (by === 'you') this.kick();
    if (reducedMotion() || this.shotsThisFrame > 3) return;
    this.shotsThisFrame++;
    const plate = $('nameplate');
    plate.classList.remove('hit');
    void plate.offsetWidth;
    plate.classList.add('hit');
    const box = $('floaters');
    if (box.childElementCount > 12) box.firstElementChild?.remove();
    const f = document.createElement('span');
    f.className = by === 'ally' ? 'floater ally' : 'floater';
    f.textContent = `−${damage % 1 === 0 ? damage : damage.toFixed(1)}`;
    f.style.left = `${10 + Math.random() * 80}%`;
    box.appendChild(f);
    setTimeout(() => f.remove(), 950);
  }

  /** Snaps the band. */
  private kick() {
    const key = $('flick-btn');
    key.classList.add('pressed');
    setTimeout(() => key.classList.remove('pressed'), 90);
    if (reducedMotion()) return;
    this.pull = Math.max(this.pull, 0.9);
    this.pullVel = 0;
    this.holding = false;
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
    this.set('susp-note', suspicionNote(susp));
    this.set('scrounge-sub', `+${m.scrounge} band${m.scrounge > 1 ? 's' : ''}`);
    this.set('work-sub', `+$${m.workPay}, −1.5 Suspicion`);
    this.set('order-sub', `$${m.order.price} for ${m.order.amount} bands`);
    $<HTMLButtonElement>('order-btn').disabled = s.salary < m.order.price;

    this.set(
      'mini',
      `Bands ${fmt(s.bands)}    Salary ${money(s.salary)}    Suspicion ${susp.toFixed(0)}`,
    );

    this.renderFront(s, m.warning);
    this.renderAlerts(s, m.warning);
    this.renderFloor(s);
    this.renderTicker(s);
    this.renderMail(s);
    this.renderPanes(s);
    this.renderSheetStatus(s);
    this.animateBand(dt);
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
    this.set(
      'weapon-line',
      `${w.name}: ${total} damage, ${w.burst} band${w.burst > 1 ? 's' : ''} per shot`,
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
      s.allies.map((a) => a.id + a.role),
      m.priceMult,
    ]);
    this.rebuild('panes', shape, () => {
      this.buildArmory(s);
      this.buildReqs(s);
      this.buildTeam(s);
    });

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
      if (equipped) act = '<span class="stamp blue">Equipped</span>';
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
        const options = ROLES.map(
          (r) => `<option value="${r.id}"${r.id === ally.role ? ' selected' : ''}>${r.name}${r.id === c.traitRole ? ' ★' : ''}</option>`,
        ).join('');
        return `<div class="item owned">${head}<div class="act"><label class="tag">Role <select class="role-select" data-ally="${c.id}" id="role-${c.id}">${options}</select></label></div></div>`;
      }
      if (!coworkerAvailable(s, c.id)) {
        const t = TARGETS.find((t) => t.id === c.unlockAfter);
        return `<div class="item">${head}<div class="act"><span class="tag">After ${esc(t?.name ?? '')}</span></div></div>`;
      }
      return `<div class="item">${head}<div class="act"><button type="button" class="buy" data-recruit="${c.id}" data-price="${c.cost}">Recruit ${money(c.cost)}</button></div></div>`;
    });
    const key = ROLES.map((r) => `<dt>${r.name}</dt><dd>${esc(r.effect)}</dd>`).join('');
    $('pane-team').innerHTML =
      `<p class="pane-note">Change roles any time. A ★ marks the role each person is best at.</p>` +
      cards.join('') +
      `<dl class="roles-key">${key}</dl>`;
  }

  // ---------------------------------------------------------------- band animation

  private animateBand(dt: number) {
    if (this.holding) {
      this.pull += (1 - this.pull) * Math.min(1, dt * 14);
      this.pullVel = 0;
    } else {
      // Damped spring back to rest, with a little overshoot.
      const k = 520;
      const c = 16;
      this.pullVel += (-k * this.pull - c * this.pullVel) * dt;
      this.pull += this.pullVel * dt;
      if (Math.abs(this.pull) < 0.002 && Math.abs(this.pullVel) < 0.01) {
        this.pull = 0;
        this.pullVel = 0;
      }
    }
    const p = this.pull;
    const key = p.toFixed(3);
    if (this.keys.get('band') === key) return;
    this.keys.set('band', key);
    const dy = p * 30;
    $('band-a').setAttribute('d', `M50 18 Q120 ${18 + dy * 2} 190 18`);
    $('band-b').setAttribute('d', `M50 34 Q120 ${34 + dy * 2} 190 34`);
    $('band-s').setAttribute('d', `M50 30 Q120 ${34 + dy * 2.2} 190 30`);
  }

  // ---------------------------------------------------------------- boss key spreadsheet

  private buildSheet() {
    if (this.sheetBuilt) return;
    this.sheetBuilt = true;
    const cols = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const heads = ['Region', 'Q1', 'Q2', 'Q3', 'Q4 (fcst)', 'YoY %', 'Variance', 'Synergy idx'];
    const regions = ['North', 'South', 'East', 'West', 'Central', 'EMEA', 'APAC', 'LATAM', 'Online', 'Partners', 'Channel', 'Strategic', 'Legacy', 'Other'];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let html = `<thead><tr>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>`;
    html += `<tr><th scope="row">1</th>${heads.map((h) => `<td class="label">${h}</td>`).join('')}</tr>`;
    for (let r = 0; r < 30; r++) {
      const region = regions[r % regions.length] + (r >= regions.length ? ` ${Math.floor(r / regions.length) + 1}` : '');
      const cells = [0, 1, 2, 3].map(() => (rnd() * 90000 + 10000).toFixed(0));
      const yoy = ((rnd() - 0.4) * 30).toFixed(1);
      const variance = ((rnd() - 0.5) * 8000).toFixed(0);
      const syn = (rnd() * 2).toFixed(2);
      const vals = [...cells.map((v) => Number(v).toLocaleString('en-US')), yoy, Number(variance).toLocaleString('en-US'), syn];
      html += `<tr><th scope="row">${r + 2}</th><td class="label">${region}</td>${vals
        .map((v, i) => `<td class="cell" data-ref="${cols[i + 2]}${r + 2}">${v}</td>`)
        .join('')}</tr>`;
    }
    html += '</tbody>';
    const grid = $('sheet-grid');
    grid.innerHTML = html;
    grid.addEventListener('click', (e) => {
      const td = (e.target as HTMLElement).closest<HTMLTableCellElement>('td.cell');
      if (!td) return;
      work(this.s);
      td.textContent = (Math.random() * 90000 + 10000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      td.classList.add('typed');
      $('sheet-ref').textContent = td.dataset.ref ?? '';
      $('sheet-fx').textContent = `=ROUND(${td.dataset.ref}*1.07,0)`;
    });
  }

  private renderSheetStatus(s: GameState) {
    if (!s.lookBusy) return;
    const last = s.ticker[0];
    const msg = last && s.time - last.t < 8 ? last.text : 'Ready. Click any cell to do some work.';
    this.set('sheet-msg', msg);
    this.set(
      'sheet-stats',
      `Average: ${Math.min(100, s.suspicion).toFixed(1)}   Count: ${fmt(s.bands)}   Sum: ${money(s.salary)}`,
    );
  }
}

// ------------------------------------------------------------------ copy helpers

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
  if (s.stats.shots === 0) return 'Gary started it. Flick back: press F or click Flick.';
  if (s.bands < w.burst) {
    return s.salary >= m.order.price
      ? 'Out of bands. Order supplies (O) or scrounge your drawer (S).'
      : 'Out of bands. Scrounge your drawer (S), or do some work (W) to afford a supply order.';
  }
  if (s.suspicion >= 70) return 'Suspicion is high. Do some work (W) or hide in a spreadsheet (Esc) until it cools.';
  if (!s.ownedWeapons.includes('ruler')) {
    return s.salary >= 15
      ? 'You can afford the Ruler Launcher. Buy it in the Armory below.'
      : 'Do some work (W) to earn $15 for the Ruler Launcher. Work also lowers Suspicion.';
  }
  if (s.stats.walkbysSpotted + s.stats.hides === 0 && s.time > 60)
    return 'Mr. Feeney walks the floor every few minutes. When you hear footsteps, press Esc to look busy.';
  if (s.stage === 2 && s.allies.length < 3) return 'Recruit coworkers on the Team tab. Each one has a role they are best at.';
  if (s.stage === 2 && w.id !== 'repeater' && s.ownedWeapons.includes('clothespin') && targetDefeated(s, 'printer'))
    return 'Assign Dave as Engineer to unlock the Binder-Clip Repeater.';
  return '';
}
