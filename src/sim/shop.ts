// What's worth buying next: the shopping list on your desk, and the badges on the closet.
// Everything is sold in one place now: Dale's supply closet (weapons and band upgrades on
// his shelves, office upgrades on the Procurement clipboard). Coworkers join from the Org Chart.

import { COWORKERS, UPGRADES, WEAPONS, type CoworkerId, type UpgradeId, type WeaponId } from './content';
import { coworkerAvailable, priceOf, upgradeAvailable, weaponAvailable } from './engine';
import { has, mods } from './mods';
import type { GameState } from './state';

export type ShopItem =
  | { kind: 'weapon'; id: WeaponId; name: string; price: number }
  | { kind: 'upgrade'; id: UpgradeId; name: string; price: number; office: boolean }
  | { kind: 'recruit'; id: CoworkerId; name: string; price: number };

/** Everything you could buy right now (not owned, unlocked), cheapest first. */
export function forSale(s: GameState): ShopItem[] {
  const items: ShopItem[] = [];
  const m = mods(s);
  for (const w of WEAPONS) {
    if (w.price === 0 || s.ownedWeapons.includes(w.id) || !weaponAvailable(s, w.id)) continue;
    if (w.needsEngineer && !m.hasEngineer) continue;
    items.push({ kind: 'weapon', id: w.id, name: w.name, price: priceOf(s, w.price) });
  }
  for (const c of COWORKERS) {
    if (c.cost === 0 || s.allies.some((a) => a.id === c.id) || !coworkerAvailable(s, c.id)) continue;
    items.push({ kind: 'recruit', id: c.id, name: `Recruit ${c.name}`, price: c.cost });
  }
  for (const u of UPGRADES) {
    if (has(s, u.id) || !upgradeAvailable(s, u.id)) continue;
    items.push({ kind: 'upgrade', id: u.id, name: u.name, price: priceOf(s, u.price), office: u.seller !== 'dale' });
  }
  return items.sort((a, b) => a.price - b.price);
}

/** The next weapon first (it matters most), then the cheapest other things. */
export function shoppingList(s: GameState, n = 3): ShopItem[] {
  const all = forSale(s);
  const gun = all.find((i) => i.kind === 'weapon');
  const rest = all.filter((i) => i !== gun);
  return (gun ? [gun, ...rest] : rest).slice(0, n);
}

/** How many things you could afford right now (for badges). `where` picks Dale's closet or the Org Chart. */
export function affordable(s: GameState, where: 'closet' | 'org' | 'all' = 'all') {
  return forSale(s).filter((i) => i.price <= s.salary && (where === 'all' || (where === 'org') === (i.kind === 'recruit'))).length;
}

/** The key the closet and the shopping list use for an item ('w:ruler', 'u:chair', 'r:kevin'). */
export function itemKey(i: ShopItem) {
  return `${i.kind === 'weapon' ? 'w' : i.kind === 'upgrade' ? 'u' : 'r'}:${i.id}`;
}
