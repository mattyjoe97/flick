// The words for your job: the emails in your inbox, the people who call, the
// receipts in expense reports and the rules for them. Kept apart from work.ts so the
// rules of the mini-games stay readable.

/** Departments on the phone directory (and for forwarding email). */
export const DEPARTMENTS = ['Facilities', 'Sales', 'Accounting', 'HR', 'Mailroom', 'IT'] as const;
export type Department = (typeof DEPARTMENTS)[number];

/** Who works where: callers sometimes ask for a person, not a department. */
export const PEOPLE: Record<string, Department> = {
  Brad: 'Sales',
  Doug: 'Facilities',
  Diane: 'HR',
  Ron: 'IT',
  Janet: 'Accounting',
  Marcus: 'Mailroom',
};

// ---------------------------------------------------------------- email

export type MailAct = 'reply' | 'forward' | 'delete';

export interface MailPrompt {
  from: string;
  subject: string;
  body: string;
  /** What this email needs: a reply from you, forwarding to a department, or the bin. */
  act: MailAct;
  /** For forward: the department it's really for. */
  dept?: Department;
  /** For reply: exactly one reply is right; a Reply All is always a mistake. */
  replies?: { text: string; ok?: boolean; replyAll?: boolean; result: string }[];
  /** What happens when you handle it right (forward and delete emails). */
  done?: string;
}

