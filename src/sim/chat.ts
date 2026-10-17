// Messenger on your computer: coworkers (and rivals) message you, one conversation
// each. Some lines are reactions to what just happened; the rest is banter and the odd
// useful tip, dripped out every couple of minutes. Each line is said at most once.
//
// Messages don't appear instantly: they're queued for a moment first, so Messenger can
// show "Gary is typing…". Some lines can be answered with one of two quick replies,
// and a few replies get an answer back (or do something, like Dale finding you a deal).

import { TEAMS, type DeptId } from './content';
import { rand, randRange } from './rng';
import type { ChatThread, GameState } from './state';

interface Reply {
  text: string;
  /** Their answer, a couple of seconds later. */
  then?: string;
  act?: (s: GameState) => void;
}

interface Line {
  id: string;
  from: string;
  text: string;
  /** For periodic lines: when it's okay to say this. */
  when?: (s: GameState) => boolean;
  /** You can answer with one of these. */
  replies?: Reply[];
}

const has = (s: GameState, id: string) => s.allies.some((a) => a.id === id);
const stage1 = (s: GameState) => s.stage === 1;
const stage2 = (s: GameState) => s.stage === 2;
const holdingOut = (id: DeptId) => (s: GameState) => s.stage === 3 && !s.war.depts[id].taken;

