// All tunable game content lives here as data. Balancing FLICK should mostly
// mean editing numbers in this file, not changing code.

export type Role = 'shooter' | 'gatherer' | 'lookout' | 'cover' | 'engineer';

export const ROLES: { id: Role; name: string; effect: string }[] = [
  { id: 'shooter', name: 'Shooter', effect: 'Fires your best weapon every 2 s' },
  { id: 'gatherer', name: 'Gatherer', effect: '+0.5 bands/s' },
  { id: 'lookout', name: 'Lookout', effect: '−12% Suspicion gain, +0.75 s warning' },
  { id: 'cover', name: 'Cover', effect: 'Does real work: +$0.50/s, −0.3 Suspicion/s' },
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
  { id: 'clothespin', name: 'Clothespin Pistol', blurb: 'Hot-glued. Trigger action. Surprisingly accurate.', damage: 7, burst: 1, noise: 1.4, reload: 0.2, price: 100, stage: 1 },
  { id: 'repeater', name: 'Binder-Clip Repeater', blurb: 'Three bands per trigger pull. Dave designed it on a napkin.', damage: 7, burst: 3, noise: 3.0, reload: 0.3, price: 420, stage: 2, needsEngineer: true },
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
  bounty: number; // Salary you find when they surrender
  bountyNote: string; // where that money came from
  intro: { from: string; subject: string; body: string };
  defeat: { from: string; subject: string; body: string };
}

