import type { GameState } from '../src/sim/state';
import { TROPHIES } from '../src/sim/trophies';
import { describe, expect, it } from 'vitest';
import { CAREER, COMBO, DALE, DEPARTMENTS, PAY_GRADES, PROMOTION, STAFF, TARGETS, TEAMS, TUNING, UPGRADES, WEAPONS } from '../src/sim/content';
import { fight } from '../src/sim/war';
import { addReview, promote, reviewNeed, reviewReady, TOP_RANK } from '../src/sim/career';
import { hire, leadName, rename, seatCost, staffPayPerMin, teamPerMin, train, trainCost } from '../src/sim/staff';
import { baileyHowl, canHowl, claimMoment, nextTrick, petBailey } from '../src/sim/office';
import { goalProgress, GOAL_DEFS } from '../src/sim/goals';
import { BAILEY, BALL, CHARGE, BARRAGE, GOALS, MOMENTS, REMATCH } from '../src/sim/content';
import { rematchStats } from '../src/sim/rematch';
import { ballDamageMult, ballLayers, ballSize, ballUnlocked, wind, windAmount } from '../src/sim/ball';
import { addSuspicion, applyOffline, barrage, barrageSize, canFlick, buyBack, buyBackPrice, buyUpgrade, buyWeapon, daleSells, flick, openBox, orderSupplies, passDeal, priceOf, recruit, scrounge, setLookBusy, step, takeDeal } from '../src/sim/engine';
import { drawerCap, SUPPLIES } from '../src/sim/supplies';
import { knowsTrick, mods, rolePower, weapon } from '../src/sim/mods';
import {
  answerCall,
  answerMail,
  answerPhone,
  basePay,
  callerDept,
  comboMult,
  correctCall,
  correctMail,
  correctStamp,
  directory,
  checkCell,
  mistype,
  sheetValue,
  typosLeft,
  focusApp,
  liveCombo,
  payGrade,
  receiptOk,
  setSheetTab,
  stampReceipt,
  startRound,
  WORK,
  type WorkKind,
} from '../src/sim/work';
import { CALLERS, MAIL } from '../src/sim/workdata';
import { buddies, chatName, chatUnread, readThread, replyOptions, sendReply, typing } from '../src/sim/chat';
import { affordable, forSale, itemKey, shoppingList } from '../src/sim/shop';
import { deserialize, exportSave, importSave, serialize } from '../src/sim/save';
import { currentTarget, newAlly, newGame } from '../src/sim/state';
import { playBot, STYLES } from './bot';

function run(s: ReturnType<typeof newGame>, seconds: number) {
  for (let i = 0; i < seconds / TUNING.stepSeconds; i++) step(s, TUNING.stepSeconds);
}


/** Win every trophy up front, so their bonuses stay constant while a test measures something. */
function allTrophies(s: GameState) {
  s.job.trophies = Object.fromEntries(TROPHIES.map((x) => [x.id, 0]));
}

describe('core actions', () => {
  it('flicking spends a band, damages the target and makes noise', () => {
    const s = newGame(1);
    const before = s.targetResolve;
    expect(flick(s).ok).toBe(true);
    expect(s.bands).toBe(TUNING.startBands - 1);
    expect(s.targetResolve).toBe(before - 1);
    expect(s.suspicion).toBeGreaterThan(0);
  });

  it('cannot flick while looking busy or without bands', () => {
    const s = newGame(1);
    setLookBusy(s, true);
    expect(flick(s).ok).toBe(false);
    setLookBusy(s, false);
    s.bands = 0;
    expect(flick(s).ok).toBe(false);
  });

  it('weapons need salary', () => {
    const s = newGame(1);
    expect(buyWeapon(s, 'ruler').ok).toBe(false);
    s.salary = 15;
    expect(buyWeapon(s, 'ruler').ok).toBe(true);
    expect(s.weapon).toBe('ruler');
    expect(buyWeapon(s, 'repeater').ok).toBe(false); // stage 2 only
  });

  it('defeating Gary in all four positions starts Stage 2 with Gary as an ally', () => {
    const s = newGame(1);
    for (let i = 0; i < 4; i++) {
      s.bands = 100000;
      s.targetResolve = 0.5;
      s.nextFlickAt = 0;
      flick(s);
    }
    expect(s.stage).toBe(2);
    expect(s.allies.map((a) => a.id)).toEqual(['gary']);
    expect(s.desks).toBe(1);
    expect(TARGETS[s.targetIndex].id).toBe('brad');
  });

  it('recruiting costs salary and respects unlocks', () => {
    const s = newGame(1);
    s.salary = 1000;
    expect(recruit(s, 'kevin').ok).toBe(false); // Stage 1
    s.stage = 2;
    s.targetIndex = 4;
    expect(recruit(s, 'kevin').ok).toBe(true);
    expect(recruit(s, 'dave').ok).toBe(false); // needs the Printer Corner
  });
});

describe('suspicion', () => {
  it('getting caught costs 40% of bands and resets suspicion', () => {
    const s = newGame(1);
    s.bands = 100;
    addSuspicion(s, 120);
    expect(s.stats.caught).toBe(1);
    expect(s.bands).toBe(60);
    expect(s.suspicion).toBe(TUNING.caughtResetTo);
    expect(flick(s).ok).toBe(false);
  });

  it('a walk-by spots you unless you look busy', () => {
    const spotted = newGame(1);
    const warning = mods(spotted).warning;
    run(spotted, TUNING.firstWalkby + warning + 0.5);
    expect(spotted.stats.walkbysSpotted).toBe(1);

    const hidden = newGame(1);
    setLookBusy(hidden, true);
    run(hidden, TUNING.firstWalkby + warning + 0.5);
    expect(hidden.stats.hides).toBe(1);
  });

  it('cools down over time', () => {
    const s = newGame(1);
    s.suspicion = 50;
    run(s, 10);
    expect(s.suspicion).toBeLessThan(50);
  });
});

