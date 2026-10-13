// All tunable game content lives here as data. Balancing FLICK should mostly
// mean editing numbers in this file, not changing code.

export type Role = 'shooter' | 'gatherer' | 'lookout' | 'cover' | 'engineer';

export const ROLES: { id: Role; name: string; effect: string }[] = [
  { id: 'shooter', name: 'Shooter', effect: 'Fires your best weapon every 2 s' },
  { id: 'gatherer', name: 'Gatherer', effect: '+0.5 bands/s' },
  { id: 'lookout', name: 'Lookout', effect: '−12% Suspicion gain, +0.75 s warning' },
  { id: 'cover', name: 'Cover', effect: 'Does real work: +$0.50/s, −0.3 Suspicion/s, clears a task every 40 s' },
  { id: 'engineer', name: 'Engineer', effect: '−10% weapon and requisition prices' },
];

// ---------------------------------------------------------------- weapons

export type WeaponId = 'flick' | 'ruler' | 'clothespin' | 'repeater';

export interface Weapon {
  id: WeaponId;
  name: string;
  blurb: string;
  damage: number; // per band
  burst: number; // bands fired per shot
  noise: number; // Suspicion per shot = 0.5 × noise (before modifiers)
  reload: number; // minimum seconds between your shots (multiples of the 0.1 s step)
  price: number;
  stage: number; // first stage it can be bought in
  needsEngineer?: boolean;
}

export const WEAPONS: Weapon[] = [
  { id: 'flick', name: 'Finger Flick', blurb: 'The classic. Thumb, finger, regret.', damage: 1, burst: 1, noise: 1.0, reload: 0.1, price: 0, stage: 1 },
  { id: 'ruler', name: 'Ruler Launcher', blurb: 'A 12-inch ruler and a confident wrist.', damage: 3, burst: 1, noise: 1.2, reload: 0.1, price: 15, stage: 1 },
  { id: 'clothespin', name: 'Clothespin Pistol', blurb: 'Hot-glued. Trigger action. Surprisingly accurate.', damage: 7, burst: 1, noise: 1.4, reload: 0.2, price: 80, stage: 1 },
  { id: 'repeater', name: 'Binder-Clip Repeater', blurb: 'Three bands per trigger pull. Dave designed it on a napkin.', damage: 7, burst: 3, noise: 3.0, reload: 0.3, price: 350, stage: 2, needsEngineer: true },
];

// ---------------------------------------------------------------- targets

export interface Target {
  id: string;
  stage: 1 | 2;
  name: string; // on the nameplate
  title: string; // second line of the nameplate
  position: string; // what they're hiding behind right now
  resolve: number;
  regenPct: number; // share of max Resolve recovered per second after 4 s without a hit
  desks: number; // desks captured when they surrender
  damageMult?: number; // e.g. Gary's desk fan deflects shots
  twist?: string; // shown under the Resolve bar
  intro: { from: string; subject: string; body: string };
  defeat: { from: string; subject: string; body: string };
}

