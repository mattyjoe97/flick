import { COMPANIES, DALE, DEPARTMENTS, HR_DIRECTOR, type CompanyId, type PerkId, MEMOS, MOMENTS, POLITICS, REMATCH, ROOMS, TARGETS, TUNING, WAR, targetById, type CoworkerId, type MemoId, type DeptId, type Department, type MomentKind, type Role, type Room, type RoomId, type Target, type TeamId, type TrickId, type UpgradeId, type WeaponId } from './content';
import { newSupplies, type FindKind, type SuppliesState } from './supplies';
import { newWorkState, type Grade, type WorkKind, type WorkState } from './work';

export const SAVE_VERSION = 17;

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

  stage: 1 | 2 | 3 | 4 | 5 | 6; // 3 = the Department War, 4 = Floor Domination, 5 = Corporate Politics, 6 = the floor is yours
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
  /** Your career across companies: kept when you quit for a new job. */
  job: JobState;
  barrageAt: number;

  /**
   * After the first war: who's back for a rematch (an index into REMATCH.order), which
   * round, what they're worth, and the Resolve they have left while you're busy elsewhere.
   */
  rematch: { round: number; index: number; resolve: number; bounty: number; left?: number } | null;

  /** Stage 3, the Department War: how much fight each department has left, and the supply closet. */
  war: WarState;

  /**
   * Your team leads' calls: the one waiting for an answer, when the next comes, which have
   * come up lately, the speed-ups (and slowdowns) still running, and whether someone is
   * watching the supply closet.
   */
  asks: {
    current: { id: string; until: number } | null;
    nextAt: number;
    used: string[];
    boosts: { team: TeamId | 'all'; mult: number; from: number; until: number }[];
    watchUntil: number;
  };

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
    asks: number;
    stage4At: number | null;
    rooms: number;
    walls: number;
    countersHeld: number;
    countersLost: number;
    sabotages: number;
    stage5At: number | null;
    memos: number;
    coached: number;
    interviewsLost: number;
    seized: number;
    reclaimed: number;
    caseGoodwill: number;
  };

  /** One-shot UI events the renderer consumes (flick animation, captures...). */
  events: GameEvent[];
}

export interface WarState {
  /**
   * Share of its Resolve each department has left (it keeps it while you fight someone else),
   * and in Stage 4, until when a counterattack has its desks back.
   */
  depts: Record<DeptId, { share: number; taken: boolean; met: boolean; rebranded: boolean; lostUntil: number; seized: boolean }>;
  /** Stage 4's rooms: what's left of each wall, their Resolve, and any sabotage running. */
  rooms: Record<RoomId, { wall: number; share: number; taken: boolean; met: boolean; sabotageUntil: number }>;
  /** Who you're fighting: a department, a room, HR, or your old rivals' rematches. */
  fighting: DeptId | RoomId | 'hr' | 'rematch';
  /** The rooms' tricks: the next coffee refill and meeting, and the meeting your Shooters are stuck in. */
  coffeeAt: number;
  meetingAt: number;
  meetingUntil: number;
  /** Stage 4's counterattacks: one in progress, and when the next comes. */
  counter: { attack: { dept: DeptId; until: number } | null; nextAt: number };
  /** The UI has shown Stage 4's welcome. */
  announced4: boolean;
  /** Stage 5: HR's investigation. */
  politics: PoliticsState;
  /** When Big Tony next fires back. */
  tonyAt: number;
  /** The supply closet: a raid in progress, when the next one comes, and how long it's theirs. */
  closet: { raid: { dept: DeptId; until: number } | null; nextAt: number; lostUntil: number };
  /** The UI has shown the Department War's welcome (old saves see it once). */
  announced: boolean;
}

/**
 * Stage 5, Corporate Politics: your Plausible Deniability, HR's goodwill (one way to close
 * the case) and case file (fill it and HR takes a department), the memos you've sent, the
 * interview in progress, and what's left of the HR Director's Resolve.
 */