/** Said once, right when something happens. */
const EVENT_LINES: Record<string, Line[]> = {
  'capture:gary1': [{ id: 'g1', from: 'Gary', text: 'that was a warm-up', replies: [{ text: 'sure it was', then: 'it WAS' }, { text: 'warm up faster', then: 'you’ll see. phase two' }] }],
  'capture:gary2': [{ id: 'g2', from: 'Gary', text: 'fine. phase two. you are not ready for phase two', replies: [{ text: 'what’s phase two', then: 'you’ll find out. (I am building a fort)' }, { text: 'I was born ready', then: 'nobody is born ready. that’s not how birth works' }] }],
  'capture:gary3': [{ id: 'g3', from: 'Gary', text: 'that fort took me THREE DAYS', replies: [{ text: 'it was a nice fort', then: '…thanks' }, { text: 'it showed', then: 'wow' }] }],
  'capture:gary4': [{ id: 'g4', from: 'Gary', text: 'ok. truce. Brad from Sales has been flicking us both for years. let’s get him', replies: [{ text: 'deal. welcome aboard', then: 'I’ll bring snacks' }, { text: 'you flicked me first', then: 'water under the cubicle. Brad. focus' }] }],
  'capture:brad': [{ id: 'b1', from: 'Brad', text: 'gg. still the top seller on this floor btw', replies: [{ text: 'gg', then: 'let’s circle back sometime' }, { text: 'not anymore', then: 'Sales doesn’t lose. Sales reframes.' }] }],
  'capture:printer': [{ id: 'p1', from: 'Ron', text: 'PC LOAD LETTER. we surrender. nobody knows what it means' }],
  'capture:taskforce': [{ id: 't1', from: 'Q3 Task Force', text: 'This group chat has been archived.' }],
  'capture:rick': [{ id: 'r1', from: 'Rick', text: 'I’ll be working from home. Indefinitely.' }],
  'capture:it': [{ id: 'd-it', from: 'Dave', text: 'you beat Derek?? we shared a desk for six years. he labeled his half', replies: [{ text: 'want the drill?', then: 'I already have plans for the drill' }, { text: 'he says hi', then: 'no he doesn’t' }] }],
  'capture:accounting': [{ id: 'd-ac', from: 'Marjorie', text: 'Doris has never lost an audit, dear. Until today. She’ll never forgive you. Well done.' }],
  'capture:mailroom': [{ id: 'd-ma', from: 'Kevin', text: 'the MAILROOM is ours?? Tony once made me sort rubber bands for a week. by COLOR', replies: [{ text: 'they’re all tan', then: 'THAT’S WHAT I SAID' }, { text: 'revenge', then: 'sweet sweet revenge' }] }],
  'capture:marketing': [{ id: 'd-mk', from: 'Brad', text: 'Marketing joined you? Sales has always respected Marketing. (Sales has never respected Marketing.)' }],
  rebrand: [{ id: 'd-rb', from: 'Gary', text: 'did Skyler just rebrand in the middle of a war. can she DO that', replies: [{ text: 'apparently', then: 'I want a rebrand' }, { text: 'keep firing', then: 'firing. rebranding my aim' }] }],
  'war:start': [{ id: 'd-ws', from: 'Dale (Facilities)', text: 'heads up. the other departments have been eyeing my closet. keep it yours and it keeps paying you', replies: [{ text: 'paying how?', then: 'bands. I leave the door open a crack. you know how it is' }, { text: 'on it', then: 'good. I’ll be in the closet. obviously' }] }],
  'raid:chased': [{ id: 'd-rc', from: 'Dale (Facilities)', text: 'saw you chase them out. my closet thanks you. (I’ll know if anything’s missing)' }],
  'raid:lost': [{ id: 'd-rl', from: 'Dale (Facilities)', text: 'somebody just walked out of my closet with a box of bands. that’s YOUR closet now, friend. act like it' }],
  'recruit:kevin': [{ id: 'rk', from: 'Kevin', text: 'omg I’m on the team!! do I get a title. or a desk', replies: [{ text: 'you get a role', then: 'a ROLE. like in a movie' }, { text: 'neither', then: 'still worth it' }] }],
  'recruit:marjorie': [{ id: 'rm', from: 'Marjorie', text: 'I’ll keep an eye out, dear. I always do.' }],
  'recruit:steve': [{ id: 'rs', from: 'Steve', text: 'sorry, were you talking? I’m in. going on mute' }],
  'recruit:linda': [{ id: 'rl', from: 'Linda', text: 'Regional darts champion, 2009. Point me at something.' }],
  'recruit:dave': [{ id: 'rd', from: 'Dave', text: 'I have drawings. Don’t ask what of. (A repeater.)', replies: [{ text: 'what of?', then: 'I said don’t ask. (A repeater. Make me an Engineer.)' }, { text: 'show me', then: 'Make me an Engineer and I’ll build it.' }] }],
  caught: [
    { id: 'c1', from: 'Gary', text: 'lol', replies: [{ text: 'not funny', then: 'little funny' }, { text: 'lol', then: 'lol' }] },
    { id: 'c2', from: 'Marjorie', text: 'I did say to listen for his shoes, dear.' },
    { id: 'c3', from: 'Kevin', text: 'are you in trouble?? is it bad?? can I have your stapler', replies: [{ text: 'no', then: 'ok. can I have it if you get fired' }, { text: 'it’s fine', then: 'ok!! (can I still have the stapler)' }] },
  ],
  fired: [
    { id: 'f1', from: 'Gary', text: 'wait you got FIRED?? see you monday I guess' },
    { id: 'f2', from: 'Kevin', text: 'I saved your desk plant. it’s fine. it’s mostly fine' },
  ],
  'dale:intro': [
    {
      id: 'di',
      from: 'Dale (Facilities)',
      text: 'heard you’re in the market. supply closet, end of the hall. come alone.',
      replies: [{ text: 'what are you selling?', then: 'guns. rubber band ones. and things that make them better. D for Dale.' }, { text: 'who is this', then: 'Facilities. I have keys to everything. D for Dale.' }],
    },
  ],
  'find:ball': [{ id: 'fb', from: 'Gary', text: 'where did you get a rubber band BALL. that’s a war crime' }],
  'ball:1': [{ id: 'bl1', from: 'Gary', text: 'is that a rubber band ball. on your desk. in front of god and everyone', replies: [{ text: 'it’s a stress ball', then: 'it’s stressing ME out' }, { text: 'jealous?', then: 'a little' }] }],
  'ball:2': [{ id: 'bl2', from: 'Kevin', text: 'your ball is so big now. can I hold it', replies: [{ text: 'no', then: 'ok. can I look at it' }, { text: 'gently', then: 'I will be SO gentle' }] }],
  'ball:3': [{ id: 'bl3', from: 'Marjorie', text: 'In 1994 Harold from Payroll had one the size of a cantaloupe. Yours is bigger, dear. Harold would be proud.' }],
  'ball:4': [{ id: 'bl4', from: 'Gary', text: 'I think your ball ate my stapler. I want it back but I’m scared to ask it', replies: [{ text: 'it’s ours now', then: 'it’s not even a good stapler' }, { text: 'reach in', then: 'I am NOT reaching in there' }] }],
  'trick:fetch': [{ id: 'tk1', from: 'Gary', text: 'your dog just brought you one of MY bands. traitor', replies: [{ text: 'good girl', then: 'she IS a good girl. still a traitor' }, { text: 'finders keepers', then: 'she didn’t find it, it was on my desk' }] }],
  'trick:playdead': [{ id: 'tk2', from: 'Kevin', text: 'Bailey just played dead in front of Mr Feeney and he almost cried. best day of my life' }],
  'trick:howl': [{ id: 'tk3', from: 'Marjorie', text: 'That dog has better instincts than half of HR, dear.' }],
  rematch: [{ id: 'rm1', from: 'Gary', text: 'ok that one doesn’t count. best of seven', replies: [{ text: 'deal', then: 'I will be training. with the fan' }, { text: 'it counts', then: 'agree to disagree' }] }],
  barrage: [{ id: 'br1', from: 'Gary', text: 'did we just. all fire at once. I’ve never felt so alive', replies: [{ text: 'again?', then: 'give me a minute to find more bands' }, { text: 'that was the plan', then: 'there was a PLAN??' }] }],
  promoted: [
    { id: 'up1', from: 'Gary', text: 'you got PROMOTED? for what', replies: [{ text: 'excellence', then: 'I have also been excellent. nobody noticed' }, { text: 'no idea', then: 'that tracks honestly' }] },
    { id: 'up2', from: 'Marjorie', text: 'Congratulations, dear. I remember when Mr. Feeney was an Associate.' },
    { id: 'up3', from: 'Kevin', text: 'congrats!!! does this mean you can hire me for real', replies: [{ text: 'maybe', then: 'MAYBE!!!' }, { text: 'you’re an intern', then: 'a promising intern' }] },
    { id: 'up4', from: 'Dale (Facilities)', text: 'new title, huh. big offices have big closets. just saying' },
    { id: 'up5', from: 'Brad', text: 'nice. let’s grab a coffee and talk about your pipeline' },
    { id: 'up6', from: 'Gary', text: 'they gave you a bigger chair didn’t they. I can tell' },
  ],
  // Team leads talk as '@<team>' so a rename shows up everywhere (see chatName).
  'hired:temp': [{ id: 'h1', from: '@temp', text: 'ok I’m in. which stapler is the good one. also Muffins is under your desk, don’t step on him', replies: [{ text: 'the red one', then: 'cool. it’s mine now' }, { text: 'Muffins??', then: 'he’s a cat. he has a badge. it’s fine' }] }],
  'hired:receptionist': [{ id: 'h2', from: '@receptionist', text: 'Front desk is staffed! I’ll put the important calls through. Joey says hi.', replies: [{ text: 'hi Joey', then: 'he wagged. that’s a yes' }, { text: 'is Joey allowed here?', then: 'he has a lanyard now, so yes' }] }],
  'hired:bookkeeper': [{ id: 'h3', from: '@bookkeeper', text: 'I have reviewed your expense history. We should talk.', replies: [{ text: 'about what?', then: 'Rubber bands. 400,000 of them.' }, { text: 'no we shouldn’t', then: 'Understood. I have made a note.' }] }],
  'hired:analyst': [{ id: 'h4', from: '@analyst', text: 'Ran the numbers. This team is 14% more efficient with me on it. You’re welcome.' }],
  'hired:manager': [{ id: 'h5', from: '@manager', text: 'yo!! assistant manager reporting for duty. let’s 10x this', replies: [{ text: 'let’s do it', then: 'LET’S GOOO' }, { text: 'please don’t', then: 'too late, I already made a deck' }] }],
  boxSpotted: [{ id: 'bx', from: 'Marjorie', text: 'Open your parcels promptly, dear. Mr. Feeney reads labels.' }],
  'promotion:gary': [{ id: 'pg', from: 'Gary', text: 'promoted!! drinks on me (water cooler)' }],
  'promotion:kevin': [{ id: 'pk', from: 'Kevin', text: 'I GOT A TITLE', replies: [{ text: 'congrats!', then: 'I’m going to put it on a mug' }, { text: 'don’t let it go to your head', then: 'too late' }] }],
  'promotion:marjorie': [{ id: 'pm', from: 'Marjorie', text: 'Thirty-one years and a promotion. How lovely.' }],
  'promotion:steve': [{ id: 'ps', from: 'Steve', text: 'sorry, cut out there, did you say promoted?' }],
  'promotion:linda': [{ id: 'pl', from: 'Linda', text: 'As expected.' }],
  'promotion:dave': [{ id: 'pd', from: 'Dave', text: 'New title. Same drawings.' }],
  'grade:A': [{ id: 'ga', from: 'Marjorie', text: 'I saw that report, dear. Very tidy. Mr. Feeney noticed too.' }],
};

