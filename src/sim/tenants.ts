// Stage 6: Building Takeover. Once HR's case is closed, the floor is yours, and the other
// companies renting the floors above have noticed. One floor at a time, each fights its own way:
//
//   Hargrove & Pike LLP   Objection! Every so often Meg Hargrove objects for a few seconds:
//                          nothing you throw lands, and your own bands bounce back as paperclips.
//   Bright Smiles Dental   Floss snares: Dr. Gleam wraps your launcher in floss, halving how fast
//                          you can flick until you tap the floss enough times to cut free.
//   Disruptr               Funding: while Tyler Vance is funded, his startup slowly recovers.
//                          When the money runs out (a down round) you hit twice as hard, until he
//                          raises again.
//
// Optional: Job Search opens when the case closes. Each floor taken makes the job worth more
// Reputation when you leave, and all three more again.

import { HR_DIRECTOR, type Target } from './content';
import { addReview, reviewNeed, TOP_RANK } from './career';
import { randRange } from './rng';
import { staffPayPerMin } from './staff';
import { pushEmail, pushTicker, type GameState } from './state';
import { payGrade } from './work';
import { tierFloor } from './ladder';

export type TenantId = 'law' | 'dental' | 'startup';

export interface Tenant extends Target {
  tenant: TenantId;
  company: string;
  short: string;
}

export const TENANTS: Tenant[] = [
  {
    tenant: 'law', company: 'Hargrove & Pike LLP', short: 'Hargrove & Pike',
    id: 'law', stage: 6, name: 'Meg Hargrove', title: 'Senior Partner', position: 'Behind a wall of case files',
    resolve: 1_200_000, regenPct: 0.004, desks: 3, bounty: 20000, bountyNote: 'the partners’ billable-hours bonus pool',
    twist: 'Objection! Hold your fire while she objects, or your bands bounce back.',
    intro: { from: 'Meg Hargrove (Hargrove & Pike LLP)', subject: 'Notice of intent', body: 'Hargrove & Pike represents the tenants of the floor above you. We are aware of the rubber band activity. Any band that crosses our threshold will be treated as a hostile act. You have been served.' },
    defeat: { from: 'Meg Hargrove (Hargrove & Pike LLP)', subject: 'Settlement', body: 'My clients are prepared to settle. The floor is yours. We will be billing you for the paperclips.' },
  },
  {
    tenant: 'dental', company: 'Bright Smiles Dental', short: 'Bright Smiles',
    id: 'dental', stage: 6, name: 'Dr. Gleam', title: 'Lead Dentist', position: 'Behind the reception desk',
    resolve: 1_650_000, regenPct: 0.004, desks: 3, bounty: 28000, bountyNote: 'a jar of lollipop money',
    twist: 'Floss snares slow your flicks: tap the floss to cut free.',
    intro: { from: 'Dr. Fiona Gleam (Bright Smiles Dental)', subject: 'Your next appointment', body: 'Hi! It’s Dr. Gleam from upstairs. We heard about the lawyers. Just so you know, we floss twice a day, and we are VERY good at it. See you soon!' },
    defeat: { from: 'Dr. Fiona Gleam (Bright Smiles Dental)', subject: 'Cancellation', body: 'We’ve decided to relocate. Please take a toothbrush on your way out. Actually, take all of them.' },
  },
  {
    tenant: 'startup', company: 'Disruptr', short: 'Disruptr',
    id: 'startup', stage: 6, name: 'Tyler Vance', title: 'Founder & CEO', position: 'Behind a beanbag fort',
    resolve: 2_300_000, regenPct: 0.004, desks: 4, bounty: 40000, bountyNote: 'what was left of the seed round',
    twist: 'While he’s funded he recovers. Save your Barrages for a down round.',
    intro: { from: 'Tyler Vance (Disruptr)', subject: 'Let’s disrupt this', body: 'Yo. Tyler, founder of Disruptr (no e). We just closed a huge round. We have foam dart blasters, a kombucha tap, and runway for DAYS. Your move.' },
    defeat: { from: 'Tyler Vance (Disruptr)', subject: 'Pivoting', body: 'We’re pivoting. Disruptr is now a rubber band company. We’d love you on the board. Also we can’t make rent.' },
  },
];