describe('work at your computer', () => {
  const desk = (seed = 1) => {
    const s = newGame(seed);
    s.walkby.nextAt = 1e9;
    s.work.nextCallAt = 1e9;
    s.dale.nextDealAt = 1e9;
    setLookBusy(s, true);
    return s;
  };
  /** Opens a round of `kind` and looks at it. */
  const open = (s: ReturnType<typeof newGame>, kind: 'mail' | 'expense' | 'sheet') => {
    if (kind === 'mail') s.work.mailWaiting = Math.max(s.work.mailWaiting, 5);
    if (kind === 'expense') s.work.expenseAt = 0;
    if (kind === 'sheet') s.work.sheetAt = 0;
    focusApp(s, kind);
    return startRound(s, kind)!;
  };

  it('mail trickles in, the phone rings, and reports and spreadsheets are ready on their own', () => {
    const s = newGame(1);
    s.walkby.nextAt = 1e9;
    run(s, WORK.firstMailAt + 0.2);
    expect(s.work.mailWaiting).toBe(1);
    run(s, WORK.firstCallAt);
    expect(s.work.ringing !== null || s.stats.callsMissed === 1).toBe(true);
    expect(startRound(s, 'expense')).not.toBeNull();
    expect(startRound(s, 'sheet')).not.toBeNull();
  });

  it('mail: Reply (with the right reply), Forward to the right department, or Delete', () => {
    const s = desk();
    s.suspicion = 20;
    const r = open(s, 'mail');
    expect(r.items).toBe(3); // a Junior Associate gets three at a time
    const first = r.mail![0];
    const res = answerMail(s, 0, correctMail(first))!;
    expect(res.ok).toBe(true);
    expect(res.pay).toBeCloseTo(WORK.pay.mail);
    expect(s.suspicion).toBe(20 - WORK.relief.mail);
    // Every kind of wrong answer is wrong.
    for (let idx = 0; idx < MAIL.length; idx++) {
      const m = MAIL[idx];
      const item = { idx, order: [0, 1, 2], state: 'open' as const };
      const right = correctMail(item);
      expect(right.act).toBe(m.act);
      if (m.act === 'reply') expect(m.replies!.filter((x) => x.ok).length).toBe(1);
      if (m.act === 'forward') expect(m.dept).toBeTruthy();
    }
    // A Reply All is loud.
    const b = desk(2);
    const rb = open(b, 'mail');
    for (let i = 0; i < 40; i++) {
      // find a reply email in some burst
      const k = rb.mail!.findIndex((x) => MAIL[x.idx].act === 'reply' && x.state === 'open');
      if (k >= 0) {
        const m = MAIL[rb.mail![k].idx];
        const all = rb.mail![k].order.indexOf(m.replies!.findIndex((x) => x.replyAll));
        const before = b.suspicion;
        const bad = answerMail(b, k, { act: 'reply', choice: all })!;
        expect(bad.ok).toBe(false);
        expect(bad.pay).toBe(0);
        expect(b.suspicion).toBeCloseTo(before + WORK.replyAllNoise);
        return;
      }
      rb.mail!.forEach((x, j) => x.state === 'open' && answerMail(b, j, correctMail(x)));
      Object.assign(rb, open(b, 'mail'));
    }
    throw new Error('no reply email turned up');
  });

  it('a call left ringing just stops; transfers follow today’s directory, which changes daily', () => {
    const s = newGame(1);
    s.walkby.nextAt = 1e9;
    s.work.nextCallAt = 0;
    run(s, WORK.ringSeconds + 0.5);
    expect(s.work.ringing).toBeNull();
    expect(s.stats.callsMissed).toBe(1);
    expect(s.suspicion).toBe(0);

    // Every caller has exactly one right answer.
    for (let i = 0; i < CALLERS.length; i++) {
      const c = CALLERS[i];
      expect([!!callerDept(i), !!c.self, !!c.prank].filter(Boolean).length).toBe(1);
    }
    // The directory is a shuffle of extensions 2-7, and it changes the next day.
    const today = directory(s);
    expect(Object.values(today).sort()).toEqual([2, 3, 4, 5, 6, 7]);
    s.time += WORK.dayLength;
    expect(directory(s)).not.toEqual(today);

    s.work.nextCallAt = s.time;
    run(s, 0.2);
    const r = answerPhone(s)!;
    expect(s.lookBusy).toBe(true);
    expect(answerCall(s, correctCall(s, r.caller!))!.ok).toBe(true);
    expect(s.work.rounds.call).toBeNull(); // one caller per round
  });

  it('expenses follow today’s rule; approving your own rubber bands pays in bands, and Accounting notices', () => {
    for (let seed = 1; seed < 60; seed++) {
      const s = desk(seed);
      s.stage = 2;
      const r = open(s, 'expense');
      const yours = r.receipts!.findIndex((x) => x.yours);
      if (yours < 0) continue;
      expect(correctStamp(r, yours)).toBe(false); // by the rules, your order is denied
      const graded = r.receipts!.filter((x) => !x.yours);
      expect(graded.some((x) => receiptOk(x, r.rule!))).toBe(true);
      expect(graded.some((x) => !receiptOk(x, r.rule!))).toBe(true);
      const bands = s.bands;
      expect(stampReceipt(s, yours, true)!.bonusBands).toBe(WORK.fraudBands * 2);
      expect(s.bands).toBe(bands + WORK.fraudBands * 2);
      expect(s.suspicion).toBeGreaterThan(0);
      r.receipts!.forEach((x, i) => x.state === 'open' && stampReceipt(s, i, correctStamp(r, i)));
      expect(s.work.rounds.expense).toBeNull();
      expect(s.work.last?.right).toBe(r.items);
      return;
    }
    throw new Error('no seed produced your own receipt');
  });

  it('spreadsheet: spot the typos against the printout; a cell that matched is a mistake (once)', () => {
    const s = desk(3);
    const r = open(s, 'sheet');
    const sh = r.sheet!;
    expect(sh.typos.length).toBe(3);
    expect(r.items).toBe(3);
    expect(new Set(sh.typos.map((t) => t.row)).size).toBe(3); // one per row
    for (const row of sh.rows) expect(row.cells.slice(0, -1).reduce((a, b) => a + b, 0)).toBe(row.cells[row.cells.length - 1]);
    for (const t of sh.typos) {
      expect(t.shown).not.toBe(sh.rows[t.row].cells[t.col]);
      expect(sheetValue(r, t.row, t.col)).toBe(t.shown);
    }
    // A cell that matched the printout: a mistake, but only the first time.
    const fine = sh.rows.flatMap((row, i) => row.cells.map((_, col) => ({ row: i, col }))).find((c) => !sh.typos.some((t) => t.row === c.row && t.col === c.col))!;
    expect(checkCell(s, fine.row, fine.col)!.ok).toBe(false);
    expect(checkCell(s, fine.row, fine.col)).toBeNull();
    expect(r.mistakes).toBe(1);
    expect(r.done).toBe(0);
    // Each typo found pays and shows the printout's number; the last one ends the sheet.
    const [a, ...rest] = typosLeft(r);
    const res = checkCell(s, a.row, a.col)!;
    expect(res.ok).toBe(true);
    expect(res.pay).toBeGreaterThan(0);
    expect(sheetValue(r, a.row, a.col)).toBe(sh.rows[a.row].cells[a.col]);
    expect(checkCell(s, a.row, a.col)).toBeNull();
    for (const t of rest) checkCell(s, t.row, t.col);
    expect(s.work.rounds.sheet).toBeNull();
    expect(s.work.last?.grade).toBe('C'); // one slip in three
  });

  it('typos look like real typos', () => {
    const s = desk(4);
    for (const v of [7, 24, 50, 120, 450, 1250, 1300, 2205]) {
      const swap = mistype(s, v, 'swap', 10);
      if (swap !== null) expect([...String(swap)].sort().join('')).toBe([...String(v)].sort().join(''));
      const zero = mistype(s, v, 'zero', 10)!;
      expect([v * 10, v / 10]).toContain(zero);
      const digit = mistype(s, v, 'digit', 1)!;
      expect(String(digit).length).toBe(String(v).length);
      const diff = [...String(v)].filter((d, i) => String(digit)[i] !== d).length;
      expect(diff).toBe(1);
      for (const kind of ['wrong', 'zero', 'swap', 'digit'] as const) {
        const out = mistype(s, v, kind, 10);
        if (out !== null) {
          expect(out).toBeGreaterThan(0);
          expect(out).not.toBe(v);
        }
      }
    }
    expect(mistype(s, 7, 'swap', 1)).toBeNull();
    expect(mistype(s, 1100, 'swap', 10)).not.toBe(110); // never a leading zero
  });

  it('a clean, quick round is an A with a bonus; running out of time counts the rest as mistakes', () => {
    const s = desk(4);
    const r = open(s, 'mail');
    let paid = 0;
    r.mail!.forEach((m, i) => (paid += answerMail(s, i, correctMail(m))!.pay));
    expect(s.work.last?.grade).toBe('A');
    expect(s.work.last?.pay).toBeCloseTo(paid * (1 + WORK.gradeBonus.A));

    const b = desk(5);
    const rb = open(b, 'sheet');
    run(b, rb.limit + 0.5);
    expect(b.work.rounds.sheet).toBeNull();
    expect(b.work.last?.grade).toBe('F');
  });

  it('a round’s clock only runs while you’re looking at it', () => {
    const s = desk(6);
    const r = open(s, 'expense');
    focusApp(s, 'mail');
    run(s, 30);
    expect(r.used).toBe(0);
    setLookBusy(s, false);
    focusApp(s, 'expense');
    run(s, 30);
    expect(r.used).toBe(0);
    expect(s.work.rounds.expense).toBe(r);
  });

  it('nothing goes overdue, and Auto-Reply answers waiting emails', () => {
    const s = newGame(1);
    s.walkby.nextAt = 1e9;
    s.work.nextCallAt = 1e9;
    run(s, 300);
    expect(s.suspicion).toBe(0);
    expect(s.work.mailWaiting).toBeLessThanOrEqual(WORK.mailMax);

    const a = newGame(1);
    a.work.nextCallAt = 1e9;
    a.walkby.nextAt = 1e9;
    a.upgrades.push('autoreply');
    run(a, WORK.firstMailAt + WORK.autoReplyEvery + 1);
    expect(a.stats.tasksAuto).toBeGreaterThan(0);
  });

  it('harder spreadsheets unlock with progress', () => {
    const s = newGame(9);
    expect(setSheetTab(s, 'budget')).toBe(false);
    s.stage = 2;
    s.targetIndex = 4;
    expect(setSheetTab(s, 'budget')).toBe(true);
    expect(setSheetTab(s, 'headcount')).toBe(false);
    s.targetIndex = 6;
    expect(setSheetTab(s, 'headcount')).toBe(true);
  });

  it('every kind of work pays roughly the same per minute for a quick, careful player', () => {
    // Per-item seconds for a decent human, and how long the item's round gives.
    const pace: Record<Exclude<WorkKind, 'call'>, number> = { mail: 3, expense: 2, sheet: 6 };
    const perMinute = (kind: Exclude<WorkKind, 'call'>) => {
      const s = desk(11);
      while (s.time < 120) {
        const r = open(s, kind);
        const item = kind === 'mail' ? r.mail!.findIndex((m) => m.state === 'open') : kind === 'expense' ? r.receipts!.findIndex((x) => x.state === 'open') : 0;
        run(s, pace[kind]);
        if (kind === 'mail') answerMail(s, item, correctMail(r.mail![item]));
        else if (kind === 'expense') stampReceipt(s, item, correctStamp(r, item));
        else {
          const t = typosLeft(r)[0];
          checkCell(s, t.row, t.col);
        }
      }
      return (s.salary / s.time) * 60;
    };
    const rates = { mail: perMinute('mail'), expense: perMinute('expense'), sheet: perMinute('sheet') };
    const lo = Math.min(...Object.values(rates));
    const hi = Math.max(...Object.values(rates));
    expect(hi / lo).toBeLessThan(1.6);
  });

  it('your Shooters keep firing at half speed while you are at your computer', () => {
    const shots = (busy: boolean) => {
      const s = newGame(1);
      s.stage = 2;
      s.targetIndex = 4;
      s.targetResolve = 1e6;
      s.bands = 1e4;
      s.allies = [{ id: 'gary', role: 'shooter', timer: 0, served: 0, rank: 0 }];
      s.walkby.nextAt = 1e9;
      setLookBusy(s, busy);
      run(s, 60);
      return s.stats.shots;
    };
    expect(shots(true)).toBeCloseTo(shots(false) / 2, 0);
  });

  it('coworkers message you (typing first), one conversation each, and some can be answered', () => {
    const s = newGame(1);
    s.walkby.nextAt = 1e9;
    s.targetResolve = 0.5;
    flick(s);
    expect(typing(s)).toEqual(['Gary']);
    run(s, 2);
    const gary = s.chat.threads.find((t) => t.who === 'Gary')!;
    expect(gary.msgs[gary.msgs.length - 1].text).toBe('that was a warm-up');
    expect(chatUnread(s)).toBe(1);
    readThread(s, 'Gary');
    expect(chatUnread(s)).toBe(0);
    const opts = replyOptions(s, 'Gary');
    expect(opts.length).toBe(2);
    expect(sendReply(s, 'Gary', 0)).toBe(true);
    expect(replyOptions(s, 'Gary')).toEqual([]);
    run(s, 4);
    expect(gary.msgs.map((m) => m.mine)).toEqual([false, true, false]);
    expect(buddies(s).some((b) => b.who === 'Gary')).toBe(true);
  });
});