/** Dripped out every couple of minutes: banter and tips. */
const BANTER: Line[] = [
  { id: 'b-g1', from: 'Gary', text: 'nice try', when: stage1, replies: [{ text: 'nice dodge', then: 'thank you. I practice' }, { text: 'try harder', then: 'I’m trying the exact right amount' }] },
  { id: 'b-g2', from: 'Gary', text: 'my monitor is 27 inches. think about that', when: stage1, replies: [{ text: 'compensating?', then: 'it’s for spreadsheets' }, { text: 'mine’s a CRT', then: 'my condolences' }] },
  { id: 'b-g3', from: 'Gary', text: 'I can see your reflection in my screen btw', when: stage1 },
  { id: 'b-m1', from: 'Marjorie', text: 'Mr. Feeney walks the floor every couple of minutes, dear. Listen for his shoes.', when: stage1, replies: [{ text: 'thanks Marjorie', then: 'You’re welcome, dear. Size 11 loafers. Very squeaky.' }, { text: 'how do you know?', then: '31 years, dear.' }] },
  { id: 'b-m2', from: 'Marjorie', text: 'Hold the band longer and let go at full stretch. I have seen things.', when: stage1 },
  { id: 'b-k1', from: 'Kevin', text: 'hi. is it true there’s a war. asking for a friend (me)', when: stage1, replies: [{ text: 'what war', then: 'ok cool cool. (I see the bands on your desk)' }, { text: 'yes. want in?', then: 'YES. when do I start. do I need a helmet' }] },
  { id: 'b-it', from: 'IT Helpdesk', text: 'Reminder: your password expires in 3 days.', replies: [{ text: 'ok', then: 'This is an automated message. Replies are not monitored.' }, { text: 'it expired last week', then: 'This is an automated message. Replies are not monitored.' }] },
  { id: 'b-g4', from: 'Gary', text: 'Brad thinks he’s untouchable. he has not met us', when: stage2 },
  { id: 'b-k2', from: 'Kevin', text: 'found 40 rubber bands in the break room. also ate a granola bar', when: (s) => stage2(s) && has(s, 'kevin') },
  { id: 'b-k3', from: 'Kevin', text: 'what does "circle back" mean', when: (s) => has(s, 'kevin'), replies: [{ text: 'it means later', then: 'oh. then why not say later' }, { text: 'nobody knows', then: 'I KNEW it' }] },
  { id: 'b-m3', from: 'Marjorie', text: 'Rick’s door is locked from the inside. Interesting.', when: stage2 },
  { id: 'b-m4', from: 'Marjorie', text: 'A Lookout or two and you’ll hear Mr. Feeney coming sooner.', when: stage2 },
  { id: 'b-l1', from: 'Linda', text: 'Janet takes her break at 10:15. Just saying.', when: (s) => stage2(s) && has(s, 'linda') },
  { id: 'b-s1', from: 'Steve', text: 'sorry, was on mute. what did I miss', when: (s) => has(s, 'steve'), replies: [{ text: 'everything', then: 'great. great great great' }, { text: 'nothing', then: 'perfect, going back on mute' }] },
  { id: 'b-dv', from: 'Dave', text: 'If someone is an Engineer I can build a repeater. Three clips. Don’t ask.', when: (s) => has(s, 'dave') },
  { id: 'b-br', from: 'Brad', text: 'Sales doesn’t lose. Sales reframes.', when: (s) => stage2(s) && s.targetIndex <= 4, replies: [{ text: 'reframe this', then: 'I will. In a deck. With charts.' }, { text: 'ok Brad', then: 'it’s Bradley in meetings' }] },
  { id: 'b-ja', from: 'Janet', text: 'Ron says we should stop. I say we continue.', when: (s) => stage2(s) && s.targetIndex === 5 },
  { id: 'b-g5', from: 'Gary', text: 'tip: the expense portal is VERY trusting', when: stage2, replies: [{ text: 'meaning?', then: 'approve your own rubber band order. accounting barely checks. (they check a little)' }, { text: 'I would never', then: 'sure. me neither. (I have 4,000 bands)' }] },
  {
    id: 'b-d1',
    from: 'Dale (Facilities)',
    text: 'got something new in. you know where I am',
    when: (s) => s.dale.introduced,
    replies: [
      { text: 'got any deals?', then: 'maybe. I’ll swing by.', act: (s) => (s.dale.nextDealAt = Math.min(s.dale.nextDealAt, s.time + 20)) },
      { text: 'not now Dale', then: 'your loss. closet’s open.' },
    ],
  },
  { id: 'b-w1', from: 'Dave', text: 'IT keeps a cordless drill in the server room. I’ve seen what it can do with a spool. Just saying.', when: holdingOut('it') },
  { id: 'b-w2', from: 'Gary', text: 'Accounting counts every band. you have to really pull back on Doris or she doesn’t even notice', when: holdingOut('accounting') },
  { id: 'b-w3', from: 'Marjorie', text: 'Big Tony fires back, dear. Free bands, but he’s loud about it.', when: holdingOut('mailroom') },
  { id: 'b-w4', from: 'Kevin', text: 'Skyler made a mood board about beating you. it’s actually really nice', when: holdingOut('marketing'), replies: [{ text: 'send it to me', then: 'it’s mostly pictures of you looking sad' }, { text: 'traitor', then: 'I said it was NICE. not that I liked it' }] },
  { id: 'b-w5', from: 'Marjorie', text: 'A Lookout or two will keep an eye on the supply closet while you’re busy, dear.', when: (s) => s.stage === 3 },
  { id: 'b-d2', from: 'Marjorie', text: 'If Dale offers you a deal, dear, count your fingers after.', when: (s) => s.dale.introduced },
  { id: 'b-hr', from: 'HR', text: 'This is an automated reminder that Wellness Wednesday is this Wednesday.' },
  { id: 'b-rr', from: 'Marjorie', text: 'Do a report right and quickly, dear, and Accounting pays a little extra. They grade everything.', when: (s) => s.stats.rounds > 2 },
  { id: 'b-ph', from: 'Kevin', text: 'the phone directory changed again?? I sent a guy to HR for a printer', when: (s) => s.time > 500 },
];

