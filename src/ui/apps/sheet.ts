// Spreadsheet: Accounting's printout sits next to your copy of the same sheet. Whoever
// typed up your copy made a few typos. Spot the numbers that don't match the printout
// and click them. No math, just spot the difference; harder sheets have sneakier typos
// (1,250 typed as 1,520) and pay more. Clicking a number that matched is a mistake.
//
// Hovering (or moving the cursor over) a cell lights up the same cell on the printout,
// so you can compare them side by side.

import { SHEET_TABS, type SheetTabId } from '../../sim/content';
import type { GameState } from '../../sim/state';
import { checkCell, setSheetTab, sheetValue, startRound, tabUnlocked, type Round } from '../../sim/work';
import { clockHtml, esc, keyed, resultHtml, updateClock, type AppCtx, type AppView } from './common';

const COLS = 'ABCDEFGH';
const num = (n: number) => n.toLocaleString('en-US');
const INSTRUCTION = 'Click the numbers in <b>your copy</b> that don’t match the <b>printout</b>.';

/** A typo of the kind this sheet has, for the start card's example. */
const EXAMPLES: Record<SheetTabId, { label: string; parts: number[]; at: number; typed: number; note: string }> = {
  forecast: { label: 'South', parts: [600, 500, 130], at: 1, typed: 5000, note: 'an extra zero' },
  budget: { label: 'Coffee', parts: [310, 250, 90, 120], at: 1, typed: 520, note: 'two digits swapped' },
  headcount: { label: 'IT', parts: [12, 37, 5, 8], at: 1, typed: 38, note: 'one digit off' },
};

export class SheetApp implements AppView {
  work = 'sheet' as const;
  private cur = { row: 0, col: 0 }; // the keyboard cursor on your copy
  private hover: string | null = null; // "row-col" lit on both sheets
  private outcome: { text: string; ok: boolean } | null = null;
  private showResult = 0;