export const TENANT_RULES = {
  objection: { first: 12, gap: [20, 26] as [number, number], seconds: 5, ricochetShare: 0.01, ricochetMin: 3 },
  floss: { first: 15, gap: [26, 32] as [number, number], seconds: 15, cuts: 5, reloadMult: 2 },
  funding: { drainSeconds: 90, refill: 0.75, downSeconds: 30, downDamage: 2, regen: 0.00007 },
  bountyMinutes: [25, 30, 40],
  repEach: 0.2,
  repAll: 0.2,
};

export interface TenantState {
  /** Floors taken this job (0 to 3); the next one up is TENANTS[taken]. */
  taken: number;
  /** Resolve left on the one you're working on, as a share (kept when you switch away). */
  share: number;
  announced: boolean;
  met: boolean[];
  objection: { nextAt: number; until: number };
  floss: { nextAt: number; until: number; cuts: number };
  funding: { level: number; downUntil: number };
  ricochets: number;
  flossCut: number;
}

export function newTenants(): TenantState {
  return {
    taken: 0,
    share: 1,
    announced: false,
    met: [false, false, false],
    objection: { nextAt: 0, until: 0 },
    floss: { nextAt: 0, until: 0, cuts: 0 },
    funding: { level: 1, downUntil: 0 },
    ricochets: 0,
    flossCut: 0,
  };
}

/** The company you're up against next (null once the building is yours). */
export function nextTenant(s: GameState): Tenant | null {
  const t = s.tenants;
  return s.stage >= 6 && t && t.taken < TENANTS.length ? TENANTS[t.taken] : null;
}

/** Their floor: just above yours (so it moves up with the career ladder). */
export function tenantFloor(s: GameState, index: number) {
  return tierFloor(s.job?.tier ?? 0) + 1 + index;
}

export function fightingTenant(s: GameState): Tenant | null {
  return s.war?.fighting === 'tenant' ? nextTenant(s) : null;
}

/** Puts a tenant fight on hold with whatever Resolve they have left. */
export function shelveTenant(s: GameState) {
  const t = fightingTenant(s);
  if (t) s.tenants.share = Math.max(0, Math.min(1, s.targetResolve / t.resolve));
}

/** Turns your desk toward the next floor up. */
export function loadTenant(s: GameState) {
  const t = nextTenant(s);
  if (!t) return false;
  const st = s.tenants;
  s.war.fighting = 'tenant';
  s.sinceLastHit = 0;
  s.targetResolve = st.share * t.resolve;
  const R = TENANT_RULES;
  st.objection = { nextAt: s.time + R.objection.first, until: 0 };
  st.floss = { nextAt: s.time + R.floss.first, until: 0, cuts: 0 };
  if (!st.met[st.taken]) {
    st.met[st.taken] = true;
    pushEmail(s, t.intro.from, t.intro.subject, t.intro.body, 'story');
  }
  return true;
}

// ---------------------------------------------------------------- the three ways they fight

export function objectionOn(s: GameState) {
  return fightingTenant(s)?.tenant === 'law' && s.time < s.tenants.objection.until;
}

export function snared(s: GameState) {
  return fightingTenant(s)?.tenant === 'dental' && s.time < s.tenants.floss.until;
}

export function downRound(s: GameState) {
  return fightingTenant(s)?.tenant === 'startup' && s.time < s.tenants.funding.downUntil;
}

/** Damage from your side: nothing lands during an Objection; double in a down round. */
export function tenantDamage(s: GameState) {
  if (!s.tenants || s.stage < 6) return 1;
  return objectionOn(s) ? 0 : downRound(s) ? TENANT_RULES.funding.downDamage : 1;
}