export const TARGETS: Target[] = [
  {
    id: 'gary1', stage: 1, name: 'Gary Lindqvist', title: 'Account Coordinator', position: 'Exposed',
    resolve: 15, regenPct: 0.02, desks: 0, bounty: 10, bountyNote: 'Gary’s lunch money',
    intro: { from: 'Gary', subject: '(no subject)', body: 'oops' },
    defeat: { from: 'Gary', subject: '(no subject)', body: 'Gary has retreated behind his monitor. Gary will remember this.' },
  },
  {
    id: 'gary2', stage: 1, name: 'Gary Lindqvist', title: 'Account Coordinator', position: 'Behind his monitor',
    resolve: 80, regenPct: 0.02, desks: 0, bounty: 20, bountyNote: 'Gary’s jar of quarters',
    intro: { from: 'Gary', subject: 'Re: (no subject)', body: 'I have a 27-inch monitor. You will not get through.' },
    defeat: { from: 'Gary', subject: 'Re: Re: (no subject)', body: 'Fine. Phase two.' },
  },
  {
    id: 'gary3', stage: 1, name: 'Gary Lindqvist', title: 'Account Coordinator', position: "Inside a Post-it fort",
    resolve: 400, regenPct: 0.02, desks: 0, bounty: 45, bountyNote: 'Gary’s Post-it budget',
    intro: { from: 'All-Staff', subject: 'Post-it shortage', body: 'The 4th floor is out of Post-its. If you know why, please tell Facilities.' },
    defeat: { from: 'Gary', subject: 'my fort', body: 'That was three days of work.' },
  },
  {
    id: 'gary4', stage: 1, name: 'Gary Lindqvist', title: 'Account Coordinator', position: 'Behind a desk fan',
    resolve: 1600, regenPct: 0.02, desks: 1, damageMult: 0.75, bounty: 90, bountyNote: 'Gary’s savings, taped under his desk', twist: 'The desk fan deflects a quarter of every shot.',
    intro: { from: 'Gary', subject: 'Fan', body: 'It is a 3-speed oscillating fan and it is on high.' },
    defeat: { from: 'Gary', subject: 'Truce', body: 'Okay. You win. Honestly, I could use an ally. Brad from Sales has been flicking at both of us for years.' },
  },
  {
    id: 'brad', stage: 2, name: 'Brad Okafor', title: 'Senior Sales Executive', position: 'Leaning back, feet on the desk',
    resolve: 2500, regenPct: 0.015, desks: 1, bounty: 180, bountyNote: 'Brad’s commission check',
    intro: { from: 'Brad', subject: 'Heard about Gary', body: 'Cute. Sales has been doing this since before you were hired. Bring it.' },
    defeat: { from: 'Brad', subject: 'gg', body: 'Respect. I am still the top seller on this floor, for the record.' },
  },
  {
    id: 'printer', stage: 2, name: 'Janet & Ron', title: 'The Printer Corner', position: 'Behind a wall of toner boxes',
    resolve: 7000, regenPct: 0.015, desks: 2, bounty: 350, bountyNote: 'the printer’s petty cash',
    intro: { from: 'Janet', subject: 'The printer is ours', body: 'Ron and I control the only color printer on this floor. Think carefully.' },
    defeat: { from: 'Ron', subject: 'PC LOAD LETTER', body: 'We surrender the printer. Nobody knows how to fix it anyway.' },
  },
  {
    id: 'taskforce', stage: 2, name: 'The Q3 Task Force', title: 'Strategic Initiatives', position: 'Barricaded in a pod of three desks',
    resolve: 18000, regenPct: 0.015, desks: 3, bounty: 600, bountyNote: 'the Task Force’s offsite budget',
    intro: { from: 'Q3 Task Force', subject: 'Meeting invite: Defending the Pod', body: 'Recurring, daily, 9:00 AM. Attendance is mandatory.' },
    defeat: { from: 'Q3 Task Force', subject: 'Canceled: Defending the Pod', body: 'This meeting has been canceled. The task force has been reorganized under you.' },
  },
  {
    id: 'rick', stage: 2, name: 'Rick Dunham', title: 'Team Lead', position: 'In his glass office',
    resolve: 50000, regenPct: 0.015, desks: 2, bounty: 1500, bountyNote: 'Rick’s discretionary fund', twist: 'Rick schedules a performance review every 30 s (+4 Suspicion).',
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
  { id: 'kevin', name: 'Kevin', who: 'The unpaid intern', trait: 'Eager', traitRole: 'gatherer', mult: 1.5, cost: 35, unlockAfter: 'stage2', joinEmail: 'omg yes. do I get a title' },
  { id: 'marjorie', name: 'Marjorie', who: '31 years at the company', trait: 'Sees Everything', traitRole: 'lookout', mult: 2, cost: 95, unlockAfter: 'stage2', joinEmail: 'I will keep an eye out, dear. I always do.' },
  { id: 'steve', name: 'Steve', who: 'Always on a call', trait: 'Very Loud Calls', traitRole: 'cover', mult: 2, cost: 180, unlockAfter: 'brad', joinEmail: 'Sorry, can you hear me? I am in. Going on mute.' },
  { id: 'linda', name: 'Linda', who: 'Senior Associate', trait: 'Dead Eye', traitRole: 'shooter', mult: 2, cost: 300, unlockAfter: 'brad', joinEmail: 'I was regional darts champion in 2009. I do not miss.' },
  { id: 'dave', name: 'Dave', who: 'IT, "temporarily" in your row since 2019', trait: 'Tinkerer', traitRole: 'engineer', mult: 2, cost: 480, unlockAfter: 'printer', joinEmail: 'Have you tried turning the war off and on again? Kidding. I have drawings.' },
];

// ---------------------------------------------------------------- requisitions

export type UpgradeId =
  | 'rummage' | 'organizer' | 'autoreply' | 'chair' | 'silent' | 'riser'
  | 'bulk' | 'closet' | 'training' | 'carpet' | 'macros' | 'walls' | 'calendar'
  | 'waxed' | 'thick';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  effect: string;
  price: number;
  stage: number;
  unlockAfter?: string; // target id
  /** Who sells it: Procurement (on your computer) by default, or Dale's black market in the supply closet. */
  seller?: 'dale';
}