const ALL_LINES: Line[] = [...Object.values(EVENT_LINES).flat(), ...BANTER];
const lineById = (id: string) => ALL_LINES.find((l) => l.id === id);

/** Seconds of "typing…" before a message lands. */
const TYPING = 1.6;

function thread(s: GameState, who: string): ChatThread {
  let th = s.chat.threads.find((t) => t.who === who);
  if (!th) {
    th = { who, msgs: [], unread: 0, pending: null };
    s.chat.threads.push(th);
  }
  return th;
}

function say(s: GameState, line: Line) {
  s.chat.used.push(line.id);
  s.chat.queue.push({ who: line.from, text: line.text, at: s.time + TYPING, line: line.id });
}

/** Something happened: maybe someone has something to say about it. */
export function chatEvent(s: GameState, key: string) {
  const lines = (EVENT_LINES[key] ?? []).filter((l) => !s.chat.used.includes(l.id));
  if (lines.length === 0) return;
  say(s, lines[Math.floor(rand(s) * lines.length) % lines.length]);
}

export function stepChat(s: GameState) {
  const c = s.chat;
  // Deliver messages whose typing is done.
  for (const q of c.queue.filter((x) => s.time >= x.at)) {
    const th = thread(s, q.who);
    th.msgs.push({ id: s.seq++, t: s.time, mine: false, text: q.text });
    if (th.msgs.length > 40) th.msgs.shift();
    th.unread++;
    const line = q.line ? lineById(q.line) : undefined;
    if (line?.replies) th.pending = line.id;
    s.events.push({ type: 'chat', from: q.who });
  }
  c.queue = c.queue.filter((x) => s.time < x.at);

  if (s.time < c.nextAt) return;
  c.nextAt = s.time + randRange(s, 100, 160);
  const options = BANTER.filter((l) => !c.used.includes(l.id) && (!l.when || l.when(s)));
  if (options.length) say(s, options[Math.floor(rand(s) * options.length) % options.length]);
}

