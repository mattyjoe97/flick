// The Boss Key spreadsheet: what it shows and how its numbers stay believable.
// Every column has its own kind of value, derived columns are real formulas of
// the inputs, and the totals row is recalculated whenever a cell changes.

import { SHEET_TABS, type SheetTabId } from '../sim/content';
import { fatigue, fixCell, setSheetTab, streakMult, tabUnlocked } from '../sim/minigame';
import type { GameState } from '../sim/state';
import { money } from './format';

type Grid = number[][]; // [row][inputColumn index in the tab's column list] (derived columns are ignored)

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function seeded(seed: number) {
  let x = seed;
  return () => ((x = (x * 16807) % 2147483647) / 2147483647);
}

const signed = (v: string, n: number) => (n > 0 ? `+${v}` : n < 0 ? `−${v.replace('-', '')}` : v);
const accounting = (n: number) => (n < 0 ? `(${nf0.format(Math.abs(n))})` : nf0.format(n));

interface Model {
  grid: Grid;
  /** Display text for a data cell. */
  cell(row: number, col: number): string;
  /** Display text for the totals row. */
  total(col: number): string;
  /** Formula-bar text for a cell. */
  formula(row: number, col: number): string;
  /** Apply a plausible new value to a fixed input cell. */
  fix(row: number, col: number, rnd: () => number): void;
  negative(row: number, col: number): boolean;
}

// ------------------------------------------------------------------ tab models

function forecastModel(rows: number): Model {
  const r = seeded(11);
  const grid: Grid = [];
  for (let i = 0; i < rows; i++) {
    const base = 18000 + r() * 74000;
    const q1 = Math.round(base * (0.92 + r() * 0.16));
    const q2 = Math.round(q1 * (0.94 + r() * 0.16));
    const q3 = Math.round(q2 * (0.94 + r() * 0.16));
    const q4 = Math.round(q3 * (0.95 + r() * 0.17));
    const syn = Math.round((0.4 + r() * 1.4) * 100) / 100;
    grid.push([q1, q2, q3, q4, 0, 0, syn]);
  }
  const yoy = (q1: number, q4: number) => ((q4 - q1) / q1) * 100;
  const sum = (c: number) => grid.reduce((a, row) => a + row[c], 0);
  return {
    grid,
    cell(i, c) {
      const g = grid[i];
      if (c <= 3) return nf0.format(g[c]);
      if (c === 4) return `${signed(nf1.format(yoy(g[0], g[3])), yoy(g[0], g[3]))}%`;
      if (c === 5) return signed(nf0.format(g[3] - g[2]), g[3] - g[2]);
      return nf2.format(g[6]);
    },
    total(c) {
      if (c <= 3) return nf0.format(sum(c));
      if (c === 4) {
        const v = yoy(sum(0), sum(3));
        return `${signed(nf1.format(v), v)}%`;
      }
      if (c === 5) return signed(nf0.format(sum(3) - sum(2)), sum(3) - sum(2));
      return nf2.format(sum(6) / grid.length);
    },
    formula(i, c) {
      const R = i + 2;
      if (c === 4) return `=(E${R}-B${R})/B${R}`;
      if (c === 5) return `=E${R}-D${R}`;
      return this.cell(i, c);
    },
    fix(i, c, rnd) {
      const g = grid[i];
      if (c <= 3) g[c] = Math.round(g[c] * (0.96 + rnd() * 0.1));
      else g[6] = Math.min(1.95, Math.max(0.3, Math.round((g[6] + (rnd() - 0.5) * 0.3) * 100) / 100));
    },
    negative(i, c) {
      const g = grid[i];
      if (c === 4) return yoy(g[0], g[3]) < 0;
      if (c === 5) return g[3] - g[2] < 0;
      return false;
    },
  };
}