/** How much longer your flicks take to reload (floss on your launcher). */
export function tenantReloadMult(s: GameState) {
  return snared(s) ? TENANT_RULES.floss.reloadMult : 1;
}

/** One of your shots during an Objection: it bounces back as paperclips and costs you bands. */
export function ricochet(s: GameState, burst: number) {
  if (!objectionOn(s)) return 0;
  const R = TENANT_RULES.objection;
  const lost = Math.min(Math.floor(s.bands), Math.max(burst * R.ricochetMin, Math.floor(s.bands * R.ricochetShare)));
  s.bands -= lost;
  s.tenants.ricochets++;
  s.events.push({ type: 'ricochet', bands: lost });
  return lost;
}

/** Tap the floss on your launcher: enough taps and you're free. */
export function cutFloss(s: GameState) {
  if (!snared(s)) return false;
  const f = s.tenants.floss;
  f.cuts++;
  if (f.cuts >= TENANT_RULES.floss.cuts) {
    f.until = s.time;
    f.nextAt = s.time + randRange(s, TENANT_RULES.floss.gap[0], TENANT_RULES.floss.gap[1]);
    s.tenants.flossCut++;
    s.stats.flossCut = (s.stats.flossCut ?? 0) + 1;
    s.events.push({ type: 'flossCut' });
  }
  return true;
}

/** Every step: the building's tenants notice you, and the one you're fighting fights back. */
export function stepTenants(s: GameState, dt: number) {
  const st = s.tenants;
  if (!st || s.stage < 6) return;
  if (!st.announced) {
    st.announced = true;
    const t = TENANTS[st.taken];
    if (t) {
      pushEmail(
        s,
        'Building Management',
        'A note to all tenants',
        `It has come to our attention that one tenant now controls all of Floor ${tierFloor(s.job?.tier ?? 0)}. The other tenants (${TENANTS.map((x) => x.company).join(', ')}) have asked us to remind everyone that the building has a strict no-projectiles policy. We do not expect this to help.`,
        'story',
      );
      pushTicker(s, `The building’s other tenants have noticed you. ${t.company}, one floor up, is first. Find them on the map.`);
      s.events.push({ type: 'tenantsOpen' });
    }
  }
  const t = fightingTenant(s);
  if (!t) return;
  const R = TENANT_RULES;
  if (t.tenant === 'law') {
    const o = st.objection;
    if (s.time >= o.until && s.time >= o.nextAt) {
      o.until = s.time + R.objection.seconds;
      o.nextAt = o.until + randRange(s, R.objection.gap[0], R.objection.gap[1]);
      s.events.push({ type: 'objection' });
    }
  } else if (t.tenant === 'dental') {
    const f = st.floss;
    if (s.time >= f.until && s.time >= f.nextAt) {
      f.until = s.time + R.floss.seconds;
      f.cuts = 0;
      f.nextAt = f.until + randRange(s, R.floss.gap[0], R.floss.gap[1]);
      s.events.push({ type: 'floss' });
    }
  } else {
    const f = st.funding;
    if (s.time < f.downUntil) return;
    if (f.downUntil > 0) {
      // The down round is over: he raises again (a little less every time).
      f.downUntil = 0;
      f.level = R.funding.refill;
      s.events.push({ type: 'funded' });
      pushTicker(s, 'Tyler closed another round. Disruptr is funded again (for now).');
      return;
    }
    f.level -= dt / R.funding.drainSeconds;
    s.targetResolve = Math.min(t.resolve, s.targetResolve + t.resolve * R.funding.regen * dt);
    if (f.level <= 0) {
      f.level = 0;
      f.downUntil = s.time + R.funding.downSeconds;
      s.events.push({ type: 'downRound' });
      pushTicker(s, `Disruptr is out of money: a down round! Your bands hit ${R.funding.downDamage}× as hard for ${R.funding.downSeconds} seconds.`);
    }
  }
}