export const UPGRADES: Upgrade[] = [
  { id: 'rummage', name: 'Rummage Deeper', effect: 'Grab 2 bands at a time, and twice as many turn up in your drawer.', price: 10, stage: 1, seller: 'dale' },
  { id: 'organizer', name: 'Drawer Organizer', effect: '+0.4 bands/s, automatically.', price: 25, stage: 1 },
  { id: 'autoreply', name: 'Email Auto-Reply', effect: 'Answers emails that wait 20 s (half pay), plus $0.40/s.', price: 45, stage: 1 },
  { id: 'chair', name: 'Ergonomic Chair', effect: 'Work tasks and spreadsheet fixes pay double.', price: 65, stage: 1 },
  { id: 'waxed', name: 'Waxed Bands', effect: 'Your bands stretch further before they snap, and the Perfect window is longer.', price: 45, stage: 1, seller: 'dale' },
  { id: 'silent', name: 'Silent Flick Technique', effect: 'Your shots make 25% less noise.', price: 75, stage: 1, seller: 'dale' },
  { id: 'riser', name: 'Monitor Riser', effect: 'See over the cubicle: +1 s walk-by warning.', price: 110, stage: 1 },
  { id: 'bulk', name: 'Bulk Ordering', effect: 'Supply orders become $12 for 200 bands.', price: 180, stage: 2 },
  { id: 'closet', name: 'Supply Closet Key', effect: 'A copy of Dale’s key: +1.5 bands/s.', price: 300, stage: 2, unlockAfter: 'brad', seller: 'dale' },
  { id: 'training', name: 'Shooter Training', effect: 'Your Shooters fire 30% faster.', price: 360, stage: 2, seller: 'dale' },
  { id: 'thick', name: 'Double-Thick Bands', effect: 'Every band hits 25% harder, yours and your Shooters’.', price: 850, stage: 2, unlockAfter: 'printer', seller: 'dale' },
  { id: 'carpet', name: 'Carpet Tiles', effect: 'All shots make 15% less noise.', price: 480, stage: 2 },
  { id: 'macros', name: 'Spreadsheet Macros', effect: 'Passive Salary pays ×3 while you’re at your computer, instead of ×2.', price: 720, stage: 2, unlockAfter: 'printer' },
  { id: 'walls', name: 'Cubicle Wall Extensions', effect: 'All shots make 20% less noise.', price: 1100, stage: 2, unlockAfter: 'printer' },
  { id: 'calendar', name: 'Fake Calendar Invites', effect: 'Mr. Feeney walks by 30% less often.', price: 1450, stage: 2, unlockAfter: 'taskforce', seller: 'dale' },
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
  computerAllySlow: 2, // allies fire this many times slower while you're at your computer
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
  offlineCapSeconds: 8 * 60 * 60,
};

/** Coworkers get promoted for time served on your team: each rank boosts their role. */
export const PROMOTION = {
  after: [480, 1500], // seconds on the team to reach Senior, then Lead
  bonus: [1, 1.2, 1.4],
  titles: ['', 'Senior', 'Lead'],
};

/**
 * Your career. You climb it with Performance: things done right at your computer (and,
 * a little, your team's work). When the bar fills, Mr. Feeney calls you in for a review
 * and you're promoted: work pays more, and some ranks let you hire a new team.
 */
export const PAY_GRADES = [
  { title: 'Junior Associate', mult: 1 },
  { title: 'Associate', mult: 1.15 },
  { title: 'Associate II', mult: 1.3 },
  { title: 'Senior Associate', mult: 1.5 },
  { title: 'Specialist', mult: 1.8 },
  { title: 'Senior Specialist', mult: 2.2 },
  { title: 'Coordinator', mult: 2.7 },
  { title: 'Lead Coordinator', mult: 3.3 },
  { title: 'Floor Manager', mult: 4 },
  { title: 'Department Head', mult: 5 },
  { title: 'Director', mult: 6.5 },
  { title: 'Senior Director', mult: 8.5 },
  { title: 'Vice President', mult: 11 },
  { title: 'Senior Vice President', mult: 14 },
  { title: 'Chief Operating Officer', mult: 18 },
  { title: 'CEO', mult: 25 },
];

export const CAREER = {
  first: 10, // Performance for your first promotion
  growth: 1.82, // each promotion after that needs this much more
  itemPoints: 1, // per thing you do right (times your pay grade's multiplier: seniors' work counts more)
  gradePoints: { A: 2, B: 1, C: 0, D: 0, F: 0 } as Record<'A' | 'B' | 'C' | 'D' | 'F', number>,
  teamPoints: 0.012, // per thing your team does, times that thing's base pay
};

// ---------------------------------------------------------------- your team

export type TeamId = 'temp' | 'receptionist' | 'bookkeeper' | 'analyst' | 'manager';

/**
 * People who work for you, once you're senior enough to hire them. Each team starts with
 * its lead (a named hire) and grows a seat at a time; training multiplies the whole team.
 * They do your kind of work at half your pay, all the time, even while the game is closed.
 */
