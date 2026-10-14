// Spreadsheet: every row's parts add up to its Total, but some cells broke (#REF!,
// #N/A...). Pick a broken cell, work out what belongs there from the rest of its row,
// and choose it from three options. One try per cell. Harder sheets pay more.

import { SHEET_TABS, type SheetTabId } from '../../sim/content';
import type { GameState } from '../../sim/state';
import { fixCell, setSheetTab, startRound, tabUnlocked } from '../../sim/work';
import { clockHtml, esc, keyed, resultHtml, updateClock, type AppCtx, type AppView } from './common';

const COLS = 'ABCDEFGH';
const num = (n: number) => n.toLocaleString('en-US');

export class SheetApp implements AppView {
  work = 'sheet' as const;
  private sel = -1; // the broken cell's row you're looking at
  private outcome: { text: string; ok: boolean } | null = null;
  private showResult = 0;

  constructor(
    private el: HTMLElement,
    private ctx: AppCtx,
  ) {
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-row],button[data-pick],button[data-tab],button[data-start]');
      if (!b || b.disabled) return;
      const d = b.dataset;
      if (d.start !== undefined) this.start();
      else if (d.tab) {
        if (setSheetTab(this.s, d.tab as SheetTabId)) this.ctx.sound.type();
      } else if (d.row !== undefined) this.sel = Number(d.row);
      else if (d.pick !== undefined) this.pick(Number(d.pick));
      this.el.dataset.key = '';
    });
  }

  private get s() {
    return this.ctx.get();
  }

  private start() {
    const r = startRound(this.s, 'sheet');
    if (!r) return;
    this.sel = r.sheet!.rows.findIndex((x) => x.state === 'broken');
    this.outcome = null;
    this.showResult = 0;
    this.ctx.sound.type();
  }

  private pick(value: number) {
    const s = this.s;
    const r = s.work.rounds.sheet;
    if (!r || this.sel < 0) return;
    const res = fixCell(s, this.sel, value);
    if (!res) return;
    this.outcome = { text: res.text, ok: res.ok };
    if (!res.ok) this.ctx.sound.miss();
    if (!s.work.rounds.sheet) {
      this.showResult = r.id;
      return;
    }
    // On to the next broken cell, down the sheet and around.
    const rows = r.sheet!.rows;
    const order = [...rows.keys()].map((k) => (this.sel + 1 + k) % rows.length);
    this.sel = order.find((k) => rows[k].state === 'broken') ?? -1;
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
    const row = r.sheet!.rows[this.sel];
    const n = Number(e.key);
    if (row?.state === 'broken' && n >= 1 && n <= 3) this.pick(row.options[n - 1]);
    else if (k === 'tab' || k === 'arrowdown' || k === 'arrowup') {
      const rows = r.sheet!.rows;
      const dir = k === 'arrowup' || e.shiftKey ? -1 : 1;
      for (let step = 1; step <= rows.length; step++) {
        const j = (this.sel + dir * step + rows.length * 2) % rows.length;
        if (rows[j].state === 'broken') {
          this.sel = j;
          break;
        }
      }
    } else return false;
    this.el.dataset.key = '';
    return true;
  }

  render(s: GameState) {
    const r = s.work.rounds.sheet;
    const last = s.work.last?.kind === 'sheet' && s.work.last.id === this.showResult ? s.work.last : null;
    const ready = s.time >= s.work.sheetAt;
    const key = [r ? `${r.id}:${r.sheet!.rows.map((x) => x.state[0]).join('')}:${this.sel}` : '-', last?.id ?? '', ready, s.work.sheetTab, s.stage, s.targetIndex, this.outcome?.text ?? ''].join('|');
    keyed(this.el, key, () => this.html(s, last, ready));
    updateClock(this.el, r);
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
      const rows = r.sheet!.rows;
      const head = `<tr class="cols"><th></th>${['', ...tab.parts, 'Total'].map((_, i) => `<th>${COLS[i]}</th>`).join('')}</tr>
        <tr class="head"><th>1</th><td class="label"></td>${tab.parts.map((p) => `<td class="head">${esc(p)}</td>`).join('')}<td class="head total">Total</td></tr>`;
      const body2 = rows
        .map((row, i) => {
          const cells = row.cells
            .map((v, j) => {
              const isTotal = j === row.cells.length - 1;
              const cls = `${isTotal ? 'total' : ''}`;
              if (j !== row.bad) return `<td class="${cls}">${num(v)}</td>`;
              if (row.state === 'broken')
                return `<td class="${cls}"><button type="button" class="cell-broken${i === this.sel ? ' on' : ''}" data-row="${i}" aria-label="Broken cell in ${esc(row.label)}">${esc(row.error)}</button></td>`;
              return `<td class="${cls} ${row.state}">${num(v)}</td>`;
            })
            .join('');
          return `<tr class="${i === this.sel ? 'sel' : ''}"><th>${i + 2}</th><td class="label">${esc(row.label)}</td>${cells}</tr>`;
        })
        .join('');
      body = `<div class="sheet-scroll"><table class="sheet-grid">${head}${body2}</table></div>`;
      const row = rows[this.sel];
      if (row?.state === 'broken') {
        const col = COLS[row.bad + 1];
        const what = row.bad === row.cells.length - 1 ? `the Total for ${row.label}` : `${tab.parts[row.bad]} for ${row.label}`;
        formula = `<span class="sheet-ref">${col}${this.sel + 2}</span><span class="sheet-fx">What belongs here (${esc(what)})?</span>
          <span class="sheet-picks">${row.options.map((v, k) => `<button type="button" class="option" data-pick="${v}"><kbd>${k + 1}</kbd>${num(v)}</button>`).join('')}</span>`;
      } else formula = `<span class="sheet-ref"></span><span class="sheet-fx">Click a broken cell.</span>`;
    } else if (last) body = `<div class="sheet-card">${resultHtml(last, { label: 'Next spreadsheet', data: 'data-start', disabled: !ready })}</div>`;
    else if (ready)
      body = `<div class="sheet-card"><div class="start-card"><h3>${esc(tab.file)}</h3>
        <p>Some cells are broken (<b>#REF!</b>, <b>#N/A</b>…). Every row’s parts add up to its <b>Total</b>, so you can work out what belongs in each broken cell. Pick it from three options. One try per cell; ${tab.errors} broken cells, ${tab.seconds} seconds.</p>
        <button type="button" class="win-action strong" data-start>Open the spreadsheet <kbd>Enter</kbd></button></div></div>`;
    else body = `<div class="sheet-card"><div class="start-card quiet"><h3>Loading…</h3></div></div>`;
    const left = r ? r.sheet!.rows.filter((x) => x.state === 'broken').length : 0;
    return `<div class="sheet">
      <div class="sheet-file"><span class="sheet-title">${esc(tab.file)}</span></div>
      <div class="sheet-formula">${formula}</div>
      ${r ? clockHtml() : ''}
      ${body}
      <div class="sheet-foot"><div class="sheet-tabs">${tabs}</div><div class="sheet-status">${outcome}${r ? `<span>${left} broken cell${left === 1 ? '' : 's'} left</span>` : '<span>Ready</span>'}</div></div>
    </div>`;
  }
}
