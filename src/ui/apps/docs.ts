// Things to poke at on the desktop: My Documents (a few files that change as the war
// goes on), the Recycle Bin, and the Supply Catalog.

import { has, mods } from '../../sim/mods';
import { orderSupplies } from '../../sim/engine';
import type { GameState } from '../../sim/state';
import { SUPPLIES } from '../../sim/supplies';
import { payGrade } from '../../sim/work';
import { yourName } from './staffing';
import { fmt } from '../format';
import { esc, keyed, money, type AppCtx, type AppView } from './common';

interface Doc {
  name: string;
  text: (s: GameState) => string;
}

const tick = (done: boolean) => (done ? '[x]' : '[ ]');

export const DOCS: Record<string, Doc> = {
  resume: {
    name: 'resume_FINAL_final_v3.doc',
    text: (s) => `${yourName(s).toUpperCase()}
CURRENT TITLE: ${payGrade(s).title}

OBJECTIVE
To leverage my synergies in a dynamic, fast-paced, rubber-band-free environment.

EXPERIENCE
Pemberton Solutions Group, Floor 4
  • Handled ${fmt(s.stats.tasksDone)} pieces of work (most of them correctly)
  • Transferred calls to roughly the right department
  • Approved expenses within reason
  • ${s.stage >= 2 ? 'Built and led a cross-functional team' : 'Team player (see: Gary)'}
  • ${s.career.rank > 0 ? `Promoted ${s.career.rank} time${s.career.rank === 1 ? '' : 's'}` : 'Ready to be promoted'}
  • Bring-your-dog-to-work advocate (Bailey, beagle)

SKILLS
Excel (formulas: SUM). Outlook. Conflict resolution (elastic).

REFERENCES
Gary (please do not call Gary)`,
  },
  todo: {
    name: 'TODO.txt',
    text: (s) => `TODO
${tick(s.ownedWeapons.length > 1)} get a real weapon (Dale?)
${tick(s.stage >= 2)} make Gary surrender
${tick(s.stage >= 2 && s.targetIndex > 4)} Brad. obviously
${tick(s.stage >= 2 && s.targetIndex > 5)} the Printer Corner
${tick(s.stage >= 2 && s.targetIndex > 6)} the Q3 Task Force
${tick(s.stage > 2)} Rick
[ ] finish the Q3 deck
[ ] return the stapler`,
  },
  inventory: {
    name: 'rubber_band_inventory.xls',
    text: (s) => `RUBBER BAND INVENTORY (DO NOT SHOW ACCOUNTING)

On hand ................ ${fmt(s.bands)}
Pulled out of drawer ... ${fmt(s.stats.bandsScrounged)}
Orders placed .......... ${fmt(s.stats.ordersPlaced)}
"Reimbursed" ........... ${fmt(s.stats.receiptsFudged)} receipts
Fired at coworkers ..... ${fmt(s.stats.shots)}`,
  },
  passwords: {
    name: 'passwords.txt',
    text: () => `email: password1
voicemail: password1!
expenses portal: Password1!
IT said I need a symbol. I added a symbol.`,
  },
};

const TRASH: Doc[] = [
  { name: 'Q3_deck_v2_OLD (do not use).ppt', text: () => 'Slide 1: SYNERGY\nSlide 2: (blank)\nSlide 3: SYNERGY (again)\n\nSpeaker notes: stall.' },
  { name: 'apology_to_gary.doc', text: () => 'Dear Gary,\n\nI am sorry I flicked a rubber band at your\n\n[unfinished]' },
  { name: 'band_ball.jpg', text: () => '(A photo of a rubber band ball. The file is labeled "him".)' },
  { name: 'feeney_card_draft.doc', text: () => 'Happy birthday Mr. Feeney!\nYou are the best boss on Floor 4!!\n(He is the only boss on Floor 4.)' },
];

export type DocsMode = { kind: 'folder' } | { kind: 'trash' } | { kind: 'doc'; id: string } | { kind: 'trashdoc'; i: number };