/** What taking a floor is worth: its bounty, or some minutes of your team's pay if that's more. */
export function tenantBounty(s: GameState, index: number) {
  const t = TENANTS[index];
  return Math.round(Math.max(t.bounty * payGrade(s).mult, staffPayPerMin(s, true) * TENANT_RULES.bountyMinutes[index]));
}

/** You took their floor. */
export function tenantWon(s: GameState) {
  const t = fightingTenant(s);
  if (!t) return;
  const st = s.tenants;
  const index = st.taken;
  const bounty = tenantBounty(s, index);
  // Paid in cash, but kept out of your bounty total: the floors' Reputation is the +15% each.
  s.salary += bounty;
  s.desks += t.desks;
  if (s.career.rank < TOP_RANK) addReview(s, reviewNeed(s.career.rank) * 0.25);
  st.taken++;
  st.share = 1;
  st.objection = { nextAt: 0, until: 0 };
  st.floss = { nextAt: 0, until: 0, cuts: 0 };
  st.funding = { level: 1, downUntil: 0 };
  s.stats.tenants = (s.stats.tenants ?? 0) + 1;
  s.events.push({ type: 'pay', amount: bounty, source: 'bounty', note: t.bountyNote });
  s.events.push({ type: 'capture', targetId: t.id });
  pushEmail(s, t.defeat.from, t.defeat.subject, t.defeat.body, 'win');
  const floor = tenantFloor(s, index);
  const text = pushTicker(
    s,
    `${t.company} gives up Floor ${floor}! +${t.desks} desks, and ${t.bountyNote}: +$${bounty.toLocaleString('en-US')}. This job is worth ${Math.round(tenantRepBonus(s) * 100)}% more Reputation now.`,
  );
  s.events.push({ type: 'tenantTaken', index, text });
  const next = nextTenant(s);
  if (next) {
    loadTenant(s);
    pushTicker(s, `Next floor up: ${next.company}.`);
    return;
  }
  // The whole building (below the top) is yours.
  pushEmail(s, 'Building Management', 'Change of occupancy', `Effective immediately, every floor from ${tierFloor(s.job?.tier ?? 0)} to ${tenantFloor(s, TENANTS.length - 1)} is leased to you. The CEO’s office upstairs has asked for your name.`, 'win');
  const all = pushTicker(s, `The building is yours! Every floor below the top answers to you, and this job is worth ${Math.round(tenantRepBonus(s) * 100)}% more Reputation.`);
  s.events.push({ type: 'buildingTaken', text: all });
  s.war.fighting = 'rematch';
  if (s.rematch) s.targetResolve = s.rematch.left ?? s.rematch.resolve;
  void HR_DIRECTOR;
}

/** How much more the job is worth for the floors you've taken. */
export function tenantRepBonus(s: GameState) {
  const n = s.tenants?.taken ?? 0;
  return TENANT_RULES.repEach * n + (n >= TENANTS.length ? TENANT_RULES.repAll : 0);
}

/** Saves: keep it, and tidy anything odd. */
export function tenantsForLoad(saved: Partial<TenantState> | undefined): TenantState {
  const base = newTenants();
  const t = { ...base, ...(saved ?? {}) };
  t.taken = Math.max(0, Math.min(TENANTS.length, Math.floor(Number(t.taken) || 0)));
  t.share = Number.isFinite(t.share) ? Math.max(0, Math.min(1, t.share)) : 1;
  t.met = Array.isArray(t.met) ? TENANTS.map((_, i) => !!t.met[i]) : base.met;
  t.objection = { ...base.objection, ...(t.objection ?? {}) };
  t.floss = { ...base.floss, ...(t.floss ?? {}) };
  t.funding = { ...base.funding, ...(t.funding ?? {}) };
  return t;
}
