// All tunable game content lives here as data. Balancing FLICK should mostly
// mean editing numbers in this file, not changing code.

export type Role = 'shooter' | 'gatherer' | 'lookout' | 'cover' | 'engineer' | 'guard';

export const ROLES: { id: Role; name: string; effect: string }[] = [
  { id: 'shooter', name: 'Shooter', effect: 'Fires your best weapon every 2 s' },
  { id: 'gatherer', name: 'Gatherer', effect: '+0.5 bands/s' },
  { id: 'lookout', name: 'Lookout', effect: '−12% Suspicion gain, +0.75 s warning' },
  { id: 'cover', name: 'Cover', effect: 'Does real work: +$0.50/s, −0.3 Suspicion/s' },
  { id: 'engineer', name: 'Engineer', effect: '−10% weapon and requisition prices; in Stage 4, takes filing-cabinet walls apart' },
  { id: 'guard', name: 'Guard', effect: 'Holds your desks: stops departments taking them back (Stage 4)' },
];

/** The roles you can give people right now (Guards come with Stage 4). */
export function rolesFor(stage: number) {
  return ROLES.filter((r) => r.id !== 'guard' || stage === 4);
}

// ---------------------------------------------------------------- weapons

export type WeaponId = 'flick' | 'ruler' | 'clothespin' | 'repeater' | 'gatling';

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
  /** A department you have to take first (its people have the parts). */
  needsDept?: DeptId;
}

export const WEAPONS: Weapon[] = [
  { id: 'flick', name: 'Finger Flick', blurb: 'The classic. Thumb, finger, regret.', damage: 1, burst: 1, noise: 1.0, reload: 0.1, price: 0, stage: 1 },
  { id: 'ruler', name: 'Ruler Launcher', blurb: 'A 12-inch ruler and a confident wrist.', damage: 3, burst: 1, noise: 1.2, reload: 0.1, price: 15, stage: 1 },
  { id: 'clothespin', name: 'Clothespin Pistol', blurb: 'Hot-glued. Trigger action. Surprisingly accurate.', damage: 7, burst: 1, noise: 1.4, reload: 0.2, price: 100, stage: 1 },
  { id: 'repeater', name: 'Binder-Clip Repeater', blurb: 'Three bands per trigger pull. Dave designed it on a napkin.', damage: 7, burst: 3, noise: 3.0, reload: 0.3, price: 420, stage: 2, needsEngineer: true },
  { id: 'gatling', name: 'Drill-Powered Gatling', blurb: 'IT’s cordless drill and a spool. Six bands a spin.', damage: 9, burst: 6, noise: 5.0, reload: 0.4, price: 15000, stage: 3, needsEngineer: true, needsDept: 'it' },
];

// ---------------------------------------------------------------- targets

