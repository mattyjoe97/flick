// Cartoon coworkers, drawn from parts so every character shares one style.
// Each drawing is a head-and-shoulders bust in a 120 x 150 box.

export type Mood = 'idle' | 'hit' | 'angry' | 'smug' | 'happy' | 'worried' | 'peer';

type HairStyle = 'short' | 'thinning' | 'slick' | 'curly' | 'bun' | 'bob' | 'messy' | 'bald' | 'side' | 'spiky';

export interface Person {
  skin: string;
  hair: string;
  style: HairStyle;
  shirt: string;
  tie?: string;
  glasses?: 'square' | 'round';
  mustache?: boolean;
  beard?: boolean;
  headset?: boolean;
  earrings?: boolean;
  lanyard?: string;
  cardigan?: boolean;
  hoodie?: boolean;
  /** The face they make when nothing is happening. */
  rest?: Mood;
  /** What they say when hit, when idle, and when they fire back. */
  lines?: { hit?: string[]; idle?: string[]; fire?: string[] };
}

const INK = '#2b2522';

export const PEOPLE: Record<string, Person> = {
  gary: {
    skin: '#f2c9a5', hair: '#6b4a2e', style: 'thinning', shirt: '#dccfae', tie: '#8a5a2b', glasses: 'square', mustache: true,
    lines: {
      hit: ['Ow!', 'Hey!', 'Not cool.', 'My ear!', 'That was my eye!'],
      idle: ['I can see you.', 'Bring it.', 'I have a 3-speed fan.'],
      fire: ['Take that!', 'Ha!'],
    },
  },
  brad: {
    skin: '#8d5a3b', hair: '#1f1b18', style: 'short', shirt: '#5b86c4', tie: '#c0392b', rest: 'smug',
    lines: {
      hit: ['Whoa, easy!', 'Not the suit!', 'Okay, okay.', 'Rude.'],
      idle: ['Top seller, baby.', 'Is that all?', "Let's circle back."],
    },
  },
  janet: {
    skin: '#e0ac83', hair: '#b5462e', style: 'curly', shirt: '#7aa37a', glasses: 'round',
    lines: { hit: ['Ron!', 'Ouch!', 'I am printing!'], idle: ['The printer is ours.'] },
  },
  ron: {
    skin: '#f2c9a5', hair: '#9c8f80', style: 'bald', shirt: '#8e9aa6', beard: true,
    lines: { hit: ['Oof.', 'PC LOAD LETTER!', 'Paper jam!'], idle: ['Out of toner.'] },
  },
  tf1: { skin: '#c68863', hair: '#1f1b18', style: 'bob', shirt: '#9b6fb0', lines: { hit: ['Agenda item!', 'Ow!'], idle: ['Per my last email...'] } },
  tf2: { skin: '#f2c9a5', hair: '#d8b25a', style: 'short', shirt: '#4f6d8f', tie: '#2d3e50', lines: { hit: ['Action item!', 'Hey!'], idle: ['Synergy.'] } },
  tf3: { skin: '#5c3a26', hair: '#1f1b18', style: 'messy', shirt: '#c47a3a', lines: { hit: ['Ow, my deck!', 'Rude!'], idle: ['Let’s take this offline.'] } },
  rick: {
    skin: '#e0ac83', hair: '#3b2a1e', style: 'spiky', shirt: '#2f4f6f', tie: '#d4a017', rest: 'smug',
    lines: {
      hit: ['This is going in your review!', 'Unacceptable!', 'My door is closed!'],
      idle: ['Quick 1:1?', 'Let’s talk goals.', 'Where are we on that?'],
    },
  },
  feeney: { skin: '#f2c9a5', hair: '#c9c4bd', style: 'side', shirt: '#ffffff', tie: '#24508f', glasses: 'square', mustache: true },
  kevin: { skin: '#c68863', hair: '#3b2a1e', style: 'messy', shirt: '#6aa0c8', lanyard: '#d64545', rest: 'happy' },
  marjorie: { skin: '#f2c9a5', hair: '#c9c4bd', style: 'bun', shirt: '#b05a6a', glasses: 'round', cardigan: true, rest: 'happy' },
  steve: { skin: '#e0ac83', hair: '#6b4a2e', style: 'short', shirt: '#e8e3d8', tie: '#556b2f', headset: true },
  linda: { skin: '#8d5a3b', hair: '#1f1b18', style: 'bob', shirt: '#2e7d6b', earrings: true, rest: 'smug' },
  dave: { skin: '#f2c9a5', hair: '#3b2a1e', style: 'short', shirt: '#555d66', glasses: 'square', beard: true, hoodie: true },
  // The department bosses (their painted portraits are used; the drawing is only a fallback).
  derek: {
    skin: '#f1dccb', hair: '#3b2a1e', style: 'slick', shirt: '#2b2d31', hoodie: true, glasses: 'square', beard: true, lanyard: '#1d1f22', rest: 'smug',
    lines: {
      hit: ['That’s a P1!', 'Ow, my uptime!', 'Reopening this ticket!'],
      idle: ['Have you tried turning it off and on again?', 'Your ticket is in the queue.', 'Firewall’s up. Probably.'],
    },
  },
  doris: {
    skin: '#ecd0b0', hair: '#c9c4bd', style: 'bob', shirt: '#2c3e64', glasses: 'round', earrings: true,
    lines: {
      hit: ['That will be noted.', 'Unacceptable!', 'I am reconciling that.'],
      idle: ['Every band is accounted for.', 'Receipts, please.', 'Under protest.'],
    },
  },
  tony: {
    skin: '#c99a72', hair: '#6e6a66', style: 'short', shirt: '#b49a6a', rest: 'smug',
    lines: {
      hit: ['Hey!', 'Watch it, kid.', 'That one stung.'],
      idle: ['Every band comes through me.', 'Sign here.', 'You want a package? I got packages.'],
      fire: ['Special delivery!', 'Return to sender!'],
    },
  },
  skyler: {
    skin: '#6b4228', hair: '#efe3c2', style: 'curly', shirt: '#d9a43a', glasses: 'round', earrings: true, rest: 'happy',
    lines: {
      hit: ['Off brand!', 'Not the blazer!', 'Let’s take that offline!'],
      idle: ['Love that energy!', 'Let’s circle back.', 'This is so on-brand for you.'],
    },
  },
  // The Stage 4 room bosses (their painted portraits are used; the drawing is only a fallback).
  gail: {
    skin: '#f4cdb0', hair: '#cdbf98', style: 'messy', shirt: '#2f8f8a', cardigan: true, glasses: 'round', earrings: true, lanyard: '#8a5a2b',
    lines: {
      hit: ['My mug!', 'Not before my coffee!', 'I run payroll, you know.'],
      idle: ['Fresh pot’s on.', 'Coffee Club members only.', 'Same mug since 1998.'],
    },
  },
  victoria: {
    skin: '#c99a72', hair: '#26211e', style: 'bun', shirt: '#1f2126', earrings: true,
    lines: {
      hit: ['Let’s take this offline!', 'I’ll be speaking to Mr. Feeney.', 'That is not on the agenda!'],
      idle: ['Let’s circle up.', 'Do you have a minute? Or sixty?', 'I’ve sent a calendar invite.'],
    },
  },
  // Stand-in until his painted art arrives.
  dale: { skin: '#d8b08a', hair: '#5c554c', style: 'slick', shirt: '#6e7b43', lanyard: '#3a3f45', glasses: 'square', rest: 'smug' },
};

