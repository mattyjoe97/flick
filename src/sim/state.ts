import { DALE, DEPARTMENTS, MOMENTS, REMATCH, TARGETS, TUNING, WAR, targetById, type CoworkerId, type DeptId, type Department, type MomentKind, type Role, type Target, type TeamId, type TrickId, type UpgradeId, type WeaponId } from './content';
import { newSupplies, type FindKind, type SuppliesState } from './supplies';
import { newWorkState, type Grade, type WorkKind, type WorkState } from './work';

export const SAVE_VERSION = 13;

export interface Email {
  id: number;
  t: number; // game time in seconds
  from: string;
  subject: string;
  body: string;
  kind: 'story' | 'warning' | 'flavor' | 'win';
  /** A coworker asking to join: Mail shows a Recruit button. */
  recruit?: CoworkerId;
  /** Mr. Feeney calling you in: Mail shows a button to go to your performance review. */
  review?: boolean;
}

export interface Ally {
  id: CoworkerId;
  role: Role;
  timer: number; // seconds accumulated toward the next shot
  served: number; // seconds on your team, for promotions
  rank: number; // 0 = new hire, 1 = Senior, 2 = Lead
}

export function newAlly(id: CoworkerId, role: Role): Ally {
  return { id, role, timer: 0, served: 0, rank: 0 };
}

/** One message in a Messenger conversation. */
export interface ChatMessage {
  id: number;
  t: number;
  mine: boolean; // you sent it
  text: string;
}

/** A Messenger conversation with one person (or group). */
export interface ChatThread {
  who: string;
  msgs: ChatMessage[];
  unread: number;
  /** A line of theirs you can answer, with quick replies (its id in chat.ts). */
  pending: string | null;
}

/** A "Psst" offer from Dale: a little off, or something early at a markup. */
export interface DaleDeal {
  kind: 'weapon' | 'upgrade';
  id: string;
  price: number;
  until: number;
  early: boolean;
}

export interface Ticker {
  id: number;
  t: number;
  text: string;
}

export interface GameState {
  version: number;
  rng: number;
  time: number; // active game seconds

  bands: number;
  salary: number;
  suspicion: number;

  stage: 1 | 2 | 3 | 4; // 3 = the Department War, 4 = the whole floor is yours
  targetIndex: number;
  targetResolve: number;
  sinceLastHit: number;
  desks: number;

  weapon: WeaponId;
  ownedWeapons: WeaponId[];
  upgrades: UpgradeId[];
  allies: Ally[];

  lookBusy: boolean;
  lastShotAt: number;
  nextFlickAt: number; // your weapon's reload
  flickLockUntil: number;
  lastCaughtAt: number | null;
  shooterLockUntil: number;

  walkby: { nextAt: number; arrivesAt: number | null };

  /** Your HR file: write-ups, and the weapon sitting in Mr. Feeney's drawer. */
  hr: {
    writeUps: number;
    lastWriteUpAt: number; // also when the last write-up faded
    confiscated: { weapon: WeaponId; until: number } | null;
  };
  nextGaryFlickAt: number;
  nextReviewAt: number;
  nextChatterAt: number;
  chatterIndex: number;
  nextShipmentAt: number;
  warned50: boolean;
  warned75: boolean;
  outOfAmmoWarnedAt: number;

  /** Your job at your computer: mail, the phone, expense reports and spreadsheets. */
  work: WorkState;

  /** Your career: your rank (PAY_GRADES), and Performance toward the next review. */
  career: { rank: number; review: number };

  /** The teams working for you: seats filled, training level, and work in progress. */
  staff: Partial<Record<TeamId, { seats: number; level: number; done: number }>>;
  /** Your team's pay since the last coin drop, and when the next drop is. */
  staffPay: { owed: number; at: number };

  /** Names you can change: yours (on your ID badge) and your team leads'. */
  names: Partial<Record<'you' | TeamId, string>>;

  /** Bailey and the office: the moment up right now, the next one, pizza, the last ear scratch. */
  office: {
    moment: { kind: MomentKind; until: number } | null;
    nextAt: number;
    pizzaUntil: number;
    pettedAt: number;
    /** Ear scratches that taught Bailey something (one counts every few seconds), and her last howl. */
    scratches: number;
    scratchedAt: number;
    howledAt: number;
  };