export interface PoliticsState {
  pd: number;
  goodwill: number;
  evidence: number;
  memos: Record<MemoId, { until: number; readyAt: number }>;
  interview: { who: string; until: number } | null;
  nextInterviewAt: number;
  hrShare: number;
  met: boolean;
  announced5: boolean;
  /** Told you the case file is nearly full (again once it's back under half). */
  warned: boolean;
}

export function newPolitics(): PoliticsState {
  const memos = Object.fromEntries(MEMOS.map((m) => [m.id, { until: -999, readyAt: -999 }])) as PoliticsState['memos'];
  return { pd: 0, goodwill: 0, evidence: 0, memos, interview: null, nextInterviewAt: 0, hrShare: 1, met: false, announced5: false, warned: false };
}

export function newWar(): WarState {
  const d = () => ({ share: 1, taken: false, met: false, rebranded: false, lostUntil: -999, seized: false });
  const r = (id: RoomId) => ({ wall: ROOMS.find((x) => x.room === id)!.wall, share: 1, taken: false, met: false, sabotageUntil: -999 });
  return {
    depts: { it: d(), accounting: d(), mailroom: d(), marketing: d() },
    rooms: { breakroom: r('breakroom'), conference: r('conference') },
    fighting: 'it',
    coffeeAt: 0,
    meetingAt: 0,
    meetingUntil: -999,
    counter: { attack: null, nextAt: 0 },
    announced4: false,
    politics: newPolitics(),
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
  | { type: 'fight'; id: DeptId | RoomId | 'hr' | 'rematch' }
  | { type: 'rebrand' }
  | { type: 'raid'; dept: DeptId }
  | { type: 'raidOver'; dept: DeptId; how: 'chased' | 'lookout' | 'lost'; bands: number }
  | { type: 'deptTaken'; id: DeptId }
  | { type: 'wallDown'; id: RoomId }
  | { type: 'roomTaken'; id: RoomId }
  | { type: 'coffee' }
  | { type: 'meeting' }
  | { type: 'sabotage'; id: RoomId }
  | { type: 'counter'; dept: DeptId }
  | { type: 'counterOver'; dept: DeptId; how: 'held' | 'guards' | 'lost'; bands: number }
  | { type: 'memo'; id: MemoId }
  | { type: 'interview'; who: string }
  | { type: 'interviewOver'; who: string; how: 'coached' | 'lost' }
  | { type: 'seized'; dept: DeptId }
  | { type: 'reclaimed'; dept: DeptId }
  | { type: 'caseClosed'; how: 'fight' | 'goodwill' }
  | { type: 'caseWarning' }
  | { type: 'trophy'; id: string }
  | { type: 'ask'; id: string }
  | { type: 'askDone'; id: string; choice: 0 | 1; auto: boolean; text: string }
  | { type: 'dealGone'; why: 'expired' | 'walkby' | 'taken' | 'passed' };

/**
 * The New Job restart: which company you're at, how many times you've quit, the Reputation
 * you have to spend (and have ever earned), the résumé perks you've bought, and a few lines
 * about every job you've left.
 */
export interface JobState {
  company: CompanyId;
  runs: number;
  reputation: number;
  earned: number;
  unlocked: boolean;
  welcomed: boolean;
  perks: Partial<Record<PerkId, number>>;
  /** Trophies you've won (by id: the job number you won it on). */
  trophies: Record<string, number>;
  history: { company: CompanyId; minutes: number; stage: number; rep: number }[];
}

export function newJob(): JobState {
  return { company: 'pemberton', runs: 0, reputation: 0, earned: 0, unlocked: false, welcomed: true, perks: {}, trophies: {}, history: [] };
}

/** Levels of a résumé perk you own. */
export function perk(s: GameState, id: PerkId) {
  return s.job?.perks?.[id] ?? 0;
}

/** The company you work for now, and its rules. */
export function company(s: GameState) {
  return COMPANIES.find((c) => c.id === s.job?.company) ?? COMPANIES[0];
}

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
    job: newJob(),
    barrageAt: 0,
    rematch: null,
    war: newWar(),
    asks: { current: null, nextAt: 0, used: [], boosts: [], watchUntil: -999 },
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
      asks: 0,
      stage4At: null,
      rooms: 0,
      walls: 0,
      countersHeld: 0,
      countersLost: 0,
      sabotages: 0,
      stage5At: null,
      memos: 0,
      coached: 0,
      interviewsLost: 0,
      seized: 0,
      reclaimed: 0,
      caseGoodwill: 0,
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

/** Is this department's prize working right now (taken, its desks not retaken, and HR hasn't taken it)? */
export function deptPerk(s: GameState, id: DeptId) {
  const d = s.war?.depts[id];
  return !!d?.taken && !d.seized && s.time >= (d.lostUntil ?? -999);
}

// ---------------------------------------------------------------- Stage 5 helpers

/** Is this memo's policy in force right now? */
export function memoOn(s: GameState, id: MemoId) {
  return s.stage === 5 && s.time < (s.war?.politics?.memos[id]?.until ?? -999);
}

/** Are you fighting the HR Director right now? */
export function fightingHr(s: GameState) {
  return s.stage === 5 && s.war?.fighting === 'hr';
}

/** The department you're winning back from HR, if any. */
export function reclaimingDept(s: GameState): DeptId | null {
  const f = s.war?.fighting;
  return s.stage === 5 && f && isDept(f) && s.war.depts[f].seized ? f : null;
}

/** A department HR took, as a target: its old Resolve, no twist. */
export function reclaimTarget(id: DeptId): Department {
  const d = DEPARTMENTS.find((x) => x.dept === id)!;
  return { ...d, resolve: Math.round(d.resolve * POLITICS.reclaim), twist: `HR reassigned ${d.label} to itself. Win it back.`, bounty: 0 };
}

/** Deniability for real work (Stage 5 only). */
export function earnPd(s: GameState, n: number) {
  if (s.stage === 5 && n > 0) s.war.politics.pd += n;
}

/** Your shots' noise in Stage 5: HR hears everything, unless there's a team-building exercise on. */
export function politicsNoise(s: GameState) {
  if (s.stage !== 5) return 1;
  if (memoOn(s, 'teambuilding')) return 0;
  return (fightingHr(s) ? POLITICS.hrNoise : 1) * (memoOn(s, 'openplan') ? POLITICS.openPlan.noise : 1);
}

/** Your shots' damage in Stage 5 (an open-plan office leaves nowhere to hide). */
export function politicsDamage(s: GameState) {
  return memoOn(s, 'openplan') ? POLITICS.openPlan.damage : 1;
}

/** Has this room been taken? */
export function roomTaken(s: GameState, id: RoomId) {
  return !!s.war?.rooms?.[id]?.taken;
}

/** A room as a target. */
export function roomTarget(id: RoomId): Room {
  return ROOMS.find((r) => r.room === id)!;
}

export const isRoom = (id: string): id is RoomId => id === 'breakroom' || id === 'conference';
export const isDept = (id: string): id is DeptId => DEPARTMENTS.some((d) => d.dept === id);

/** Who's in the rematch rotation: your old rivals, and the department bosses once they're yours. */
export function rematchOrder(s: GameState): string[] {
  return s.stage >= 4 ? REMATCH.order : REMATCH.order.slice(0, REMATCH.firstWar);
}

/** Who you're flicking at right now: the war's next target, a department, a room, a rematch, or nobody. */
export function currentTarget(s: GameState): Target | undefined {
  if (s.stage <= 2) return TARGETS[s.targetIndex];
  const f = s.war?.fighting;
  if (s.stage === 3 && f && isDept(f)) return deptTarget(s, f);
  if (s.stage === 4 && f && isRoom(f)) return roomTarget(f);
  if (s.stage === 5 && f === 'hr') return HR_DIRECTOR;
  if (s.stage === 5 && f && isDept(f) && s.war.depts[f].seized) return reclaimTarget(f);
  const r = s.rematch;
  if (!r) return undefined;
  const base = targetById(rematchOrder(s)[r.index]);
  if (!base) return undefined;
  const line = REMATCH.lines[base.id];
  return { ...base, resolve: r.resolve, bounty: r.bounty, bountyNote: line?.note ?? base.bountyNote, desks: 0 };
}
