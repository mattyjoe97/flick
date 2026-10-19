// Hacks: pick one of three after (nearly) every boss you beat, for the rest of the job.
//
// Each job you put together a different build: hacks that change how you fight (ricochets,
// free mini-Barrages, staplers, crits), hacks that cut the waiting and the hiding, and a few
// wild ones. Picking one you already have levels it up. They're gone when you change jobs.
//
// Offers come after a boss surrenders: every Gary phase after the first, every Stage 1 and 2
// boss, every department, room, HR and the companies upstairs, and every third rematch. They
// wait for you (up to three at a time); the game doesn't stop while you choose.

import { rand } from './rng';
import { staffPayPerMin } from './staff';
import { currentTarget, pushTicker, type GameState } from './state';
import { payGrade } from './work';
import { jobPayMult } from './job';
import { mods } from './mods';

export type HackId =
  | 'ricochet' | 'echo' | 'loader' | 'sharpshooter' | 'overcharge' | 'hothands' | 'executioner' | 'salvo'
  | 'rain' | 'crossfire' | 'lunch' | 'quiet' | 'alibi' | 'patrol' | 'busywork' | 'fraud' | 'bulk'
  | 'goldrush' | 'chaostheory' | 'scavenger' | 'stapler' | 'domino' | 'lucky';