/** Put a message straight into a conversation (already seen: your team leads' calls show on a card too). */
export function chatPost(s: GameState, who: string, text: string, mine: boolean) {
  const th = thread(s, who);
  th.msgs.push({ id: s.seq++, t: s.time, mine, text });
  if (th.msgs.length > 40) th.msgs.shift();
}

/** Who's typing to you right now (for "Gary is typing…"). */
export function typing(s: GameState): string[] {
  return [...new Set(s.chat.queue.filter((q) => q.at - s.time <= TYPING).map((q) => q.who))];
}

/** All unread messages. */
export function chatUnread(s: GameState) {
  return s.chat.threads.reduce((n, t) => n + t.unread, 0);
}

/** You opened a conversation. */
export function readThread(s: GameState, who: string) {
  const th = s.chat.threads.find((t) => t.who === who);
  if (th) th.unread = 0;
}

/** The quick replies you can send in a conversation right now. */
export function replyOptions(s: GameState, who: string): string[] {
  const th = s.chat.threads.find((t) => t.who === who);
  const line = th?.pending ? lineById(th.pending) : undefined;
  return line?.replies?.map((r) => r.text) ?? [];
}

/** Send quick reply `choice` in a conversation. */
export function sendReply(s: GameState, who: string, choice: number) {
  const th = s.chat.threads.find((t) => t.who === who);
  const line = th?.pending ? lineById(th.pending) : undefined;
  const r = line?.replies?.[choice];
  if (!th || !r) return false;
  th.pending = null;
  th.msgs.push({ id: s.seq++, t: s.time, mine: true, text: r.text });
  if (r.then) s.chat.queue.push({ who, text: r.then, at: s.time + TYPING + 0.8 });
  r.act?.(s);
  return true;
}