export const TARGETS: Target[] = [
  {
    id: 'gary1', stage: 1, name: 'Gary Lindqvist', title: 'Account Coordinator', position: 'Exposed',
    resolve: 15, regenPct: 0.02, desks: 0,
    intro: { from: 'Gary', subject: '(no subject)', body: 'oops' },
    defeat: { from: 'Gary', subject: '(no subject)', body: 'Gary has retreated behind his monitor. Gary will remember this.' },
  },
  {
    id: 'gary2', stage: 1, name: 'Gary Lindqvist', title: 'Account Coordinator', position: 'Behind his monitor',
    resolve: 80, regenPct: 0.02, desks: 0,
    intro: { from: 'Gary', subject: 'Re: (no subject)', body: 'I have a 27-inch monitor. You will not get through.' },
    defeat: { from: 'Gary', subject: 'Re: Re: (no subject)', body: 'Fine. Phase two.' },
  },
  {
    id: 'gary3', stage: 1, name: 'Gary Lindqvist', title: 'Account Coordinator', position: "Inside a Post-it fort",
    resolve: 400, regenPct: 0.02, desks: 0,
    intro: { from: 'All-Staff', subject: 'Post-it shortage', body: 'The 4th floor is out of Post-its. If you know why, please tell Facilities.' },
    defeat: { from: 'Gary', subject: 'my fort', body: 'That was three days of work.' },
  },
  {
    id: 'gary4', stage: 1, name: 'Gary Lindqvist', title: 'Account Coordinator', position: 'Behind a desk fan',
    resolve: 1600, regenPct: 0.02, desks: 1, damageMult: 0.75, twist: 'The desk fan deflects a quarter of every shot.',
    intro: { from: 'Gary', subject: 'Fan', body: 'It is a 3-speed oscillating fan and it is on high.' },
    defeat: { from: 'Gary', subject: 'Truce', body: 'Okay. You win. Honestly, I could use an ally. Brad from Sales has been flicking at both of us for years.' },
  },
  {
    id: 'brad', stage: 2, name: 'Brad Okafor', title: 'Senior Sales Executive', position: 'Leaning back, feet on the desk',
    resolve: 2500, regenPct: 0.015, desks: 1,
    intro: { from: 'Brad', subject: 'Heard about Gary', body: 'Cute. Sales has been doing this since before you were hired. Bring it.' },
    defeat: { from: 'Brad', subject: 'gg', body: 'Respect. I am still the top seller on this floor, for the record.' },
  },
  {
    id: 'printer', stage: 2, name: 'Janet & Ron', title: 'The Printer Corner', position: 'Behind a wall of toner boxes',
    resolve: 7000, regenPct: 0.015, desks: 2,
    intro: { from: 'Janet', subject: 'The printer is ours', body: 'Ron and I control the only color printer on this floor. Think carefully.' },
    defeat: { from: 'Ron', subject: 'PC LOAD LETTER', body: 'We surrender the printer. Nobody knows how to fix it anyway.' },
  },
  {
    id: 'taskforce', stage: 2, name: 'The Q3 Task Force', title: 'Strategic Initiatives', position: 'Barricaded in a pod of three desks',
    resolve: 18000, regenPct: 0.015, desks: 3,
    intro: { from: 'Q3 Task Force', subject: 'Meeting invite: Defending the Pod', body: 'Recurring, daily, 9:00 AM. Attendance is mandatory.' },
    defeat: { from: 'Q3 Task Force', subject: 'Canceled: Defending the Pod', body: 'This meeting has been canceled. The task force has been reorganized under you.' },
  },
  {
    id: 'rick', stage: 2, name: 'Rick Dunham', title: 'Team Lead', position: 'In his glass office',
    resolve: 50000, regenPct: 0.015, desks: 2, twist: 'Rick schedules a performance review every 30 s (+4 Suspicion).',
    intro: { from: 'Rick', subject: 'My door is always open', body: 'Metaphorically. The actual door is locked and I have a lot of rubber bands.' },
    defeat: { from: 'Rick', subject: 'Out of office', body: 'I am out of the office indefinitely. Please direct all questions to whoever is in charge now. Apparently that is you.' },
  },
];

// ---------------------------------------------------------------- coworkers

export type CoworkerId = 'gary' | 'kevin' | 'marjorie' | 'steve' | 'linda' | 'dave';

export interface Coworker {
  id: CoworkerId;
  name: string;
  who: string;
  trait: string;
  traitRole: Role;
  mult: number;
  cost: number;
  unlockAfter: string | 'stage2'; // target id, or stage start
  joinEmail: string;
}

