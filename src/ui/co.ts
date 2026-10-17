// The company you work at calls the same faces by different names. Everything the game
// shows goes through `co`, which swaps the names you'd know from Pemberton for this
// company's (the app sets the company once a frame).

import type { CompanyId } from '../sim/content';
import { companyText } from '../sim/job';

let current: CompanyId = 'pemberton';
let floor = 4;

/** The company you're at, and the floor its office is on (Floor 4 at the Regional Office). */
export function setCompany(id: CompanyId, onFloor = 4) {
  current = id;
  floor = onFloor;
}

export function co(text: string) {
  return companyText(current, text, floor);
}