  /** Today's goals on Mr. Feeney's sticky note (what each counter read when the day began). */
  goals: { day: number; list: { id: string; base: number; done: boolean }[]; combo: number };

  /** Your rubber band ball (bands wound on so far), and when your next Barrage is ready. */
  ball: { wound: number; found: boolean };
  barrageAt: number;

  /**
   * After the first war: who's back for a rematch (an index into REMATCH.order), which
   * round, what they're worth, and the Resolve they have left while you're busy elsewhere.
   */
  rematch: { round: number; index: number; resolve: number; bounty: number; left?: number } | null;

  /** Stage 3, the Department War: how much fight each department has left, and the supply closet. */
  war: WarState;

  /** Messenger: coworkers (and rivals) messaging you, one conversation each. */
  chat: {
    threads: ChatThread[];
    /** Messages on their way ("Gary is typing…"): delivered at `at`. */
    queue: { who: string; text: string; at: number; line?: string }[];
    nextAt: number;
    used: string[];
  };

  /** Your desk drawer, supply orders on their way, and a delivered box waiting on your desk. */
  supplies: SuppliesState;

  /** Dale from Facilities and his black market in the supply closet. */
  dale: { deal: DaleDeal | null; nextDealAt: number; introduced: boolean };

  inbox: Email[];
  unread: number;
  ticker: Ticker[];
  seq: number;

  stats: {
    shots: number;
    damage: number;
    caught: number;
    hides: number;
    walkbysSpotted: number;
    workClicks: number;
    workEarned: number;
    bandsScrounged: number;
    charged: number;
    perfect: number;
    snapped: number;
    stage1At: number | null;
    stage2At: number | null;
    fired: number;
    buyBacks: number;
    promotions: number;
    tasksDone: number;
    tasksWrong: number;
    tasksAuto: number;
    callsMissed: number;
    receiptsFudged: number;
    finds: number;
    ordersPlaced: number;
    boxesOpened: number;
    dealsOffered: number;
    dealsTaken: number;
    bounties: number;
    bestCombo: number;
    rounds: number;
    gradeA: number;
    teamEarned: number;
    teamDone: number;
    moments: number;
    pets: number;
    hires: number;
    goals: number;
    mailRounds: number;
    callRounds: number;
    expenseRounds: number;
    sheetRounds: number;
    sheetA: number;
    winds: number;
    barrages: number;
    barrageDamage: number;
    rematches: number;
    howls: number;
    depts: number;
    raidsStopped: number;
    raidsLost: number;
    stage3At: number | null;
  };

  /** One-shot UI events the renderer consumes (flick animation, captures...). */
  events: GameEvent[];
}

export interface WarState {
  /** Share of its Resolve each department has left (it keeps it while you fight someone else). */
  depts: Record<DeptId, { share: number; taken: boolean; met: boolean; rebranded: boolean }>;
  /** Who you're fighting: a department, or your old rivals' rematches. */
  fighting: DeptId | 'rematch';
  /** When Big Tony next fires back. */
  tonyAt: number;
  /** The supply closet: a raid in progress, when the next one comes, and how long it's theirs. */
  closet: { raid: { dept: DeptId; until: number } | null; nextAt: number; lostUntil: number };
  /** The UI has shown the Department War's welcome (old saves see it once). */
  announced: boolean;
}

export function newWar(): WarState {
  const d = () => ({ share: 1, taken: false, met: false, rebranded: false });
  return {
    depts: { it: d(), accounting: d(), mailroom: d(), marketing: d() },
    fighting: 'it',
    tonyAt: 0,
    closet: { raid: null, nextAt: 0, lostUntil: -999 },
    announced: false,
  };
}