export const COWORKERS: Coworker[] = [
  { id: 'gary', name: 'Gary', who: 'Your desk neighbor', trait: 'Holds a Grudge', traitRole: 'shooter', mult: 1.5, cost: 0, unlockAfter: 'gary4', joinEmail: 'I am in. Point me at Brad.' },
  { id: 'kevin', name: 'Kevin', who: 'The unpaid intern', trait: 'Eager', traitRole: 'gatherer', mult: 1.5, cost: 30, unlockAfter: 'stage2', joinEmail: 'omg yes. do I get a title' },
  { id: 'marjorie', name: 'Marjorie', who: '31 years at the company', trait: 'Sees Everything', traitRole: 'lookout', mult: 2, cost: 80, unlockAfter: 'stage2', joinEmail: 'I will keep an eye out, dear. I always do.' },
  { id: 'steve', name: 'Steve', who: 'Always on a call', trait: 'Very Loud Calls', traitRole: 'cover', mult: 2, cost: 150, unlockAfter: 'brad', joinEmail: 'Sorry, can you hear me? I am in. Going on mute.' },
  { id: 'linda', name: 'Linda', who: 'Senior Associate', trait: 'Dead Eye', traitRole: 'shooter', mult: 2, cost: 250, unlockAfter: 'brad', joinEmail: 'I was regional darts champion in 2009. I do not miss.' },
  { id: 'dave', name: 'Dave', who: 'IT, "temporarily" in your row since 2019', trait: 'Tinkerer', traitRole: 'engineer', mult: 2, cost: 400, unlockAfter: 'printer', joinEmail: 'Have you tried turning the war off and on again? Kidding. I have drawings.' },
];

// ---------------------------------------------------------------- requisitions

export type UpgradeId =
  | 'rummage' | 'organizer' | 'autoreply' | 'chair' | 'silent' | 'riser'
  | 'bulk' | 'closet' | 'training' | 'carpet' | 'macros' | 'walls' | 'calendar';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  effect: string;
  price: number;
  stage: number;
  unlockAfter?: string; // target id
}

export const UPGRADES: Upgrade[] = [
  { id: 'rummage', name: 'Rummage Deeper', effect: 'Scrounging finds 2 bands instead of 1.', price: 10, stage: 1 },
  { id: 'organizer', name: 'Drawer Organizer', effect: '+0.4 bands/s, automatically.', price: 20, stage: 1 },
  { id: 'autoreply', name: 'Email Auto-Reply', effect: 'Answers emails that wait 20 s (half pay), plus $0.40/s.', price: 35, stage: 1 },
  { id: 'chair', name: 'Ergonomic Chair', effect: 'Work tasks and spreadsheet fixes pay double.', price: 50, stage: 1 },
  { id: 'silent', name: 'Silent Flick Technique', effect: 'Your shots make 25% less noise.', price: 60, stage: 1 },
  { id: 'riser', name: 'Monitor Riser', effect: 'See over the cubicle: +1 s walk-by warning.', price: 90, stage: 1 },
  { id: 'bulk', name: 'Bulk Ordering', effect: 'Supply orders become $12 for 200 bands.', price: 150, stage: 2 },
  { id: 'closet', name: 'Supply Closet Key', effect: '+1.5 bands/s.', price: 250, stage: 2, unlockAfter: 'brad' },
  { id: 'training', name: 'Shooter Training', effect: 'Allies fire 30% faster.', price: 300, stage: 2 },
  { id: 'carpet', name: 'Carpet Tiles', effect: 'All shots make 15% less noise.', price: 400, stage: 2 },
  { id: 'macros', name: 'Spreadsheet Macros', effect: 'Look Busy pays ×3 instead of ×2.', price: 600, stage: 2, unlockAfter: 'printer' },
  { id: 'walls', name: 'Cubicle Wall Extensions', effect: 'All shots make 20% less noise.', price: 900, stage: 2, unlockAfter: 'printer' },
  { id: 'calendar', name: 'Fake Calendar Invites', effect: 'Mr. Feeney walks by 30% less often.', price: 1200, stage: 2, unlockAfter: 'taskforce' },
];

// ---------------------------------------------------------------- tuning constants