function budgetModel(names: string[]): Model {
  const r = seeded(23);
  const ranges: Record<string, [number, number]> = {
    'Office supplies': [4000, 9000],
    'Rubber bands (misc.)': [200, 200],
    Coffee: [3000, 6000],
    'Printer toner': [2000, 5000],
    Software: [10000, 30000],
    Travel: [8000, 25000],
    Training: [4000, 12000],
    'Team building': [2000, 6000],
    Furniture: [5000, 15000],
    Snacks: [1000, 3000],
  };
  const grid: Grid = names.map((name) => {
    const [lo, hi] = ranges[name] ?? [2000, 8000];
    const budget = Math.round((lo + r() * (hi - lo)) / 50) * 50;
    // Rubber bands are, of course, at 900% of budget.
    const actual = name.startsWith('Rubber') ? budget * 9 : Math.round((budget * (0.35 + r() * 0.7)) / 10) * 10;
    return [budget, actual, 0, 0];
  });
  const sum = (c: number) => grid.reduce((a, row) => a + row[c], 0);
  return {
    grid,
    cell(i, c) {
      const [b, a] = grid[i];
      if (c === 0) return nf0.format(b);
      if (c === 1) return nf0.format(a);
      if (c === 2) return accounting(b - a);
      return `${nf0.format((a / b) * 100)}%`;
    },
    total(c) {
      const b = sum(0);
      const a = sum(1);
      if (c === 0) return nf0.format(b);
      if (c === 1) return nf0.format(a);
      if (c === 2) return accounting(b - a);
      return `${nf0.format((a / b) * 100)}%`;
    },
    formula(i, c) {
      const R = i + 2;
      if (c === 2) return `=B${R}-C${R}`;
      if (c === 3) return `=C${R}/B${R}`;
      return this.cell(i, c);
    },
    fix(i, c, rnd) {
      const row = grid[i];
      if (names[i].startsWith('Rubber') && c === 1) row[1] = Math.round(row[1] * 1.1);
      else if (c === 0) row[0] = Math.max(50, Math.round((row[0] * (0.97 + rnd() * 0.08)) / 50) * 50);
      else row[1] = Math.max(0, Math.round((row[1] * (0.97 + rnd() * 0.08)) / 10) * 10);
    },
    negative(i, c) {
      return c === 2 && grid[i][0] - grid[i][1] < 0;
    },
  };
}

function headcountModel(rows: number): Model {
  const r = seeded(37);
  const grid: Grid = [];
  for (let i = 0; i < rows; i++) {
    grid.push([
      4 + Math.floor(r() * 34),
      Math.floor(r() * 5),
      Math.round((3 + r() * 21) * 10) / 10,
      Math.round((0.8 + r() * 13) * 10) / 10,
      2 + Math.floor(r() * 8),
    ]);
  }
  const sum = (c: number) => grid.reduce((a, row) => a + row[c], 0);
  const weighted = (c: number) => grid.reduce((a, row) => a + row[c] * row[0], 0) / sum(0);
  return {
    grid,
    cell(i, c) {
      const v = grid[i][c];
      if (c === 2) return `${nf1.format(v)}%`;
      if (c === 3) return nf1.format(v);
      return nf0.format(v);
    },
    total(c) {
      if (c <= 1) return nf0.format(sum(c));
      if (c === 2) return `${nf1.format(weighted(2))}%`;
      if (c === 3) return nf1.format(weighted(3));
      return nf1.format(sum(4) / grid.length);
    },
    formula(i, c) {
      return this.cell(i, c);
    },
    fix(i, c, rnd) {
      const row = grid[i];
      const step = rnd() < 0.5 ? -1 : 1;
      if (c === 0) row[0] = Math.max(1, row[0] + step * (1 + Math.floor(rnd() * 2)));
      else if (c === 1) row[1] = Math.max(0, row[1] + step);
      else if (c === 2) row[2] = Math.min(40, Math.max(0.5, Math.round((row[2] + step * (0.5 + rnd() * 1.5)) * 10) / 10));
      else if (c === 3) row[3] = Math.max(0.2, Math.round((row[3] + step * (0.1 + rnd() * 0.3)) * 10) / 10);
      else row[4] = Math.min(10, Math.max(1, row[4] + step));
    },
    negative() {
      return false;
    },
  };
}

// ------------------------------------------------------------------ the view

export interface SheetHooks {
  onFix(pay: number, streak: number, hustle: boolean): void;
  onMiss(): void;
}

