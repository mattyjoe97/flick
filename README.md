# FLICK

An incremental browser game about an office rubber band war. It starts when Gary in the next cubicle flicks a rubber band at you, and ends (eventually) with you running the building.

This repo holds the **first playable slice**: Stage 1 (Desk Skirmish) and Stage 2 (Cubicle Alliance), about 45–75 minutes of play.

## Play it online

Every push to `main` builds the game and publishes it with GitHub Pages (see `.github/workflows/deploy.yml`). One-time setup: in the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**. The game then lives at `https://<your-username>.github.io/flick/`.

**Put it on your home screen.** On the website, FLICK can be added to your phone's home screen (Settings has the steps for iPhone and Android; Android gets an Install button). It then opens full screen with its own icon, no browser bars, and works with no connection. The home screen app keeps its own save, so copy your save over with Export and Import.

## Play it locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

Add `?debug=1` to the URL for a speed control (×1, ×10, ×50) and `window.flick` in the browser console.

## Controls

| Key | Action |
| --- | --- |
| F | Flick at the current target (hold to stretch the band, let go at full stretch for a Perfect shot) |
| Esc or B | Your computer (and back to the war) |
| W | Answer the desk phone when it rings |
| S | Scrounge: pull a band out of your desk drawer |
| O | Order supplies, or open the box when it arrives |
| D | The supply closet (Dale's black market) |
| V | Barrage: you and every Shooter throw a pile of bands at once (Stage 2) |
| T | Your floor: go and see your team (once you can hire) |
| M | The map of the 4th floor: pick who to fight and sabotage the rooms (Stages 3 and 4; or The 4th floor in the top bar, or the nameplate) |
| 1–4 | Switch between the weapons you own (or click one on the rack under Flick) |
| 1–9 | On your computer: pick an email reply, dial an extension |

**The screen.** One strip under the top bar holds your numbers: Bands, Salary (with your title and the bar toward your next promotion), Suspicion and your HR file; on a phone it stays at the top while you scroll. Below it is the view from your chair: the office across the aisle, your hand on the right, the near edge of your desk along the bottom with your coffee mug (it fills with Suspicion) and your rubber band ball on it, and Bailey asleep in her bed beside your chair. Under the view are only the controls: the Flick key, the Barrage key beside it, and your weapons. The desk mat on the left keeps the shopping list, Dale's closet, your drawer and supply orders, and a notepad under the controls has the tip of the moment and what just happened.

**On a phone** the war fits on one screen with no scrolling. The view gets taller (the empty sides are cropped, so everyone is about half again as big, Bailey too), the tip sits under it, and your keys are at the bottom where your thumbs are: your weapons, the stretch meter, then Barrage and a big Flick key. A bottom bar has Drawer, Order, Closet, Floor, Map (from Stage 3) and List (the shopping list and what just happened). The numbers strip never jiggles as it counts up: every digit has a slot of its own and every number its own column. Holding a key never selects text or opens the phone's long-press menu, and tips say "tap" instead of naming keys.

The game has two modes. At war you flick at your coworkers while Suspicion climbs. Press Esc and you're at your work computer: a beige CRT on your desk (keyboard, mouse and desk phone in front of it) running a 90s office OS with a Start menu, a taskbar, pop-up notifications and a flying-stapler screensaver. Mr. Feeney can't catch you there, Suspicion cools, and your Shooters keep firing at half speed. When he walks the floor you hear his footsteps get louder and see his reflection grow in the glass; he stops behind you, comments on whatever you have open, and moves on.

Work comes in short rounds with a clock and a grade (A to F). Every item done right pays, cools Suspicion and builds the combo; a clean, quick round earns a grade bonus. A round's clock only runs while you're looking at it.

- **Mail:** work email arrives in bursts. Each one needs one thing: **Reply** (and pick the right reply; never Reply All), **Forward** it to the right department, or **Delete** it. Story email lands in the Inbox; coworkers who want to join your side email you, with a Recruit button right in the message.
- **Phone:** the desk phone rings every minute or two, even at war. Put the caller through using today's directory (it's reshuffled every morning); some want you ("Speaking"), some are pranks (hang up), and sometimes it's Mr. Feeney checking you're at your desk. Ignoring it costs nothing.
- **Spreadsheet:** Accounting's printout (greenbar paper, holes down the sides) sits next to your copy of the same sheet, and whoever typed your copy made a few typos. Click the numbers that don't match. No adding up. Pointing at a number lights up its twin on the printout; clicking one that matched is a mistake. The Budget and Headcount sheets unlock as you progress, pay more and have sneakier typos (swapped digits, one digit off).
- **Expenses:** stamp each receipt Approved or Denied by today's rule (it changes daily, and gains an exception once you're senior). Your own rubber band order sometimes turns up: approve it for free bands, if you don't mind Accounting noticing.
- **Messenger:** a buddy list with away messages and a conversation with each coworker. Their bubbles on the left, yours on the right, "Gary is typing…", and quick replies when there's something to say back (Dale might find you a deal).
- **Staffing:** your career and the people you hire (see below).
- **Supply Catalog, Org Chart, My Documents, Recycle Bin:** band orders; your allies in the war (recruiting, roles, promotions and the floor plan); and a few files to poke at.