export const TUNING = {
  startBands: 10,
  stepSeconds: 0.1,
  noisePerShot: 0.5,
  recoverDelay: 4, // seconds without a hit before a target recovers
  baseCool: 0.5, // Suspicion/s always
  idleCool: 0.6, // extra Suspicion/s after 3 s with no shots
  idleCoolDelay: 3,
  lookBusyCool: 3,
  coverCool: 0.3,
  coverPay: 0.5,
  gathererRate: 0.5,
  deskRate: 0.25,
  organizerRate: 0.4,
  closetRate: 1.5,
  autoReplyPay: 0.4,
  allyInterval: 2,
  lookoutCutEach: 0.12,
  lookoutCutMax: 0.6,
  lookoutWarnEach: 0.75,
  warnBase: 3,
  warnMax: 6,
  engineerCutEach: 0.1,
  engineerCutMax: 0.4,
  captureNoise: 8,
  recruitNoise: 5,
  orderNoise: 2,
  reviewNoise: 4,
  reviewEvery: 30,
  firstWalkby: 180,
  walkbyMin: 75,
  walkbyMax: 150,
  hideReward: 10, // Suspicion removed
  caughtOpen: 20,
  caughtFiring: 35,
  caughtBandLoss: 0.4,
  caughtFlickLock: 30,
  caughtShooterLock: 45,
  caughtResetTo: 35,
  // Your HR file: each time you're caught you get a write-up. One fades after a stretch
  // without being caught. At three you're on Final Warning; caught again, you're fired.
  writeUpsToFinal: 3,
  writeUpFade: 600,
  confiscateSeconds: 180, // your equipped weapon sits in Mr. Feeney's drawer
  buyBackShare: 0.5, // Lost and Found charges this share of the weapon's price
  buyBackMin: 10,
  regroupShare: 0.2, // the target rebuilds this share of its Resolve while you're in the meeting
  finalWarningWalkbyMult: 0.7, // Mr. Feeney walks by more often
  firedBands: 20, // what's left in your drawer when you come back
  garyFlickMin: 15,
  garyFlickMax: 25,
  garyFlickBands: 2,
  offlineCapSeconds: 2 * 60 * 60,
};

/** Coworkers get promoted for time served on your team: each rank boosts their role. */
export const PROMOTION = {
  after: [480, 1500], // seconds on the team to reach Senior, then Lead
  bonus: [1, 1.2, 1.4],
  titles: ['', 'Senior', 'Lead'],
};

/** Hold Flick to stretch the band: more damage from the same band, a bit more noise. */
export const CHARGE = {
  deadZone: 0.12, // a tap shorter than this is a normal flick
  fullAfter: 0.9, // seconds of holding (after the dead zone) to reach full stretch
  perfectWindow: 0.35, // seconds at full stretch where a release counts as Perfect
  snapAfter: 1.7, // total seconds of holding before the band snaps on you
  maxMult: 5, // damage multiplier at full stretch
  perfectMult: 6, // damage multiplier for a Perfect release
  noisePerCharge: 0.6, // a full stretch makes 1.6x the noise of a tap
  snapNoise: 3,
};

export function chargeMult(charge: number, perfect: boolean) {
  if (perfect) return CHARGE.perfectMult;
  return 1 + (CHARGE.maxMult - 1) * Math.min(1, Math.max(0, charge));
}

// ---------------------------------------------------------------- flavor

export const CHATTER: { from: string; subject: string; body: string }[] = [
  { from: 'All-Staff', subject: 'Stapler', body: 'Whoever took the stapler from the 3rd floor kitchen: we know.' },
  { from: 'Facilities', subject: 'Fridge cleanout Friday', body: 'Anything unlabeled will be thrown away. This includes the yogurt from March.' },
  { from: 'All-Staff', subject: 'Cake in the break room', body: 'For Diane’s birthday. Update: the cake is gone. Happy birthday, Diane.' },
  { from: 'IT', subject: 'Password expiry', body: 'Your password expires in 3 days. It must not match any of your last 24 passwords.' },
  { from: 'HR', subject: 'Wellness Wednesday', body: 'This week’s theme is posture. Please sit up. Thank you.' },
  { from: 'All-Staff', subject: 'Reply-all', body: 'Please remove me from this list.' },
  { from: 'All-Staff', subject: 'Re: Reply-all', body: 'Please remove me from this list too.' },
  { from: 'Facilities', subject: 'Thermostat', body: 'The thermostat is not broken. It is set to a temperature that is fair to everyone.' },
  { from: 'Mr. Feeney', subject: 'Synergy', body: 'Great energy on the floor lately. Keep it up, team.' },
  { from: 'IT', subject: 'Phishing test', body: 'Congratulations to the 41% of you who did not click the link.' },
  { from: 'All-Staff', subject: 'Parking', body: 'The silver sedan in spot 14 has its lights on. It has had its lights on since Tuesday.' },
  { from: 'Procurement', subject: 'Unusual orders', body: 'Our rubber band spend is up 900% this quarter. Probably a data error.' },
];