describe('HR file', () => {
  /** A game in Stage 2 that has beaten Brad and owns the Clothespin Pistol. */
  function midStage2() {
    const s = newGame(3);
    s.stage = 2;
    s.targetIndex = TARGETS.findIndex((t) => t.id === 'printer');
    s.targetResolve = 3000;
    s.desks = 2; // Gary's desk + Brad's
    s.ownedWeapons = ['flick', 'ruler', 'clothespin'];
    s.weapon = 'clothespin';
    s.bands = 500;
    s.salary = 200;
    return s;
  }

  it('getting caught writes you up, takes your weapon and lets the target regroup', () => {
    const s = midStage2();
    addSuspicion(s, 200);
    expect(s.hr.writeUps).toBe(1);
    expect(s.hr.confiscated?.weapon).toBe('clothespin');
    expect(weapon(s).id).toBe('flick'); // you (and your Shooters) are back to the finger
    expect(buyWeapon(s, 'clothespin').ok).toBe(false); // can't re-equip it
    expect(s.targetResolve).toBe(3000 + 7000 * TUNING.regroupShare);
    expect(s.bands).toBe(300);
  });

  it('Lost and Found sells your weapon back, or it comes back on its own', () => {
    const a = midStage2();
    addSuspicion(a, 200);
    const price = buyBackPrice(a);
    const clothespin = WEAPONS.find((w) => w.id === 'clothespin')!.price;
    expect(price).toBe(clothespin / 2); // half what the Clothespin costs
    const before = a.salary;
    expect(buyBack(a).ok).toBe(true);
    expect(a.salary).toBe(before - price);
    expect(weapon(a).id).toBe('clothespin');

    const b = midStage2();
    addSuspicion(b, 200);
    b.suspicion = 0;
    run(b, TUNING.confiscateSeconds + 1);
    expect(b.hr.confiscated).toBeNull();
    expect(weapon(b).id).toBe('clothespin');
  });

  it('write-ups fade after a stretch without being caught', () => {
    const s = midStage2();
    addSuspicion(s, 200);
    addSuspicion(s, 200);
    expect(s.hr.writeUps).toBe(2);
    s.suspicion = 0;
    s.walkby.nextAt = 1e9;
    run(s, TUNING.writeUpFade + 1);
    expect(s.hr.writeUps).toBe(1);
  });

  it('three write-ups is Final Warning; the next catch gets you fired', () => {
    const s = midStage2();
    for (let i = 0; i < 3; i++) addSuspicion(s, 200);
    expect(s.hr.writeUps).toBe(3);
    expect(s.stats.fired).toBe(0);
    addSuspicion(s, 200);
    expect(s.stats.fired).toBe(1);
    // Back to the start of Stage 2: Brad again, his desk handed back, a nearly empty drawer.
    expect(TARGETS[s.targetIndex].id).toBe('brad');
    expect(s.desks).toBe(1);
    expect(s.bands).toBe(TUNING.firedBands);
    expect(s.stage).toBe(2);
    // ...but a clean file, and you keep your weapons.
    expect(s.hr.writeUps).toBe(0);
    expect(s.hr.confiscated).toBeNull();
    expect(s.ownedWeapons).toContain('clothespin');
  });

  it('coworkers get promoted for time served, and get better at their job', () => {
    const s = midStage2();
    s.allies = [{ id: 'marjorie', role: 'lookout', timer: 0, served: 0, rank: 0 }];
    const before = rolePower(s, 'lookout');
    s.suspicion = 0;
    setLookBusy(s, true); // stay out of trouble while time passes
    run(s, PROMOTION.after[0] + 1);
    expect(s.allies[0].rank).toBe(1);
    expect(rolePower(s, 'lookout')).toBeCloseTo(before * PROMOTION.bonus[1]);
    run(s, PROMOTION.after[1] - PROMOTION.after[0]);
    expect(s.allies[0].rank).toBe(2);
    expect(s.stats.promotions).toBe(2);
  });

  it('old saves get a clean HR file and new hires', () => {
    const s = midStage2();
    s.allies = [{ id: 'gary', role: 'shooter', timer: 0, served: 0, rank: 0 }];
    const file = JSON.parse(serialize(s));
    file.version = 1;
    delete file.state.hr;
    delete file.state.allies[0].served;
    delete file.state.allies[0].rank;
    const back = deserialize(JSON.stringify(file));
    expect(back?.state.hr.writeUps).toBe(0);
    expect(back?.state.allies[0].rank).toBe(0);
    expect(back?.state.allies[0].served).toBe(0);
  });
});