export interface Hack {
  id: HackId;
  name: string;
  /** What the next level does (given the level it would be). */
  does: (level: number) => string;
  max: number;
  /** How often it turns up: 3 common, 2 uncommon, 1 rare. */
  weight: number;
  kind: 'fight' | 'flow' | 'money' | 'wild';
  needs?: (s: GameState) => boolean;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const shooters = (s: GameState) => s.allies.some((a) => a.role === 'shooter');

export const HK = {
  ricochet: { chance: 0.15, power: 0.6 },
  echo: { every: [12, 9, 6], bands: 30 },
  loader: 0.12,
  sharpshooter: { gap: 0.6, seconds: 1 },
  overcharge: 0.5,
  hothands: { steps: 10, gap: 1.5 },
  executioner: { below: 0.25, mult: 0.6 },
  salvo: { seconds: 8, mult: 1.5 },
  rain: 0.2,
  crossfire: 0.25,
  lunch: 0.25,
  quiet: 0.15,
  patrol: { warn: 1, minutes: 1, min: 50 },
  fraud: 0.4,
  bulk: 0.3,
  goldrush: 0.6,
  chaostheory: 0.6,
  scavenger: { seconds: 60, min: 300 },
  stapler: { every: [6, 5, 4], mult: 4 },
  domino: 0.15,
  lucky: { chance: 0.04, mult: 8 },
};

export const HACKS: Hack[] = [
  { id: 'ricochet', name: 'Ricochet', kind: 'fight', weight: 3, max: 3, does: (l) => `Your flicks have a ${pct(HK.ricochet.chance * l)} chance to bounce and hit again (60%), for free.` },
  { id: 'echo', name: 'Echo Volley', kind: 'fight', weight: 2, max: 3, needs: (s) => s.stage >= 2, does: (l) => `Every ${HK.echo.every[l - 1]}th flick, your whole team throws a free mini-Barrage.` },
  { id: 'loader', name: 'Speed Loader', kind: 'fight', weight: 3, max: 3, does: (l) => `Your weapon reloads ${pct(HK.loader * l)} faster.` },
  { id: 'sharpshooter', name: 'Sharpshooter', kind: 'fight', weight: 2, max: 3, does: (l) => `Weak spots turn up more often and stay ${l} s longer.` },
  { id: 'overcharge', name: 'Overcharge', kind: 'fight', weight: 3, max: 3, does: (l) => `Perfect flicks hit ${pct(HK.overcharge * l)} harder.` },
  { id: 'hothands', name: 'Hot Hands', kind: 'fight', weight: 2, max: 3, does: (l) => `Your hot streak goes ${pct(0.02 * HK.hothands.steps * l)} higher and stays hot ${HK.hothands.gap * l} s longer.` },
  { id: 'executioner', name: 'Finisher', kind: 'fight', weight: 2, max: 3, does: (l) => `Your flicks hit ${pct(HK.executioner.mult * l)} harder on anyone below a quarter of their Resolve.` },
  { id: 'salvo', name: 'Opening Salvo', kind: 'fight', weight: 2, max: 3, does: (l) => `For ${HK.salvo.seconds} s after a boss surrenders, your flicks hit ${pct(HK.salvo.mult * l)} harder on the next one.` },
  { id: 'rain', name: 'Rubber Rain', kind: 'fight', weight: 3, max: 3, needs: (s) => s.stage >= 2, does: (l) => `Barrages reload ${pct(HK.rain * l)} faster.` },
  { id: 'crossfire', name: 'Crossfire', kind: 'fight', weight: 3, max: 3, needs: shooters, does: (l) => `Your Shooters fire ${pct(HK.crossfire * l)} faster.` },
  { id: 'lunch', name: 'Long Lunches', kind: 'flow', weight: 3, max: 3, does: (l) => `Mr. Feeney walks by ${pct(1 - 1 / (1 + HK.lunch * l))} less often.` },
  { id: 'quiet', name: 'Noise Cancelling', kind: 'flow', weight: 3, max: 3, does: (l) => `Your shots make ${pct(HK.quiet * l)} less noise.` },
  { id: 'alibi', name: 'Airtight Alibi', kind: 'flow', weight: 2, max: 3, does: (l) => `The next time you'd get caught, you talk your way out of it (${l} in all). No penalty.` },
  { id: 'patrol', name: 'Bailey on Patrol', kind: 'flow', weight: 2, max: 3, does: (l) => `${l} s more warning before walk-bys, and every one you hide from pays ${l} min of your team's pay.` },
  { id: 'busywork', name: 'Busywork', kind: 'flow', weight: 2, max: 1, needs: shooters, does: () => 'Your Shooters keep firing at full speed while you’re at your computer.' },
  { id: 'fraud', name: 'Expense Fraud', kind: 'money', weight: 3, max: 3, does: (l) => `Every boss you beat pays ${pct(HK.fraud * l)} more.` },
  { id: 'bulk', name: 'Band Hoarder', kind: 'money', weight: 3, max: 3, does: (l) => `${pct(HK.bulk * l)} more bands from everything that brings them in on its own.` },
  { id: 'goldrush', name: 'Gold Rush', kind: 'wild', weight: 2, max: 2, does: () => 'Golden staplers turn up more often.' },
  { id: 'chaostheory', name: 'Chaos Theory', kind: 'wild', weight: 2, max: 2, needs: (s) => s.stage >= 2, does: () => 'Office chaos events happen more often.' },
  { id: 'scavenger', name: 'Scavenger', kind: 'money', weight: 3, max: 3, does: (l) => `Every boss you beat drops ${l} min of your band income (at least ${HK.scavenger.min * l}).` },
  { id: 'stapler', name: 'Stapler Gun', kind: 'wild', weight: 1, max: 3, does: (l) => `Every ${HK.stapler.every[l - 1]}th flick fires a stapler: ${HK.stapler.mult}× damage.` },
  { id: 'domino', name: 'Domino Effect', kind: 'wild', weight: 1, max: 3, does: (l) => `Whoever's next starts with ${pct(HK.domino * l)} of their Resolve already gone.` },
  { id: 'lucky', name: 'Lucky Break', kind: 'wild', weight: 1, max: 3, does: (l) => `${pct(HK.lucky.chance * l)} of your flicks are lucky: ${HK.lucky.mult}× damage.` },
];

export function hack(id: HackId) {
  return HACKS.find((h) => h.id === id)!;
}

export interface HackState {
  levels: Partial<Record<HackId, number>>;
  /** Three to choose from right now (null when there's nothing to pick). */
  offer: HackId[] | null;
  /** Picks waiting (the current offer counts as one). */
  pending: number;
  captures: number;
  rematches: number;
  alibis: number;
  flicks: number;
  salvoUntil: number;
}

export function newHacks(): HackState {
  return { levels: {}, offer: null, pending: 0, captures: 0, rematches: 0, alibis: 0, flicks: 0, salvoUntil: 0 };
}

export function hackLevel(s: GameState, id: HackId) {
  return s.hacks?.levels[id] ?? 0;
}

export function hackCount(s: GameState) {
  return Object.values(s.hacks?.levels ?? {}).reduce((n, l) => n + (l ?? 0), 0);
}

/** Three different hacks you could take (not maxed, and that make sense now). */
function makeOffer(s: GameState): HackId[] {
  const pool = HACKS.filter((h) => hackLevel(s, h.id) < h.max && (!h.needs || h.needs(s)));
  const out: HackId[] = [];
  while (out.length < 3 && pool.length) {
    const total = pool.reduce((n, h) => n + h.weight, 0);
    let r = rand(s) * total;
    let i = 0;
    for (; i < pool.length - 1; i++) if ((r -= pool[i].weight) < 0) break;
    out.push(pool.splice(i, 1)[0].id);
  }
  return out;
}

/** Take one of the three on offer. */
export function pickHack(s: GameState, id: HackId) {
  const h = s.hacks;
  if (!h?.offer?.includes(id)) return false;
  const level = (h.levels[id] ?? 0) + 1;
  h.levels[id] = level;
  if (id === 'alibi') h.alibis++;
  h.pending = Math.max(0, h.pending - 1);
  h.offer = h.pending > 0 ? makeOffer(s) : null;
  if (h.offer && !h.offer.length) {
    h.offer = null;
    h.pending = 0;
  }
  const text = pushTicker(s, `Hack: ${hack(id).name}${level > 1 ? ` (level ${level})` : ''}. ${hack(id).does(level)}`);
  s.events.push({ type: 'hackPicked', id, level, text });
  return true;
}

/** Every step: a boss surrendered? Earn a pick, and the money and band hacks pay out. */
const counted = new WeakSet<object>();

export function stepHacks(s: GameState) {
  const h = s.hacks;
  if (!h) return;
  for (let i = 0; i < s.events.length; i++) {
    const e = s.events[i];
    // (Events wait for the screen to read them, so a capture can be seen by several steps.)
    if (e.type !== 'capture' || counted.has(e)) continue;
    counted.add(e);
    h.captures++;
    // Rematches only count every third time; the very first Gary doesn't (you're still learning).
    let earn = h.captures >= 2;
    if (s.stage >= 3 && s.war?.fighting === 'rematch') {
      h.rematches++;
      earn = h.rematches % 3 === 0;
    }
    if (earn) h.pending = Math.min(3, h.pending + 1);
    // Expense Fraud: the bounty that just came in, again (in part).
    const fraud = hackLevel(s, 'fraud');
    if (fraud) {
      const pay = s.events.slice(0, i).reverse().find((x) => x.type === 'pay' && x.source === 'bounty');
      if (pay && pay.type === 'pay') {
        const extra = Math.round(pay.amount * HK.fraud * fraud);
        s.salary += extra;
        s.events.push({ type: 'pay', amount: extra, source: 'bounty', note: 'some creative expenses' });
      }
    }
    // Scavenger: bands left lying around.
    const scav = hackLevel(s, 'scavenger');
    if (scav) s.bands += Math.max(HK.scavenger.min * scav, bandsIncome(s) * HK.scavenger.seconds * scav);
    // Opening Salvo and Domino Effect: the next one.
    if (hackLevel(s, 'salvo')) h.salvoUntil = s.time + HK.salvo.seconds;
    const domino = hackLevel(s, 'domino');
    const t = currentTarget(s);
    if (domino && t) s.targetResolve = Math.min(s.targetResolve, t.resolve * (1 - HK.domino * domino));
  }
  if (h.pending > 0 && !h.offer) {
    h.offer = makeOffer(s);
    if (!h.offer.length) {
      h.offer = null;
      h.pending = 0;
    } else s.events.push({ type: 'hackOffer' });
  }
}

function bandsIncome(s: GameState) {
  return mods(s).bandsPerSec;
}

// ---------------------------------------------------------------- what they do (read by the rest of the sim)

/**
 * Extra damage on one of your flicks: Finisher, Opening Salvo, a stapler, a lucky break.
 * Counts the flick (call once per flick).
 */
export function hackFlick(s: GameState, perfect: boolean) {
  const h = s.hacks;
  if (!h) return 1;
  h.flicks++;
  let m = 1;
  const t = currentTarget(s);
  const ex = hackLevel(s, 'executioner');
  if (ex && t && s.targetResolve < t.resolve * HK.executioner.below) m *= 1 + HK.executioner.mult * ex;
  const salvo = hackLevel(s, 'salvo');
  if (salvo && s.time < h.salvoUntil) m *= 1 + HK.salvo.mult * salvo;
  const oc = hackLevel(s, 'overcharge');
  if (oc && perfect) m *= 1 + HK.overcharge * oc;
  const st = hackLevel(s, 'stapler');
  if (st && h.flicks % HK.stapler.every[st - 1] === 0) {
    m *= HK.stapler.mult;
    s.events.push({ type: 'hackProc', id: 'stapler' });
  }
  const lucky = hackLevel(s, 'lucky');
  if (lucky && rand(s) < HK.lucky.chance * lucky) {
    m *= HK.lucky.mult;
    s.events.push({ type: 'hackProc', id: 'lucky' });
  }
  return m;
}

/** Does this flick bounce for a free second hit? */
export function ricochets(s: GameState) {
  const l = hackLevel(s, 'ricochet');
  return l > 0 && rand(s) < HK.ricochet.chance * l;
}

/** Is it time for an Echo Volley (call after counting the flick)? */
export function echoNow(s: GameState) {
  const l = hackLevel(s, 'echo');
  return l > 0 && s.stage >= 2 && s.hacks.flicks % HK.echo.every[l - 1] === 0;
}

export function hackReload(s: GameState) {
  return 1 - HK.loader * hackLevel(s, 'loader');
}

export function hackBarrageReload(s: GameState) {
  return 1 - HK.rain * hackLevel(s, 'rain');
}

export function hackAllySpeed(s: GameState) {
  return 1 + HK.crossfire * hackLevel(s, 'crossfire');
}

export function hackBusywork(s: GameState) {
  return hackLevel(s, 'busywork') > 0;
}

export function hackWalkbyGap(s: GameState) {
  return 1 + HK.lunch * hackLevel(s, 'lunch');
}

export function hackQuiet(s: GameState) {
  return 1 - HK.quiet * hackLevel(s, 'quiet');
}

export function hackWarning(s: GameState) {
  return HK.patrol.warn * hackLevel(s, 'patrol');
}

export function hackBands(s: GameState) {
  return 1 + HK.bulk * hackLevel(s, 'bulk');
}

export function hackGoldenGap(s: GameState) {
  return HK.goldrush ** hackLevel(s, 'goldrush');
}

export function hackChaosGap(s: GameState) {
  return HK.chaostheory ** hackLevel(s, 'chaostheory');
}

export function hackWeak(s: GameState) {
  const l = hackLevel(s, 'sharpshooter');
  return { gap: HK.sharpshooter.gap ** l, seconds: HK.sharpshooter.seconds * l };
}

export function hackStreak(s: GameState) {
  const l = hackLevel(s, 'hothands');
  return { steps: HK.hothands.steps * l, gap: HK.hothands.gap * l };
}

/** Airtight Alibi: if you have one, it gets you out of being caught (true = used one). */
export function useAlibi(s: GameState) {
  const h = s.hacks;
  if (!h || h.alibis <= 0) return false;
  h.alibis--;
  s.suspicion = 35;
  const text = pushTicker(s, `Mr. Feeney catches you mid-flick. "Ergonomic wrist exercises," you explain. He nods slowly and leaves. (Alibis left: ${h.alibis}.)`);
  s.events.push({ type: 'alibi', text });
  return true;
}

/** Bailey on Patrol: you hid from a walk-by, so it pays. */
export function hackHidden(s: GameState) {
  const l = hackLevel(s, 'patrol');
  if (!l) return;
  const cash = Math.round(Math.max(HK.patrol.min * payGrade(s).mult * jobPayMult(s), staffPayPerMin(s, true) * HK.patrol.minutes) * l);
  s.salary += cash;
  s.events.push({ type: 'pay', amount: cash, source: 'bounty', note: 'Bailey’s patrol' });
}

/** Saves: hacks are this job's, so they keep (an offer included). */
export function hacksForLoad(saved: Partial<HackState> | undefined): HackState {
  const h = { ...newHacks(), ...(saved ?? {}) };
  const levels: HackState['levels'] = {};
  for (const x of HACKS) {
    const l = Math.floor(Number(h.levels?.[x.id]) || 0);
    if (l > 0) levels[x.id] = Math.min(x.max, l);
  }
  h.levels = levels;
  h.offer = Array.isArray(h.offer) ? (h.offer.filter((id) => HACKS.some((x) => x.id === id)) as HackId[]) : null;
  if (h.offer && !h.offer.length) h.offer = null;
  for (const k of ['pending', 'captures', 'rematches', 'alibis', 'flicks'] as const) h[k] = Math.max(0, Math.floor(Number(h[k]) || 0));
  if (!Number.isFinite(h.salvoUntil)) h.salvoUntil = 0;
  return h;
}