export interface Team {
  id: TeamId;
  lead: string; // the first hire, who runs the team (their first name)
  surname?: string;
  title: string;
  portrait: string; // PORTRAITS id
  pet?: 'muffins' | 'joey'; // the pet the lead brings to work
  job: 'mail' | 'call' | 'expense' | 'sheet' | null; // null: the Assistant Manager boosts the others
  does: string; // "emails" / "calls"...
  perMin: number; // things one seat gets done per minute
  unlockRank: number; // the PAY_GRADES index that lets you hire them
  cost: number; // the first seat
  growth: number; // each seat after that costs this much more
  pitch: string; // a line from the lead when you look at them
}

export const TEAMS: Team[] = [
  { id: 'temp', lead: 'Adam', surname: 'Pierce', title: 'Temp', portrait: 'friendA', pet: 'muffins', job: 'mail', does: 'emails', perMin: 4, unlockRank: 1, cost: 150, growth: 1.3, pitch: 'The agency said it’s “mostly email.” Can my cat come?' },
  { id: 'receptionist', lead: 'Danielle', surname: 'Hayes', title: 'Receptionist', portrait: 'friendB', pet: 'joey', job: 'call', does: 'calls', perMin: 2, unlockRank: 3, cost: 600, growth: 1.3, pitch: 'Good morning, how may I direct your call? (Joey, sit.)' },
  { id: 'bookkeeper', lead: 'Harold', title: 'Bookkeeper', portrait: 'bookkeeper', job: 'expense', does: 'receipts', perMin: 20, unlockRank: 5, cost: 2400, growth: 1.3, pitch: 'Forty years of receipts. I have seen things.' },
  { id: 'analyst', lead: 'Priya', title: 'Analyst', portrait: 'analyst', job: 'sheet', does: 'typos', perMin: 14, unlockRank: 7, cost: 9000, growth: 1.3, pitch: 'Your printout has a typo in row 3. Also, hi.' },
  { id: 'manager', lead: 'Chad', title: 'Assistant Manager', portrait: 'manager', job: null, does: '', perMin: 0, unlockRank: 9, cost: 40000, growth: 1.5, pitch: 'Let’s circle back and 10x this team.' },
];

export const STAFF = {
  quality: 0.35, // your team earns this share of what you'd earn for the same thing
  /** Headcount budget: one seat when a team unlocks, and one more with every promotion after. */
  seatsPerRank: 1,
  managerBoost: 0.1, // each Assistant Manager seat: every other team works this much faster
  /** Training: each level makes a team half again as productive. Costs grow fast. */
  training: ['Lunch-and-learn', 'Certification course', 'Offsite retreat', 'Executive coaching', 'Six Sigma black belt'],
  trainBoost: 1.5,
  trainCost: 20, // the first level costs this many first seats
  trainGrowth: 8,
  payEvery: 15, // seconds between "your team made $X" coin drops
  /** Leading by example: while your work combo is going, your team works faster (+10% a link, up to ×2). */
  leadPerCombo: 0.1,
  leadCap: 10,
};

// ---------------------------------------------------------------- the office: Bailey, moments and goals

/** Bailey, your beagle, asleep in her bed by your desk. */
export type TrickId = 'fetch' | 'guard' | 'playdead' | 'howl';

export const BAILEY = {
  warn: 1, // extra seconds of walk-by warning: she hears Mr. Feeney's shoes first
  petCalm: 3, // Suspicion off when you scratch her ears
  petEvery: 20, // seconds before another scratch calms you again
  /**
   * Bailey learns tricks from ear scratches (one counts every few seconds, so tapping
   * away doesn't rush her). Each trick is a little perk for good.
   */
  scratchEvery: 6,
  tricks: [
    { id: 'fetch', name: 'Fetch', at: 5, perk: 'she brings you stray bands (+0.3 bands a second)' },
    { id: 'guard', name: 'Guard', at: 20, perk: 'she hears Mr. Feeney a second sooner' },
    { id: 'playdead', name: 'Play Dead', at: 50, perk: 'when you’re caught, she plays dead and Mr. Feeney only takes half as many bands' },
    { id: 'howl', name: 'Howl', at: 100, perk: 'when Mr. Feeney’s coming, tap her: she howls and he turns around to check on her (once every 5 minutes)' },
  ] as { id: TrickId; name: string; at: number; perk: string }[],
  fetchRate: 0.3, // bands a second
  playDeadLoss: 0.5, // of the bands you'd lose when caught
  howlEvery: 300, // seconds
  howlDelay: 90, // seconds until Mr. Feeney tries again
};

