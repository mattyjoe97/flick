// Stage 5: Corporate Politics.
//
// The whole 4th floor answers to you, so HR has opened an investigation. Leonard Fisk,
// Director of Human Resources, fights from behind a fortress of binders.
//
//   Deniability  Plausible Deniability, earned by real work: your rounds (more for good
//                grades), your Cover teammates and your hired teams
//   Memos        spend it on office policy from the Memos app (quiet shots, harder shots,
//                a faster team, cheaper hiring, shredded evidence); each has a cooldown
//   Case file    HR's evidence: getting caught, shooting at HR (he hears everything) and
//                interviews you miss fill it. Full, and HR takes one of your departments
//                until you win it back
//   Interviews   every few minutes someone you beat is called in to HR: coach them in time
//
// Close the case either way: flick Fisk's Resolve to nothing, or win HR over (the memos you
// send add up to goodwill). Then the floor is yours.
//
// Picking who to fight lives in war.ts with the departments and rooms.

import { addReview, reviewNeed, TOP_RANK } from './career';
import { chatEvent } from './chat';
import { DEPARTMENTS, HR_DIRECTOR, MEMOS, POLITICS, ROOMS, type DeptId, type MemoId } from './content';
import { rolePower } from './mods';
import { rand, randRange } from './rng';
import { startRematch } from './rematch';
import { currentTarget, newPolitics, perk, pushEmail, pushTicker, type GameState } from './state';
import { staffPayPerMin } from './staff';
import { payGrade } from './work';

const memo = (id: MemoId) => MEMOS.find((m) => m.id === id)!;
const deptOf = (id: DeptId) => DEPARTMENTS.find((d) => d.dept === id)!;

/** Stage 5 begins: you turn your desk toward HR, and the first interview comes a couple of minutes in. */
export function startPolitics(s: GameState) {
  const p = (s.war.politics ??= newPolitics());
  p.nextInterviewAt = s.time + POLITICS.interview.firstAt;
  s.war.fighting = 'hr';
  s.targetResolve = p.hrShare * HR_DIRECTOR.resolve;
  s.sinceLastHit = 0;
  if (!p.met) {
    p.met = true;
    pushEmail(s, HR_DIRECTOR.intro.from, HR_DIRECTOR.intro.subject, HR_DIRECTOR.intro.body, 'story');
  }
}

/** Old saves that had already taken the whole floor: HR opens its file on them too. */
export function politicsForOldSave(s: GameState) {
  s.war.politics = newPolitics();
  s.war.politics.nextInterviewAt = s.time + POLITICS.interview.firstAt;
  for (const d of DEPARTMENTS) s.war.depts[d.dept].seized = false;
}

// ---------------------------------------------------------------- memos

export type PoliticsResult = { ok: true } | { ok: false; reason: string };

/** Seconds until this memo can be sent again (0 when it's ready). */
export function memoCooldown(s: GameState, id: MemoId) {
  return Math.max(0, (s.war?.politics?.memos[id]?.readyAt ?? -999) - s.time);
}

/** Can this memo go out right now? */
export function canSendMemo(s: GameState, id: MemoId): PoliticsResult {
  if (s.stage !== 5) return { ok: false, reason: 'Memos are for Stage 5.' };
  const m = memo(id);
  const left = memoCooldown(s, id);
  if (left > 0) return { ok: false, reason: `Too soon: HR is still reading the last one (${Math.ceil(left)} s).` };
  if (s.war.politics.pd < m.cost) return { ok: false, reason: `That memo needs ${m.cost} Deniability. Real work earns it.` };
  return { ok: true };
}

/** Send a memo: the policy is in force for a while, and HR thinks a little better of you. */
export function sendMemo(s: GameState, id: MemoId): PoliticsResult {
  const can = canSendMemo(s, id);
  if (!can.ok) return can;
  const m = memo(id);
  const p = s.war.politics;
  p.pd -= m.cost;
  p.goodwill += m.cost;
  p.memos[id] = { until: s.time + m.seconds, readyAt: s.time + m.cooldown };
  s.stats.memos = (s.stats.memos ?? 0) + 1;
  if (id === 'retention') p.evidence = Math.max(0, p.evidence - POLITICS.evidence.retention);
  pushTicker(s, `Memo to all staff: ${m.name}. ${m.does}`);
  s.events.push({ type: 'memo', id });
  if (s.stats.memos === 1) chatEvent(s, 'memo');
  if (p.goodwill >= POLITICS.goodwill) closeCase(s, 'goodwill');
  return { ok: true };
}

// ---------------------------------------------------------------- the case file

