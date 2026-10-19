import { COMPANIES, COWORKERS, DEPARTMENTS, HR_DIRECTOR, MEMOS, PERKS, EXEC_PERKS, type ExecId, MOMENTS, RENOVATIONS, type RenovationId, PAY_GRADES, POLITICS, ROLES, ROOMS, TARGETS, TEAMS, UPGRADES, WEAPONS } from './content';
import { deptMax, isDept, isRoom, newGame, newJob, newWar, reclaimTarget, rematchOrder, SAVE_VERSION, type GameState, type WarState } from './state';
import { politicsForOldSave } from './politics';
import { ladderForOldSave } from './ladder';
import { goldenForLoad } from './golden';
import { chaosForLoad } from './chaos';
import { dailyForLoad } from './daily';
import { rivalForLoad, rivalTarget, startRace } from './rival';
import { tenantsForLoad } from './tenants';
import { newStreak, newWeak, WEAK } from './feel';
import { TROPHIES } from './trophies';
import { siegeForOldSave, warForOldSave } from './war';

export const SAVE_KEY = 'flick.save';

export interface SaveFile {
  version: number;
  savedAt: number; // wall-clock ms
  state: Omit<GameState, 'events'>;
}

export function serialize(s: GameState, now = Date.now()): string {
  const { events: _events, ...rest } = s;
  const file: SaveFile = { version: SAVE_VERSION, savedAt: now, state: rest };
  return JSON.stringify(file);
}

/** Parses a save string. Returns null if it isn't a FLICK save. Never throws. */
export function deserialize(text: string): { state: GameState; savedAt: number } | null {
  try {
    const file = JSON.parse(text) as SaveFile;
    if (!file || typeof file !== 'object' || typeof file.version !== 'number' || !file.state) return null;
    const migrated = migrate(file);
    if (!migrated) return null;
    return { state: migrated, savedAt: file.savedAt ?? Date.now() };
  } catch {
    return null;
  }
}

/** Upgrades older saves to the current shape. Unknown future versions are refused. */
function migrate(file: SaveFile): GameState | null {
  if (file.version > SAVE_VERSION) return null;
  // Start from a fresh game so any field added since the save was made gets a default.
  const base = newGame(1);
  const s = { ...base, ...file.state, events: [] } as GameState;
  s.stats = { ...base.stats, ...(file.state.stats ?? {}) };
  s.walkby = { ...base.walkby, ...(file.state.walkby ?? {}) };
  s.hr = { ...base.hr, ...(file.state.hr ?? {}) };
  // Work rounds survive a reload (their clocks only run while you look at them); saves
  // from before version 7 had a different job, so they start with a fresh one.
  s.work = file.version >= 7 ? { ...base.work, ...(file.state.work ?? {}), focus: null } : base.work;
  s.chat = file.version >= 7 ? { ...base.chat, ...(file.state.chat ?? {}) } : oldChat(file, base);
  s.supplies = { ...base.supplies, ...(file.state.supplies ?? {}) };
  s.dale = { ...base.dale, ...(file.state.dale ?? {}), deal: null };
  // Allies from version 1 saves have no promotion fields yet.
  s.allies = (file.state.allies ?? []).map((a) => ({ ...a, served: a.served ?? 0, rank: a.rank ?? 0 }));
  // Before version 8 your pay grade came from the war (one per surrender): keep the rank you had.
  if (file.version < 8) s.career = { rank: s.stage > 2 ? 8 : Math.min(8, s.targetIndex), review: 0 };
  else s.career = { ...base.career, ...(file.state.career ?? {}) };
  s.staff = { ...(file.state.staff ?? {}) };
  s.staffPay = { owed: 0, at: s.time };
  s.names = { ...(file.state.names ?? {}) };
  // Moments don't wait while the game is closed; pizza goes cold.
  s.office = { ...base.office, ...(file.state.office ?? {}), moment: null, pizzaUntil: -999 };
  if (file.version < 9) s.office.nextAt = s.time + MOMENTS.first;
  // Before tricks, every scratch counted as a pet: give Bailey credit for some of them.
  if (file.version < 12) s.office.scratches = Math.min(19, Math.floor((s.stats.pets ?? 0) / 3));
  s.goals = { ...base.goals, ...(file.state.goals ?? {}) };
  s.ball = { ...base.ball, ...(file.state.ball ?? {}) };
  s.rematch = file.state.rematch ?? null;
  // The Department War: saves from before it that had already beaten Rick open it with their rematch.
  if (file.version < 13 || !file.state.war) {
    s.war = newWar();
    if (s.stage >= 3) warForOldSave(s);
  } else s.war = mergeWar(file.state.war);
  // Stage 4: saves from before it that had already taken all four departments open it from their rematch.
  if (file.version < 15 && s.stage >= 4) siegeForOldSave(s);
  // Stage 5: saves from before it that had already taken the whole floor get HR's investigation.
  if (file.version < 16 && s.stage >= 5) politicsForOldSave(s);
  s.asks = { ...base.asks, ...(file.state.asks ?? {}) };
  // The New Job restart: saves from before it open it if they'd already closed HR's case.
  const job = file.state.job;
  s.job = { ...newJob(), ...(job ?? {}), perks: { ...(job?.perks ?? {}) }, trophies: { ...(job?.trophies ?? {}) }, history: Array.isArray(job?.history) ? job!.history : [] };
  if (file.version < 17) s.job.unlocked = s.stage >= 6;
  s.job.closed = Array.isArray(job?.closed) ? [...job!.closed] : [];
  s.job.exec = { ...(job?.exec ?? {}) };
  // The career ladder: saves from before it count the cases they'd already closed.
  if (file.version < 18) ladderForOldSave(s);
  s.renovations = { ...(file.state.renovations ?? {}) };
  s.golden = goldenForLoad(file.state.golden, s.time);
  s.chaos = chaosForLoad(file.state.chaos, s.time);
  s.daily = dailyForLoad(file.state.daily);
  s.rival = rivalForLoad(file.state.rival);
  s.tenants = tenantsForLoad(file.state.tenants);
  // A weak spot on screen doesn't wait while the game is closed, and neither does a streak.
  s.weak = { ...newWeak(), nextAt: s.time + WEAK.first };
  s.streak = newStreak();
  // Saves from before Chad: if you've already changed jobs, he joins the race you're in now
  // (as long as there's time left to win it).
  if (!file.state.rival && s.job.runs >= 1 && s.stage < 6 && s.time < rivalTarget(s, s.job.tier ?? 0) - 20 * 60) startRace(s);
  if (!Number.isFinite(s.barrageAt)) s.barrageAt = 0;
  s.version = SAVE_VERSION;
  return sanitize(s) ? s : null;
}