export type MomentKind = 'pizza' | 'ball' | 'vending' | 'bonus' | 'coffee' | 'bailey' | 'muffins' | 'joey';

/**
 * Office moments: now and then something good happens for a few seconds, and you grab it
 * with a tap. Never anything bad, and nothing you lose by being away.
 */
export const MOMENTS = {
  first: 150, // seconds into a new game
  gap: [150, 270] as [number, number],
  seconds: 15, // how long one stays up
  pizzaSeconds: 60,
  pizzaTeam: 2, // your team works this much faster
  pizzaWork: 1.5, // and your work pays this much more
  coffeeSeconds: 45, // your work pays double (like Mr. Feeney watching)
  vendingCalm: 30,
  joeyDelay: 150, // Mr. Feeney's next walk-by, pushed back (he's playing fetch)
  joeyCalm: 15,
  muffinsShare: 0.2, // of the target's Resolve, knocked off their desk
  bandsSeconds: 60, // a found ball is worth this much of your band income (at least 30)
  bonusMinutes: 3, // a spot bonus is worth this much of your team's pay (at least $25 × your pay grade)
};

/**
 * Your rubber band ball: spare bands wound onto a ball on your desk. It grows through
 * four sizes and each one is a permanent perk. `at` is how many bands are wound on.
 */
export const BALL = {
  unlockTarget: 2, // it turns up once the second Gary gives in
  windShare: 0.25, // one tap winds on this share of your loose bands
  windMin: 10,
  sizes: [
    { name: 'Golf ball', at: 250, perk: 'Suspicion cools 25% faster', why: 'You squeeze it instead of flicking.' },
    { name: 'Softball', at: 2500, perk: 'Barrages throw twice as many bands', why: 'You know where every loose band in the office is.' },
    { name: 'Basketball', at: 25000, perk: 'Your team works 20% faster', why: 'People come by to look at it. Then they get back to work.' },
    { name: 'The Monster', at: 150000, perk: 'Everything you earn +25%', why: 'It ate a stapler. Mr. Feeney won’t come near it.' },
  ],
  cool: 1.25,
  team: 1.2,
  pay: 1.25,
};

/**
 * Barrage: you and your Shooters empty your pockets at once. One huge volley from a pile
 * of loose bands (each hits like a light stretch), on a cooldown, and loud.
 */
export const BARRAGE = {
  perPerson: 100, // bands thrown, for you and each Shooter
  min: 50, // you need at least this many bands
  power: 1, // each band hits like a quick flick (a full stretch is ×5)
  noise: 10, // Suspicion, plus a little per band
  noisePerBand: 0.04,
  cooldown: 90,
};

/**
 * Rematches: once the department is yours, nobody here can let it go. The people you
 * beat come back one after another, a little tougher every round and worth more: a
 * bounty (at least a few minutes of your team's pay) and a bit of Performance.
 */
export const REMATCH = {
  order: ['gary4', 'brad', 'printer', 'taskforce', 'rick'],
  first: 0.5, // round 1: they come back at half their old Resolve
  growth: 1.35, // and each round after that, this much tougher
  bountyMinutes: [1, 1.5, 2, 3, 6], // of your team's steady pay, if that beats the old bounty
  bountyGrowth: 0.5, // the old bounty, +50% a round (times your pay grade)
  review: [0.02, 0.02, 0.03, 0.04, 0.08], // share of your next promotion
  lines: {
    gary4: { intro: 'Gary wants a rematch. He bought a bigger fan.', defeat: 'Gary switches the fan off and sighs.', note: 'Gary’s new savings jar' },
    brad: { intro: 'Brad says last time was a fluke. Best of three.', defeat: 'Brad reframes the loss as a learning opportunity.', note: 'Brad’s bonus check' },
    printer: { intro: 'Janet and Ron have restocked the toner. All of it.', defeat: 'PC LOAD LETTER. The Printer Corner surrenders again.', note: 'the printer’s new petty cash' },
    taskforce: { intro: 'The Q3 Task Force has reconvened as the Q4 Task Force.', defeat: 'The Task Force tables the discussion until next quarter.', note: 'the Task Force’s new offsite budget' },
    rick: { intro: 'Rick is back from working from home. He looks rested.', defeat: 'Rick is working from home again. For now.', note: 'Rick’s new discretionary fund' },
  } as Record<string, { intro: string; defeat: string; note: string }>,
};

