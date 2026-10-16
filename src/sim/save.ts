import { COWORKERS, DEPARTMENTS, MOMENTS, PAY_GRADES, TARGETS, TEAMS, UPGRADES, WEAPONS } from './content';
import { deptMax, newGame, newWar, rematchOrder, SAVE_VERSION, type GameState, type WarState } from './state';
import { warForOldSave } from './war';

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
  if (!Number.isFinite(s.barrageAt)) s.barrageAt = 0;
  s.version = SAVE_VERSION;
  return sanitize(s) ? s : null;
}

function mergeWar(saved: Partial<WarState>): WarState {
  const base = newWar();
  const depts = { ...base.depts };
  for (const d of DEPARTMENTS) depts[d.dept] = { ...base.depts[d.dept], ...(saved.depts?.[d.dept] ?? {}) };
  // A raid doesn't wait while the game is closed.
  return { ...base, ...saved, depts, closet: { ...base.closet, ...(saved.closet ?? {}), raid: null } };
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
  if (![1, 2, 3, 4].includes(s.stage)) return false;
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
  }
  if (war.fighting !== 'rematch' && !DEPARTMENTS.some((d) => d.dept === war.fighting)) war.fighting = 'rematch';
  if (war.fighting !== 'rematch' && war.depts[war.fighting].taken) war.fighting = DEPARTMENTS.find((d) => !war.depts[d.dept].taken)?.dept ?? 'rematch';
  if (s.stage >= 4) war.fighting = 'rematch';
  // If we had to change who you're fighting, their Resolve comes with them.
  if (war.fighting !== was && s.stage >= 3) {
    if (war.fighting === 'rematch') s.targetResolve = s.rematch?.left ?? s.rematch?.resolve ?? 0;
    else s.targetResolve = war.depts[war.fighting].share * deptMax(s, war.fighting);
  }
  if (!Number.isFinite(war.tonyAt)) war.tonyAt = s.time;
  const cl = war.closet;
  if (!Number.isFinite(cl.nextAt)) cl.nextAt = s.time + 120;
  if (!Number.isFinite(cl.lostUntil)) cl.lostUntil = -999;
  war.announced = !!war.announced;
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