export const MAIL: MailPrompt[] = [
  // ---- needs a reply from you
  {
    from: 'Mr. Feeney', subject: 'Status?', body: 'Where are we on the Q3 deck?', act: 'reply',
    replies: [
      { text: 'Almost done. You’ll have it by end of day.', ok: true, result: 'Mr. Feeney replies with a thumbs up.' },
      { text: 'What Q3 deck?', result: 'Mr. Feeney books a meeting titled "Q3 Deck (Urgent)".' },
      { text: 'lol no idea', replyAll: true, result: 'Reply All. 212 people now know you have no idea.' },
    ],
  },
  {
    from: 'Accounting', subject: 'Missing receipt', body: 'We are missing your receipt for $4.99 from March.', act: 'reply',
    replies: [
      { text: 'Attached. Sorry for the delay!', ok: true, result: 'Accounting closes the ticket.' },
      { text: 'It was a stapler. Let it go.', result: 'Accounting does not let it go.' },
      { text: 'Who cares about $4.99', replyAll: true, result: 'Reply All. Everyone now knows Accounting cares.' },
    ],
  },
  {
    from: 'HR', subject: 'Employee Happiness Survey', body: 'Please complete the 45-minute Employee Happiness Survey by Friday.', act: 'reply',
    replies: [
      { text: 'Done! Thanks for asking.', ok: true, result: 'HR marks you as "happy".' },
      { text: 'Too busy being happy.', result: 'HR schedules a 1:1 about your happiness.' },
      { text: 'Is this anonymous?', replyAll: true, result: 'Reply All. It is no longer anonymous.' },
    ],
  },
  {
    from: 'Janet', subject: 'Printer', body: 'Can you send me the file again? The printer ate it.', act: 'reply',
    replies: [
      { text: 'Re-sent. Fingers crossed!', ok: true, result: 'The printer accepts your offering.' },
      { text: 'Have you tried hitting it?', result: 'Janet hit it. Facilities is on the way.' },
      { text: 'PRINTER IS BROKEN AGAIN', replyAll: true, result: 'Reply All. The whole floor walks over to look at the printer.' },
    ],
  },
  {
    from: 'Kevin', subject: 'question', body: 'is it ok if i take a 2 hour lunch', act: 'reply',
    replies: [
      { text: 'Check with Mr. Feeney, but probably not.', ok: true, result: 'Kevin takes a 58-minute lunch.' },
      { text: 'Take three. Live your life.', result: 'Kevin took four. Mr. Feeney wants to know who approved it.' },
      { text: 'who is this', replyAll: true, result: 'Reply All. Kevin is hurt.' },
    ],
  },
  {
    from: 'Accounting', subject: 'Supply order', body: 'Why did your department order 40,000 rubber bands this month?', act: 'reply',
    replies: [
      { text: 'Bulk discount. Very cost-effective.', ok: true, result: 'Accounting is impressed by your thrift.' },
      { text: 'What rubber bands?', result: 'Accounting attaches the invoice. And a photo.' },
      { text: 'No comment.', replyAll: true, result: 'Reply All. "No comment" is the most suspicious reply possible.' },
    ],
  },
  {
    from: 'HR', subject: 'Diane’s card', body: 'Please sign Diane’s birthday card at the front desk by 3 PM.', act: 'reply',
    replies: [
      { text: 'Signed! Happy birthday, Diane.', ok: true, result: 'Diane is delighted.' },
      { text: 'Who is Diane?', result: 'Diane sits next to you.' },
      { text: 'Is there cake?', replyAll: true, result: 'Reply All. There was cake.' },
    ],
  },
  {
    from: 'Mr. Feeney', subject: 'Team culture', body: 'Send me three words that describe our team.', act: 'reply',
    replies: [
      { text: 'Collaborative, focused, resilient.', ok: true, result: 'Mr. Feeney puts your words on a poster.' },
      { text: 'Armed. Dangerous. Elastic.', result: 'Mr. Feeney reads it twice.' },
      { text: 'synergy synergy synergy', replyAll: true, result: 'Reply All. It becomes the team motto. Against your will.' },
    ],
  },
  {
    from: 'Marketing', subject: 'Office newsletter', body: 'Any fun news from your floor for this week’s newsletter?', act: 'reply',
    replies: [
      { text: 'Nothing to report! Quiet week.', ok: true, result: 'The newsletter features a cat photo instead.' },
      { text: 'Huge rubber band war on Floor 4!', result: 'The newsletter runs it. With a diagram.' },
      { text: 'Gary has a fan now', replyAll: true, result: 'Reply All. Gary’s fan gets its own newsletter section.' },
    ],
  },
  {
    from: 'Mr. Feeney', subject: 'Saturday', body: 'Any chance you could come in this Saturday?', act: 'reply',
    replies: [
      { text: 'I can’t Saturday, but I’ll wrap it up Friday.', ok: true, result: 'Mr. Feeney respects the boundary. Mostly.' },
      { text: 'Absolutely not.', result: 'Mr. Feeney writes "attitude?" on a sticky note.' },
      { text: 'Is it paid?', replyAll: true, result: 'Reply All. Now everyone is asking if it’s paid.' },
    ],
  },
  {
    from: 'Facilities', subject: 'Fridge cleanout', body: 'Is the yogurt labeled "DO NOT TOUCH" yours?', act: 'reply',
    replies: [
      { text: 'Not mine. I’ll ask around.', ok: true, result: 'The yogurt’s owner remains a mystery.' },
      { text: 'It’s Gary’s. Throw it out.', result: 'It was Brad’s. Brad is furious.' },
      { text: 'It’s been there since March', replyAll: true, result: 'Reply All. The yogurt is now famous.' },
    ],
  },
  {
    from: 'Brad', subject: 'Quick favor', body: 'Can you cover my 2 PM client call? I’m "at the dentist".', act: 'reply',
    replies: [
      { text: 'Sorry, I’m booked at 2. Ask Linda?', ok: true, result: 'Brad goes to "the dentist" anyway.' },
      { text: 'Sure, what’s the client’s name?', result: 'There is no client. There was never a client.' },
      { text: 'Brad is golfing', replyAll: true, result: 'Reply All. Brad is no longer golfing.' },
    ],
  },
  {
    from: 'Facilities', subject: 'Thermostat', body: 'Please stop adjusting the thermostat. It is set to a temperature that is fair to everyone.', act: 'reply',
    replies: [
      { text: 'Understood. I’ll leave it alone.', ok: true, result: 'Facilities logs your cooperation.' },
      { text: 'It was 61 degrees, Doug.', result: 'Doug lowers it to 60.' },
      { text: 'IT IS FREEZING IN HERE', replyAll: true, result: 'Reply All. A thermostat debate begins. It will outlive us all.' },
    ],
  },
  {
    from: 'IT', subject: 'Restart required', body: 'Your computer will restart in 5 minutes to install updates. Please confirm.', act: 'reply',
    replies: [
      { text: 'Saving my work now. Thanks!', ok: true, result: 'The restart goes smoothly.' },
      { text: 'Postpone (forever)', result: 'It restarts anyway, mid-sentence, during a call.' },
      { text: 'NO', replyAll: true, result: 'Reply All. Everyone’s computer restarts out of spite.' },
    ],
  },

  // ---- somebody else's job: forward it
  { from: 'Visitor desk', subject: 'Delivery', body: 'A courier is here with 6 boxes marked "RUBBER BANDS (MISC.)". Where do they go?', act: 'forward', dept: 'Mailroom', done: 'The Mailroom signs for the boxes. You did not see the boxes.' },
  { from: 'Ron', subject: 'my chair', body: 'My chair squeaks every time I breathe. Who fixes chairs?', act: 'forward', dept: 'Facilities', done: 'Doug arrives with a can of WD-40 and opinions.' },
  { from: 'Acme Staples Ltd.', subject: 'Invoice #4471 OVERDUE', body: 'Please remit payment for 9,000 staples at your earliest convenience.', act: 'forward', dept: 'Accounting', done: 'Accounting pays the invoice and asks who needs 9,000 staples.' },
  { from: 'A customer', subject: 'Bulk order', body: 'Hello, I would like to buy 500 units of your finest synergy. Who do I talk to?', act: 'forward', dept: 'Sales', done: 'Brad closes the deal. Brad takes the credit.' },
  { from: 'Steve', subject: 'laptop noise', body: 'my laptop is making a noise like a kettle. also it is hot like a kettle', act: 'forward', dept: 'IT', done: 'IT turns it off and on again. The kettle noise stops.' },
  { from: 'Kevin', subject: 'dog fridays?', body: 'can I bring my dog to work on fridays. his name is Spreadsheet', act: 'forward', dept: 'HR', done: 'HR says no. Spreadsheet is disappointed.' },
  { from: 'Linda', subject: 'Parking garage', body: 'Half the lights in the parking garage are out. It is a horror movie down there.', act: 'forward', dept: 'Facilities', done: 'Facilities replaces two of the bulbs. Progress.' },
  { from: 'Gary', subject: 'pizza money', body: 'I paid for the team pizza ($84). who pays me back?', act: 'forward', dept: 'Accounting', done: 'Accounting reimburses Gary. Gary is insufferable about it.' },
  { from: 'Postal service', subject: 'Returned package', body: 'Package addressed to "THE WAR ROOM, FLOOR 4" could not be delivered.', act: 'forward', dept: 'Mailroom', done: 'Marcus in the Mailroom quietly delivers it to your desk.' },
  { from: 'Anonymous', subject: 'Workplace concern', body: 'Two coworkers on Floor 4 keep flicking rubber bands at each other. This seems like an HR thing.', act: 'forward', dept: 'HR', done: 'HR files it under "Monday". Nobody reads "Monday".' },
  { from: 'New hire', subject: 'Wi-Fi', body: 'Hi! First day. What’s the Wi-Fi password and who would know?', act: 'forward', dept: 'IT', done: 'IT sends the password. It is "password1".' },
  { from: 'Prospect', subject: 'Pricing question', body: 'Is there a discount if we sign a three-year contract? Asking for a large company.', act: 'forward', dept: 'Sales', done: 'Sales sends a quote with a lot of exclamation points.' },
  { from: 'Marjorie', subject: 'Kitchen leak', body: 'There is a puddle under the third-floor kitchen sink, dear. A growing one.', act: 'forward', dept: 'Facilities', done: 'Doug puts a bucket under it. A permanent bucket.' },
  { from: 'Vendor', subject: 'W-9 request', body: 'We need a signed W-9 before we can process your refund.', act: 'forward', dept: 'Accounting', done: 'Accounting sends the form. The refund is $3.12.' },

  // ---- nobody needs this: delete it
  { from: 'IT Security', subject: 'Action required!!', body: 'Please confirm your password by replying to this email.', act: 'delete', done: 'You deleted a phishing test. IT is proud of you. Gary failed it.' },
  { from: 'Prize Department', subject: 'YOU WON A CRUISE', body: 'Congratulations!! Claim your 7-night cruise by sending a $49 processing fee.', act: 'delete', done: 'No cruise. No fee. A wise trade.' },
  { from: 'Brad', subject: 'RE: RE: RE: RE: who took my yogurt', body: 'Reply All: "please remove me from this thread" (x41)', act: 'delete', done: 'You are the only person who did not reply. A hero.' },
  { from: 'Steve', subject: 'FWD: FWD: lucky chain email', body: 'Forward this to 10 coworkers in the next hour or have bad luck for a year!!', act: 'delete', done: 'Deleted. Your luck holds.' },
  { from: 'Daily Synergy Digest', subject: 'Your daily digest', body: '12 new posts about leveraging bandwidth. (The unsubscribe link is broken.)', act: 'delete', done: 'Another day, another digest, deleted.' },
  { from: 'Mail system', subject: 'Mailbox 99% full', body: 'Your mailbox is almost full. Click here and enter your password to upgrade.', act: 'delete', done: 'That was a phishing email. Your mailbox is fine.' },
  { from: 'Brad', subject: 'Out of office', body: 'I am currently "at the dentist". For urgent matters, please contact the dentist.', act: 'delete', done: 'Automatic reply, deleted. Brad is golfing.' },
  { from: 'Kyle (3rd floor)', subject: 'Free seminar!', body: 'Learn how I turned $20 into $19 with crypto. Conference Room B, lunchtime.', act: 'delete', done: 'You will never know what happened to the other dollar.' },
  { from: 'Read receipt', subject: 'Read: lunch?', body: 'Gary read your message at 9:14 AM. Gary did not reply.', act: 'delete', done: 'Gary is ignoring you. Noted.' },
  { from: 'ink_deals_4u', subject: 'Printer ink 90% off', body: 'Genuine-ish printer ink, direct from a man named Tony.', act: 'delete', done: 'Deleted. The printer did not need Tony.' },
  { from: 'Office Chairs Near You', subject: 'Hot deals on chairs!!!', body: 'Chairs in your area are waiting to meet you.', act: 'delete', done: 'Spam deleted. The chairs will have to wait.' },
  { from: 'Calendar', subject: 'Reminder: reminder', body: 'This is a reminder about your reminder to check your reminders.', act: 'delete', done: 'Deleted. You feel lighter.' },
  { from: 'Facilities', subject: 'Optional lunch & learn', body: '90 minutes on the history of the font Arial. Optional. No food will be provided.', act: 'delete', done: 'Deleted. Arial will survive without you.' },
];