describe('desk drawer and deliveries', () => {
  it('the drawer runs out, then strays turn up a few seconds apart', () => {
    const s = newGame(1);
    s.supplies.refillAt = 1e9; // nothing turns up while we empty it
    for (let i = 0; i < SUPPLIES.drawerCap; i++) expect(scrounge(s, 'band').ok).toBe(true);
    expect(s.bands).toBe(TUNING.startBands + SUPPLIES.drawerCap);
    expect(scrounge(s, 'band').ok).toBe(false);
    s.supplies.refillAt = s.time;
    run(s, SUPPLIES.refillEvery * 3 + 0.5);
    expect(s.supplies.drawer).toBe(4);
    run(s, 600);
    expect(s.supplies.drawer).toBe(drawerCap(s)); // and no further
  });

  it('Rummage Deeper grabs two at a time and doubles the drawer', () => {
    const s = newGame(1);
    s.salary = 100;
    expect(buyUpgrade(s, 'rummage').ok).toBe(true);
    expect(drawerCap(s)).toBe(SUPPLIES.drawerCap * 2);
    const before = s.bands;
    scrounge(s, 'band');
    expect(s.bands).toBe(before + 2);
  });

  it('finds come out first: a ball is a pile of bands, loose change is Salary', () => {
    const s = newGame(1);
    s.supplies.find = 'ball';
    const r = scrounge(s);
    expect(r.ok && r.item).toBe('ball');
    expect(s.bands).toBe(TUNING.startBands + SUPPLIES.ball[1]);
    expect(s.supplies.find).toBeNull();
    s.supplies.find = 'change';
    scrounge(s);
    expect(s.salary).toBe(SUPPLIES.change[1]);
    expect(s.stats.finds).toBe(2);
  });

  it('an order is paid now and arrives later as a box; orders placed meanwhile ride along', () => {
    const s = newGame(1);
    s.salary = 20;
    expect(orderSupplies(s).ok).toBe(true);
    expect(orderSupplies(s).ok).toBe(true);
    expect(s.salary).toBe(10);
    expect(s.bands).toBe(TUNING.startBands);
    run(s, SUPPLIES.deliverySeconds + 0.5);
    expect(s.supplies.order).toBeNull();
    expect(s.supplies.box?.amount).toBe(100);
    const r = openBox(s);
    expect(r.ok).toBe(true);
    expect(s.bands).toBe(TUNING.startBands + 100);
    expect(openBox(s).ok).toBe(false);
  });

  it('Mr. Feeney notices an unopened box, even while you work', () => {
    const s = newGame(1);
    setLookBusy(s, true);
    s.supplies.box = { amount: 50, arrivedAt: 0, free: false };
    s.walkby.nextAt = 1;
    s.suspicion = 30;
    run(s, 1 + mods(s).warning + 0.2);
    expect(s.stats.hides).toBe(1);
    expect(s.events.some((e) => e.type === 'boxSpotted')).toBe(true);
  });

  it('time away fills the drawer and delivers what you ordered', () => {
    const s = newGame(1);
    s.salary = 5;
    orderSupplies(s);
    s.supplies.drawer = 0;
    applyOffline(s, 600);
    expect(s.supplies.drawer).toBe(drawerCap(s));
    expect(s.supplies.box?.amount).toBe(50);
  });

  it('old saves get a full drawer and nothing on order', () => {
    const s = newGame(3);
    const file = JSON.parse(serialize(s));
    file.version = 4;
    delete file.state.supplies;
    const back = deserialize(JSON.stringify(file));
    expect(back?.state.supplies.drawer).toBe(SUPPLIES.drawerCap);
    expect(back?.state.supplies.box).toBeNull();
  });
});

describe("Dale's black market", () => {
  const quiet = (s: ReturnType<typeof newGame>) => {
    s.walkby.nextAt = 1e9;
    s.work.nextCallAt = 1e9;
  };

  it('keeps the rubber band upgrades on his table; office upgrades are Procurement forms', () => {
    expect(daleSells('silent')).toBe(true);
    expect(daleSells('thick')).toBe(true);
    expect(daleSells('chair')).toBe(false);
    expect(daleSells('autoreply')).toBe(false);
  });

  it('introduces himself, then leans over the wall with a deal that is never cheap', () => {
    const s = newGame(5);
    quiet(s);
    s.salary = 40;
    run(s, DALE.introAt + 3);
    expect(s.dale.introduced).toBe(true);
    expect(s.chat.threads.some((t) => t.who.startsWith('Dale'))).toBe(true);
    run(s, DALE.firstDealAt - s.time + 1);
    const deal = s.dale.deal!;
    expect(deal).toBeTruthy();
    const base =
      deal.kind === 'weapon' ? priceOf(s, WEAPONS.find((w) => w.id === deal.id)!.price) : priceOf(s, UPGRADES.find((u) => u.id === deal.id)!.price);
    if (deal.early) expect(deal.price).toBeGreaterThan(base);
    else expect(deal.price).toBeGreaterThanOrEqual(Math.floor(base * (1 - DALE.discount[1])));
    run(s, DALE.dealSeconds + 1);
    expect(s.dale.deal).toBeNull();
  });

  it('a deal can be taken (or passed), and Dale bolts when Mr. Feeney comes', () => {
    const s = newGame(6);
    quiet(s);
    s.salary = 100000;
    s.dale.nextDealAt = 0;
    run(s, 0.2);
    const deal = s.dale.deal!;
    const before = s.salary;
    expect(takeDeal(s).ok).toBe(true);
    expect(s.salary).toBe(before - deal.price);
    expect(deal.kind === 'weapon' ? s.ownedWeapons.includes(deal.id as never) : s.upgrades.includes(deal.id as never)).toBe(true);
    expect(takeDeal(s).ok).toBe(false);

    s.dale.nextDealAt = s.time;
    run(s, 0.2);
    expect(s.dale.deal).toBeTruthy();
    passDeal(s);
    expect(s.dale.deal).toBeNull();

    s.dale.nextDealAt = s.time;
    run(s, 0.2);
    s.walkby.nextAt = s.time;
    run(s, 0.2);
    expect(s.dale.deal).toBeNull();
  });

  it('no deals while you are at your computer', () => {
    const s = newGame(7);
    quiet(s);
    setLookBusy(s, true);
    s.dale.nextDealAt = 0;
    run(s, 5);
    expect(s.dale.deal).toBeNull();
  });

  it('Double-Thick Bands hit harder; Waxed Bands stretch further', () => {
    const a = newGame(1);
    const b = newGame(1);
    b.upgrades.push('thick');
    flick(a);
    flick(b);
    expect(TARGETS[0].resolve - b.targetResolve).toBeCloseTo((TARGETS[0].resolve - a.targetResolve) * DALE.thickDamage);
    b.upgrades.push('waxed');
    expect(mods(b).perfectWindow).toBe(DALE.waxedWindow);
    expect(mods(b).snapAfter).toBeGreaterThan(mods(a).snapAfter);
  });
});