  constructor(
    private el: HTMLElement,
    private ctx: AppCtx,
  ) {
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-cell],button[data-tab],button[data-start]');
      if (!b || b.disabled) return;
      const d = b.dataset;
      if (d.start !== undefined) this.start();
      else if (d.tab) {
        if (setSheetTab(this.s, d.tab as SheetTabId)) this.ctx.sound.type();
      } else if (d.cell) {
        const [row, col] = d.cell.split('-').map(Number);
        this.cur = { row, col };
        this.check(row, col);
      }
      this.el.dataset.key = '';
    });
    // Point at a cell in your copy and its twin on the printout lights up.
    el.addEventListener('mouseover', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]');
      if (b && b.dataset.cell !== this.hover) this.light(b.dataset.cell!);
    });
    el.addEventListener('mouseleave', () => this.light(null));
  }

  private get s() {
    return this.ctx.get();
  }

  private start() {
    const r = startRound(this.s, 'sheet');
    if (!r) return;
    this.cur = { row: 0, col: 0 };
    this.hover = null;
    this.outcome = null;
    this.showResult = 0;
    this.ctx.sound.type();
  }

  private check(row: number, col: number) {
    const s = this.s;
    const r = s.work.rounds.sheet;
    if (!r) return;
    const res = checkCell(s, row, col);
    if (!res) return;
    this.outcome = { text: res.text, ok: res.ok };
    if (res.ok) this.ctx.sound.type();
    else this.ctx.sound.miss();
    if (!s.work.rounds.sheet) this.showResult = r.id;
  }

  /** Light up a cell (and its row) on both sheets, and compare them in the formula bar. */
  private light(key: string | null) {
    this.hover = key;
    const root = this.el;
    root.querySelectorAll('.po-grid .hl').forEach((x) => x.classList.remove('hl'));
    root.querySelectorAll('.hl-row').forEach((x) => x.classList.remove('hl-row'));
    root.querySelectorAll('.sheet-grid .cell-btn.hl').forEach((x) => x.classList.remove('hl'));
    const r = this.s.work.rounds.sheet;
    const ref = root.querySelector('.sheet-ref');
    const fx = root.querySelector('.sheet-fx');
    if (!r) return;
    if (!key) {
      if (ref) ref.textContent = '';
      if (fx) fx.innerHTML = INSTRUCTION;
      return;
    }
    const [row, col] = key.split('-').map(Number);
    const pc = root.querySelector(`.po-grid [data-pc="${key}"]`);
    pc?.classList.add('hl');
    pc?.closest('tr')?.classList.add('hl-row');
    const cell = root.querySelector(`.sheet-grid [data-cell="${key}"]`);
    cell?.classList.add('hl');
    cell?.closest('tr')?.classList.add('hl-row');
    if (ref) ref.textContent = `${COLS[col + 1]}${row + 2}`;
    if (fx) fx.innerHTML = `<b>${num(sheetValue(r, row, col))}</b> <span class="fx-vs">(the printout’s ${esc(r.sheet!.rows[row].label)} row is lit up)</span>`;
  }

  key(e: KeyboardEvent): boolean {
    const s = this.s;
    const r = s.work.rounds.sheet;
    const k = e.key.toLowerCase();
    if (!r) {
      if (k === 'enter' || k === ' ') {
        this.start();
        this.el.dataset.key = '';
        return true;
      }
      return false;
    }
    const rows = r.sheet!.rows;
    const cols = rows[0].cells.length;
    const c = this.cur;
    if (k === 'arrowup') c.row = (c.row + rows.length - 1) % rows.length;
    else if (k === 'arrowdown') c.row = (c.row + 1) % rows.length;
    else if (k === 'arrowleft') c.col = (c.col + cols - 1) % cols;
    else if (k === 'arrowright' || k === 'tab') c.col = (c.col + 1) % cols;
    else if (k === 'enter' || k === ' ') this.check(c.row, c.col);
    else return false;
    this.hover = `${c.row}-${c.col}`;
    this.el.dataset.key = '';
    return true;
  }

  render(s: GameState) {
    const r = s.work.rounds.sheet;
    const last = s.work.last?.kind === 'sheet' && s.work.last.id === this.showResult ? s.work.last : null;
    const ready = s.time >= s.work.sheetAt;
    const sh = r?.sheet;
    const state = sh ? `${r!.id}:${sh.typos.map((t) => (t.found ? 1 : 0)).join('')}:${sh.misses.length}:${this.cur.row}-${this.cur.col}` : '-';
    const key = [state, last?.id ?? '', ready, s.work.sheetTab, s.stage, s.targetIndex, this.outcome?.text ?? ''].join('|');
    if (keyed(this.el, key, () => this.html(s, last, ready))) this.light(r ? this.hover : null);
    updateClock(this.el, r);
  }

  private printoutHtml(r: Round, parts: readonly string[]) {
    const rows = r.sheet!.rows;
    return `<section class="printout" aria-label="Accounting's printout">
      <p class="po-head"><b>Accounting · printout</b><span>The real numbers. Page 1 of 1.</span></p>
      <table class="po-grid">
        <tr class="po-cols"><td></td>${parts.map((p) => `<th>${esc(p)}</th>`).join('')}<th>Total</th></tr>
        ${rows
          .map(
            (row, i) =>
              `<tr><td class="label">${esc(row.label)}</td>${row.cells.map((v, j) => `<td data-pc="${i}-${j}"${j === row.cells.length - 1 ? ' class="total"' : ''}>${num(v)}</td>`).join('')}</tr>`,
          )
          .join('')}
      </table>
    </section>`;
  }

  private copyHtml(r: Round, parts: readonly string[]) {
    const sh = r.sheet!;
    const head = `<tr class="cols"><th></th>${['', ...parts, 'Total'].map((_, i) => `<th>${COLS[i]}</th>`).join('')}</tr>
      <tr class="head"><th>1</th><td class="label"></td>${parts.map((p) => `<td class="head">${esc(p)}</td>`).join('')}<td class="head total">Total</td></tr>`;
    const body = sh.rows
      .map((row, i) => {
        const cells = row.cells
          .map((_, j) => {
            const typo = sh.typos.find((t) => t.row === i && t.col === j);
            const miss = sh.misses.some((m) => m.row === i && m.col === j);
            const state = typo?.found ? 'fixed' : miss ? 'miss' : '';
            const cur = this.cur.row === i && this.cur.col === j ? ' cur' : '';
            const v = num(sheetValue(r, i, j));
            const note = typo?.found ? 'fixed' : miss ? 'matches the printout' : 'click it if it doesn’t match';
            return `<td class="c${j === row.cells.length - 1 ? ' total' : ''}"><button type="button" class="cell-btn ${state}${cur}" data-cell="${i}-${j}" aria-label="${esc(row.label)}, ${COLS[j + 1]}: ${v} (${note})"${state ? ' disabled' : ''}>${v}</button></td>`;
          })
          .join('');
        return `<tr><th>${i + 2}</th><td class="label">${esc(row.label)}</td>${cells}</tr>`;
      })
      .join('');
    return `<div class="sheet-scroll" aria-label="Your copy"><p class="copy-head"><b>Your copy</b> · has typos</p><table class="sheet-grid">${head}${body}</table></div>`;
  }

  private exampleHtml(tabId: SheetTabId, parts: readonly string[], typos: number) {
    const ex = EXAMPLES[tabId];
    const total = ex.parts.reduce((a, b) => a + b, 0);
    const row = (typed: boolean) =>
      `<tr><td class="label">${typed ? 'Your copy' : 'Printout'}</td>${ex.parts
        .map((v, j) => (j === ex.at && typed ? `<td><span class="ex-typo">${num(ex.typed)}</span></td>` : `<td>${num(v)}</td>`))
        .join('')}<td class="total">${num(total)}</td></tr>`;
    return `<p>Accounting printed the real numbers. Whoever typed up your copy made <b>${typos} typos</b>. Click every number in your copy that doesn’t match the printout. No adding up needed.</p>
      <table class="sheet-grid sheet-example" aria-label="Example">
        <tr><td class="label">${esc(ex.label)}</td>${parts.map((p) => `<td class="head">${esc(p)}</td>`).join('')}<td class="head total">Total</td></tr>
        ${row(false)}${row(true)}
      </table>
      <p class="hint">Here ${esc(parts[ex.at])} was typed wrong (${ex.note}), so you’d click it. Clicking a number that matches counts as a mistake.</p>`;
  }

  private html(s: GameState, last: GameState['work']['last'], ready: boolean) {
    const r = s.work.rounds.sheet;
    const tabId = r?.sheet?.tab ?? (tabUnlocked(s, s.work.sheetTab) ? s.work.sheetTab : 'forecast');
    const tab = SHEET_TABS.find((t) => t.id === tabId)!;
    const tabs = SHEET_TABS.map((t) => {
      const open = tabUnlocked(s, t.id);
      return `<button type="button" data-tab="${t.id}" class="${t.id === tabId ? 'on' : ''}"${!open || r ? ' disabled' : ''}>${esc(t.name)}${t.payMult > 1 ? ` <small>pays ×${t.payMult}</small>` : ''}${open ? '' : ' <small>(locked)</small>'}</button>`;
    }).join('');
    const outcome = this.outcome ? `<span class="outcome-inline ${this.outcome.ok ? 'ok' : 'bad'}">${esc(this.outcome.text)}</span>` : '';
    let body = '';
    let formula = '<span class="sheet-ref">A1</span><span class="sheet-fx"></span>';
    if (r) {
      body = `<div class="sheet-compare">${this.printoutHtml(r, tab.parts)}${this.copyHtml(r, tab.parts)}</div>`;
      formula = `<span class="sheet-ref"></span><span class="sheet-fx">${INSTRUCTION}</span>`;
    } else if (last) body = `<div class="sheet-card">${resultHtml(last, { label: 'Next spreadsheet', data: 'data-start', disabled: !ready })}</div>`;
    else if (ready)
      body = `<div class="sheet-card"><div class="start-card sheet-intro"><h3>${esc(tab.file)}</h3>
        ${this.exampleHtml(tab.id, tab.parts, tab.typos)}
        <p class="hint">${tab.seconds} seconds for the sheet. Point at a number to see what the printout says. Arrow keys and <kbd>Enter</kbd> work too.</p>
        <button type="button" class="win-action strong" data-start>Open the spreadsheet <kbd>Enter</kbd></button></div></div>`;
    else body = `<div class="sheet-card"><div class="start-card quiet"><h3>Loading…</h3></div></div>`;
    const left = r ? r.items - r.done : 0;
    return `<div class="sheet">
      <div class="sheet-file"><span class="sheet-title">${esc(tab.file)}</span></div>
      <div class="sheet-formula">${formula}</div>
      ${r ? clockHtml() : ''}
      ${body}
      <div class="sheet-foot"><div class="sheet-tabs">${tabs}</div><div class="sheet-status">${outcome}${r ? `<span>${left} typo${left === 1 ? '' : 's'} left</span>` : '<span>Ready</span>'}</div></div>
    </div>`;
  }
}
