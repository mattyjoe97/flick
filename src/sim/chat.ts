// Messenger on your computer: coworkers (and rivals) message you. Some lines are
// reactions to what just happened; the rest is banter and the odd useful tip,
// dripped out every couple of minutes. Each line is said at most once.

import { rand, randRange } from './rng';
import type { GameState } from './state';

interface Line {
  id: string;
  from: string;
  text: string;
  /** For periodic lines: when it's okay to say this. */
  when?: (s: GameState) => boolean;
}

const has = (s: GameState, id: string) => s.allies.some((a) => a.id === id);
const stage1 = (s: GameState) => s.stage === 1;
const stage2 = (s: GameState) => s.stage === 2;

/** Said once, right when something happens. */
const EVENT_LINES: Record<string, Line[]> = {
  'capture:gary1': [{ id: 'g1', from: 'Gary', text: 'that was a warm-up' }],
  'capture:gary2': [{ id: 'g2', from: 'Gary', text: 'fine. phase two. you are not ready for phase two' }],
  'capture:gary3': [{ id: 'g3', from: 'Gary', text: 'that fort took me THREE DAYS' }],
  'capture:gary4': [{ id: 'g4', from: 'Gary', text: 'ok. truce. Brad from Sales has been flicking us both for years. let’s get him' }],
  'capture:brad': [{ id: 'b1', from: 'Brad', text: 'gg. still the top seller on this floor btw' }],
  'capture:printer': [{ id: 'p1', from: 'Ron', text: 'PC LOAD LETTER. we surrender. nobody knows what it means' }],
  'capture:taskforce': [{ id: 't1', from: 'Q3 Task Force', text: 'This group chat has been archived.' }],
  'capture:rick': [{ id: 'r1', from: 'Rick', text: 'I’ll be working from home. Indefinitely.' }],
  'recruit:kevin': [{ id: 'rk', from: 'Kevin', text: 'omg I’m on the team!! do I get a title. or a desk' }],
  'recruit:marjorie': [{ id: 'rm', from: 'Marjorie', text: 'I’ll keep an eye out, dear. I always do.' }],
  'recruit:steve': [{ id: 'rs', from: 'Steve', text: 'sorry, were you talking? I’m in. going on mute' }],
  'recruit:linda': [{ id: 'rl', from: 'Linda', text: 'Regional darts champion, 2009. Point me at something.' }],
  'recruit:dave': [{ id: 'rd', from: 'Dave', text: 'I have drawings. Don’t ask what of. (A repeater.)' }],
  caught: [
    { id: 'c1', from: 'Gary', text: 'lol' },
    { id: 'c2', from: 'Marjorie', text: 'I did say to listen for his shoes, dear.' },
    { id: 'c3', from: 'Kevin', text: 'are you in trouble?? is it bad?? can I have your stapler' },
  ],
  fired: [
    { id: 'f1', from: 'Gary', text: 'wait you got FIRED?? see you monday I guess' },
    { id: 'f2', from: 'Kevin', text: 'I saved your desk plant. it’s fine. it’s mostly fine' },
  ],
  'find:ball': [{ id: 'fb', from: 'Gary', text: 'where did you get a rubber band BALL. that’s a war crime' }],
  boxSpotted: [{ id: 'bx', from: 'Marjorie', text: 'Open your parcels promptly, dear. Mr. Feeney reads labels.' }],
  'promotion:gary': [{ id: 'pg', from: 'Gary', text: 'promoted!! drinks on me (water cooler)' }],
  'promotion:kevin': [{ id: 'pk', from: 'Kevin', text: 'I GOT A TITLE' }],
  'promotion:marjorie': [{ id: 'pm', from: 'Marjorie', text: 'Thirty-one years and a promotion. How lovely.' }],
  'promotion:steve': [{ id: 'ps', from: 'Steve', text: 'sorry, cut out there, did you say promoted?' }],
  'promotion:linda': [{ id: 'pl', from: 'Linda', text: 'As expected.' }],
  'promotion:dave': [{ id: 'pd', from: 'Dave', text: 'New title. Same drawings.' }],
};