Bands come from three places besides Gary. **Your desk drawer** (S) slides open full of junk and a few stray bands; your hand picks them out one at a time, and a few more turn up every few seconds. Sometimes there's something better in there: a tangle of bands, a rubber band ball, or loose change. **Supply orders** (O) get stamped and sent off in an inter-office envelope; 10 seconds later a box lands on your desk, and you open it (O again) for the bands. Don't leave it sitting there: Mr. Feeney asks about unopened boxes.

**Dale from Facilities** runs the office black market out of the supply closet (D), and it's the only shop. Every rubber band gun hangs on his pegboard; the band upgrades Procurement would never approve (Rummage Deeper, Waxed Bands, Silent Flick Technique, Shooter Training, Double-Thick Bands, the Supply Closet Key, Fake Calendar Invites) are on his table; and office upgrades (the chair, Auto-Reply, the Monitor Riser and so on) are on the Procurement clipboard by the door, forms his cousin pre-stamps. He can also get a confiscated weapon back out of Mr. Feeney's drawer. Every few minutes he leans over your cubicle wall ("Psst") with a deal for 30 seconds: at most 15% off, or something before it unlocks at a markup. The closet closes, and Dale vanishes, the moment Mr. Feeney's footsteps start.

You don't have to go looking. The **shopping list** on your desk always shows the next weapon and the cheapest things you could buy, with a bar filling up toward each price; tap one and you're at Dale's with it in your hand (or at the Org Chart, for a coworker). A red number on the closet card says how many things you can afford right now. The guns you own sit on a **rack** under the Flick key, numbered 1–4, with the next one on an empty hook. Click a teammate in the office to change their role on the spot.

**Money.** Work pays Salary and cools Suspicion. Items done one after another build a **combo** (each one inside 15 seconds of the last adds 10% pay, up to ×2); a wrong answer or a long pause ends it. A quick player earns about the same per minute from any of the four jobs. Coins fly into your Salary when you're paid. Beating someone pays their **bounty** (Gary's lunch money, Brad's commission check, the Printer Corner's petty cash, Rick's discretionary fund). Nothing piles up or goes overdue.

**Your career.** Things done right at your computer fill your **Performance** bar (a clean, quick round counts extra, and the more senior you are the more your work counts). When it's full, Mr. Feeney calls you in: go to your review in Staffing (or from his email), answer one question (any answer is fine), and you're promoted. There are 16 ranks, from Junior Associate (work ×1) through Floor Manager (×4) and Director (×6.5) to CEO (×25). The bar stops at full until you show up, so promotions never happen while you're away. Old saves keep the pay grade the war gave them.