export type GameEvent =
  | { type: 'shot'; damage: number; by: 'you' | 'ally'; allyId?: CoworkerId; charge?: number; perfect?: boolean }
  | { type: 'snap' }
  | { type: 'capture'; targetId: string }
  | { type: 'caught'; writeUps: number; confiscated: WeaponId | null; lostBands: number; regrouped: number }
  | { type: 'fired'; lostBands: number; lostDesks: number; stage: number }
  | { type: 'promotion'; id: CoworkerId; rank: number }
  | { type: 'writeUpFaded'; writeUps: number }
  | { type: 'weaponBack'; weapon: WeaponId; paid: boolean }
  | { type: 'hidden' }
  | { type: 'spotted' }
  | { type: 'stage'; stage: number }
  | { type: 'enemyShot' }
  | { type: 'review' }
  | { type: 'walkby' }
  | { type: 'recruit'; id: CoworkerId }
  | { type: 'mail'; kind: Email['kind'] }
  | { type: 'workReady'; kind: WorkKind }
  | { type: 'roundStart'; kind: WorkKind }
  | { type: 'itemDone'; kind: WorkKind; ok: boolean; pay: number; text: string }
  | { type: 'roundDone'; kind: WorkKind; grade: Grade; pay: number; bonus: number; right: number; items: number }
  | { type: 'taskAuto'; kind: WorkKind; who: string }
  | { type: 'callMissed' }
  | { type: 'chat'; from: string }
  | { type: 'delivery'; amount: number; free: boolean; auto?: boolean }
  | { type: 'find'; kind: FindKind }
  | { type: 'boxSpotted'; noise: number }
  | { type: 'deal' }
  | { type: 'pay'; amount: number; source: 'work' | 'bounty' | 'team'; combo?: number; note?: string }
  | { type: 'reviewReady'; rank: number }
  | { type: 'promoted'; rank: number }
  | { type: 'hired'; team: TeamId; seats: number }
  | { type: 'trained'; team: TeamId; level: number }
  | { type: 'moment'; kind: MomentKind }
  | { type: 'momentClaimed'; kind: MomentKind; text: string }
  | { type: 'momentGone'; kind: MomentKind }
  | { type: 'petted'; calmed: boolean }
  | { type: 'trick'; id: TrickId }
  | { type: 'howled' }
  | { type: 'goalDone'; id: string; text: string; all: boolean }
  | { type: 'goalsNew' }
  | { type: 'wound'; amount: number; size: number; grew: boolean }
  | { type: 'ballReady' }
  | { type: 'barrage'; damage: number; bands: number; shooters: CoworkerId[] }
  | { type: 'rematch'; round: number; index: number }
  | { type: 'fight'; id: DeptId | 'rematch' }
  | { type: 'rebrand' }
  | { type: 'raid'; dept: DeptId }
  | { type: 'raidOver'; dept: DeptId; how: 'chased' | 'lookout' | 'lost'; bands: number }
  | { type: 'deptTaken'; id: DeptId }
  | { type: 'dealGone'; why: 'expired' | 'walkby' | 'taken' | 'passed' };