export interface Target {
  id: string;
  stage: number; // 1 and 2: the first war; 3: the departments
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

// ---------------------------------------------------------------- Stage 3: the Department War

export type DeptId = 'it' | 'accounting' | 'mailroom' | 'marketing';

/**
 * The rest of the floor. Each department is run by a boss who fights from behind a
 * barricade of their department's junk. Take them in any order: each one you take gives
 * you something for good, and puts the others on alert (they get tougher).
 */
export interface Department extends Target {
  dept: DeptId;
  label: string; // the department's name on the map
  short: string; // how the boss is referred to ("Derek")
  perk: string; // what taking it gives you, completing "You get ..."
  prize: string; // the same, in a few words (the map, the welcome)
}

export const DEPARTMENTS: Department[] = [
  {
    id: 'it', dept: 'it', label: 'IT', short: 'Derek', stage: 3, name: 'Derek Voss', title: 'Systems Administrator', position: 'Behind a wall of old computers',
    resolve: 120000, regenPct: 0.008, desks: 4, bounty: 4000, bountyNote: 'IT’s “hardware budget”',
    twist: 'Firewall: every 45 s it goes up for 10 s and stops half of every shot. Barrages go straight through.',
    perk: 'the Drill-Powered Gatling, and supply orders that place and open themselves',
    prize: 'The Drill Gatling, and supplies that order themselves',
    intro: { from: 'Derek (IT)', subject: 'Ticket #4471: rubber bands', body: 'Your ticket has been received. Priority: low. Expected response time: never. IT does not surrender. IT closes tickets.' },
    defeat: { from: 'Derek (IT)', subject: 'Ticket #4471: resolved', body: 'Fine. Your workstation has admin rights now, and I wrote you a script that orders your supplies. Take the drill. Please stop unplugging my servers.' },
  },
  {
    id: 'accounting', dept: 'accounting', label: 'Accounting', short: 'Doris', stage: 3, name: 'Doris Kemper', title: 'Controller', position: 'Behind a fortress of ledgers',
    resolve: 140000, regenPct: 0.008, desks: 5, bounty: 6000, bountyNote: 'the petty cash Accounting swears doesn’t exist',
    twist: 'Doris only respects effort: quick taps hit for half. Stretch your shots.',
    perk: '25% more pay for everything you and your team do at work',
    prize: '+25% pay on all work',
    intro: { from: 'Doris Kemper', subject: 'Re: We have noticed', body: 'This is Doris Kemper, Controller. Your rubber band spend has been flagged. Accounting does not surrender. Accounting reconciles.' },
    defeat: { from: 'Doris Kemper', subject: 'Surrender (under protest)', body: 'Accounting has surrendered. We would like it noted that we are surrendering under protest. Your team’s pay has been adjusted upward. Do not make us regret it.' },
  },
  {
    id: 'mailroom', dept: 'mailroom', label: 'Mailroom', short: 'Tony', stage: 3, name: 'Big Tony', title: 'Mailroom Supervisor', position: 'On top of the band pile',
    resolve: 110000, regenPct: 0.008, desks: 3, bounty: 3500, bountyNote: 'Tony’s poker winnings',
    twist: 'Tony fires back every 20 s: a fistful of bands lands on your desk. Free ammo, but loud.',
    perk: '10 more bands a second, straight from the mailroom',
    prize: '+10 bands a second',
    intro: { from: 'Big Tony', subject: 'You got a package', body: 'Every rubber band in this building comes through my mailroom. Every one. Think about that.' },
    defeat: { from: 'Big Tony', subject: 'Return to sender', body: 'Alright. You got moxie, kid. The mailroom’s yours. I’ll have the bands sent up. All of ’em.' },
  },
  {
    id: 'marketing', dept: 'marketing', label: 'Marketing', short: 'Skyler', stage: 3, name: 'Skyler Brandt', title: 'Brand Lead', position: 'Behind the ring light',
    resolve: 130000, regenPct: 0.008, desks: 6, bounty: 5000, bountyNote: 'the swag budget',
    twist: 'Rebrand: the first time Skyler drops below half, she rebrands and gets a quarter of her Resolve back.',
    perk: 'hiring that costs 30% less (Marketing writes your job ads now)',
    prize: 'Hiring costs 30% less',
    intro: { from: 'Skyler (Marketing)', subject: 'Quick sync re: your campaign', body: 'Love the energy! Unfortunately Marketing owns the narrative. We’re going to win this war in the court of public opinion. And with rubber bands.' },
    defeat: { from: 'Skyler (Marketing)', subject: 'Exciting news!', body: 'Thrilled to announce that Marketing is joining your team! This is a merger, not a surrender. I’ve already made a deck.' },
  },
];

/** The Department War's rules and perks. */
export const WAR = {
  reinforce: 1.4, // every department you take makes the others this much tougher
  bountyMinutes: 10, // a department's bounty: at least this many minutes of your team's pay
  review: 0.12, // and this share of your next promotion
  firewall: { every: 45, up: 10, mult: 0.5 }, // IT
  tapBelow: 0.3, // Accounting: shots stretched less than this...
  tapMult: 0.5, // ...hit for this much
  tony: { every: 20, bands: 15, noise: 3 }, // the Mailroom fires back
  rebrandAt: 0.5, // Marketing rebrands below this share of Resolve...
  rebrandBack: 0.25, // ...and gets this share back
  mailroomRate: 10, // bands a second, once the Mailroom is yours
  accountingPay: 1.25,
  marketingHire: 0.7,
  autoOrderCushion: 5, // IT's script only orders when you have this many orders' worth of cash
  /**
   * Dale's supply closet is contested ground. Hold it and it pays out bands; departments
   * you haven't taken sneak in to raid it. Chase them off (they drop what they grabbed),
   * or your Lookouts might catch them. A raid that gets away loses you the closet for a
   * while, and the raiders take the bands back to their department.
   */
  closet: {
    bonus: 3, // bands a second while it's yours
    firstAt: 120, // seconds into the Department War
    gap: [180, 300] as [number, number],
    seconds: 20, // how long you have to chase them off
    lost: 120, // seconds the closet is theirs after a raid gets away
    heal: 0.1, // of the raiders' Resolve, back
    dropSeconds: 15, // chasing them off: they drop this many seconds of your band income
    dropMin: 40,
    lookoutEach: 0.25, // chance a raid is caught per point of Lookout power
    lookoutMax: 0.75,
  },
};

// ---------------------------------------------------------------- Stage 4: Floor Domination

export type RoomId = 'breakroom' | 'conference';

/**
 * The floor's last two shared spaces, held by people who dug in behind walls of filing
 * cabinets. The wall comes down first (it has its own bar), then their Resolve.
 */
export interface Room extends Target {
  room: RoomId;
  label: string;
  short: string;
  perk: string; // completes "You get ..."
  prize: string; // the same in a few words
  wall: number; // the wall's strength
  sabotage: { label: string; does: string };
}

export const ROOMS: Room[] = [
  {
    id: 'breakroom', room: 'breakroom', label: 'Break Room', short: 'Gail', stage: 4, name: 'Gail Petroski', title: 'Payroll Supervisor', position: 'By the coffee maker, out in the open',
    resolve: 330000, wall: 180000, regenPct: 0.004, desks: 3, bounty: 9000, bountyNote: 'the Coffee Club’s dues jar',
    twist: 'Coffee: every 30 s they top up 1.5% of their Resolve.',
    perk: 'coffee for your side: your Shooters fire 25% faster and your own shots hit 25% harder',
    prize: 'Shooters 25% faster, your shots 25% harder',
    sabotage: { label: 'Unplug their coffee machine', does: 'no coffee refills for 3 minutes' },
    intro: { from: 'Gail Petroski', subject: 'Re: the Break Room', body: 'The Coffee Club has held this break room since 1998. We have a wall of filing cabinets and a full pot. We are not leaving.' },
    defeat: { from: 'Gail Petroski', subject: 'Fine', body: 'The Coffee Club surrenders the break room. The good mugs are on the left. Rinse them.' },
  },
  {
    id: 'conference', room: 'conference', label: 'Conference Room', short: 'Victoria', stage: 4, name: 'Victoria Lang', title: 'VP of Operations', position: 'At the head of the table, out in the open',
    resolve: 400000, wall: 230000, regenPct: 0.004, desks: 4, bounty: 12000, bountyNote: 'the executive offsite budget',
    twist: 'Meetings: every 45 s she pulls your Shooters away for 10 s.',
    perk: 'the corner conference room: your team works 25% faster',
    prize: 'Your team works 25% faster',
    sabotage: { label: 'Start a reply-all storm', does: 'no meetings for 3 minutes' },
    intro: { from: 'Victoria Lang', subject: 'Calendar hold: the Conference Room', body: 'I have booked the corner conference room indefinitely. Recurring, all day, every day. Declining is not an option.' },
    defeat: { from: 'Victoria Lang', subject: 'Canceled: Everything', body: 'I am releasing the conference room. Effective immediately, you report to me. Kidding. I report to you. Do not tell the board.' },
  },
];

/** Stage 4's rules: walls, the rooms' tricks, sabotage and counterattacks. */
export const SIEGE = {
  wallShot: 0.5, // a normal shot does this much to a wall (the Gatling, a drill, and Barrages do all of it)
  engineerDps: 60, // wall taken down per second per point of Engineer power
  coffee: { every: 30, share: 0.015 },
  meeting: { every: 45, seconds: 10 },
  sabotageSeconds: 180,
  sabotageMinutes: 4, // a sabotage costs this many minutes of your team's pay (at least $500 × your pay grade)
  bountyMinutes: 15,
  review: 0.15,
  coffeeShooters: 1.25, // the Break Room's prize
  coffeeShots: 1.25,
  conferenceTeam: 1.25, // the Conference Room's prize
  /**
   * Counterattacks: every few minutes a department you took tries to take its desks back.
   * Guards stop most of them; you can push the rest back. One that gets through switches
   * that department's prize (and desks) off for a while.
   */
  counter: { firstAt: 150, gap: [180, 300] as [number, number], seconds: 20, lost: 180, guardEach: 0.3, guardMax: 0.9, dropSeconds: 20, dropMin: 60 },
};

// ---------------------------------------------------------------- Stage 5: Corporate Politics

/**
 * HR has opened an investigation into Floor 4. The Director of Human Resources fights from
 * behind a fortress of binders; shots at him are extra loud and add to his case file.
 */
export const HR_DIRECTOR: Target = {
  id: 'hr', stage: 5, name: 'Leonard Fisk', title: 'Director of Human Resources', position: 'Behind a fortress of binders',
  resolve: 1700000, regenPct: 0.004, desks: 2, bounty: 15000, bountyNote: 'HR’s “team-building” budget',
  twist: 'Shots at HR are louder, and feed his case file.',
  intro: { from: 'Leonard Fisk (HR)', subject: 'A safe space', body: 'Hi. I’m Leonard, from HR. I’ve opened a file on the 4th floor. It’s a very thick file. My door is always open, and so is the investigation.' },
  defeat: { from: 'Leonard Fisk (HR)', subject: 'Case closed', body: 'After a thorough review, HR finds no evidence of any rubber band activity on Floor 4. The file has been misplaced. Permanently. Please stop flicking me.' },
};

export type MemoId = 'teambuilding' | 'casual' | 'synergy' | 'openplan' | 'retention';

/** Memos: office policy, bought with Plausible Deniability from the Memos app on your computer. */
export const MEMOS: { id: MemoId; name: string; does: string; cost: number; seconds: number; cooldown: number }[] = [
  { id: 'teambuilding', name: 'Mandatory Team-Building Exercise', does: 'Your shots and Barrages make no noise for 2 minutes.', cost: 8, seconds: 120, cooldown: 360 },
  { id: 'openplan', name: 'Open-Plan Office Initiative', does: 'Nobody can hide for 3 minutes: your shots hit 50% harder, and they’re 50% louder.', cost: 6, seconds: 180, cooldown: 300 },
  { id: 'synergy', name: 'Synergy Offsite', does: 'Your team works twice as fast for 3 minutes.', cost: 10, seconds: 180, cooldown: 480 },
  { id: 'casual', name: 'Casual Friday', does: 'Hiring and training cost half for 5 minutes.', cost: 6, seconds: 300, cooldown: 480 },
  { id: 'retention', name: 'Document Retention Policy', does: 'Shreds a quarter of HR’s case file.', cost: 12, seconds: 0, cooldown: 360 },
];

/** Stage 5's rules: Plausible Deniability, HR's case file, interviews and goodwill. */
export const POLITICS = {
  /** Plausible Deniability: earned by real work. Your rounds by grade, your Cover teammates, your teams. */
  pd: { grade: { A: 2, B: 1, C: 0, D: 0, F: 0 } as Record<'A' | 'B' | 'C' | 'D' | 'F', number>, coverPerMin: 0.5, teamPerMin: 0.5 },
  /** Memos sent (in Deniability spent) that win HR over: the other way to close the case. */
  goodwill: 300,
  /** HR's case file, 0 to 100: when it's full, HR takes one of your departments and it drops back to half. */
  evidence: { caught: 25, noiseShare: 0.03, interview: 15, decayPerMin: 0.5, full: 100, after: 50, retention: 25, warn: 75 },
  /** HR interviews: every few minutes someone you beat is called in. Coach them before the clock runs out. */
  interview: { firstAt: 120, gap: [180, 300] as [number, number], seconds: 20 },
  hrNoise: 1.25, // shots at the HR Director make this much noise (was 2: with the safety catch, HR stopped taking damage)
  openPlan: { damage: 1.5, noise: 1.5 },
  synergyTeam: 2,
  casualPrice: 0.5,
  reclaim: 1, // a department HR took comes back at this share of its old Resolve
  bountyMinutes: 20,
  review: 0.25,
};

// ---------------------------------------------------------------- the New Job restart

export type CompanyId = 'pemberton' | 'bank' | 'ledger' | 'dialtone';

/**
 * Where you work. Your first job is at Pemberton; after that you pick your next offer. Each
 * company has its own rules, and its own names for the same faces (offices are all the same).
 */
export interface Company {
  id: CompanyId;
  name: string;
  short: string;
  pitch: string; // one line on what it's like
  rules: { suspicion: number; pay: number; bands: number; walkby: number; team: number; hire: number };
  rulesText: string[];
  names: Record<string, string>; // first names and surnames, swapped wherever they're shown
}

const NO_RULES = { suspicion: 1, pay: 1, bands: 1, walkby: 1, team: 1, hire: 1 };

export const COMPANIES: Company[] = [
  {
    id: 'pemberton', name: 'Pemberton Solutions Group', short: 'Pemberton', pitch: 'Where it all started: the stapler, the coffee, Gary.',
    rules: NO_RULES, rulesText: ['No surprises. You know this place.'], names: {},
  },
  {
    id: 'bank', name: 'First Allied Bank', short: 'First Allied', pitch: 'Marble floors, quiet carpets and very serious people.',
    rules: { ...NO_RULES, suspicion: 1.25, pay: 1.4 }, rulesText: ['Work pays 40% more', 'It’s so quiet: Suspicion builds 25% faster'],
    names: {
      Gary: 'Gordon', Lindqvist: 'Pratt', Brad: 'Trent', Okafor: 'Mensah', Janet: 'Carol', Ron: 'Walt', Rick: 'Rex', Dunham: 'Holloway',
      Derek: 'Morgan', Voss: 'Reyes', Doris: 'Edith', Kemper: 'Hale', Tony: 'Sal', Skyler: 'Madison', Brandt: 'Price', Gail: 'Barb',
      Petroski: 'Novak', Victoria: 'Eleanor', Lang: 'Ashford', Leonard: 'Gerald', Fisk: 'Pike', Kevin: 'Tyler', Marjorie: 'Agnes',
      Steve: 'Phil', Linda: 'Denise', Dave: 'Stu', Feeney: 'Whitcombe',
    },
  },
  {
    id: 'ledger', name: 'The Daily Ledger', short: 'the Ledger', pitch: 'A newspaper: loud, messy, rubber bands on every bundle.',
    rules: { ...NO_RULES, bands: 1.5, walkby: 0.8 }, rulesText: ['Bands come in 50% faster', 'The editor walks the floor 25% more often'],
    names: {
      Gary: 'Gus', Lindqvist: 'Ferraro', Brad: 'Duncan', Okafor: 'Adeyemi', Janet: 'Peggy', Ron: 'Hal', Rick: 'Vince', Dunham: 'Calloway',
      Derek: 'Quinn', Voss: 'Marsh', Doris: 'Mildred', Kemper: 'Thornbury', Tony: 'Frankie', Skyler: 'Jordan', Brandt: 'Vale', Gail: 'Rhonda',
      Petroski: 'Kowalski', Victoria: 'Beatrice', Lang: 'Sterling', Leonard: 'Howard', Fisk: 'Grubb', Kevin: 'Jake', Marjorie: 'Dolores',
      Steve: 'Ray', Linda: 'Bev', Dave: 'Ozzie', Feeney: 'Brennan',
    },
  },
  {
    id: 'dialtone', name: 'Dialtone Solutions', short: 'Dialtone', pitch: 'A call center. Headsets, headcount, and a lot of hold music.',
    rules: { ...NO_RULES, team: 1.5, hire: 1.3 }, rulesText: ['Your team works 50% faster', 'Hiring and training cost 30% more'],
    names: {
      Gary: 'Kyle', Lindqvist: 'Novotny', Brad: 'Logan', Okafor: 'Eze', Janet: 'Tina', Ron: 'Earl', Rick: 'Brock', Dunham: 'Kessler',
      Derek: 'Ravi', Voss: 'Patel', Doris: 'Lorraine', Kemper: 'Fitch', Tony: 'Vinnie', Skyler: 'Brooklyn', Brandt: 'Hayes', Gail: 'Darlene',
      Petroski: 'Kubiak', Victoria: 'Monica', Lang: 'Delacroix', Leonard: 'Warren', Fisk: 'Bell', Kevin: 'Josh', Marjorie: 'Bernice',
      Steve: 'Greg', Linda: 'Tanya', Dave: 'Rudy', Feeney: 'Bixby',
    },
  },
];

export type PerkId = 'refs' | 'friends' | 'hustle' | 'headhunter' | 'contacts' | 'bonus' | 'seniority' | 'standing' | 'delegate' | 'templates' | 'mug' | 'beans' | 'change';

/** Résumé perks: bought with Reputation, kept forever. */
export const PERKS: { id: PerkId; name: string; does: string; max: number; cost: number; growth: number; room?: true }[] = [
  { id: 'refs', name: 'Strong References', does: 'Start every job one pay grade higher.', max: 5, cost: 10, growth: 2 },
  { id: 'bonus', name: 'Signing Bonus', does: 'Start every job with $1,000 and 300 bands more.', max: 5, cost: 5, growth: 1.6 },
  { id: 'hustle', name: 'Hustle', does: 'All your work pays 20% more.', max: 10, cost: 8, growth: 1.6 },
  { id: 'headhunter', name: 'Headhunter', does: 'Hiring and training cost 10% less.', max: 5, cost: 10, growth: 1.7 },
  { id: 'contacts', name: 'Black Market Contacts', does: 'Dale’s weapons and requisitions cost 10% less.', max: 5, cost: 8, growth: 1.7 },
  { id: 'friends', name: 'Old Friends', does: 'Kevin and Marjorie follow you to every new job, from day one.', max: 1, cost: 15, growth: 1 },
  { id: 'standing', name: 'Standing Order', does: 'Dale reorders your bands and opens the box for you, from day one.', max: 1, cost: 20, growth: 1 },
  { id: 'seniority', name: 'Seniority', does: 'Time away counts for 4 more hours.', max: 4, cost: 12, growth: 2 },
  { id: 'delegate', name: 'Delegation', does: 'Raids, counterattacks and HR interviews you miss get handled anyway.', max: 1, cost: 40, growth: 1 },
  { id: 'templates', name: 'Memo Templates', does: 'Synergy Offsite and Document Retention memos send themselves when they’re ready.', max: 1, cost: 35, growth: 1 },
  // The Break Room's own (on the corkboard with the rest):
  { id: 'mug', name: 'Your Own Mug', does: 'Coffee keeps you Caffeinated 30 s longer.', max: 3, cost: 6, growth: 1.8, room: true },
  { id: 'beans', name: 'Good Beans', does: 'The coffee pot brews 20% faster.', max: 3, cost: 6, growth: 1.8, room: true },
  { id: 'change', name: 'Exact Change', does: 'Snacks cost 20% less and last a minute longer.', max: 3, cost: 5, growth: 1.8, room: true },
];

export type ExecId = 'clout' | 'morale' | 'expense' | 'warchest' | 'lunch';

/**
 * Executive perks: once Head Office is recruiting you, Job Search has perks with no top level,
 * so Reputation always has somewhere to go. Each level costs more than the last. Kept forever.
 */
export const EXEC_PERKS: { id: ExecId; name: string; does: string; each: number; cost: number; growth: number; max: number }[] = [
  { id: 'clout', name: 'Corner-Office Clout', does: 'Your bands hit 5% harder.', each: 0.05, cost: 300, growth: 2.5, max: 999 },
  { id: 'morale', name: 'Team Morale', does: 'Your team works 5% faster.', each: 0.05, cost: 200, growth: 2.5, max: 999 },
  { id: 'expense', name: 'Expense Account', does: 'All work pays 8% more.', each: 0.08, cost: 200, growth: 2.5, max: 999 },
  { id: 'warchest', name: 'War Chest', does: 'Barrages throw 5% more bands.', each: 0.05, cost: 250, growth: 2.5, max: 999 },
  { id: 'lunch', name: 'Long Lunches', does: 'Time away counts for 2 more hours.', each: 2, cost: 400, growth: 2.2, max: 12 },
];

/** Reputation for a job: how far you got, how high you climbed, and what you collected. */
export const JOB = {
  stageRep: { 1: 0, 2: 0, 3: 5, 4: 10, 5: 18, 6: 30 } as Record<number, number>,
  perRank: 2,
  bountyRoot: 1000, // + the square root of (bounties ÷ this)
  minStage: 3, // you can quit once you've reached the Department War
  hustle: 0.2,
  headhunter: 0.1,
  contacts: 0.1,
  bonus: { salary: 1000, bands: 300 },
  seniorityHours: 4,
  /** Every point of Reputation you've ever earned makes your bands hit this much harder (a reputation precedes you). */
  damagePerRep: 0.004,
};

/**
 * The career ladder: companies have offices at every level. Close HR's case at enough jobs in
 * one tier and the next tier starts recruiting you: everyone there is tougher, the pay is
 * better, and a job there is worth more Reputation. After Global HQ it keeps going (Global
 * HQ II, III...), so there's always another rung.
 */
export const LADDER = {
  tiers: [
    { name: 'Regional Office', floor: 4 },
    { name: 'Head Office', floor: 12 },
    { name: 'Global HQ', floor: 30 },
  ],
  /** Past the named tiers: Global HQ II, III... a few floors higher each time. */
  floorsAfter: 8,
  closes: 3, // cases closed at a tier to be recruited one up
  toughness: 4, // everyone's Resolve (and walls), times this per tier
  pay: 1.5, // all work pays this much more per tier
  rep: 2, // Reputation from a job, times this per tier
};

export type RenovationId = 'window' | 'espresso' | 'desks' | 'panels';

/**
 * Renovations: repeatable office upgrades on Dale's Procurement clipboard, from the Department
 * War on. Each level costs more than the last, and they stay with the office when you leave.
 */
export const RENOVATIONS: { id: RenovationId; name: string; does: string; each: number; cost: number; growth: number; max: number }[] = [
  { id: 'window', name: 'Window Office', does: 'Your bands hit 10% harder.', each: 0.1, cost: 60000, growth: 1.6, max: 99 },
  { id: 'espresso', name: 'Espresso Machine', does: 'Your team works 10% faster.', each: 0.1, cost: 40000, growth: 1.55, max: 99 },
  { id: 'desks', name: 'Standing Desks', does: 'All work pays 10% more.', each: 0.1, cost: 30000, growth: 1.55, max: 99 },
  { id: 'panels', name: 'Acoustic Panels', does: 'Everything you do is 4% quieter.', each: 0.04, cost: 50000, growth: 1.7, max: 10 },
];

/** Company stock: buy shares with money, cash them in as Reputation when you leave. */
export const STOCK = {
  price: 40000, // the first share
  growth: 1.12, // each share after costs this much more (the price resets at every new job)
  rep: 0.01, // each share adds this share of the job's Reputation when you leave (+1%)
  minStage: 3,
};

/** Anyone you've ever fought, by id (rematches look them up here). */
export function targetById(id: string): Target | undefined {
  return TARGETS.find((t) => t.id === id) ?? DEPARTMENTS.find((d) => d.id === id) ?? ROOMS.find((r) => r.id === id) ?? (id === 'hr' ? HR_DIRECTOR : undefined);
}

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
  // Past The Monster it keeps growing: every layer of this many bands, your bands hit harder (no cap).
  layer: 100000,
  layerDamage: 0.05,
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
  /** Every flick you land takes this much of the weapon's reload time off the Barrage's (a Perfect one twice). */
  flickRefill: 1,
};