// ---------------------------------------------------------------- the phone

/** What a caller needs: a department, a person (find their department), you, or a hang-up. */
export interface Caller {
  line: string;
  /** Transfer to this department. */
  dept?: Department;
  /** Or: they asked for this person (transfer to that person's department). */
  person?: keyof typeof PEOPLE;
  /** Or: it's for you ("Speaking."). */
  self?: boolean;
  /** Or: a prank. Hang up. */
  prank?: boolean;
  /** Mr. Feeney checking you're at your desk: answering well cools Suspicion. */
  boss?: boolean;
}

export const CALLERS: Caller[] = [
  { line: 'My paycheck is one cent short. Again.', dept: 'Accounting' },
  { line: 'I need a reimbursement form for a stapler.', dept: 'Accounting' },
  { line: 'There’s water dripping from the ceiling tile above my desk.', dept: 'Facilities' },
  { line: 'The vending machine ate my dollar.', dept: 'Facilities' },
  { line: 'I’d like to report a coworker for "elastic misconduct".', dept: 'HR' },
  { line: 'I need to update my emergency contact.', dept: 'HR' },
  { line: 'My screen says PC LOAD LETTER. What does that mean?', dept: 'IT' },
  { line: 'I forgot my password. I also forgot my username.', dept: 'IT' },
  { line: 'I have a package for Floor 4. It rattles.', dept: 'Mailroom' },
  { line: 'Where do I deliver forty boxes of rubber bands?', dept: 'Mailroom' },
  { line: 'I’d like to buy 500 of whatever you sell.', dept: 'Sales' },
  { line: 'Is Brad there? He promised me a discount.', person: 'Brad' },
  { line: 'Could you put me through to Doug? It’s about the thermostat. Again.', person: 'Doug' },
  { line: 'I’m looking for Diane. It’s a confidential matter.', person: 'Diane' },
  { line: 'Ron, please. Tell him it’s his mom.', person: 'Ron' },
  { line: 'Hi, Janet asked me to call her back about an invoice?', person: 'Janet' },
  { line: 'Is Marcus around? I have a pallet with his name on it.', person: 'Marcus' },
  { line: 'Hi, is this your desk? I’m calling about your car’s extended warranty… no wait, your stapler’s.', self: true },
  { line: 'Hello, is this the person who ordered a "lifetime supply" of rubber bands?', self: true },
  { line: 'Is your refrigerator running? (Gary, badly disguising his voice.)', prank: true },
  { line: 'Hello, this is the IRS. Please pay your taxes in gift cards. (It is Kevin.)', prank: true },
  { line: 'Just checking you’re at your desk. Keep it up.', boss: true, self: true },
  { line: 'Mr. Feeney here. Quick question: are you busy? Good.', boss: true, self: true },
];