**Your team.** Some promotions let you hire someone: a Temp (answers email; that's Adam, who brings his cat Muffins), a Receptionist (takes calls; that's Danielle, who brings her golden retriever Joey), a Bookkeeper (stamps receipts), an Analyst (fixes spreadsheets) and an Assistant Manager (makes every other team faster). Each team starts with its lead and grows a seat at a time; your headcount budget goes up by one seat with every promotion, every seat costs more than the last, and training (Lunch-and-learn up to a Six Sigma black belt) makes a whole team half again as productive. They earn 35% of what you would for the same work, all the time, and keep earning while the game is closed (up to 8 hours), and their work adds a little Performance. Keep a work combo going and they **follow your lead**: +10% per link, up to twice as fast. Tap a pencil to rename anyone, yourself included (your badge says Matt Callahan). **Your floor** (T, or the button in the top bar) is where they sit: Adam at his desk with Muffins lying on it, Danielle at the wooden front desk with Joey on the floor in front of it, Harold, Priya, and Chad in his office, with a little monitor for every extra seat and their work floating up as they finish it (they grin when your combo or a pizza speeds them up). Tap someone for their card to hire, train or rename them; empty desks have a "wanted" sign with the price. Being on your floor counts as working, like your computer: Mr. Feeney can't catch you there. Playing straight through, CEO takes about 3½ hours; checking in for ten minutes an hour, about 12½.

**Your team leads' calls.** Once you've hired someone, every 4 to 7 minutes of play one of your team leads messages you with a little problem and two ways to handle it: Muffins knocked coffee into the printer, Joey ate Mr. Feeney's FedEx envelope, Harold requires a nap (he is eighty-one), Priya wrote a macro, Chad booked a bowling offsite. The card shows their face and what each choice does: cash (scaled to your team's pay), Suspicion, Performance, a team working faster or stopping for a bit, your own work paying double, Mr. Feeney's next walk-by pushed back, a playdate that counts as an ear scratch for Bailey, or (in the Department War) Danielle watching the supply closet so raiders get caught on the way in. You have 40 seconds; after that they go with the safe choice. A call never costs more than you have or pushes Suspicion past 90, and nothing comes in while you're away. On a phone the card drops in under the numbers strip (at your computer it sits at the bottom); each call and your answer also go into that person's Messenger conversation. About 20 calls, only from people you've hired.