/** Which people stand behind each target. */
export const TARGET_PEOPLE: Record<string, string[]> = {
  gary1: ['gary'],
  gary2: ['gary'],
  gary3: ['gary'],
  gary4: ['gary'],
  brad: ['brad'],
  printer: ['janet', 'ron'],
  taskforce: ['tf1', 'tf2', 'tf3'],
  rick: ['rick'],
  it: ['derek'],
  accounting: ['doris'],
  mailroom: ['tony'],
  marketing: ['skyler'],
  breakroom: ['gail'],
  conference: ['victoria'],
};

function hair(p: Person): string {
  const f = `fill="${p.hair}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
  switch (p.style) {
    case 'short':
      return `<path ${f} d="M29 56 Q26 22 60 20 Q94 22 91 56 Q86 38 72 36 Q60 42 46 36 Q34 40 29 56 Z"/>`;
    case 'thinning':
      return `<path ${f} d="M29 62 Q27 42 35 36 Q40 48 38 62 Z"/><path ${f} d="M91 62 Q93 42 85 36 Q80 48 82 62 Z"/><path fill="none" stroke="${p.hair}" stroke-width="3" stroke-linecap="round" d="M44 27 Q60 18 78 28 M48 31 Q62 24 76 32"/>`;
    case 'slick':
      return `<path ${f} d="M29 54 Q30 18 64 20 Q94 24 91 50 Q80 30 50 33 Q36 38 29 54 Z"/>`;
    case 'curly': {
      const c = [[34, 40], [44, 27], [58, 21], [73, 24], [85, 35], [90, 52], [30, 56], [91, 68], [29, 70]];
      return c.map(([x, y]) => `<circle ${f} cx="${x}" cy="${y}" r="11"/>`).join('');
    }
    case 'bun':
      return `<circle ${f} cx="60" cy="16" r="12"/><path ${f} d="M29 58 Q26 24 60 22 Q94 24 91 58 Q84 36 60 36 Q36 36 29 58 Z"/>`;
    case 'bob':
      return `<path ${f} d="M26 86 Q20 22 60 20 Q100 22 94 86 L84 86 Q88 50 76 40 Q60 46 42 40 Q32 52 36 86 Z"/>`;
    case 'messy':
      return `<path ${f} d="M28 56 L30 34 L38 38 L40 22 L50 30 L56 16 L64 28 L72 16 L76 30 L86 24 L86 38 L94 40 L92 56 Q84 40 60 38 Q38 40 28 56 Z"/>`;
    case 'side':
      return `<path ${f} d="M29 58 Q26 24 58 21 Q94 22 91 58 Q88 40 80 34 L46 34 Q34 40 29 58 Z"/><path fill="none" stroke="${INK}" stroke-width="2" d="M46 34 Q54 26 64 22"/>`;
    case 'spiky':
      return `<path ${f} d="M29 56 L28 30 L40 34 L42 18 L54 28 L60 12 L67 28 L78 18 L80 34 L92 30 L91 56 Q84 38 60 38 Q36 38 29 56 Z"/>`;
    case 'bald':
      return `<path fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="4" stroke-linecap="round" d="M44 32 Q52 26 62 26"/>`;
  }
}

function eyes(m: Mood): string {
  const dot = (x: number) => `<circle cx="${x}" cy="58" r="3.6" fill="${INK}"/>`;
  switch (m) {
    case 'hit':
      return `<path fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" d="M43 53 L51 58 L43 63 M77 53 L69 58 L77 63"/>`;
    case 'happy':
      return `<path fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" d="M43 60 Q48 53 53 60 M67 60 Q72 53 77 60"/>`;
    case 'angry':
      return `${dot(48)}${dot(72)}<path stroke="${INK}" stroke-width="3.5" stroke-linecap="round" d="M41 47 L54 52 M79 47 L66 52"/>`;
    case 'smug':
      return `${dot(48)}${dot(72)}<path stroke="${INK}" stroke-width="3" stroke-linecap="round" d="M42 55 L54 55 M66 55 L78 55"/><path fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" d="M66 46 Q72 42 78 45"/>`;
    case 'worried':
      return `${dot(48)}${dot(72)}<path stroke="${INK}" stroke-width="3" stroke-linecap="round" d="M41 51 L54 46 M79 51 L66 46"/>`;
    default:
      return `${dot(48)}${dot(72)}`;
  }
}