// ---------------------------------------------------------------- names

/** The name to show for someone in Messenger (team leads can be renamed in Staffing). */
export function chatName(s: GameState, who: string) {
  if (!who.startsWith('@')) return who;
  const t = TEAMS.find((x) => x.id === who.slice(1));
  // First names in Messenger, like everyone else.
  return t ? (s.names?.[t.id]?.trim() || t.lead).split(' ')[0] : who;
}

// ---------------------------------------------------------------- the buddy list

export interface Buddy {
  who: string;
  status: 'online' | 'away' | 'offline';
  note: string; // away message or status line
}

/** Everyone on your buddy list, with an away message that changes with the war. */
export function buddies(s: GameState): Buddy[] {
  const ally = (id: string) => has(s, id);
  const list: Buddy[] = [
    { who: 'Gary', status: 'online', note: s.stage === 1 ? 'plotting' : 'on your side (for now)' },
    { who: 'Marjorie', status: 'online', note: 'I see everything' },
    { who: 'Kevin', status: 'online', note: ally('kevin') ? 'ON THE TEAM' : 'unpaid & thriving' },
    { who: 'Brad', status: s.targetIndex <= 4 && s.stage < 3 ? 'away' : 'offline', note: s.targetIndex <= 4 && s.stage < 3 ? 'in a meeting (golf)' : 'working from the golf course' },
    { who: 'Dale (Facilities)', status: s.dale.introduced ? 'away' : 'offline', note: s.dale.introduced ? 'restocking. you know where' : '' },
    { who: 'Mr. Feeney', status: 'away', note: 'Idle for 47 minutes' },
    { who: 'IT Helpdesk', status: 'online', note: 'have you tried turning it off and on' },
    // The people you've hired.
    ...TEAMS.filter((t) => (s.staff[t.id]?.seats ?? 0) > 0).map((t) => ({ who: `@${t.id}`, status: 'online' as const, note: `${t.title}, your team` })),
  ];
  for (const id of ['steve', 'linda', 'dave']) {
    const name = id[0].toUpperCase() + id.slice(1);
    if (s.chat.threads.some((t) => t.who === name) || ally(id))
      list.push({ who: name, status: id === 'steve' ? 'away' : 'online', note: { steve: 'on a call (muted)', linda: 'darts at lunch', dave: 'drawing something' }[id]! });
  }
  // Anyone else who has messaged you (Ron, the Task Force, HR...).
  for (const t of s.chat.threads) if (!list.some((b) => b.who === t.who)) list.push({ who: t.who, status: 'offline', note: '' });
  return list;
}