export class SheetView {
  private models = new Map<SheetTabId, Model>();
  private builtTab: SheetTabId | null = null;
  private flagKey = '';
  private tabKey = '';
  private rnd = seeded(101);
  private missUntil = 0;

  constructor(
    private getState: () => GameState,
    private hooks: SheetHooks,
  ) {
    const grid = document.getElementById('sheet-grid')!;
    grid.addEventListener('click', (e) => {
      const td = (e.target as HTMLElement).closest<HTMLTableCellElement>('td[data-row]');
      if (!td) return;
      this.click(Number(td.dataset.row), Number(td.dataset.col), td);
    });
    document.getElementById('sheet-tabs')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tab]');
      if (b && setSheetTab(this.getState(), b.dataset.tab as SheetTabId)) this.flagKey = '';
    });
  }

  private model(id: SheetTabId) {
    let m = this.models.get(id);
    if (!m) {
      const tab = SHEET_TABS.find((t) => t.id === id)!;
      m = id === 'forecast' ? forecastModel(tab.rows.length) : id === 'budget' ? budgetModel(tab.rows) : headcountModel(tab.rows.length);
      this.models.set(id, m);
    }
    return m;
  }

  private click(row: number, col: number, td: HTMLTableCellElement) {
    const s = this.getState();
    const tab = SHEET_TABS.find((t) => t.id === s.sheet.tab)!;
    const m = this.model(tab.id);
    const letter = String.fromCharCode(66 + col);
    document.getElementById('sheet-ref')!.textContent = `${letter}${row + 2}`;
    const r = fixCell(s, row, col);
    if (r.ok) {
      m.fix(row, col, this.rnd);
      this.refreshRow(row);
      this.refreshTotals();
      this.popPay(td, r.pay, r.hustle);
      this.hooks.onFix(r.pay, r.streak, r.hustle);
    } else {
      td.classList.remove('miss');
      void td.offsetWidth;
      td.classList.add('miss');
      this.missUntil = performance.now() + 1200;
      this.hooks.onMiss();
    }
    document.getElementById('sheet-fx')!.textContent = m.formula(row, col);
  }

  private popPay(td: HTMLTableCellElement, pay: number, hustle: boolean) {
    const p = document.createElement('span');
    p.className = hustle ? 'cell-pay hustle' : 'cell-pay';
    p.textContent = `+$${pay.toFixed(2)}`;
    td.appendChild(p);
    setTimeout(() => p.remove(), 800);
  }

  /** Builds the table for the current tab (only when the tab changes). */
  private build(id: SheetTabId) {
    const tab = SHEET_TABS.find((t) => t.id === id)!;
    const m = this.model(id);
    const letters = ['', 'A', ...tab.columns.map((_, i) => String.fromCharCode(66 + i))];
    let html = `<thead><tr>${letters.map((l) => `<th scope="col">${l}</th>`).join('')}</tr></thead><tbody>`;
    html += `<tr><th scope="row">1</th><td class="label head">${tab.id === 'budget' ? 'Line item' : tab.id === 'headcount' ? 'Team' : 'Region'}</td>${tab.columns
      .map((c) => `<td class="label head${c.kind === 'derived' ? ' calc' : ''}">${c.name}</td>`)
      .join('')}</tr>`;
    tab.rows.forEach((name, i) => {
      html += `<tr data-r="${i}"><th scope="row">${i + 2}</th><td class="label">${name}</td>${tab.columns
        .map(
          (c, j) =>
            `<td data-row="${i}" data-col="${j}" class="${c.kind === 'derived' ? 'calc' : 'cell'}${m.negative(i, j) ? ' neg' : ''}">${m.cell(i, j)}</td>`,
        )
        .join('')}</tr>`;
    });
    html += `<tr class="totals"><th scope="row">${tab.rows.length + 2}</th><td class="label">Total</td>${tab.columns
      .map((_, j) => `<td data-total="${j}">${m.total(j)}</td>`)
      .join('')}</tr></tbody>`;
    document.getElementById('sheet-grid')!.innerHTML = html;
    document.getElementById('sheet-title')!.textContent = tab.file;
    this.builtTab = id;
    this.flagKey = '';
  }

  private refreshRow(row: number) {
    const s = this.getState();
    const m = this.model(s.sheet.tab);
    document.querySelectorAll<HTMLTableCellElement>(`#sheet-grid tr[data-r="${row}"] td[data-col]`).forEach((td) => {
      const c = Number(td.dataset.col);
      const pay = td.querySelector('.cell-pay');
      td.textContent = m.cell(row, c);
      if (pay) td.appendChild(pay);
      td.classList.toggle('neg', m.negative(row, c));
    });
  }

  private refreshTotals() {
    const m = this.model(this.getState().sheet.tab);
    document.querySelectorAll<HTMLTableCellElement>('#sheet-grid td[data-total]').forEach((td) => {
      td.textContent = m.total(Number(td.dataset.total));
    });
  }

  render() {
    const s = this.getState();
    if (!s.lookBusy || !s.sheet.open) return;
    if (this.builtTab !== s.sheet.tab) this.build(s.sheet.tab);

    // Flags: red comment corners, with a fuse showing how long each has left.
    const key = s.sheet.flags.map((f) => f.id).join(',');
    if (key !== this.flagKey) {
      this.flagKey = key;
      const live = new Set(s.sheet.flags.map((f) => String(f.id)));
      // Remove flags that were fixed or expired; leave the others' fuses running.
      document.querySelectorAll<HTMLElement>('#sheet-grid td.flag').forEach((td) => {
        if (!live.has(td.dataset.flag ?? '')) {
          td.classList.remove('flag');
          delete td.dataset.flag;
        }
      });
      for (const f of s.sheet.flags) {
        const td = document.querySelector<HTMLElement>(`#sheet-grid td[data-row="${f.row}"][data-col="${f.col}"]`);
        if (!td || td.dataset.flag === String(f.id)) continue;
        td.dataset.flag = String(f.id);
        td.style.setProperty('--fuse', `${Math.max(0.2, f.expiresAt - s.time)}s`);
        td.classList.remove('flag');
        void td.offsetWidth;
        td.classList.add('flag');
      }
    }

    // Sheet tabs along the bottom
    const tabKey = `${s.sheet.tab}:${SHEET_TABS.map((t) => tabUnlocked(s, t.id)).join()}`;
    if (tabKey !== this.tabKey) {
      this.tabKey = tabKey;
      document.getElementById('sheet-tabs')!.innerHTML = SHEET_TABS.map((t) => {
        const open = tabUnlocked(s, t.id);
        const why = t.unlock.stage ? `Unlocks in Stage ${t.unlock.stage}` : 'Unlocks after you capture the Printer Corner';
        return `<button type="button" data-tab="${t.id}" class="${t.id === s.sheet.tab ? 'on' : ''}" ${open ? '' : `disabled title="${why}"`}>${t.name}${t.payMult > 1 ? ` <small>pays ×${t.payMult}</small>` : ''}</button>`;
      }).join('');
    }

    // Status bar
    const streak = s.sheet.streak;
    const fat = fatigue(s);
    const last = s.ticker[0];
    let msg = 'Fix the cells with red corners before they time out.';
    if (performance.now() < this.missUntil) msg = 'That cell was fine. Streak lost.';
    else if (s.time <= s.sheet.hustleUntil) msg = 'Mr. Feeney is watching. Fixes pay double right now!';
    else if (last && s.time - last.t < 4) msg = last.text;
    else if (fat < 1) msg = 'You are running out of real work. Fixes pay less the longer you hide.';
    setText('sheet-msg', msg);
    setText(
      'sheet-streak',
      streak > 0 ? `Streak ${streak}  (+${Math.round((streakMult(streak) - 1) * 100)}% pay)` : `Best streak ${s.sheet.best}`,
    );
    setText(
      'sheet-stats',
      `Average: ${Math.min(100, s.suspicion).toFixed(1)}   Count: ${Math.floor(s.bands).toLocaleString('en-US')}   Sum: ${money(s.salary)}`,
    );
  }
}

const cache = new Map<string, string>();
function setText(id: string, v: string) {
  if (cache.get(id) === v) return;
  cache.set(id, v);
  document.getElementById(id)!.textContent = v;
}
