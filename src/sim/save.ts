import { COWORKERS, TARGETS, UPGRADES, WEAPONS } from './content';
import { newGame, SAVE_VERSION, type GameState } from './state';

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
  // Work tasks are never open right after loading.
  s.work = { ...base.work, ...(file.state.work ?? {}), activeId: null };
  s.sheet = { ...base.sheet, ...(file.state.sheet ?? {}), open: false };
  s.chat = { ...base.chat, ...(file.state.chat ?? {}) };
  s.supplies = { ...base.supplies, ...(file.state.supplies ?? {}) };
  // Allies from version 1 saves have no promotion fields yet.
  s.allies = (file.state.allies ?? []).map((a) => ({ ...a, served: a.served ?? 0, rank: a.rank ?? 0 }));
  s.version = SAVE_VERSION;
  return sanitize(s) ? s : null;
}

/** Guards against corrupted or hand-edited saves that would break the game. */
function sanitize(s: GameState): boolean {
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  if (![s.time, s.bands, s.salary, s.suspicion, s.targetResolve, s.desks].every(finite)) return false;
  if (s.targetIndex < 0 || s.targetIndex >= TARGETS.length) return false;
  if (![1, 2, 3].includes(s.stage)) return false;
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
  const kinds = ['email', 'call', 'expense'];
  if (!Array.isArray(s.work.queue) || !s.work.queue.every((t) => t && kinds.includes(t.kind) && t.data)) s.work.queue = [];
  if (!Array.isArray(s.work.fraudAt)) s.work.fraudAt = [];
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
