// Your work computer: a beige CRT on your desk running a retro office OS. While you're
// on it Mr. Feeney can't catch you, Suspicion cools, and the apps are where the work
// (and the empire management) happens:
//
//   Mail         work email to Reply / Forward / Delete, and story email
//   Phone        put callers through using today's directory
//   Spreadsheet  spot the typos against Accounting's printout
//   Expenses     stamp receipts by today's rule
//   Messenger    your coworkers, one conversation each
//   Staffing     your career (promotions) and the team you hire
//   Memos        (Stage 5) office policy, paid for with Plausible Deniability
//   Job Search   (once HR's case is closed) quit for a new company; résumé perks
//   Supply Catalog, Org Chart, My Documents, the Recycle Bin
//
// Around the apps: a Start menu, a taskbar with your Salary and the work combo, pop-up
// notifications, a screensaver if you sit idle, the desk phone beside the monitor, and
// Mr. Feeney's reflection growing in the glass as he walks up behind you.

import './computer.css';
import { reviewReady } from '../sim/career';
import { chatName, chatUnread } from '../sim/chat';
import { COMBO, type CompanyId, type CoworkerId } from '../sim/content';
import { walkbyCountdown } from '../sim/engine';
import { mods } from '../sim/mods';
import type { GameEvent, GameState } from '../sim/state';
import { comboMult, focusApp, liveCombo, payGradeIndex, workReady } from '../sim/work';
import { CatalogApp, DocsApp } from './apps/docs';
import { avatarHtml, esc, type AppCtx, type AppView } from './apps/common';
import { ExpensesApp } from './apps/expenses';
import { MailApp } from './apps/mail';
import { MessengerApp } from './apps/messenger';
import { PhoneApp } from './apps/phone';
import { SheetApp } from './apps/sheet';
import { StaffingApp } from './apps/staffing';
import { MemosApp } from './apps/memos';
import { JobsApp } from './apps/jobs';
import { TrophiesApp } from './apps/trophies';
import { canSendMemo } from '../sim/politics';
import { MEMOS } from '../sim/content';
import { TROPHIES } from '../sim/trophies';
import { money, officeTime } from './format';
import { portraitSvg } from './portraits';
import type { Sound } from './sound';

export type AppId = 'mail' | 'phone' | 'sheet' | 'expenses' | 'chat' | 'catalog' | 'org' | 'staffing' | 'memos' | 'jobs' | 'trophies' | 'docs' | 'trash';

const TITLES: Record<AppId, string> = {
  mail: 'Mail',
  phone: 'Phone',
  sheet: 'Spreadsheet',
  expenses: 'Expenses',
  chat: 'Messenger',
  catalog: 'Office Supply Catalog',
  org: 'Org Chart',
  staffing: 'Staffing',
  memos: 'Memos',
  jobs: 'Job Search',
  trophies: 'Trophies',
  docs: 'My Documents',
  trash: 'Recycle Bin',
};

const ICON: Record<AppId, string> = {
  mail: 'ico-mail',
  phone: 'ico-phone',
  sheet: 'ico-sheet',
  expenses: 'ico-expenses',
  chat: 'ico-chat',
  catalog: 'ico-catalog',
  org: 'ico-org',
  staffing: 'ico-staffing',
  memos: 'ico-memos',
  jobs: 'ico-doc',
  trophies: 'ico-trophies',
  docs: 'ico-folder',
  trash: 'ico-trash-full',
};

/** What Mr. Feeney says, peering at whatever you have open. */
const FEENEY_SAYS: Record<string, string[]> = {
  mail: ['Inbox zero. I like it.', 'Love a fast responder.'],
  phone: ['Great phone voice.', 'That’s how you handle a caller.'],
  sheet: ['Love a good spreadsheet.', 'Matches the printout? Good.'],
  expenses: ['Watch those receipts. Good.', 'Accounting will be thrilled.'],
  chat: ['…Is that Messenger?', 'Chatting, are we?'],
  catalog: ['Ordering supplies? We’re low on everything.'],
  org: ['Org chart. Very strategic.'],
  staffing: ['Building a team? Love it.', 'Delegation. Very managerial.'],
  memos: ['A memo? Very proactive.', 'Love a well-formatted memo.'],
  jobs: ['…Is that a job site?', 'Updating your résumé? Ha. Ha.'],
  trophies: ['Employee of the Month material.', 'Love a winner.'],
  docs: ['Updating your résumé?', 'Organized. I like it.'],
  trash: ['Taking out the trash. Good.'],
  desk: ['Busy?', 'Nice wallpaper.', 'Great hustle.'],
  saver: ['…Flying staplers?'],
};