export function newGame(seed = Date.now() % 2147483647): GameState {
  const first = TARGETS[0];
  const s: GameState = {
    version: SAVE_VERSION,
    rng: seed | 0,
    time: 0,
    bands: TUNING.startBands,
    salary: 0,
    suspicion: 0,
    stage: 1,
    targetIndex: 0,
    targetResolve: first.resolve,
    sinceLastHit: 999,
    desks: 0,
    weapon: 'flick',
    ownedWeapons: ['flick'],
    upgrades: [],
    allies: [],
    lookBusy: false,
    lastShotAt: -999,
    nextFlickAt: 0,
    flickLockUntil: 0,
    lastCaughtAt: null,
    shooterLockUntil: 0,
    walkby: { nextAt: TUNING.firstWalkby, arrivesAt: null },
    hr: { writeUps: 0, lastWriteUpAt: 0, confiscated: null },
    work: newWorkState(),
    career: { rank: 0, review: 0 },
    staff: {},
    staffPay: { owed: 0, at: 0 },
    names: {},
    office: { moment: null, nextAt: MOMENTS.first, pizzaUntil: -999, pettedAt: -999, scratches: 0, scratchedAt: -999, howledAt: -999 },
    goals: { day: -1, list: [], combo: 0 },
    ball: { wound: 0, found: false },
    barrageAt: 0,
    rematch: null,
    war: newWar(),
    nextGaryFlickAt: 20,
    nextReviewAt: 0,
    nextChatterAt: 120,
    chatterIndex: 0,
    nextShipmentAt: 300,
    warned50: false,
    warned75: false,
    outOfAmmoWarnedAt: -999,
    chat: { threads: [], queue: [], nextAt: 15, used: [] },
    supplies: newSupplies(),
    dale: { deal: null, nextDealAt: DALE.firstDealAt, introduced: false },
    inbox: [],
    unread: 0,
    ticker: [],
    seq: 1,
    stats: {
      shots: 0,
      damage: 0,
      caught: 0,
      hides: 0,
      walkbysSpotted: 0,
      workClicks: 0,
      workEarned: 0,
      bandsScrounged: 0,
      charged: 0,
      perfect: 0,
      snapped: 0,
      stage1At: null,
      stage2At: null,
      fired: 0,
      buyBacks: 0,
      promotions: 0,
      tasksDone: 0,
      tasksWrong: 0,
      tasksAuto: 0,
      callsMissed: 0,
      receiptsFudged: 0,
      finds: 0,
      ordersPlaced: 0,
      boxesOpened: 0,
      dealsOffered: 0,
      dealsTaken: 0,
      bounties: 0,
      bestCombo: 0,
      rounds: 0,
      gradeA: 0,
      teamEarned: 0,
      teamDone: 0,
      moments: 0,
      pets: 0,
      hires: 0,
      goals: 0,
      mailRounds: 0,
      callRounds: 0,
      expenseRounds: 0,
      sheetRounds: 0,
      sheetA: 0,
      winds: 0,
      barrages: 0,
      barrageDamage: 0,
      rematches: 0,
      howls: 0,
      depts: 0,
      raidsStopped: 0,
      raidsLost: 0,
      stage3At: null,
    },
    events: [],
  };
  pushEmail(s, 'IT', 'Welcome back', 'Your password expires in 3 days. Have a productive week!', 'flavor');
  pushTicker(s, 'Monday, 9:00 AM. A rubber band hits the back of your neck. Gary is staring at his screen a little too hard.');
  return s;
}

export function pushEmail(s: GameState, from: string, subject: string, body: string, kind: Email['kind'] = 'story', recruit?: CoworkerId) {
  s.inbox.unshift({ id: s.seq++, t: s.time, from, subject, body, kind, ...(recruit ? { recruit } : {}) });
  if (s.inbox.length > 80) s.inbox.length = 80;
  s.unread++;
  s.events?.push({ type: 'mail', kind });
}

export function pushTicker(s: GameState, text: string) {
  s.ticker.unshift({ id: s.seq++, t: s.time, text });
  if (s.ticker.length > 6) s.ticker.length = 6;
}

/** Has this department surrendered? */
export function deptTaken(s: GameState, id: DeptId) {
  return !!s.war?.depts[id]?.taken;
}

/** How many departments you've taken. */
export function deptsTaken(s: GameState) {
  return DEPARTMENTS.filter((d) => deptTaken(s, d.dept)).length;
}

/** A department's full Resolve right now: every one you've taken puts the rest on alert. */
export function deptMax(s: GameState, id: DeptId) {
  const d = DEPARTMENTS.find((x) => x.dept === id)!;
  return Math.round(d.resolve * Math.pow(WAR.reinforce, deptsTaken(s)));
}

/** A department as a target, at its current strength. */
export function deptTarget(s: GameState, id: DeptId): Department {
  const d = DEPARTMENTS.find((x) => x.dept === id)!;
  return { ...d, resolve: deptMax(s, id) };
}

/** Who's in the rematch rotation: your old rivals, and the department bosses once the floor is yours. */
export function rematchOrder(s: GameState): string[] {
  return s.stage >= 4 ? REMATCH.order : REMATCH.order.slice(0, REMATCH.firstWar);
}

/** Who you're flicking at right now: the war's next target, a department, a rematch, or nobody. */
export function currentTarget(s: GameState): Target | undefined {
  if (s.stage <= 2) return TARGETS[s.targetIndex];
  if (s.stage === 3 && s.war && s.war.fighting !== 'rematch') return deptTarget(s, s.war.fighting);
  const r = s.rematch;
  if (!r) return undefined;
  const base = targetById(rematchOrder(s)[r.index]);
  if (!base) return undefined;
  const line = REMATCH.lines[base.id];
  return { ...base, resolve: r.resolve, bounty: r.bounty, bountyNote: line?.note ?? base.bountyNote, desks: 0 };
}