export class DocsApp implements AppView {
  mode: DocsMode = { kind: 'folder' };

  constructor(
    private el: HTMLElement,
    private ctx: AppCtx,
  ) {
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-doc],button[data-trash],button[data-up]');
      if (!b) return;
      if (b.dataset.doc) this.mode = { kind: 'doc', id: b.dataset.doc };
      else if (b.dataset.trash) this.mode = { kind: 'trashdoc', i: Number(b.dataset.trash) };
      else this.mode = this.mode.kind === 'trashdoc' ? { kind: 'trash' } : { kind: 'folder' };
      this.ctx.sound.type();
      this.el.dataset.key = '';
      this.onTitle?.();
    });
  }

  onTitle?: () => void;

  title() {
    const m = this.mode;
    if (m.kind === 'doc') return `${DOCS[m.id].name} - Notepad`;
    if (m.kind === 'trashdoc') return `${TRASH[m.i].name} - Notepad`;
    return m.kind === 'trash' ? 'Recycle Bin' : 'My Documents';
  }

  render(s: GameState) {
    const m = this.mode;
    const key = JSON.stringify(m) + (m.kind === 'doc' ? DOCS[m.id].text(s) : '');
    keyed(this.el, key, () => {
      if (m.kind === 'doc' || m.kind === 'trashdoc') {
        const text = m.kind === 'doc' ? DOCS[m.id].text(s) : TRASH[m.i].text(s);
        return `<div class="notepad"><div class="np-menu"><button type="button" data-up>‹ Back</button><span>File</span><span>Edit</span><span>Format</span><span>Help</span></div><pre class="np-text">${esc(text)}</pre></div>`;
      }
      const files = m.kind === 'trash' ? TRASH.map((d, i) => ({ attr: `data-trash="${i}"`, name: d.name })) : Object.entries(DOCS).map(([id, d]) => ({ attr: `data-doc="${id}"`, name: d.name }));
      return `<div class="folder-view"><ul>${files
        .map((f) => `<li><button type="button" ${f.attr}><span class="ico ${/\.(txt|doc)$/.test(f.name) ? 'ico-doc' : f.name.endsWith('.xls') ? 'ico-sheet' : 'ico-doc'}"></span><span>${esc(f.name)}</span></button></li>`)
        .join('')}</ul>${m.kind === 'trash' ? '<p class="hint">Emptying the Recycle Bin is for people with nothing to hide.</p>' : ''}</div>`;
    });
  }
}

/** The Supply Catalog: band orders, also available from the war with O. */
export class CatalogApp implements AppView {
  constructor(
    private el: HTMLElement,
    private ctx: AppCtx,
    private ordered: () => void,
  ) {
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-order]');
      if (!b || b.disabled) return;
      if (orderSupplies(this.ctx.get()).ok) this.ordered();
      this.el.dataset.key = '';
    });
  }

  render(s: GameState) {
    const o = mods(s).order;
    const bulk = has(s, 'bulk');
    keyed(this.el, `${o.price}:${o.amount}:${s.salary >= o.price}:${!!s.supplies.order}`, () => `
      <div class="product">
        <div class="product-art" aria-hidden="true"></div>
        <div><h3>Rubber bands, assorted (${o.amount})</h3>
        <p>${bulk ? 'Bulk pricing, pre-stamped by Dale’s cousin in Procurement.' : 'Standard office pack.'} It arrives at your desk in a box ${SUPPLIES.deliverySeconds} seconds later. Ordering makes a little noise: someone has to sign for it.</p>
        <p class="price">${money(o.price)}</p>
        <button type="button" class="win-action strong" data-order="1"${s.salary < o.price ? ' disabled' : ''}>Add to cart and check out</button>
        ${s.supplies.order ? '<p class="hint">An order is on its way. Another one rides along in the same box.</p>' : ''}</div>
      </div>
      <p class="hint">Shortcut from the war: press O to send an order, and O again to open the box when it lands.</p>`);
  }
}