function mergeWar(saved: Partial<WarState>): WarState {
  const base = newWar();
  const depts = { ...base.depts };
  for (const d of DEPARTMENTS) depts[d.dept] = { ...base.depts[d.dept], ...(saved.depts?.[d.dept] ?? {}) };
  const rooms = { ...base.rooms };
  for (const r of ROOMS) rooms[r.room] = { ...base.rooms[r.room], ...(saved.rooms?.[r.room] ?? {}) };
  // A raid or a counterattack doesn't wait while the game is closed.
  return {
    ...base,
    ...saved,
    depts,
    rooms,
    closet: { ...base.closet, ...(saved.closet ?? {}), raid: null },
    counter: { ...base.counter, ...(saved.counter ?? {}), attack: null },
    // An interview doesn't wait while the game is closed either.
    politics: {
      ...base.politics,
      ...(saved.politics ?? {}),
      memos: { ...base.politics.memos, ...(saved.politics?.memos ?? {}) },
      interview: null,
    },
  };
}

/** Before version 7, Messenger was one log; now it's a conversation per person. */
function oldChat(file: SaveFile, base: GameState): GameState['chat'] {
  const old = (file.state as unknown as { chat?: { log?: { id: number; t: number; from: string; text: string }[]; used?: string[]; nextAt?: number } }).chat;
  const chat = { ...base.chat, used: old?.used ?? [], nextAt: old?.nextAt ?? base.chat.nextAt };
  for (const m of old?.log ?? []) {
    let th = chat.threads.find((x) => x.who === m.from);
    if (!th) chat.threads.push((th = { who: m.from, msgs: [], unread: 0, pending: null }));
    th.msgs.push({ id: m.id, t: m.t, mine: false, text: m.text });
  }
  return chat;
}