/** The wallpaper for each pay grade: the stock teal, a beach, a rowing crew, the city at night (Floor Manager and up). */
const WALLS: string[] = ['corporate', 'corporate', 'beach', 'beach', 'beach', 'teamwork', 'teamwork', 'teamwork', 'skyline'];

const IDLE_MS = 45_000; // the screensaver comes on after this long without touching anything

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface ComputerHooks {
  say(text: string): void;
  ring(): void;
  ordered(): void;
  recruited(id: CoworkerId): void;
  /** A footstep behind you, `near` from 0 (far) to 1 (right behind you). */
  footstep(near: number): void;
  notify(): void;
  promoted(rank: number): void;
  /** Hand in your notice: start over at `to`. */
  quitJob(to: CompanyId, tier: number): void;
}

export class ComputerView {
  private app: AppId | null = null;
  private views: Partial<Record<AppId, AppView>> = {};
  private mail: MailApp;
  private phone: PhoneApp;
  private chat: MessengerApp;
  private docs: DocsApp;
  private staffing: StaffingApp;
  private idleAt = performance.now();
  private saverOn = false;
  private lastRing = 0;
  private feeney: { phase: 'off' | 'walk' | 'peer' | 'leave'; t: number } = { phase: 'off', t: 0 };
  private nextStep = 0;
  private ready = { expense: false, sheet: false };
  private text = new Map<string, string>();