describe('money', () => {
  /** Answers the next email right (opening a fresh burst when needed). */
  const take = (s: ReturnType<typeof newGame>, right = true) => {
    s.work.mailWaiting = Math.max(s.work.mailWaiting, 5);
    focusApp(s, 'mail');
    const r = startRound(s, 'mail')!;
    const i = r.mail!.findIndex((m) => m.state === 'open');
    const a = correctMail(r.mail![i]);
    return answerMail(s, i, right ? a : a.act === 'delete' ? { act: 'reply', choice: 0 } : { act: 'delete' })!;
  };

  it('beating someone pays their bounty (promotions come from your work, not the war)', () => {
    const s = newGame(1);
    s.bands = 100;
    s.targetResolve = 0.5;
    flick(s);
    const gary1 = TARGETS[0];
    expect(s.salary).toBe(gary1.bounty);
    expect(s.stats.bounties).toBe(gary1.bounty);
    expect(s.events.some((e) => e.type === 'pay' && e.source === 'bounty' && e.amount === gary1.bounty)).toBe(true);
    expect(payGrade(s)).toBe(PAY_GRADES[0]);
  });

  it('bounties grow down the floor', () => {
    for (let i = 1; i < TARGETS.length; i++) expect(TARGETS[i].bounty).toBeGreaterThan(TARGETS[i - 1].bounty);
  });

  it('work done in a row builds a combo that pays more; a slip or a long pause ends it', () => {
    const s = newGame(1);
    s.walkby.nextAt = 1e9;
    setLookBusy(s, true);
    const first = take(s).pay;
    const second = take(s).pay;
    expect(liveCombo(s)).toBe(2);
    expect(second).toBeCloseTo(first * (1 + COMBO.step));
    for (let i = 0; i < 20; i++) take(s);
    expect(comboMult(s)).toBe(1 + COMBO.step * COMBO.cap); // capped
    s.time += COMBO.window + 1;
    expect(liveCombo(s)).toBe(0);

    take(s);
    take(s);
    take(s, false);
    expect(liveCombo(s)).toBe(0);
    expect(s.stats.bestCombo).toBeGreaterThanOrEqual(COMBO.cap + 1);
  });
});

describe('one shop and the shopping list', () => {
  it('lists the next weapon first, then the cheapest things you could buy', () => {
    const s = newGame(1);
    const list = shoppingList(s, 3);
    expect(list[0]).toMatchObject({ kind: 'weapon', id: 'ruler' });
    expect(list.slice(1).map((i) => i.price)).toEqual([...list.slice(1).map((i) => i.price)].sort((a, b) => a - b));
    expect(itemKey(list[0])).toBe('w:ruler');
    // Owned and locked things never show up.
    s.ownedWeapons.push('ruler');
    s.upgrades.push('rummage');
    const keys = forSale(s).map(itemKey);
    expect(keys).not.toContain('w:ruler');
    expect(keys).not.toContain('u:rummage');
    expect(keys).not.toContain('w:repeater');
    expect(keys.some((k) => k.startsWith('r:'))).toBe(false);
  });

  it('counts what you can afford in the closet and in the Org Chart separately', () => {
    const s = newGame(1);
    expect(affordable(s)).toBe(0);
    s.salary = 30; // Ruler $15, Rummage $10, Organizer $25
    expect(affordable(s, 'closet')).toBe(3);
    s.stage = 2;
    s.targetIndex = 4;
    s.salary = 40;
    expect(affordable(s, 'org')).toBe(1); // Kevin
  });

  it('office upgrades are bought the same way, and coworkers who ask to join carry a Recruit button', () => {
    const s = newGame(1);
    s.salary = 1000;
    expect(buyUpgrade(s, 'organizer').ok).toBe(true);
    for (let i = 0; i < 4; i++) {
      s.bands = 100000;
      s.targetResolve = 0.5;
      s.nextFlickAt = 0;
      flick(s);
    }
    const kevin = s.inbox.find((m) => m.from === 'Kevin');
    expect(kevin?.recruit).toBe('kevin');
    expect(s.inbox.find((m) => m.from === 'Marjorie')?.recruit).toBe('marjorie');
  });
});

describe('your career', () => {
  const fresh = () => {
    const s = newGame(1);
    s.walkby.nextAt = 1e9;
    s.work.nextCallAt = 1e9;
    s.dale.nextDealAt = 1e9;
    setLookBusy(s, true);
    return s;
  };

  it('work done right fills Performance; a clean, quick round adds a bonus', () => {
    const s = fresh();
    s.work.mailWaiting = 5;
    focusApp(s, 'mail');
    const r = startRound(s, 'mail')!;
    r.mail!.forEach((m, i) => answerMail(s, i, correctMail(m)));
    expect(s.work.last?.grade).toBe('A');
    expect(s.career.review).toBe(Math.min(reviewNeed(0), r.items * CAREER.itemPoints + CAREER.gradePoints.A));
  });

  it('the bar stops at full and waits for your review; the review promotes you', () => {
    const s = fresh();
    const pay = basePay(s, 'mail');
    expect(promote(s)).toBe(false);
    addReview(s, 1e6);
    expect(s.career.review).toBe(reviewNeed(0)); // never more than one promotion banked
    expect(reviewReady(s)).toBe(true);
    expect(s.events.some((e) => e.type === 'reviewReady')).toBe(true);
    expect(s.inbox[0].from).toBe('Mr. Feeney');
    expect(promote(s)).toBe(true);
    expect(s.career).toEqual({ rank: 1, review: 0 });
    expect(payGrade(s)).toBe(PAY_GRADES[1]);
    expect(basePay(s, 'mail')).toBeCloseTo(pay * PAY_GRADES[1].mult);
    expect(reviewReady(s)).toBe(false);
  });

  it('each promotion asks more, and CEO is the top', () => {
    for (let r = 1; r < TOP_RANK; r++) expect(reviewNeed(r)).toBeGreaterThan(reviewNeed(r - 1));
    for (let i = 1; i < PAY_GRADES.length; i++) expect(PAY_GRADES[i].mult).toBeGreaterThan(PAY_GRADES[i - 1].mult);
    const s = fresh();
    s.career.rank = TOP_RANK;
    addReview(s, 1e9);
    expect(reviewReady(s)).toBe(false);
    expect(promote(s)).toBe(false);
    expect(PAY_GRADES[TOP_RANK].title).toBe('CEO');
  });

  it('work goes on after the first slice', () => {
    const s = fresh();
    s.stage = 3;
    run(s, 60);
    expect(s.work.mailWaiting).toBeGreaterThan(0);
  });
});