/** Guards against corrupted or hand-edited saves that would break the game. */
function sanitize(s: GameState): boolean {
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  if (![s.time, s.bands, s.salary, s.suspicion, s.targetResolve, s.desks].every(finite)) return false;
  if (s.targetIndex < 0 || s.targetIndex >= TARGETS.length) return false;
  if (![1, 2, 3, 4, 5, 6].includes(s.stage)) return false;
  s.bands = Math.max(0, s.bands);
  s.salary = Math.max(0, s.salary);
  s.suspicion = Math.min(99, Math.max(0, s.suspicion));
  s.ownedWeapons = s.ownedWeapons.filter((id) => WEAPONS.some((w) => w.id === id));
  if (!s.ownedWeapons.includes(s.weapon)) s.weapon = 'flick';
  s.upgrades = s.upgrades.filter((id) => UPGRADES.some((u) => u.id === id));
  s.allies = s.allies.filter((a) => COWORKERS.some((c) => c.id === a.id));
  for (const a of s.allies) {
    if (!Number.isFinite(a.served)) a.served = 0;
    a.rank = Math.min(2, Math.max(0, Math.floor(Number(a.rank) || 0)));
    const c = COWORKERS.find((c) => c.id === a.id)!;
    if (!ROLES.some((r) => r.id === a.role) || (a.role === 'guard' && s.stage !== 4)) a.role = c.traitRole;
  }
  s.hr.writeUps = Math.min(3, Math.max(0, Math.floor(Number(s.hr.writeUps) || 0)));
  const w = s.work;
  if (!w.rounds || typeof w.rounds !== 'object') w.rounds = { mail: null, call: null, expense: null, sheet: null };
  for (const k of ['mail', 'call', 'expense', 'sheet'] as const) {
    const r = w.rounds[k];
    if (r && !(r.kind === k && Number.isFinite(r.limit) && Number.isFinite(r.used))) w.rounds[k] = null;
  }
  // A spreadsheet from before the printout (broken cells) can't be finished: drop it.
  const sh = w.rounds.sheet?.sheet;
  if (w.rounds.sheet && !(sh && Array.isArray(sh.typos) && Array.isArray(sh.misses))) w.rounds.sheet = null;
  w.rounds.call = null; // a caller doesn't wait while the game is closed
  w.mailWaiting = Math.min(10, Math.max(0, Math.floor(Number(w.mailWaiting) || 0)));
  if (!Array.isArray(w.fraudAt)) w.fraudAt = [];
  for (const k of Object.keys(s.names) as (keyof typeof s.names)[]) if (typeof s.names[k] !== 'string') delete s.names[k];
  if (!Array.isArray(s.goals.list)) s.goals = { day: -1, list: [], combo: 0 };
  if (!Number.isFinite(s.office.nextAt)) s.office.nextAt = s.time + MOMENTS.first;
  s.office.scratches = Math.max(0, Math.floor(Number(s.office.scratches) || 0));
  if (!Number.isFinite(s.office.scratchedAt)) s.office.scratchedAt = -999;
  if (!Number.isFinite(s.office.howledAt)) s.office.howledAt = -999;
  s.ball = { wound: Math.max(0, Math.floor(Number(s.ball.wound) || 0)), found: !!s.ball.found };
  const r = s.rematch;
  if (r && !(Number.isInteger(r.round) && r.round >= 1 && Number.isInteger(r.index) && r.index >= 0 && r.index < rematchOrder(s).length && Number(r.resolve) > 0 && Number.isFinite(r.bounty))) s.rematch = null;
  if (r && s.rematch && !(Number.isFinite(r.left) && r.left! >= 0)) r.left = r.resolve;
  if (s.stage < 3) s.rematch = null;
  const war = s.war;
  const was = war.fighting;
  for (const d of DEPARTMENTS) {
    const w = war.depts[d.dept];
    w.share = Math.min(1, Math.max(0, Number(w.share)));
    if (!Number.isFinite(w.share)) w.share = 1;
    w.taken = !!w.taken;
    w.met = !!w.met;
    w.rebranded = !!w.rebranded;
    if (!Number.isFinite(w.lostUntil)) w.lostUntil = -999;
    w.seized = s.stage === 5 && !!w.seized && w.taken;
  }
  for (const r of ROOMS) {
    const w = war.rooms[r.room];
    w.share = Math.min(1, Math.max(0, Number(w.share)));
    if (!Number.isFinite(w.share)) w.share = 1;
    w.wall = Math.min(r.wall, Math.max(0, Number(w.wall)));
    if (!Number.isFinite(w.wall)) w.wall = r.wall;
    w.taken = !!w.taken;
    w.met = !!w.met;
    if (!Number.isFinite(w.sabotageUntil)) w.sabotageUntil = -999;
  }
  const f = war.fighting as string;
  if (f !== 'rematch' && f !== 'hr' && f !== 'tenant' && !isDept(f) && !isRoom(f)) war.fighting = 'rematch';
  if (f === 'tenant' && s.stage < 6) war.fighting = 'rematch';
  // Who you can be fighting depends on the stage: a department in 3, a room in 4.
  if (s.stage === 3) {
    if (isRoom(war.fighting) || war.fighting === 'hr') war.fighting = 'rematch';
    if (isDept(war.fighting) && war.depts[war.fighting].taken) war.fighting = DEPARTMENTS.find((d) => !war.depts[d.dept].taken)?.dept ?? 'rematch';
  } else if (s.stage === 4) {
    if (isDept(war.fighting) || war.fighting === 'hr') war.fighting = 'rematch';
    if (isRoom(war.fighting) && war.rooms[war.fighting].taken) war.fighting = ROOMS.find((r) => !war.rooms[r.room].taken)?.room ?? 'rematch';
  } else if (s.stage === 5) {
    // HR, a department HR took, or the rematches.
    if (isRoom(war.fighting) || (isDept(war.fighting) && !war.depts[war.fighting].seized)) war.fighting = 'hr';
  } else if (s.stage >= 6 && !(war.fighting === 'tenant' && (s.tenants?.taken ?? 3) < 3)) war.fighting = 'rematch';
  // If we had to change who you're fighting, their Resolve comes with them.
  if (war.fighting !== was && s.stage >= 3) {
    const to = war.fighting;
    if (to === 'tenant') void 0;
    else if (to === 'rematch') s.targetResolve = s.rematch?.left ?? s.rematch?.resolve ?? 0;
    else if (to === 'hr') s.targetResolve = war.politics.hrShare * HR_DIRECTOR.resolve;
    else if (isDept(to)) s.targetResolve = war.depts[to].share * (s.stage === 5 ? reclaimTarget(to).resolve : deptMax(s, to));
    else s.targetResolve = war.rooms[to].share * ROOMS.find((r) => r.room === to)!.resolve;
  }
  const po = war.politics;
  for (const k of ['pd', 'goodwill', 'evidence'] as const) po[k] = Math.max(0, Number(po[k]) || 0);
  po.evidence = Math.min(POLITICS.evidence.full - 1, po.evidence);
  po.hrShare = Math.min(1, Math.max(0, Number(po.hrShare)));
  if (!Number.isFinite(po.hrShare)) po.hrShare = 1;
  if (!Number.isFinite(po.nextInterviewAt)) po.nextInterviewAt = s.time + 120;
  for (const m of MEMOS) {
    const st = po.memos[m.id];
    po.memos[m.id] = { until: Number.isFinite(st?.until) ? st.until : -999, readyAt: Number.isFinite(st?.readyAt) ? st.readyAt : -999 };
  }
  po.interview = null;
  po.met = !!po.met;
  po.announced5 = !!po.announced5;
  for (const k of ['coffeeAt', 'meetingAt'] as const) if (!Number.isFinite(war[k])) war[k] = s.time;
  war.meetingUntil = -999;
  if (!Number.isFinite(war.counter.nextAt)) war.counter.nextAt = s.time + 120;
  war.counter.attack = null;
  war.announced4 = !!war.announced4;
  if (!Number.isFinite(war.tonyAt)) war.tonyAt = s.time;
  const cl = war.closet;
  if (!Number.isFinite(cl.nextAt)) cl.nextAt = s.time + 120;
  if (!Number.isFinite(cl.lostUntil)) cl.lostUntil = -999;
  war.announced = !!war.announced;
  const a = s.asks;
  if (!Array.isArray(a.used)) a.used = [];
  a.used = a.used.filter((id) => typeof id === 'string').slice(-40);
  if (!Array.isArray(a.boosts)) a.boosts = [];
  a.boosts = a.boosts.filter((b) => b && Number.isFinite(b.mult) && b.mult >= 0 && b.mult <= 3 && Number.isFinite(b.from) && Number.isFinite(b.until) && (b.team === 'all' || TEAMS.some((t) => t.id === b.team)));
  if (!Number.isFinite(a.nextAt)) a.nextAt = 0;
  if (!Number.isFinite(a.watchUntil)) a.watchUntil = -999;
  // A call doesn't wait while the game is closed (the next one comes along in a minute).
  if (a.current) a.nextAt = s.time + 60;
  a.current = null;
  s.barrageAt = Math.min(s.barrageAt, s.time + 60);
  const c = s.career;
  c.rank = Math.min(PAY_GRADES.length - 1, Math.max(0, Math.floor(Number(c.rank) || 0)));
  c.review = Math.max(0, Number(c.review) || 0);
  for (const id of Object.keys(s.staff) as (keyof typeof s.staff)[]) {
    const st = s.staff[id];
    if (!TEAMS.some((t) => t.id === id) || !st) delete s.staff[id];
    else s.staff[id] = { seats: Math.max(0, Math.floor(Number(st.seats) || 0)), level: Math.max(0, Math.floor(Number(st.level) || 0)), done: Math.max(0, Number(st.done) || 0) };
  }
  if (!Array.isArray(s.chat.threads)) s.chat.threads = [];
  if (!Array.isArray(s.chat.queue)) s.chat.queue = [];
  const p = s.supplies;
  p.drawer = Math.max(0, Math.floor(Number(p.drawer) || 0));
  if (!['tangle', 'ball', 'change', null].includes(p.find)) p.find = null;
  if (p.order && !(Number(p.order.amount) > 0 && Number.isFinite(p.order.arriveAt))) p.order = null;
  if (p.box && !(Number(p.box.amount) > 0)) p.box = null;
  if (s.hr.confiscated && !s.ownedWeapons.includes(s.hr.confiscated.weapon)) s.hr.confiscated = null;
  const j = s.job;
  if (!COMPANIES.some((c) => c.id === j.company)) j.company = 'pemberton';
  for (const k of ['runs', 'reputation', 'earned'] as const) j[k] = Math.max(0, Math.floor(Number(j[k]) || 0));
  j.unlocked = !!j.unlocked;
  j.welcomed = j.welcomed !== false;
  for (const id of Object.keys(j.perks) as (keyof typeof j.perks)[]) {
    const def = PERKS.find((p) => p.id === id);
    if (!def) delete j.perks[id];
    else j.perks[id] = Math.min(def.max, Math.max(0, Math.floor(Number(j.perks[id]) || 0)));
  }
  for (const id of Object.keys(j.trophies)) if (!TROPHIES.some((t) => t.id === id) || !Number.isFinite(j.trophies[id])) delete j.trophies[id];
  j.closed = j.closed.map((n) => Math.max(0, Math.floor(Number(n) || 0)));
  for (const id of Object.keys(j.exec) as ExecId[]) {
    const def = EXEC_PERKS.find((p) => p.id === id);
    if (!def) delete j.exec[id];
    else j.exec[id] = Math.min(def.max, Math.max(0, Math.floor(Number(j.exec[id]) || 0)));
  }
  j.top = Math.max(0, Math.floor(Number(j.top) || 0));
  j.tier = Math.min(j.top, Math.max(0, Math.floor(Number(j.tier) || 0)));
  for (const id of Object.keys(s.renovations) as RenovationId[]) {
    const def = RENOVATIONS.find((r) => r.id === id);
    if (!def) delete s.renovations[id];
    else s.renovations[id] = Math.min(def.max, Math.max(0, Math.floor(Number(s.renovations[id]) || 0)));
  }
  s.stock = Math.max(0, Math.floor(Number(s.stock) || 0));
  j.history = j.history.filter((h) => h && COMPANIES.some((c) => c.id === h.company) && Number.isFinite(h.minutes)).slice(-12);
  return true;
}

export function saveToStorage(s: GameState) {
  try {
    localStorage.setItem(SAVE_KEY, serialize(s));
    return true;
  } catch {
    return false;
  }
}

export function loadFromStorage() {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    return text ? deserialize(text) : null;
  } catch {
    return null;
  }
}

export function clearStorage() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

/** Export as a compact text string players can copy and paste. */
export function exportSave(s: GameState) {
  return btoa(unescape(encodeURIComponent(serialize(s))));
}

export function importSave(text: string) {
  try {
    return deserialize(decodeURIComponent(escape(atob(text.trim()))));
  } catch {
    return null;
  }
}