  constructor(
    private get: () => GameState,
    private hooks: ComputerHooks,
    sound: Sound,
  ) {
    const ctx: AppCtx = { get, sound, say: (t) => hooks.say(t) };
    const pane = (id: string) => document.querySelector<HTMLElement>(`.win-body .app[data-app="${id}"]`)!;
    this.mail = new MailApp(pane('mail'), ctx, { recruited: (id) => hooks.recruited(id), review: () => this.openReview() });
    this.phone = new PhoneApp(pane('phone'), ctx);
    this.chat = new MessengerApp(pane('chat'), ctx);
    this.docs = new DocsApp(pane('docs'), ctx);
    this.docs.onTitle = () => this.setTitle();
    this.staffing = new StaffingApp(pane('staffing'), ctx, { promoted: (rank) => hooks.promoted(rank) });
    this.views = {
      mail: this.mail,
      phone: this.phone,
      sheet: new SheetApp(pane('sheet'), ctx),
      expenses: new ExpensesApp(pane('expenses'), ctx),
      chat: this.chat,
      catalog: new CatalogApp(pane('catalog'), ctx, () => hooks.ordered()),
      staffing: this.staffing,
      memos: new MemosApp(pane('memos'), ctx, { sent: () => undefined }),
      trophies: new TrophiesApp(pane('trophies'), ctx),
      jobs: new JobsApp(pane('jobs'), ctx, { quit: (to, tier) => hooks.quitJob(to, tier) }),
      docs: this.docs,
      trash: this.docs,
    };

    $('desktop').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-app]');
      if (b) this.openApp(b.dataset.app as AppId);
    });
    $('start-menu').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b) return;
      this.toggleStart(false);
      if (b.dataset.app) this.openApp(b.dataset.app as AppId);
    });
    $('start-btn').addEventListener('click', () => this.toggleStart());
    $('win-close').addEventListener('click', () => this.openApp(null));
    $('desk-phone').addEventListener('click', () => this.answerPhone());
    $('toasts').addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-open]');
      if (!t) return;
      if (t.dataset.open === 'call') this.answerPhone();
      else if (t.dataset.key === 'review') this.openReview();
      else {
        this.openApp(t.dataset.open as AppId);
        if (t.dataset.who) this.chat.show(t.dataset.who);
      }
      t.remove();
    });
    // Anything you do at the computer keeps the screensaver away.
    const wake = () => {
      this.idleAt = performance.now();
      if (this.saverOn) this.saver(false);
    };
    for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel']) $('computer').addEventListener(ev, wake, { passive: true });
  }

  private get s() {
    return this.get();
  }

  get current() {
    return this.app;
  }

  // ---------------------------------------------------------------- open, close, switch

  /** The computer just came up (you pressed Esc, or picked up the phone). */
  opened() {
    this.idleAt = performance.now();
    const s = this.s;
    if (s.work.rounds.call) this.openApp('phone');
    else if (this.app) this.openApp(this.app);
    else $('back-btn').focus();
  }

  /** You went back to the war. */
  closed() {
    this.toggleStart(false);
    this.saver(false);
    this.feeney = { phase: 'off', t: 0 };
    $('reflection').className = 'reflection';
    $('toasts').innerHTML = '';
  }

  openApp(app: AppId | null) {
    const s = this.s;
    this.toggleStart(false);
    if (app === 'docs' || app === 'trash') this.docs.mode = { kind: app === 'trash' ? 'trash' : 'folder' };
    const before = this.app;
    this.app = app;
    const host = app === 'trash' ? 'docs' : app;
    $('window').hidden = app === null;
    $('desktop').classList.toggle('behind', app !== null);
    document.querySelectorAll<HTMLElement>('.win-body .app').forEach((el) => (el.hidden = el.dataset.app !== host));
    focusApp(s, app ? (this.views[app]?.work ?? null) : null);
    this.setTitle();
    if (app && (app !== before || app === 'docs' || app === 'trash')) this.views[app]?.opened?.();
    if (app) this.views[app]?.render(s);
  }

  private setTitle() {
    const app = this.app;
    $('task-open').textContent = app ? TITLES[app] : '';
    if (!app) return;
    $('win-title').textContent = app === 'docs' || app === 'trash' ? this.docs.title() : TITLES[app];
    $('win-ico').className = `win-ico ico ${ICON[app]}`;
  }

  private toggleStart(on?: boolean) {
    const m = $('start-menu');
    const show = on ?? m.hidden;
    m.hidden = !show;
    $('start-btn').setAttribute('aria-expanded', String(show));
    $('start-btn').classList.toggle('down', show);
  }

  /** Straight into Mr. Feeney's office for your performance review. */
  openReview() {
    this.openApp('staffing');
    this.staffing.showReview();
  }

  /** Pick up the desk phone. */
  answerPhone() {
    this.openApp('phone');
    this.phone.pickUp();
  }

  /** Keys while the computer is up. Returns true if used. */
  onKey(e: KeyboardEvent): boolean {
    if (e.repeat) return false;
    if (this.saverOn) {
      this.saver(false);
      return true;
    }
    if (!$('start-menu').hidden && e.key === 'Escape') {
      this.toggleStart(false);
      return true;
    }
    const v = this.app ? this.views[this.app] : undefined;
    return v?.key?.(e) ?? false;
  }

  // ---------------------------------------------------------------- events

  handle(e: GameEvent) {
    const s = this.s;
    if (!s.lookBusy) return;
    if (e.type === 'workReady' && e.kind === 'mail' && this.app !== 'mail' && !s.work.rounds.mail) {
      const n = s.work.mailWaiting;
      if (n === 1 || n === 3 || n === 5) this.toast('mail', 'mail', 'New work email', `${n} waiting in Mail`);
    } else if (e.type === 'chat') {
      if (this.app === 'chat') return;
      const th = s.chat.threads.find((t) => t.who === e.from);
      const last = th?.msgs[th.msgs.length - 1];
      this.toast(`chat:${e.from}`, 'chat', chatName(s, e.from), last?.text ?? '', e.from);
      this.hooks.notify();
    } else if (e.type === 'taskAuto') this.toast('auto', 'mail', 'Auto-Reply', 'Answered a waiting email for you.');
    else if (e.type === 'reviewReady' && this.app !== 'staffing') {
      this.toast('review', 'staffing', 'Performance review', 'Mr. Feeney wants to see you. Click to go in.');
      this.hooks.notify();
    }
    else if (e.type === 'hidden') this.feeneyPeer();
    else if (e.type === 'trophy') {
      const t = TROPHIES.find((x) => x.id === e.id);
      if (t) this.toast(`trophy:${t.id}`, 'trophies', `Trophy: ${t.name}`, t.does);
    }
  }

  /** A notification sliding up over the taskbar. The same key replaces the old one. */
  private toast(key: string, app: AppId | 'call', title: string, text: string, who?: string) {
    const box = $('toasts');
    const old = box.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (key === 'call' && old) return;
    old?.remove();
    // On a phone one at a time (they'd cover the app); a ringing phone stays on top of it.
    const most = matchMedia('(max-width: 760px)').matches ? 1 : 3;
    const others = () => [...box.children].filter((c) => (c as HTMLElement).dataset.key !== 'call');
    while (others().length >= most) others()[0]?.remove();
    const t = document.createElement('button');
    t.type = 'button';
    t.className = `toast toast-${app}`;
    t.dataset.key = key;
    t.dataset.open = app;
    if (who) t.dataset.who = who;
    t.innerHTML = `${app === 'chat' && who ? avatarHtml(who) : `<span class="ico ${app === 'call' ? 'ico-phone' : ICON[app]}"></span>`}<span class="t-body"><b>${esc(title)}</b><span>${esc(text)}</span></span>`;
    box.append(t);
    if (key !== 'call') setTimeout(() => t.remove(), 5000);
  }

  // ---------------------------------------------------------------- Mr. Feeney behind you

  /** He arrives: leans in, says something about what you have open, and moves on. */
  private feeneyPeer() {
    this.feeney = { phase: 'peer', t: performance.now() };
    const where = this.saverOn ? 'saver' : (this.app ?? 'desk');
    const lines = FEENEY_SAYS[where] ?? FEENEY_SAYS.desk;
    const r = $('reflection');
    r.querySelector('.refl-say')!.textContent = lines[Math.floor(Math.random() * lines.length)];
    r.querySelector('.refl-man')!.innerHTML = portraitSvg('feeney', 'peer');
    const w = this.s.work.rounds;
    if (w.mail || w.sheet || w.expense || w.call) this.toast('hustle', this.app ?? 'mail', 'Mr. Feeney is watching', 'Work pays double for a moment.');
  }

  private stepFeeney(s: GameState, now: number) {
    const r = $('reflection');
    const c = walkbyCountdown(s);
    const f = this.feeney;
    if (c !== null && (f.phase === 'off' || f.phase === 'walk')) {
      // Footsteps behind you, getting closer; his reflection grows in the glass.
      if (f.phase === 'off') {
        this.feeney = { phase: 'walk', t: now };
        r.querySelector('.refl-man')!.innerHTML = portraitSvg('feeney', 'idle');
        r.querySelector('.refl-say')!.textContent = '';
      }
      const near = Math.min(1, Math.max(0, 1 - c / mods(s).warning));
      if (r.className !== 'reflection walk') r.className = 'reflection walk';
      r.style.setProperty('--near', near.toFixed(3));
      if (now > this.nextStep) {
        this.nextStep = now + 720 - 380 * near;
        this.hooks.footstep(near);
      }
      return;
    }
    if (f.phase === 'peer') {
      if (r.className !== 'reflection peer') r.className = 'reflection peer';
      if (now - f.t > 2400) this.feeney = { phase: 'leave', t: now };
    } else if (f.phase === 'leave') {
      if (r.className !== 'reflection leave') r.className = 'reflection leave';
      if (now - f.t > 1400) this.feeney = { phase: 'off', t: now };
    } else if (f.phase === 'walk') this.feeney = { phase: 'off', t: now };
    else if (r.className !== 'reflection') r.className = 'reflection';
  }

  // ---------------------------------------------------------------- screensaver

  private saver(on: boolean) {
    if (this.saverOn === on) return;
    this.saverOn = on;
    const el = $('screensaver');
    el.hidden = !on;
    el.innerHTML = on
      ? Array.from({ length: 7 }, (_, i) => `<span class="flyer" style="--i:${i};--y:${(i * 37) % 86}%;--d:${7 + (i % 3) * 2}s"></span>`).join('') +
        `<p class="saver-note"></p>`
      : '';
  }

  // ---------------------------------------------------------------- every frame

  private flags = new Map<string, boolean>();
  private rebuildFlag(key: string, v: boolean, f: () => void) {
    if (this.flags.get(key) === v) return;
    this.flags.set(key, v);
    f();
  }

  private setText(id: string, t: string) {
    if (this.text.get(id) === t) return;
    this.text.set(id, t);
    $(id).textContent = t;
  }

  render() {
    const s = this.s;
    const now = performance.now();

    // The wallpaper you get depends on your pay grade.
    const wall = WALLS[Math.min(WALLS.length - 1, payGradeIndex(s))];
    if ($('screen').dataset.wall !== wall) $('screen').dataset.wall = wall;

    // Keep the sim's idea of what you're looking at in step (picking up the phone moves you).
    const want = this.app ? (this.views[this.app]?.work ?? null) : null;
    if (s.work.focus !== want) focusApp(s, want);

    // Badges on the desktop icons.
    const ready = workReady(s);
    const r = s.work.rounds;
    badge('mail', (r.mail ? r.mail.items - r.mail.done : 0) + ready.mail + s.unread);
    badge('phone', ready.call || r.call ? '!' : 0);
    badge('expenses', ready.expense ? 1 : 0);
    badge('sheet', r.sheet ? r.sheet.items - r.sheet.done : ready.sheet ? 1 : 0);
    badge('chat', chatUnread(s));
    badge('staffing', reviewReady(s) ? '!' : 0);
    // Stage 5: the Memos app (a badge for every memo you could send right now).
    const politics = s.stage === 5;
    this.rebuildFlag('memos-on', politics, () => document.querySelectorAll<HTMLElement>('[data-app="memos"]:not(.app)').forEach((b) => (b.hidden = !politics)));
    badge('memos', politics ? MEMOS.filter((m) => canSendMemo(s, m.id).ok).length : 0);
    if (!politics && this.app === 'memos') this.openApp(null);
    // Job Search, once a recruiter has been in touch.
    const hiring = !!s.job?.unlocked;
    this.rebuildFlag('jobs-on', hiring, () => document.querySelectorAll<HTMLElement>('[data-app="jobs"]:not(.app)').forEach((b) => (b.hidden = !hiring)));

    // New reports and spreadsheets: a notification when they land.
    for (const k of ['expense', 'sheet'] as const) {
      const app: AppId = k === 'expense' ? 'expenses' : 'sheet';
      if (ready[k] && !this.ready[k] && this.app !== app && s.time > 20)
        this.toast(k, app, k === 'expense' ? 'Expense report' : 'Spreadsheet', k === 'expense' ? 'A new report is ready to stamp.' : 'Accounting sent a printout to check against.');
      this.ready[k] = ready[k];
    }

    // The desk phone rings (and shakes) beside the monitor.
    const ringing = !!s.work.ringing;
    $('desk-phone').classList.toggle('ringing', ringing);
    if (ringing) {
      if (this.app !== 'phone') this.toast('call', 'call', 'Incoming call', 'Line 1 is ringing. Click to answer.');
      if (now - this.lastRing > 1500) {
        this.lastRing = now;
        this.hooks.ring();
      }
    } else $('toasts').querySelector('[data-key="call"]')?.remove();

    // Taskbar: Suspicion, Salary, the clock and the work combo.
    this.setText('tray-clock', officeTime(s.time));
    this.setText('tray-cool', `Suspicion ${Math.round(Math.min(100, s.suspicion))}`);
    this.setText('tray-pay', money(s.salary));
    const combo = liveCombo(s);
    const chip = $('tray-combo');
    chip.hidden = combo < 2;
    if (combo >= 2) {
      this.setText('combo-x', `Combo ${combo} · ×${comboMult(s).toFixed(1).replace(/\.0$/, '')}`);
      $('combo-fill').style.width = `${Math.max(0, 1 - (s.time - s.work.comboAt) / COMBO.window) * 100}%`;
      chip.classList.toggle('max', comboMult(s) >= 1 + COMBO.step * COMBO.cap);
    }

    if (this.app) this.views[this.app]?.render(s);
    this.stepFeeney(s, now);
    if (!this.saverOn && now - this.idleAt > IDLE_MS) this.saver(true);
    if (this.saverOn) {
      const note = $('screensaver').querySelector('.saver-note');
      const t = `Salary: ${money(s.salary)}`;
      if (note && note.textContent !== t) note.textContent = t;
    }
  }
}

function badge(app: string, v: number | string) {
  const el = document.querySelector<HTMLElement>(`[data-badge="${app}"]`);
  if (!el) return;
  const show = v !== 0 && v !== '';
  el.hidden = !show;
  const t = typeof v === 'number' ? (v > 9 ? '9+' : String(v)) : v;
  if (show && el.textContent !== t) el.textContent = t;
}