describe('your team', () => {
  const boss = (rank: number) => {
    const s = newGame(1);
    s.walkby.nextAt = 1e9;
    s.work.nextCallAt = 1e9;
    s.dale.nextDealAt = 1e9;
    s.career.rank = rank;
    s.salary = 1e7;
    return s;
  };

  it('each team unlocks at its rank, and every seat costs more than the last', () => {
    const s = boss(0);
    expect(hire(s, 'temp').ok).toBe(false);
    s.career.rank = TEAMS[0].unlockRank;
    const first = seatCost(s, 'temp');
    expect(first).toBe(TEAMS[0].cost);
    expect(hire(s, 'temp').ok).toBe(true);
    expect(s.salary).toBe(1e7 - first);
    expect(seatCost(s, 'temp')).toBeGreaterThan(first);
    expect(s.inbox[0].from).toBe(leadName(s, TEAMS[0]));
    expect(hire(s, 'receptionist').ok).toBe(false);
    for (let i = 1; i < TEAMS.length; i++) expect(TEAMS[i].unlockRank).toBeGreaterThan(TEAMS[i - 1].unlockRank);
  });

  it('a team earns half your pay for its work, all the time, and adds a little Performance', () => {
    const s = boss(3);
    allTrophies(s);
    hire(s, 'temp');
    hire(s, 'receptionist');
    const before = s.salary;
    const perMin = staffPayPerMin(s);
    const expected = TEAMS[0].perMin * basePay(s, 'mail') * STAFF.quality + TEAMS[1].perMin * basePay(s, 'call') * STAFF.quality;
    expect(perMin).toBeCloseTo(expected);
    run(s, 60);
    expect(s.salary - before).toBeCloseTo(perMin, 0);
    expect(s.career.review).toBeGreaterThan(0);
    expect(s.events.some((e) => e.type === 'pay' && e.source === 'team')).toBe(true);
  });

  it('training makes a team more productive; the Assistant Manager speeds up everyone else', () => {
    const s = boss(TEAMS[4].unlockRank);
    expect(trainCost(s, 'temp')).toBeNull(); // nobody to train yet
    hire(s, 'temp');
    const base = teamPerMin(s, 'temp');
    expect(train(s, 'temp').ok).toBe(true);
    expect(teamPerMin(s, 'temp')).toBeCloseTo(base * STAFF.trainBoost);
    hire(s, 'manager');
    expect(teamPerMin(s, 'temp')).toBeCloseTo(base * STAFF.trainBoost * (1 + STAFF.managerBoost));
    expect(teamPerMin(s, 'manager')).toBe(0);
    s.salary = 1e12;
    for (let i = 1; i < STAFF.training.length; i++) expect(train(s, 'temp').ok).toBe(true);
    expect(trainCost(s, 'temp')).toBeNull(); // fully trained
  });

  it('your team keeps working while the game is closed', () => {
    const s = boss(1);
    hire(s, 'temp');
    const before = s.salary;
    const res = applyOffline(s, 3600)!;
    expect(res.team).toBeCloseTo(staffPayPerMin(s) * 60, 0);
    expect(s.salary - before).toBeCloseTo(res.salary, 0);
    expect(s.inbox[0].body).toContain('Your team made');
  });
});

describe('the office: Bailey, moments, goals', () => {
  const office = () => {
    const s = newGame(2);
    s.walkby.nextAt = 1e9;
    s.work.nextCallAt = 1e9;
    s.dale.nextDealAt = 1e9;
    return s;
  };

  it('your team follows your lead: a live work combo speeds them up (not while you’re away)', () => {
    const s = office();
    s.career.rank = 1;
    s.salary = 1e6;
    hire(s, 'temp');
    const base = teamPerMin(s, 'temp');
    s.work.combo = 10;
    s.work.comboAt = s.time;
    expect(teamPerMin(s, 'temp')).toBeCloseTo(base * 2);
    expect(teamPerMin(s, 'temp', true)).toBeCloseTo(base);
    expect(staffPayPerMin(s, true)).toBeLessThan(staffPayPerMin(s));
  });

  it('moments turn up now and then, last a few seconds, and are only ever good', () => {
    const s = office();
    run(s, MOMENTS.first + 0.2);
    expect(s.office.moment).not.toBeNull();
    run(s, MOMENTS.seconds + 0.2);
    expect(s.office.moment).toBeNull();
    expect(claimMoment(s)).toBeNull();

    const grab = (kind: (typeof s.office.moment & {})['kind']) => {
      s.office.moment = { kind, until: s.time + 5 };
      return claimMoment(s);
    };
    const bands = s.bands;
    grab('ball');
    expect(s.bands).toBeGreaterThanOrEqual(bands + 30);
    s.suspicion = 50;
    grab('vending');
    expect(s.suspicion).toBe(50 - MOMENTS.vendingCalm);
    s.career.rank = 1;
    s.salary = 1e6;
    hire(s, 'temp');
    const steady = teamPerMin(s, 'temp');
    grab('pizza');
    expect(teamPerMin(s, 'temp')).toBeCloseTo(steady * MOMENTS.pizzaTeam);
    const r = s.targetResolve;
    grab('muffins');
    expect(s.targetResolve).toBeLessThan(r);
    const next = s.walkby.nextAt = s.time + 10;
    grab('joey');
    expect(s.walkby.nextAt).toBeCloseTo(next + MOMENTS.joeyDelay);
    expect(s.stats.moments).toBe(5);
  });

  it('Bailey hears Mr. Feeney first, and a scratch behind the ears calms you (now and then)', () => {
    const s = office();
    expect(mods(s).warning).toBe(TUNING.warnBase + BAILEY.warn);
    s.suspicion = 20;
    expect(petBailey(s).calmed).toBe(true);
    expect(s.suspicion).toBe(20 - BAILEY.petCalm);
    expect(petBailey(s).calmed).toBe(false);
    expect(s.suspicion).toBe(20 - BAILEY.petCalm);
    run(s, BAILEY.petEvery);
    expect(petBailey(s).calmed).toBe(true);
  });

  it('three goals a day; finishing one pays and adds Performance; tomorrow brings new ones', () => {
    const s = office();
    run(s, 0.2);
    expect(s.goals.list.length).toBe(GOALS.perDay);
    s.goals.list[0] = { id: 'pet', base: s.stats.pets, done: false };
    const salary = s.salary;
    for (let i = 0; i < 3; i++) petBailey(s);
    run(s, 0.2);
    expect(s.goals.list[0].done).toBe(true);
    expect(goalProgress(s, 0).finished).toBe(true);
    expect(s.salary).toBeGreaterThan(salary);
    expect(s.career.review).toBeGreaterThan(0);
    expect(s.events.some((e) => e.type === 'goalDone')).toBe(true);
    const day = s.goals.day;
    run(s, WORK.dayLength);
    expect(s.goals.day).toBe(day + 1);
    expect(s.goals.list.every((g) => !g.done)).toBe(true);
    for (const g of GOAL_DEFS) expect(g.target).toBeGreaterThan(0);
  });

  it('you can rename yourself and your team leads; Messenger uses first names', () => {
    const s = office();
    const temp = TEAMS.find((t) => t.id === 'temp')!;
    expect(leadName(s, temp)).toBe(`${temp.lead} ${temp.surname}`);
    expect(chatName(s, '@temp')).toBe(temp.lead);
    rename(s, 'temp', '  Ada   Lovelace  ');
    expect(leadName(s, temp)).toBe('Ada Lovelace');
    expect(chatName(s, '@temp')).toBe('Ada');
    rename(s, 'temp', '');
    expect(leadName(s, temp)).toBe(`${temp.lead} ${temp.surname}`);
  });
});