/** Dripped out every couple of minutes: banter and tips. */
const BANTER: Line[] = [
  { id: 'b-g1', from: 'Gary', text: 'nice try', when: stage1 },
  { id: 'b-g2', from: 'Gary', text: 'my monitor is 27 inches. think about that', when: stage1 },
  { id: 'b-g3', from: 'Gary', text: 'I can see your reflection in my screen btw', when: stage1 },
  { id: 'b-m1', from: 'Marjorie', text: 'Mr. Feeney walks the floor every couple of minutes, dear. Listen for his shoes.', when: stage1 },
  { id: 'b-m2', from: 'Marjorie', text: 'Hold the band longer and let go at full stretch. I have seen things.', when: stage1 },
  { id: 'b-k1', from: 'Kevin', text: 'hi. is it true there’s a war. asking for a friend (me)', when: stage1 },
  { id: 'b-it', from: 'IT Helpdesk', text: 'Reminder: your password expires in 3 days.' },
  { id: 'b-g4', from: 'Gary', text: 'Brad thinks he’s untouchable. he has not met us', when: stage2 },
  { id: 'b-k2', from: 'Kevin', text: 'found 40 rubber bands in the break room. also ate a granola bar', when: (s) => stage2(s) && has(s, 'kevin') },
  { id: 'b-k3', from: 'Kevin', text: 'what does "circle back" mean', when: (s) => has(s, 'kevin') },
  { id: 'b-m3', from: 'Marjorie', text: 'Rick’s door is locked from the inside. Interesting.', when: stage2 },
  { id: 'b-m4', from: 'Marjorie', text: 'A Lookout or two and you’ll hear Mr. Feeney coming sooner.', when: stage2 },
  { id: 'b-l1', from: 'Linda', text: 'Janet takes her break at 10:15. Just saying.', when: (s) => stage2(s) && has(s, 'linda') },
  { id: 'b-s1', from: 'Steve', text: 'sorry, was on mute. what did I miss', when: (s) => has(s, 'steve') },
  { id: 'b-d1', from: 'Dave', text: 'If someone is an Engineer I can build a repeater. Three clips. Don’t ask.', when: (s) => has(s, 'dave') },
  { id: 'b-br', from: 'Brad', text: 'Sales doesn’t lose. Sales reframes.', when: (s) => stage2(s) && s.targetIndex <= 4 },
  { id: 'b-ja', from: 'Janet', text: 'Ron says we should stop. I say we continue.', when: (s) => stage2(s) && s.targetIndex === 5 },
  { id: 'b-g5', from: 'Gary', text: 'tip: the expense portal is VERY trusting', when: stage2 },
  { id: 'b-hr', from: 'HR', text: 'This is an automated reminder that Wellness Wednesday is this Wednesday.' },
];

function say(s: GameState, line: Line) {
  const c = s.chat;
  c.log.push({ id: s.seq++, t: s.time, from: line.from, text: line.text });
  if (c.log.length > 60) c.log.shift();
  c.used.push(line.id);
  if (!s.lookBusy) c.unread++;
  s.events.push({ type: 'chat', from: line.from });
}

/** Something happened: maybe someone has something to say about it. */
export function chatEvent(s: GameState, key: string) {
  const lines = (EVENT_LINES[key] ?? []).filter((l) => !s.chat.used.includes(l.id));
  if (lines.length === 0) return;
  say(s, lines[Math.floor(rand(s) * lines.length) % lines.length]);
}

export function stepChat(s: GameState) {
  const c = s.chat;
  if (s.time < c.nextAt) return;
  c.nextAt = s.time + randRange(s, 100, 160);
  const options = BANTER.filter((l) => !c.used.includes(l.id) && (!l.when || l.when(s)));
  if (options.length) say(s, options[Math.floor(rand(s) * options.length) % options.length]);
}

/** You opened Messenger. */
export function readChat(s: GameState) {
  s.chat.unread = 0;
}