**The office.** **Bailey**, your beagle, sleeps in her bed beside your chair. She learns **tricks** from ear scratches (one scratch counts every few seconds, so tapping away doesn't rush her): **Fetch** at 5 (she brings you stray bands, +0.3 a second), **Guard** at 20 (a second more warning), **Play Dead** at 50 (when you're caught, Mr. Feeney only takes half the bands) and **Howl** at 100 (when he's coming, tap her and he turns around to check on her; once every 5 minutes). Hover over her to see what she knows. Tap her to scratch her ears (it calms you down a little), and listen for her: she howls a second before you'd hear Mr. Feeney's shoes. Every few minutes an **office moment** pops up for 15 seconds, and you grab it with a tap: pizza in the break room (everyone works faster), a stray rubber band ball, a stuck vending machine, spot bonuses, fresh coffee, Bailey finding something, and once Adam and Danielle work for you, Muffins knocking a stapler off a rival's desk or Joey keeping Mr. Feeney busy with a tennis ball. Moments are only ever good; missing one costs nothing. And every work day (eight minutes) Mr. Feeney leaves a **sticky note** on your desktop with three small goals; each one done adds Performance and a little cash.

**Your rubber band ball.** A few minutes into the war you knot some spare bands together, and the ball sits on your desk across the Flick key from Bailey. Tap it to wind on a quarter of your loose bands. It grows through four sizes, and each one is a perk for good: a **Golf ball** (250 bands: Suspicion cools 25% faster, because you squeeze it instead of flicking), a **Softball** (2,500: Barrages throw twice as many bands), a **Basketball** (25,000: your team works 20% faster, people come by to look at it) and **The Monster** (150,000: everything you earn +25%; it ate a stapler). Bands wound on are gone for good, so it's a choice between ammo now and perks forever, and once the war is over it's what all those bands are for. The **Barrage** (V) is the other way to spend a stockpile: from Stage 2 on, you and every Shooter empty your pockets at once, 100 bands each, every band hitting like a quick flick, in one huge volley. It's loud (about 10 Suspicion plus a little per band) and your team needs 90 seconds to reload. Bands you collect while you're away are worth coming back for either way.

**Stage 3: the Department War.** Beating Rick gets you the east side of the floor; the rest of it doesn't recognize this. Four departments are left, each run by a boss behind a barricade of their department's junk. Pick who to fight on the **map** (Map in the bottom bar on a phone, The 4th floor in the top bar, the nameplate, or M), and switch whenever you like: each department keeps the damage you've done. Each one you take is yours for good, and puts the others on alert (40% more Resolve):

- **IT** (Derek Voss, behind a wall of old computers): a **firewall** goes up for 10 seconds out of every 45 and stops half of every shot, though a Barrage goes straight through. Take it for the **Drill-Powered Gatling** (six bands a spin, $15,000 from Dale, Dave builds it) and a script that orders your bands when you run low and opens the box for you.
- **Accounting** (Doris Kemper, behind a fortress of ledgers): quick taps only hit for half, so stretch your shots. Take it for 25% more pay on everything you and your team do at work. They surrender under protest.
- **The Mailroom** (Big Tony, on top of the band pile): Tony fires back every 20 seconds, a fistful of free bands landing on your desk with a thud (and some noise). Take it for 10 more bands a second.
- **Marketing** (Skyler Brandt, behind the ring light): the first time she drops below half, she **rebrands** and gets a quarter of her Resolve back. Take it and hiring costs 30% less.

Meanwhile Dale's **supply closet** is contested ground: it pays you 3 bands a second while it's yours, and every few minutes a department you haven't taken sneaks in to raid it. A boss leans in with a clock: tap **Chase them off** and they drop what they grabbed. Let it run out and your Lookouts may still catch them; if not, the closet is theirs for 2 minutes and the bands go back to their department. Each department's surrender pays a bounty (at least ten minutes of your team's pay), Performance and desks. A careful player takes all four in about an hour.

**Stage 4: Floor Domination.** The departments surrendered, but their people fell back to the floor's last two shared spaces, each behind a wall of filing cabinets with a bar of its own. The wall comes down first, then the boss. Normal shots do half to a wall; the Drill Gatling, Barrages and your Engineers (who take it apart on their own) hit it fully. A wall stays down if you switch away. Each room has a trick you can **sabotage** from the map, for a few minutes of your team's pay:

- **The Break Room** (Gail Petroski, Payroll Supervisor and president of the Coffee Club): every 30 seconds they top up 1.5% of their Resolve with fresh coffee. *Unplug their coffee machine* and there's none for 3 minutes. Take it and your Shooters fire 25% faster and your own shots hit 25% harder.
- **The Conference Room** (Victoria Lang, VP of Operations): every 45 seconds she pulls your Shooters into a 10-second meeting (they fade out of the office and stop firing). *Start a reply-all storm* and there are no meetings for 3 minutes. Take it and your whole team works 25% faster.

Meanwhile the departments you took try to take their desks back, every 3 to 5 minutes. A new role, the **Guard**, stops about 30% of attempts each (up to 90%); the rest pop up with a 20-second clock and a **Hold the line** button that keeps your desks and picks up the bands they drop. One that gets through switches that department's prize (and its desks' bands) off for 3 minutes. Nothing attacks while you're away. Take both rooms and the whole floor is yours, and your Guards go back to their old jobs. A careful player who sabotages takes about 50 minutes; one who never sabotages, about 70.

**Stage 5: Corporate Politics.** Now that the whole floor answers to you, HR opens an investigation. Leonard Fisk, Director of Human Resources, fights from behind a fortress of binders, and shots at him are twice as loud.

- **Plausible Deniability** is earned by real work: rounds you finish (A +2, B +1), Cover teammates and your hired teams (half a point a minute each). Spend it in **Memos**, a new app on your computer: *Mandatory Team-Building Exercise* (your shots and Barrages are silent for 2 minutes), *Open-Plan Office Initiative* (shots hit 50% harder and are 50% louder for 3 minutes), *Synergy Offsite* (your team works twice as fast for 3 minutes), *Casual Friday* (hiring and training half price for 5 minutes) and *Document Retention Policy* (shreds a quarter of HR's case file). Each has a cooldown.
- **HR's case file** fills when you get caught (a quarter of it), when you shoot at HR (some of the noise), and when you miss an interview. If it fills, HR takes one of your departments: its prize and desks are gone until you win it back on the map, and the file drops to half.
- **HR interviews** replace counterattacks: every 3 to 5 minutes someone you beat is called in, with a 20-second clock. Tap **Coach them** and they remember nothing.
- **Close the case either way:** flick Fisk's Resolve to nothing, or win HR over (every memo you send counts toward goodwill; at 300 the case closes). Then the whole floor is yours for good and the rematches carry on. A careful player takes about 47 minutes either way; one who never sends a memo, a couple of hours.

**Rematches.** Nobody in this office can let things go. Your old rivals wait on the map: Gary first, then Brad, the Printer Corner, the Task Force and Rick, at half their old Resolve in round 1 and about a third tougher every round after that. Once the four departments are yours their bosses join the rotation too. Each win pays a bounty (the old one, growing every round and with your pay grade, or a few minutes of your team's pay if that's more) and some Performance toward your next promotion, so the war keeps feeding your career. The Barrage and the ball's perks work in rematches too.

Getting caught (Suspicion reaches 100) puts a write-up in your HR file, sends your equipped weapon to Mr. Feeney's drawer for 3 minutes (Dale can get it back for half its price), and lets your target regroup. A write-up fades after 10 minutes without getting caught. Three write-ups is Final Warning; get caught again and you're fired: you lose your bands and this stage's progress (in the Department War, just the department you were fighting), keep your weapons, upgrades and team, and HR rehires you on Monday with a clean file.

Coworkers are promoted to Senior and then Lead the longer they're on your team, which makes them better at their role.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Simulation tests plus scripted bots that play the whole slice |
| `npm run build` | Production build in `dist/` |
| `npm run build:single` | Everything in one `dist-single/index.html`, easy to share |

## How the code is organized

| Path | What lives there |
| --- | --- |
| `src/sim/content.ts` | All tunable content: weapons, targets, coworkers, requisitions, emails, numbers |
| `src/sim/state.ts` | The game state and a fresh game |
| `src/sim/engine.ts` | The simulation step and every player action, including Dale's deals |
| `src/sim/mods.ts` | Values derived from upgrades and allies |
| `src/sim/save.ts` | Saving, loading, migration, export and import |
| `src/sim/work.ts` | Your job as graded rounds: mail, calls, expense reports and spreadsheets, pay grades and the combo |
| `src/sim/career.ts` | Performance, reviews with Mr. Feeney and promotions |
| `src/sim/staff.ts` | The teams you hire: seats, headcount budgets, training, their pay (also offline), following your lead, names |
| `src/sim/office.ts` | Bailey (petting, her early warning) and office moments |
| `src/sim/goals.ts` | The day's three goals on Mr. Feeney's sticky note |
| `src/sim/rematch.ts` | Rematches after the war: who's next, how tough, what they pay |
| `src/sim/asks.ts` | Your team leads' calls: the calls, what each choice does, timing and the safe choice on a timeout |
| `src/sim/war.ts` | Stages 3 and 4: picking who to fight, the bosses' tricks, their perks, raids on the supply closet, taking the rooms |
| `src/sim/siege.ts` | Stage 4, Floor Domination: the filing-cabinet walls, coffee and meetings, sabotage, counterattacks and Guards |
| `src/sim/politics.ts` | Stage 5, Corporate Politics: Plausible Deniability, memos, HR's case file, interviews, winning departments back, closing the case |
| `src/sim/ball.ts` | Your rubber band ball: winding bands on, its four sizes and their perks (the Barrage is in the engine) |
| `src/ui/ball.ts` | The ball on your desk (in the view) and the Barrage key beside the Flick key |
| `src/ui/floor.ts` | Your floor: your team at their desks, their work popping up, and the card to hire, train or rename them |
| `src/ui/asks.ts` | The card for a team lead's call |
| `src/ui/war.ts` | The map of the 4th floor (department cards, the closet, the Stage 4 rooms and sabotage, your departments, HR and anything HR took, rematches), and the raid, counterattack and interview alerts |
| `src/ui/apps/memos.ts` | The Memos app (Stage 5): your Deniability, HR's goodwill and case file, and the memos you can send |
| `src/ui/office.ts` | Bailey on screen, the moment card and the goals note |
| `src/sim/workdata.ts` | The words for your job: emails, callers, receipts, expense rules, the phone directory |
| `src/sim/shop.ts` | What's for sale, the shopping list and the affordable-count badges |
| `src/sim/chat.ts` | Messenger: a conversation per person, typing delays, quick replies, the buddy list |
| `src/sim/supplies.ts` | Your desk drawer, supply orders and deliveries |
| `src/ui/scene.ts` | The office across the aisle: people, cover, flying bands, Mr. Feeney, clock and light |
| `src/ui/portraits.ts` | Places the painted coworker portraits in the scene and swaps their expressions |
| `src/ui/characters.ts` | Each coworker's lines and resting face (plus the old drawn fallback) |
| `src/ui/computer.ts` | Your computer: the desk, monitor, desktop, Start menu, windows, taskbar, notifications, screensaver and Mr. Feeney's reflection |
| `src/ui/apps/` | The computer's apps: Mail, Phone, Expenses, Spreadsheet, Messenger, Staffing, My Documents and the Catalog |
| `src/ui/supplies.ts` | The drawer (your hand picking bands out of the junk), the order paperwork and the delivery box |
| `src/ui/closet.ts` | The supply closet, the only shop: Dale, his pegboard of weapons, band upgrades, the Procurement clipboard, Lost and Found, and his "Psst" deals |
| `src/ui/goods-art.ts` | Pictures of everything for sale, shared by the closet, shopping list and weapon rack |
| `src/ui/juice.ts` | Money you can see: coins and cash flying into your Salary, and the bounty floater |
| `src/ui/launcher.ts` | Your hand and weapon: aiming, hold to stretch, Perfect release, snapping |
| `src/ui/art.ts` | Sprite sizes and anchor points (generated by `tools/prepare-art.py`) |
| `art/source/` | Full-size original art (hands, weapons, bands), generated with Astra |
| `src/ui/sound.ts` | Sound effects synthesized in code |
| `src/ui/` (other) | The desk layout, panels, dialogs and input |
| `public/` | The home screen bits: the app manifest, icons (made by `tools/make-icons.py`) and the offline service worker |
| `tests/` | Unit tests, the pacing bots, and the career pacing test (hours to CEO) |

The simulation never touches the page, so tests can play the whole game in about a second. Balancing mostly means editing numbers in `content.ts` and running `npm test`, which prints how long each bot took per stage and how often it got caught.

## Art

Everything you look at is painted: the oak desk and green desk mat, the hands, weapons and rubber bands, the desk drawer and office junk, the delivery boxes, Dale and his supply closet with all his goods, coins and cash, every coworker (a head-and-shoulders portrait per facial expression: idle, hit, angry, worried and so on), you in four outfits as you're promoted, your friends Adam and Danielle, the office pets (Bailey in five poses and her bed, Joey, Muffins), your ID badge, and your work computer: the beige CRT bezel and badge, keyboard, mouse and desk phone, four wallpapers, the app icons, the flying-stapler screensaver, receipts, the rubber stamp and the red grade ring. The people you hire have portraits of their own, your rubber band ball comes in four sizes, the department bosses fight from behind painted barricades, and Mr. Feeney leaning in to peer at your screen is prepared for what comes next. The full-size originals live in `art/source/` (each weapon comes as a loaded and an empty version on a shared canvas, with the wrist at the same spot; the script snaps the ruler in half and draws every weapon at the same scale so your hand never changes size). `python3 tools/prepare-art.py` (needs Pillow) crops them, extends the shirt sleeves, scales them to what the game draws and writes WebP sprites to `src/assets/art/` plus their anchor points to `src/ui/art.ts` (and the portraits and closet art to `src/ui/portrait-art.ts`). Re-run it after replacing any source image. The Department War's art is batch 8: the four bosses (four faces each), their barricades (painted at the portraits' scale and placed so the low middle sits just under the boss's chin, with the bottom behind the cubicle wall) and the white flag on a ruler that goes up when a department surrenders. Floor Domination's art is batch 9: Gail and Victoria (four faces each), their filing-cabinet walls (standing and broken on one canvas with matching end towers, so the broken one swaps in on the same spot when the wall comes down, the standing middle lined up with the boss's nose) and the two sabotage icons. Corporate Politics' art is batch 10: Leonard Fisk (four faces), his fortress of binders (in the barricade format) and the Memos app icon.

## Design

The full design and development map lives in the FLICK design doc (Claude Docs). Stages 3–7, replay runs and the Steam build are planned there.