describe('the rubber band ball and the Barrage', () => {
  const war = () => {
    const s = newGame(3);
    s.walkby.nextAt = 1e9;
    s.work.nextCallAt = 1e9;
    s.dale.nextDealAt = 1e9;
    s.office.nextAt = 1e9;
    return s;
  };
  const stage2 = () => {
    const s = war();
    s.stage = 2;
    s.targetIndex = TARGETS.findIndex((t) => t.stage === 2);
    s.targetResolve = TARGETS[s.targetIndex].resolve;
    return s;
  };

  it('turns up once the second Gary gives in, and a tap winds on a quarter of your loose bands', () => {
    const s = war();
    expect(ballUnlocked(s)).toBe(false);
    expect(wind(s).ok).toBe(false);
    s.targetIndex = BALL.unlockTarget;
    run(s, 0.2);
    expect(s.ball.found).toBe(true);
    s.bands = 400;
    expect(windAmount(s)).toBe(100);
    const r = wind(s);
    expect(r.ok && r.amount).toBe(100);
    expect(s.bands).toBe(300);
    expect(s.ball.wound).toBe(100);
    s.bands = 12;
    expect(windAmount(s)).toBe(BALL.windMin);
    s.bands = 4;
    expect(windAmount(s)).toBe(4);
    s.bands = 0;
    expect(wind(s).ok).toBe(false);
  });

  it('grows through four sizes, each a permanent perk', () => {
    const s = stage2();
    allTrophies(s);
    s.career.rank = 1;
    s.salary = 1e6;
    hire(s, 'temp');
    const team = teamPerMin(s, 'temp', true);
    const pay = basePay(s, 'mail');
    s.suspicion = 50;
    run(s, 1);
    const cooledSmall = 50 - s.suspicion;

    s.ball.wound = BALL.sizes[0].at;
    expect(ballSize(s)).toBe(1);
    s.suspicion = 50;
    run(s, 1);
    expect(50 - s.suspicion).toBeCloseTo(cooledSmall * BALL.cool, 1);

    s.allies.push(newAlly('gary', 'shooter'));
    s.bands = 1e5;
    const before = barrageSize(s);
    s.ball.wound = BALL.sizes[1].at;
    expect(barrageSize(s)).toBe(before * 2);

    s.ball.wound = BALL.sizes[2].at;
    expect(teamPerMin(s, 'temp', true)).toBeCloseTo(team * BALL.team);
    s.ball.wound = BALL.sizes[3].at;
    expect(ballSize(s)).toBe(4);
    expect(basePay(s, 'mail')).toBeCloseTo(pay * BALL.pay);
  });

  it('keeps growing past The Monster: every layer, bands hit 5% harder', () => {
    const s = stage2();
    s.ball.wound = BALL.sizes[3].at;
    expect(ballLayers(s)).toBe(0);
    expect(ballDamageMult(s)).toBe(1);
    s.ball.wound = BALL.sizes[3].at + BALL.layer * 4 + 10;
    expect(ballLayers(s)).toBe(4);
    expect(ballDamageMult(s)).toBeCloseTo(1 + 4 * BALL.layerDamage);
    // Winding over the line tells you.
    s.ball.wound = BALL.sizes[3].at + BALL.layer * 5 - 5;
    s.bands = 1000;
    const r = wind(s);
    expect(r.ok && r.layer).toBe(5);
    // And it shows up in the damage.
    s.suspicion = 0;
    const plain = stage2();
    plain.suspicion = 0;
    const hit = (g: typeof s) => {
      const before = g.targetResolve;
      g.time += 100;
      flick(g);
      return before - g.targetResolve;
    };
    expect(hit(s) / hit(plain)).toBeCloseTo(1 + 5 * BALL.layerDamage, 2);
  });

  it('Barrage: a pocketful each for you and your Shooters, all at once, then a cooldown', () => {
    const s = stage2();
    s.allies.push(newAlly('gary', 'shooter'));
    s.bands = 1000;
    s.suspicion = 0;
    const resolve = s.targetResolve;
    expect(barrageSize(s)).toBe(BARRAGE.perPerson * 2);
    expect(barrage(s).ok).toBe(true);
    expect(s.bands).toBe(1000 - BARRAGE.perPerson * 2);
    expect(resolve - s.targetResolve).toBeCloseTo(BARRAGE.perPerson * 2 * weapon(s).damage * BARRAGE.power);
    expect(s.suspicion).toBeGreaterThan(BARRAGE.noise * 0.5);
    expect(s.stats.barrages).toBe(1);
    // Reloading, then ready again.
    expect(barrage(s).ok).toBe(false);
    s.barrageAt = s.time;
    s.bands = BARRAGE.min - 1;
    expect(barrage(s).ok).toBe(false);
    // Not from your computer, not in Stage 1.
    s.bands = 1000;
    s.lookBusy = true;
    expect(barrage(s).ok).toBe(false);
    s.lookBusy = false;
    const one = war();
    one.bands = 1000;
    expect(barrage(one).ok).toBe(false);
  });

  it('a Barrage that finishes someone off captures them', () => {
    const s = stage2();
    s.bands = 1000;
    s.targetResolve = 50;
    const index = s.targetIndex;
    expect(barrage(s).ok).toBe(true);
    expect(s.targetIndex).toBe(index + 1);
  });

  it('the ball survives a save', () => {
    const s = stage2();
    s.ball.wound = 1234;
    const back = deserialize(serialize(s))!;
    expect(back.state.ball.wound).toBe(1234);
    const old = JSON.parse(serialize(s));
    old.version = 9;
    delete old.state.ball;
    delete old.state.barrageAt;
    const migrated = deserialize(JSON.stringify(old))!.state;
    expect(migrated.ball).toEqual({ wound: 0, found: false });
    expect(migrated.barrageAt).toBe(0);
  });
});

describe("Bailey's tricks", () => {
  const office = () => {
    const s = newGame(9);
    s.walkby.nextAt = 1e9;
    s.work.nextCallAt = 1e9;
    s.dale.nextDealAt = 1e9;
    s.office.nextAt = 1e9;
    return s;
  };
  /** Scratch her ears `n` times, a few seconds apart (so each one counts). */
  const scratch = (s: ReturnType<typeof newGame>, n: number) => {
    for (let i = 0; i < n; i++) {
      run(s, BAILEY.scratchEvery + 0.1);
      petBailey(s);
    }
  };

  it('only one scratch every few seconds counts, so tapping away doesn’t rush her', () => {
    const s = office();
    run(s, 10);
    for (let i = 0; i < 20; i++) petBailey(s);
    expect(s.stats.pets).toBe(20);
    expect(s.office.scratches).toBe(1);
  });

  it('Fetch, Guard, Play Dead and Howl, in that order, each a perk for good', () => {
    const s = office();
    const bands = mods(s).bandsPerSec;
    const warning = mods(s).warning;
    scratch(s, BAILEY.tricks[0].at);
    expect(knowsTrick(s, 'fetch')).toBe(true);
    expect(mods(s).bandsPerSec).toBeCloseTo(bands + BAILEY.fetchRate);
    expect(nextTrick(s)?.id).toBe('guard');
    scratch(s, BAILEY.tricks[1].at - s.office.scratches);
    expect(mods(s).warning).toBe(warning + 1);

    // Play Dead: getting caught costs half as many bands.
    const caughtLoss = (playDead: boolean) => {
      const c = office();
      c.office.scratches = playDead ? BAILEY.tricks[2].at : 0;
      c.bands = 1000;
      addSuspicion(c, 200);
      return 1000 - c.bands;
    };
    expect(caughtLoss(true)).toBe(caughtLoss(false) * BAILEY.playDeadLoss);

    // Howl: Mr. Feeney turns around, once every five minutes.
    s.office.scratches = BAILEY.tricks[3].at;
    expect(nextTrick(s)).toBeNull();
    s.walkby.arrivesAt = s.time + 3;
    expect(canHowl(s)).toBe(true);
    expect(baileyHowl(s)).toBe(true);
    expect(s.walkby.arrivesAt).toBeNull();
    expect(s.walkby.nextAt).toBeCloseTo(s.time + BAILEY.howlDelay);
    s.walkby.arrivesAt = s.time + 3;
    expect(baileyHowl(s)).toBe(false);
    run(s, BAILEY.howlEvery);
    s.walkby.arrivesAt = s.time + 3;
    expect(baileyHowl(s)).toBe(true);
  });

  it('old saves give her credit for some of the petting she already got', () => {
    const s = office();
    s.stats.pets = 30;
    const file = JSON.parse(serialize(s));
    file.version = 11;
    delete file.state.office.scratches;
    expect(deserialize(JSON.stringify(file))!.state.office.scratches).toBe(10);
  });
});