/**
 * Rematches: once the department is yours, nobody here can let it go. The people you
 * beat come back one after another, a little tougher every round and worth more: a
 * bounty (at least a few minutes of your team's pay) and a bit of Performance.
 */
export const REMATCH = {
  /** After the Department War, the department bosses join the rotation too. */
  order: ['gary4', 'brad', 'printer', 'taskforce', 'rick', 'it', 'accounting', 'mailroom', 'marketing'],
  first: 0.5, // round 1: they come back at half their old Resolve
  growth: 1.35, // and each round after that, this much tougher
  bountyMinutes: [1, 1.5, 2, 3, 6, 5, 5, 5, 5], // of your team's steady pay, if that beats the old bounty
  bountyGrowth: 0.5, // the old bounty, +50% a round (times your pay grade)
  review: [0.02, 0.02, 0.03, 0.04, 0.08, 0.05, 0.05, 0.05, 0.05], // share of your next promotion
  lines: {
    gary4: { intro: 'Gary wants a rematch. He bought a bigger fan.', defeat: 'Gary switches the fan off and sighs.', note: 'Gary’s new savings jar' },
    brad: { intro: 'Brad says last time was a fluke. Best of three.', defeat: 'Brad reframes the loss as a learning opportunity.', note: 'Brad’s bonus check' },
    printer: { intro: 'Janet and Ron have restocked the toner. All of it.', defeat: 'PC LOAD LETTER. The Printer Corner surrenders again.', note: 'the printer’s new petty cash' },
    taskforce: { intro: 'The Q3 Task Force has reconvened as the Q4 Task Force.', defeat: 'The Task Force tables the discussion until next quarter.', note: 'the Task Force’s new offsite budget' },
    rick: { intro: 'Rick is back from working from home. He looks rested.', defeat: 'Rick is working from home again. For now.', note: 'Rick’s new discretionary fund' },
    it: { intro: 'Derek has restored IT from a backup.', defeat: 'Derek closes the ticket again. Won’t fix.', note: 'IT’s new “hardware budget”' },
    accounting: { intro: 'Accounting has found an error in the surrender paperwork.', defeat: 'Doris surrenders again. Under protest. Again.', note: 'Accounting’s new petty cash' },
    mailroom: { intro: 'Big Tony says the last war got lost in the mail.', defeat: 'Tony tips his cap. Return to sender.', note: 'Tony’s new poker winnings' },
    marketing: { intro: 'Skyler has rebranded the Department War as “Season 2”.', defeat: 'Skyler calls it a soft launch.', note: 'the new swag budget' },
  } as Record<string, { intro: string; defeat: string; note: string }>,
  /** How many of `order` are in the rotation before the Department War is won. */
  firstWar: 5,
};

/** Your team leads' calls: a little problem and two choices, every few minutes. */
export const ASKS = {
  first: 120, // seconds after your first hire
  gap: [240, 420] as [number, number],
  seconds: 40, // to answer before they go with the safe choice
  suspCap: 90, // a call never pushes Suspicion past this
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