/** Evidence goes in HR's case file. Full, and HR takes one of your departments. */
export function addEvidence(s: GameState, amount: number) {
  if (s.stage !== 5 || amount <= 0) return;
  const p = s.war.politics;
  p.evidence = Math.min(POLITICS.evidence.full, p.evidence + amount);
  if (p.evidence >= POLITICS.evidence.full) seize(s);
}

/** HR "reassigns" one of your departments to itself: its prize and desks are gone until you win it back. */
function seize(s: GameState) {
  const p = s.war.politics;
  p.evidence = POLITICS.evidence.after;
  const pool = DEPARTMENTS.filter((d) => s.war.depts[d.dept].taken && !s.war.depts[d.dept].seized);
  if (!pool.length) return;
  const d = pool[Math.floor(rand(s) * pool.length) % pool.length];
  const st = s.war.depts[d.dept];
  st.seized = true;
  st.share = 1;
  s.stats.seized = (s.stats.seized ?? 0) + 1;
  pushEmail(s, 'Leonard Fisk (HR)', `Re: ${d.label}`, `Following a review of the evidence, ${d.label} will report directly to HR for now. This is not a punishment. It is a learning opportunity.`, 'warning');
  pushTicker(s, `HR's case file is full. ${d.label} now reports to HR: its prize is gone until you win it back (on the map).`);
  s.events.push({ type: 'seized', dept: d.dept });
  chatEvent(s, 'seized');
}

/** You won a department back from HR. */
export function reclaimWon(s: GameState, id: DeptId) {
  const st = s.war.depts[id];
  st.seized = false;
  st.share = 0;
  s.stats.reclaimed = (s.stats.reclaimed ?? 0) + 1;
  pushTicker(s, `${deptOf(id).label} is yours again. ${deptOf(id).short} would like it noted that this is getting old.`);
  s.events.push({ type: 'reclaimed', dept: id });
  s.events.push({ type: 'capture', targetId: id });
  s.war.fighting = 'hr';
  s.targetResolve = s.war.politics.hrShare * HR_DIRECTOR.resolve;
  s.sinceLastHit = 0;
}

// ---------------------------------------------------------------- interviews

/** Everyone you've beaten who HR might call in for a chat. */
function witnesses(s: GameState) {
  return [...DEPARTMENTS.filter((d) => s.war.depts[d.dept].taken).map((d) => d.id), ...ROOMS.map((r) => r.id), 'rick', 'brad'];
}

/** Coach the witness: they remember nothing, and nothing goes in the file. */
export function coach(s: GameState): PoliticsResult {
  const p = s.war?.politics;
  const iv = p?.interview;
  if (s.stage !== 5 || !iv) return { ok: false, reason: 'Nobody’s in with HR right now.' };
  p.interview = null;
  p.nextInterviewAt = s.time + randRange(s, POLITICS.interview.gap[0], POLITICS.interview.gap[1]);
  s.stats.coached = (s.stats.coached ?? 0) + 1;
  pushTicker(s, `You have a quiet word in the hallway. In the interview, ${nameOf(iv.who)} remembers nothing about rubber bands.`);
  s.events.push({ type: 'interviewOver', who: iv.who, how: 'coached' });
  return { ok: true };
}

/** A witness's first name (the Printer Corner and the Task Force answer as a group). */
export function nameOf(id: string) {
  const d = DEPARTMENTS.find((x) => x.id === id) ?? ROOMS.find((x) => x.id === id);
  if (d) return d.short;
  return { rick: 'Rick', brad: 'Brad' }[id] ?? 'Someone';
}

function stepInterview(s: GameState) {
  const p = s.war.politics;
  const iv = p.interview;
  if (iv) {
    if (s.time < iv.until) return;
    // Delegation (a résumé perk): someone has a quiet word with them for you.
    if (perk(s, 'delegate')) {
      coach(s);
      return;
    }
    p.interview = null;
    p.nextInterviewAt = s.time + randRange(s, POLITICS.interview.gap[0], POLITICS.interview.gap[1]);
    s.stats.interviewsLost = (s.stats.interviewsLost ?? 0) + 1;
    pushTicker(s, `${nameOf(iv.who)} tells HR everything. Evidence +${POLITICS.evidence.interview}.`);
    s.events.push({ type: 'interviewOver', who: iv.who, how: 'lost' });
    addEvidence(s, POLITICS.evidence.interview);
    return;
  }
  if (s.time < p.nextInterviewAt) return;
  if (s.lookBusy || s.walkby.arrivesAt !== null || s.dale.deal || s.asks?.current || !currentTarget(s)) return;
  const pool = witnesses(s);
  const who = pool[Math.floor(rand(s) * pool.length) % pool.length];
  p.interview = { who, until: s.time + POLITICS.interview.seconds };
  pushTicker(s, `HR has called ${nameOf(who)} in for an interview. Coach them before they talk.`);
  s.events.push({ type: 'interview', who });
}