describe('rematches after the war', () => {
  const lastFight = () => {
    const s = newGame(5);
    s.walkby.nextAt = 1e9;
    s.work.nextCallAt = 1e9;
    s.dale.nextDealAt = 1e9;
    s.office.nextAt = 1e9;
    s.stage = 2;
    s.targetIndex = TARGETS.length - 1;
    s.targetResolve = 0.5;
    s.bands = 1000;
    return s;
  };
  const win = (s: ReturnType<typeof newGame>) => {
    s.targetResolve = 0.5;
    s.nextFlickAt = 0;
    s.flickLockUntil = 0;
    s.suspicion = 0;
    expect(flick(s).ok).toBe(true);
  };

  it('beating Rick starts the Department War, with Gary waiting for a rematch at half his old Resolve', () => {
    const s = lastFight();
    win(s);
    expect(s.stage).toBe(3);
    expect(currentTarget(s)?.id).toBe('it');
    expect(s.targetResolve).toBe(DEPARTMENTS[0].resolve);
    expect(s.rematch).toMatchObject({ round: 1, index: 0 });
    expect(fight(s, 'rematch').ok).toBe(true);
    const t = currentTarget(s)!;
    expect(t.id).toBe('gary4');
    expect(t.resolve).toBe(Math.round(TARGETS.find((x) => x.id === 'gary4')!.resolve * REMATCH.first));
    expect(s.targetResolve).toBe(t.resolve);
    expect(canFlick(s).ok).toBe(true);
  });

  it('each win pays a bounty and some Performance, then the next one walks up; after Rick, a tougher round', () => {
    const s = lastFight();
    win(s);
    fight(s, 'rematch');
    for (let i = 0; i < REMATCH.firstWar; i++) {
      const salary = s.salary;
      const review = s.career.review;
      const bounty = currentTarget(s)!.bounty;
      win(s);
      expect(s.salary).toBeGreaterThanOrEqual(salary + bounty);
      expect(s.career.review).toBeGreaterThan(review);
    }
    expect(s.stats.rematches).toBe(REMATCH.firstWar);
    expect(s.rematch).toMatchObject({ round: 2, index: 0 });
    expect(currentTarget(s)!.resolve).toBe(rematchStats(s, 2, 0).resolve);
    expect(rematchStats(s, 2, 0).resolve).toBeGreaterThan(rematchStats(s, 1, 0).resolve);
  });

  it('old saves that finished the war get their rematch on the next step', () => {
    const s = lastFight();
    s.stage = 3;
    s.targetResolve = 0;
    const file = JSON.parse(serialize(s));
    file.version = 10;
    delete file.state.rematch;
    const back = deserialize(JSON.stringify(file))!.state;
    expect(back.rematch).toBeNull();
    run(back, 0.2);
    // They keep their rematch, and the Department War opens on the map.
    expect(currentTarget(back)?.id).toBe('gary4');
    expect(back.war.fighting).toBe('rematch');
    expect(back.war.announced).toBe(false);
    expect(fight(back, 'it').ok).toBe(true);
    expect(currentTarget(back)?.id).toBe('it');
  });
});

describe('saves', () => {
  it('round-trips through serialize and export', () => {
    const s = newGame(7);
    scrounge(s);
    run(s, 30);
    const back = deserialize(serialize(s));
    expect(back?.state.bands).toBeCloseTo(s.bands);
    const imported = importSave(exportSave(s));
    expect(imported?.state.time).toBeCloseTo(s.time);
  });

  it('a save from before promotions keeps the pay grade the war gave you', () => {
    const s = newGame(7);
    s.stage = 2;
    s.targetIndex = 5;
    const file = JSON.parse(serialize(s));
    file.version = 7;
    delete file.state.career;
    delete file.state.staff;
    delete file.state.staffPay;
    const back = deserialize(JSON.stringify(file))!;
    expect(back.state.career).toEqual({ rank: 5, review: 0 });
    expect(back.state.staff).toEqual({});
    const done = { ...file, state: { ...file.state, stage: 3, targetIndex: 7 } };
    expect(deserialize(JSON.stringify(done))!.state.career.rank).toBe(8);
  });

  it('rejects garbage without throwing', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('{"version":999,"state":{}}')).toBeNull();
    expect(importSave('%%%')).toBeNull();
  });

  it('is deterministic for the same seed and actions', () => {
    const a = playBot(STYLES[0], 900, 42);
    const b = playBot(STYLES[0], 900, 42);
    expect(serialize(a, 0)).toEqual(serialize(b, 0));
  });
});

describe('pacing (scripted bots)', () => {
  for (const style of STYLES) {
    it(`${style.name} bot finishes the slice with sane numbers`, () => {
      const s = playBot(style);
      const report = {
        style: style.name,
        stage1Min: s.stats.stage1At && +(s.stats.stage1At / 60).toFixed(1),
        stage2Min: s.stats.stage2At && +(s.stats.stage2At / 60).toFixed(1),
        caught: s.stats.caught,
        fired: s.stats.fired,
        hides: s.stats.hides,
        spotted: s.stats.walkbysSpotted,
        allies: s.allies.length,
      };
      console.log(JSON.stringify(report));
      expect(Number.isFinite(s.bands) && s.bands >= 0).toBe(true);
      if (style.reactsToWalkbys) expect(s.stage).toBe(3);
      else expect(s.stats.caught + s.stats.fired).toBeGreaterThan(5); // ignoring Suspicion should hurt
    });
  }
});

describe('anti-spam', () => {
  it('ignores shots faster than the weapon reload', () => {
    const s = newGame(3);
    s.bands = 100;
    expect(flick(s).ok).toBe(true);
    expect(flick(s).ok).toBe(false); // same instant
    step(s, TUNING.stepSeconds);
    expect(flick(s).ok).toBe(true); // Finger Flick reloads in 0.1 s
    s.salary = 1000;
    buyWeapon(s, 'ruler');
    buyWeapon(s, 'clothespin');
    step(s, TUNING.stepSeconds);
    expect(flick(s).ok).toBe(true);
    step(s, TUNING.stepSeconds);
    expect(flick(s).ok).toBe(false); // Clothespin needs 0.2 s
    step(s, TUNING.stepSeconds);
    expect(flick(s).ok).toBe(true);
  });
});

describe('hold to charge', () => {
  it('a full stretch hits much harder from one band, and a Perfect harder still', async () => {
    const s = newGame(5);
    allTrophies(s);
    s.bands = 10;
    s.targetIndex = 3; // Gary behind the fan: lots of Resolve
    s.targetResolve = 1600;
    const before = s.targetResolve;
    flick(s, 0);
    const tap = before - s.targetResolve;
    step(s, TUNING.stepSeconds);
    s.streak.n = 0; // (no hot streak: compare the stretch alone)
    const mid = s.targetResolve;
    flick(s, 1, false);
    const full = mid - s.targetResolve;
    step(s, TUNING.stepSeconds);
    s.streak.n = 0;
    const mid2 = s.targetResolve;
    flick(s, 1, true);
    const perfect = mid2 - s.targetResolve;
    expect(full / tap).toBeCloseTo(5);
    expect(perfect / tap).toBeCloseTo(CHARGE.perfectMult);
    expect(s.bands).toBe(7); // three shots, three bands
    expect(s.stats.perfect).toBe(1);
    // Perfects in a row hit harder each time (up to the 5th); anything else breaks the chain.
    s.bands = 100;
    const perfects: number[] = [];
    for (let i = 0; i < 6; i++) {
      step(s, TUNING.stepSeconds);
      s.streak.n = 0;
      const r = s.targetResolve;
      flick(s, 1, true);
      perfects.push((r - s.targetResolve) / tap);
    }
    expect(perfects.map((x) => Math.round(x))).toEqual([9, 10, 11, 12, 12, 12]);
    step(s, TUNING.stepSeconds);
    flick(s, 1, false);
    expect(s.perfectChain).toBe(0);
  });

  it('holding too long snaps the band', async () => {
    const { snapBand } = await import('../src/sim/engine');
    const s = newGame(5);
    snapBand(s);
    expect(s.bands).toBe(TUNING.startBands - 1);
    expect(s.stats.snapped).toBe(1);
    expect(s.suspicion).toBeGreaterThan(0);
  });
});