/** Mr. Feeney's sticky note on your monitor: three small goals every work day. */
export const GOALS = {
  perDay: 3,
  review: 0.06, // each one is worth this share of your next promotion
  cashMinutes: 2, // and this many minutes of your team's pay (at least $20)
};

/** Work combo: things done right back to back pay more. */
export const COMBO = {
  window: 15, // seconds you have to finish the next thing to keep it going
  step: 0.1, // +10% per link
  cap: 10, // links that count, so ×2 at most
};

/** Dale from Facilities: the black market in the supply closet. */
export const DALE = {
  introAt: 75, // seconds: he messages you about the closet
  firstDealAt: 270,
  dealGap: [240, 360] as [number, number], // seconds between "Psst" deals
  dealSeconds: 30,
  discount: [0.1, 0.15] as [number, number], // the most he ever takes off
  earlyMarkup: 1.3, // getting something before it unlocks costs extra
  waxedWindow: 0.55, // Perfect window with Waxed Bands (seconds)
  waxedSnap: 2.1, // seconds before a Waxed Band snaps
  thickDamage: 1.25,
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

// ---------------------------------------------------------------- the Spreadsheet app

export type SheetTabId = 'forecast' | 'budget' | 'headcount';

/**
 * How a number got mistyped into your copy of the sheet:
 *   wrong  a different number altogether (450 → 780)
 *   zero   a zero too many or too few (450 → 4,500 or 45)
 *   swap   two digits swapped (1,250 → 1,520)
 *   digit  one digit off (450 → 460)
 */
export type TypoKind = 'wrong' | 'zero' | 'swap' | 'digit';

/**
 * Accounting's printout next to your copy of the same sheet. Whoever typed your copy
 * made a few typos: spot the cells that don't match the printout and click them.
 */
export interface SheetTab {
  id: SheetTabId;
  name: string; // shown on the sheet tab
  file: string; // shown in the title bar
  payMult: number;
  unlock: { stage?: number; after?: string };
  rows: string[];
  /** The parts that add up to each row's Total. */
  parts: string[];
  /** Values are multiples of `step` between lo and hi. */
  lo: number;
  hi: number;
  step: number;
  /** Typos per sheet, the kinds they can be (sneakier on harder sheets), and seconds to find them. */
  typos: number;
  kinds: TypoKind[];
  seconds: number;
}

export const SHEET_TABS: SheetTab[] = [
  {
    id: 'forecast',
    name: 'Q3 Forecast',
    file: 'Q3_Synergy_Forecast_FINAL_v7.xlsx',
    payMult: 1,
    unlock: {},
    rows: ['North', 'South', 'East', 'West', 'Central', 'EMEA', 'APAC', 'LATAM'],
    parts: ['Q1', 'Q2', 'Q3'],
    lo: 100,
    hi: 600,
    step: 10,
    typos: 3,
    kinds: ['wrong', 'zero'],
    seconds: 45,
  },
  {
    id: 'budget',
    name: 'Budget',
    file: 'Dept_Budget_FY_DRAFT_do_not_edit.xlsx',
    payMult: 1.5,
    unlock: { stage: 2 },
    rows: ['Office supplies', 'Rubber bands (misc.)', 'Coffee', 'Printer toner', 'Software', 'Travel', 'Team building', 'Snacks'],
    parts: ['Jan', 'Feb', 'Mar', 'Apr'],
    lo: 50,
    hi: 400,
    step: 10,
    typos: 4,
    kinds: ['zero', 'swap', 'digit'],
    seconds: 60,
  },
  {
    id: 'headcount',
    name: 'Headcount',
    file: 'Headcount_Plan_CONFIDENTIAL.xlsx',
    payMult: 2,
    unlock: { after: 'printer' },
    rows: ['Sales', 'Accounting', 'IT', 'Marketing', 'Mailroom', 'Facilities', 'HR', 'Strategy'],
    parts: ['Full-time', 'Part-time', 'Contract', 'Interns'],
    lo: 2,
    hi: 60,
    step: 1,
    typos: 5,
    kinds: ['swap', 'digit'],
    seconds: 70,
  },
];