function mouth(m: Mood): string {
  const s = `fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"`;
  switch (m) {
    case 'hit':
      return `<ellipse cx="60" cy="82" rx="5.5" ry="6.5" fill="${INK}"/>`;
    case 'happy':
      return `<path d="M47 76 Q60 92 73 76 Z" fill="${INK}"/><path d="M52 79 Q60 83 68 79" fill="none" stroke="#fff" stroke-width="2.5"/>`;
    case 'angry':
      return `<path ${s} d="M50 85 Q60 77 70 85"/>`;
    case 'smug':
      return `<path ${s} d="M50 81 Q62 85 71 76"/>`;
    case 'worried':
      return `<path ${s} d="M50 83 Q55 79 60 83 Q65 87 70 83"/>`;
    default:
      return `<path ${s} d="M51 80 Q60 84 69 80"/>`;
  }
}

/** Returns the inner SVG markup for a person (place inside a <g> or <svg viewBox="0 0 120 150">). */
export function drawPerson(p: Person, mood: Mood = p.rest ?? 'idle'): string {
  const o = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
  const body = p.hoodie
    ? `<path fill="${p.shirt}" ${o} d="M10 150 Q12 108 40 100 L80 100 Q108 108 110 150 Z"/><path fill="none" stroke="${INK}" stroke-width="2.5" d="M44 101 Q60 120 76 101 M52 112 L50 130 M68 112 L70 130"/>`
    : p.cardigan
      ? `<path fill="${p.shirt}" ${o} d="M12 150 Q14 110 40 102 L80 102 Q106 110 108 150 Z"/><path fill="#f3eee2" ${o} d="M50 102 L60 150 L70 102 Z"/><circle cx="56" cy="122" r="2" fill="${INK}"/><circle cx="58" cy="136" r="2" fill="${INK}"/>`
      : `<path fill="${p.shirt}" ${o} d="M12 150 Q14 110 40 102 L80 102 Q106 110 108 150 Z"/><path fill="${p.shirt}" ${o} d="M47 102 L60 116 L73 102"/>`;
  const tie = p.tie ? `<path fill="${p.tie}" ${o} d="M56 112 L64 112 L67 140 L60 148 L53 140 Z"/><path fill="${p.tie}" ${o} d="M55 104 L65 104 L63 113 L57 113 Z"/>` : '';
  const lanyard = p.lanyard
    ? `<path fill="none" stroke="${p.lanyard}" stroke-width="4" d="M46 103 L56 132 M74 103 L64 132"/><rect x="52" y="130" width="16" height="12" rx="2" fill="#fff" ${o}/>`
    : '';
  const neck = `<path fill="${p.skin}" ${o} d="M50 86 L50 104 Q60 110 70 104 L70 86 Z"/>`;
  const ears = `<ellipse cx="31" cy="62" rx="6" ry="8" fill="${p.skin}" ${o}/><ellipse cx="89" cy="62" rx="6" ry="8" fill="${p.skin}" ${o}/>`;
  const earrings = p.earrings ? `<circle cx="30" cy="74" r="3.5" fill="#e8c35a" ${o}/><circle cx="90" cy="74" r="3.5" fill="#e8c35a" ${o}/>` : '';
  const head = `<ellipse cx="60" cy="60" rx="30" ry="33" fill="${p.skin}" ${o}/>`;
  const beard = p.beard ? `<path fill="${p.hair}" ${o} d="M31 66 Q34 96 60 98 Q86 96 89 66 Q84 82 70 80 Q60 76 50 80 Q36 82 31 66 Z"/>` : '';
  const nose = `<path fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" d="M60 61 Q55 70 61 72"/>`;
  const mustache = p.mustache ? `<path fill="${p.hair}" ${o} d="M47 75 Q54 70 60 74 Q66 70 73 75 Q66 79 60 76 Q54 79 47 75 Z"/>` : '';
  const glasses =
    p.glasses === 'round'
      ? `<g fill="rgba(255,255,255,0.18)" stroke="${INK}" stroke-width="2.5"><circle cx="48" cy="58" r="9"/><circle cx="72" cy="58" r="9"/><path d="M57 58 L63 58"/></g>`
      : p.glasses === 'square'
        ? `<g fill="rgba(255,255,255,0.18)" stroke="${INK}" stroke-width="2.5"><rect x="38" y="51" width="19" height="14" rx="3"/><rect x="63" y="51" width="19" height="14" rx="3"/><path d="M57 57 L63 57"/></g>`
        : '';
  const headset = p.headset
    ? `<path fill="none" stroke="${INK}" stroke-width="5" d="M30 60 Q30 22 60 22 Q90 22 90 60"/><rect x="24" y="54" width="10" height="16" rx="4" fill="#3a3f45"/><path fill="none" stroke="#3a3f45" stroke-width="3" d="M30 70 Q34 86 50 84"/><circle cx="51" cy="84" r="3" fill="#3a3f45"/>`
    : '';
  const blush = '';
  return `${body}${tie}${lanyard}${neck}${ears}${earrings}${head}${beard}${hair(p)}${eyes(mood)}${glasses}${nose}${mustache}${mouth(mood)}${headset}${blush}`;
}