// ---------------------------------------------------------------- expense reports

export interface ReceiptTemplate {
  item: string;
  cat: 'Office supplies' | 'Food' | 'Travel' | 'Personal';
  lo: number;
  hi: number;
}

export const RECEIPTS: ReceiptTemplate[] = [
  { item: 'Stapler', cat: 'Office supplies', lo: 9, hi: 24 },
  { item: 'Printer paper (10 reams)', cat: 'Office supplies', lo: 32, hi: 48 },
  { item: 'Desk organizer', cat: 'Office supplies', lo: 14, hi: 39 },
  { item: 'Ergonomic keyboard', cat: 'Office supplies', lo: 55, hi: 120 },
  { item: 'Whiteboard', cat: 'Office supplies', lo: 60, hi: 140 },
  { item: 'Highlighters (24)', cat: 'Office supplies', lo: 8, hi: 19 },
  { item: 'Label maker', cat: 'Office supplies', lo: 25, hi: 70 },
  { item: 'Golf balls (12)', cat: 'Personal', lo: 18, hi: 40 },
  { item: 'Birthday gift for wife', cat: 'Personal', lo: 25, hi: 90 },
  { item: 'Gym membership', cat: 'Personal', lo: 30, hi: 80 },
  { item: 'Team lunch', cat: 'Food', lo: 120, hi: 380 },
  { item: 'Coffee for the team', cat: 'Food', lo: 14, hi: 42 },
  { item: 'Donuts (2 dozen)', cat: 'Food', lo: 18, hi: 36 },
  { item: 'Client dinner', cat: 'Food', lo: 60, hi: 240 },
  { item: 'Taxi to the airport', cat: 'Travel', lo: 28, hi: 70 },
  { item: 'Hotel minibar', cat: 'Travel', lo: 22, hi: 65 },
  { item: 'Train ticket', cat: 'Travel', lo: 18, hi: 45 },
  { item: 'Parking (conference)', cat: 'Travel', lo: 12, hi: 30 },
];