// ---------------------------------------------------------------- the Boss Key spreadsheet

export type SheetTabId = 'forecast' | 'budget' | 'headcount';

export interface SheetColumn {
  name: string;
  /** input cells can be flagged and fixed; derived cells are formulas of the inputs. */
  kind: 'input' | 'derived';
}

export interface SheetTab {
  id: SheetTabId;
  name: string; // shown on the sheet tab
  file: string; // shown in the title bar
  payMult: number;
  unlock: { stage?: number; after?: string };
  rows: string[];
  columns: SheetColumn[];
}

export const SHEET_TABS: SheetTab[] = [
  {
    id: 'forecast',
    name: 'Q3 Forecast',
    file: 'Q3_Synergy_Forecast_FINAL_v7.xlsx',
    payMult: 1,
    unlock: {},
    rows: ['North', 'South', 'East', 'West', 'Central', 'EMEA', 'APAC', 'LATAM', 'Online', 'Partners', 'Channel', 'Strategic'],
    columns: [
      { name: 'Q1', kind: 'input' },
      { name: 'Q2', kind: 'input' },
      { name: 'Q3', kind: 'input' },
      { name: 'Q4 (fcst)', kind: 'input' },
      { name: 'YoY %', kind: 'derived' },
      { name: 'Variance', kind: 'derived' },
      { name: 'Synergy idx', kind: 'input' },
    ],
  },
  {
    id: 'budget',
    name: 'Budget',
    file: 'Dept_Budget_FY_DRAFT_do_not_edit.xlsx',
    payMult: 1.5,
    unlock: { stage: 2 },
    rows: ['Office supplies', 'Rubber bands (misc.)', 'Coffee', 'Printer toner', 'Software', 'Travel', 'Training', 'Team building', 'Furniture', 'Snacks'],
    columns: [
      { name: 'Budget $', kind: 'input' },
      { name: 'Actual $', kind: 'input' },
      { name: 'Remaining $', kind: 'derived' },
      { name: '% used', kind: 'derived' },
    ],
  },
  {
    id: 'headcount',
    name: 'Headcount',
    file: 'Headcount_Plan_CONFIDENTIAL.xlsx',
    payMult: 2,
    unlock: { after: 'printer' },
    rows: ['Sales', 'Accounting', 'IT', 'Marketing', 'Mailroom', 'Facilities', 'HR', 'Strategic Initiatives', 'Customer Success'],
    columns: [
      { name: 'Headcount', kind: 'input' },
      { name: 'Open roles', kind: 'input' },
      { name: 'Attrition %', kind: 'input' },
      { name: 'Avg tenure (yrs)', kind: 'input' },
      { name: 'Morale (1–10)', kind: 'input' },
    ],
  },
];

export const SHEET_TUNING = {
  maxFlags: 3,
  spawnEvery: 1.1, // seconds between new flags while hidden
  lifetimeStart: 5, // seconds a flag lasts when you first hide
  lifetimeMin: 1.8,
  lifetimeShrink: 0.05, // per second spent hidden
  streakBonus: 0.2, // +20% pay per streak step
  streakCap: 10,
  fatigueAfter: 40, // seconds hidden before fixes start paying less
  fatigueFloor: 0.3,
  fatigueRate: 0.012, // pay multiplier lost per second after fatigueAfter
  fixCool: 2, // Suspicion removed per fix
  hustleWindow: 2.5, // seconds after a walk-by passes where fixes pay double
};
