import { TARGETS, TUNING, type CoworkerId, type Role, type SheetTabId, type UpgradeId, type WeaponId } from './content';

export const SAVE_VERSION = 1;

export interface Email {
  id: number;
  t: number; // game time in seconds
  from: string;
  subject: string;
  body: string;
  kind: 'story' | 'warning' | 'flavor' | 'win';
}

export interface Ally {
  id: CoworkerId;
  role: Role;
  timer: number; // seconds accumulated toward the next shot
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

  stage: 1 | 2 | 3; // 3 = first slice complete
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
  nextGaryFlickAt: number;
  nextReviewAt: number;
  nextChatterAt: number;
  chatterIndex: number;
  nextShipmentAt: number;
  warned50: boolean;
  warned75: boolean;
  outOfAmmoWarnedAt: number;

  /** The Boss Key spreadsheet mini-game. */
  sheet: {
    tab: SheetTabId;
    flags: { id: number; row: number; col: number; expiresAt: number }[];
    streak: number;
    best: number;
    nextFlagAt: number;
    hiddenSince: number | null;
    hustleUntil: number;
    fixes: number;
  };

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
  };

  /** One-shot UI events the renderer consumes (flick animation, captures...). */
  events: GameEvent[];
}

export type GameEvent =
  | { type: 'shot'; damage: number; by: 'you' | 'ally'; allyId?: CoworkerId; charge?: number; perfect?: boolean }
  | { type: 'snap' }
  | { type: 'capture'; targetId: string }
  | { type: 'caught' }
  | { type: 'hidden' }
  | { type: 'spotted' }
  | { type: 'stage'; stage: number }
  | { type: 'enemyShot' }
  | { type: 'review' }
  | { type: 'walkby' }
  | { type: 'recruit'; id: CoworkerId }
  | { type: 'mail'; kind: Email['kind'] }
  | { type: 'fix'; row: number; col: number; pay: number; streak: number; hustle: boolean }
  | { type: 'sheetMiss'; reason: 'wrong' | 'expired' };

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
    nextGaryFlickAt: 20,
    nextReviewAt: 0,
    nextChatterAt: 120,
    chatterIndex: 0,
    nextShipmentAt: 300,
    warned50: false,
    warned75: false,
    outOfAmmoWarnedAt: -999,
    sheet: { tab: 'forecast', flags: [], streak: 0, best: 0, nextFlagAt: 0, hiddenSince: null, hustleUntil: -999, fixes: 0 },
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
    },
    events: [],
  };
  pushEmail(s, 'IT', 'Welcome back', 'Your password expires in 3 days. Have a productive week!', 'flavor');
  pushTicker(s, 'Monday, 9:00 AM. A rubber band hits the back of your neck. Gary is staring at his screen a little too hard.');
  return s;
}

export function pushEmail(s: GameState, from: string, subject: string, body: string, kind: Email['kind'] = 'story') {
  s.inbox.unshift({ id: s.seq++, t: s.time, from, subject, body, kind });
  if (s.inbox.length > 80) s.inbox.length = 80;
  s.unread++;
  s.events?.push({ type: 'mail', kind });
}

export function pushTicker(s: GameState, text: string) {
  s.ticker.unshift({ id: s.seq++, t: s.time, text });
  if (s.ticker.length > 6) s.ticker.length = 6;
}

export function currentTarget(s: GameState) {
  return s.stage <= 2 ? TARGETS[s.targetIndex] : undefined;
}