// ---------------------------------------------------------------- closing the case

/** Deniability per minute from your Cover teammates and your teams (real work, all of it). */
export function pdPerMin(s: GameState) {
  const teams = Object.values(s.staff ?? {}).filter((t) => (t?.seats ?? 0) > 0).length;
  return rolePower(s, 'cover') * POLITICS.pd.coverPerMin + teams * POLITICS.pd.teamPerMin;
}

/** HR closes its investigation: you flicked Fisk into submission, or won HR over. The floor is yours. */
export function closeCase(s: GameState, how: 'fight' | 'goodwill') {
  if (s.stage !== 5) return;
  const bounty = Math.round(Math.max(HR_DIRECTOR.bounty * payGrade(s).mult, staffPayPerMin(s, true) * POLITICS.bountyMinutes));
  s.salary += bounty;
  s.stats.bounties += bounty;
  s.desks += HR_DIRECTOR.desks;
  if (s.career.rank < TOP_RANK) addReview(s, reviewNeed(s.career.rank) * POLITICS.review);
  for (const d of DEPARTMENTS) s.war.depts[d.dept].seized = false;
  s.war.politics.interview = null;
  s.war.politics.hrShare = 0;
  s.events.push({ type: 'pay', amount: bounty, source: 'bounty', note: HR_DIRECTOR.bountyNote });
  s.events.push({ type: 'capture', targetId: 'hr' });
  s.events.push({ type: 'caseClosed', how });
  if (how === 'goodwill') s.stats.caseGoodwill = (s.stats.caseGoodwill ?? 0) + 1;
  pushEmail(
    s,
    HR_DIRECTOR.defeat.from,
    HR_DIRECTOR.defeat.subject,
    how === 'fight'
      ? HR_DIRECTOR.defeat.body
      : 'After reviewing your many thoughtful memos, HR has concluded that Floor 4 is a model workplace. The investigation is closed. I have framed the one about team-building.',
    'win',
  );
  pushTicker(s, `${how === 'fight' ? 'Leonard Fisk surrenders.' : 'HR is on your side now.'} The case is closed, and HR hands back every department. You find ${HR_DIRECTOR.bountyNote}: +$${bounty.toLocaleString('en-US')}.`);
  chatEvent(s, 'capture:hr');
  // The floor is yours: only the rematches are left.
  s.stats.stage5At = s.time;
  s.stage = 6;
  s.war.fighting = 'rematch';
  if (!s.rematch) startRematch(s, 1, 0);
  s.targetResolve = s.rematch!.left ?? s.rematch!.resolve;
  s.sinceLastHit = 0;
  s.events.push({ type: 'stage', stage: 6 });
  // A recruiter has been watching: the New Job restart opens up.
  if (!s.job.unlocked) {
    s.job.unlocked = true;
    pushEmail(s, 'Recruiter (LinkedUp)', 'Exciting opportunity!', 'I came across your profile and was very impressed by your work on Floor 4. Several companies would love to talk. Open Job Search on your desktop whenever you’re ready. You’d keep everything that’s yours. No pressure. (Some pressure.)', 'story');
  }
}

/** Fisk's Resolve hit zero. */
export function hrWon(s: GameState) {
  closeCase(s, 'fight');
}

// ---------------------------------------------------------------- every step of Stage 5

export function stepPolitics(s: GameState, dt: number) {
  if (s.stage !== 5) return;
  const p = s.war.politics;
  p.pd += (pdPerMin(s) / 60) * dt;
  p.evidence = Math.max(0, p.evidence - (POLITICS.evidence.decayPerMin / 60) * dt);
  // Keep the HR Director's share current, so the map can show it (and switching keeps it).
  if (s.war.fighting === 'hr') p.hrShare = Math.max(0, Math.min(1, s.targetResolve / HR_DIRECTOR.resolve));
  stepInterview(s);
  // Memo Templates (a résumé perk): the routine memos go out on their own.
  if (perk(s, 'templates')) {
    if (canSendMemo(s, 'synergy').ok) sendMemo(s, 'synergy');
    else if (p.evidence >= 50 && canSendMemo(s, 'retention').ok) sendMemo(s, 'retention');
  }
}

/** Time away: Deniability keeps coming in from your team; nobody's called in while you're gone. */
export function politicsOffline(s: GameState, seconds: number) {
  if (s.stage !== 5 || !s.war?.politics) return;
  const p = s.war.politics;
  p.pd += (pdPerMin(s) / 60) * seconds;
  p.interview = null;
  p.nextInterviewAt = Math.max(p.nextInterviewAt, s.time + 60);
}