export const SUBMITTERS = ['Gary', 'Brad', 'Janet', 'Ron', 'Steve', 'Linda', 'Kevin', 'Marjorie'];

export interface ReceiptLike {
  cat: string;
  amount: number;
  by: string;
}

/** Rules of the day: what to approve. Everything else is denied. */
export const EXPENSE_RULES: { text: string; ok: (r: ReceiptLike) => boolean }[] = [
  { text: 'Approve office supplies under $50.', ok: (r) => r.cat === 'Office supplies' && r.amount < 50 },
  { text: 'Approve anything under $30.', ok: (r) => r.amount < 30 },
  { text: 'Approve travel. Nothing else.', ok: (r) => r.cat === 'Travel' },
  { text: 'Approve food and office supplies under $40.', ok: (r) => (r.cat === 'Food' || r.cat === 'Office supplies') && r.amount < 40 },
  { text: 'Approve office supplies and travel.', ok: (r) => r.cat === 'Office supplies' || r.cat === 'Travel' },
  { text: 'Approve anything that isn’t personal.', ok: (r) => r.cat !== 'Personal' },
];

/** Once you're senior enough, Accounting adds an exception on top of the rule. */
export const EXPENSE_EXCEPTIONS: { text: string; by: string }[] = [
  { text: 'Deny anything Brad submits.', by: 'Brad' },
  { text: 'Deny anything Steve submits.', by: 'Steve' },
  { text: 'Deny anything Gary submits.', by: 'Gary' },
];

// ---------------------------------------------------------------- spreadsheet errors

