# FLICK

An incremental browser game about an office rubber band war. It starts when Gary in the next cubicle flicks a rubber band at you, and ends (eventually) with you running the building.

This repo holds the **first playable slice**: Stage 1 (Desk Skirmish) and Stage 2 (Cubicle Alliance), about 45–75 minutes of play.

## Play it online

Every push to `main` builds the game and publishes it with GitHub Pages (see `.github/workflows/deploy.yml`). One-time setup: in the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**. The game then lives at `https://<your-username>.github.io/flick/`.

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
| 1–4 | Switch between the weapons you own (or click one on the rack under Flick) |
| 1–9 | On your computer: pick an email reply, dial an extension |

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

**Your team.** Some promotions let you hire someone: a Temp (answers email; that's Adam, who brings his cat Muffins), a Receptionist (takes calls; that's Danielle, who brings her golden retriever Joey), a Bookkeeper (stamps receipts), an Analyst (fixes spreadsheets) and an Assistant Manager (makes every other team faster). Each team starts with its lead and grows a seat at a time; your headcount budget goes up by one seat with every promotion, every seat costs more than the last, and training (Lunch-and-learn up to a Six Sigma black belt) makes a whole team half again as productive. They earn 35% of what you would for the same work, all the time, and keep earning while the game is closed (up to 8 hours), and their work adds a little Performance. Keep a work combo going and they **follow your lead**: +10% per link, up to twice as fast. Tap a pencil to rename anyone, yourself included (your badge says Matt Callahan). Playing straight through, CEO takes about 3½ hours; checking in for ten minutes an hour, about 12½.

**The office.** **Bailey**, your beagle, sleeps in her bed by your desk. Tap her to scratch her ears (it calms you down a little), and listen for her: she howls a second before you'd hear Mr. Feeney's shoes. Every few minutes an **office moment** pops up for 15 seconds, and you grab it with a tap: pizza in the break room (everyone works faster), a stray rubber band ball, a stuck vending machine, spot bonuses, fresh coffee, Bailey finding something, and once Adam and Danielle work for you, Muffins knocking a stapler off a rival's desk or Joey keeping Mr. Feeney busy with a tennis ball. Moments are only ever good; missing one costs nothing. And every work day (eight minutes) Mr. Feeney leaves a **sticky note** on your desktop with three small goals; each one done adds Performance and a little cash.

**Your rubber band ball.** A few minutes into the war you knot some spare bands together, and the ball sits on your desk across the Flick key from Bailey. Tap it to wind on a quarter of your loose bands. It grows through four sizes, and each one is a perk for good: a **Golf ball** (250 bands: Suspicion cools 25% faster, because you squeeze it instead of flicking), a **Softball** (2,500: Barrages throw twice as many bands), a **Basketball** (25,000: your team works 20% faster, people come by to look at it) and **The Monster** (150,000: everything you earn +25%; it ate a stapler). Bands wound on are gone for good, so it's a choice between ammo now and perks forever, and once the war is over it's what all those bands are for. The **Barrage** (V) is the other way to spend a stockpile: from Stage 2 on, you and every Shooter empty your pockets at once, 100 bands each, every band hitting like a quick flick, in one huge volley. It's loud (about 10 Suspicion plus a little per band) and your team needs 90 seconds to reload. Bands you collect while you're away are worth coming back for either way.

Getting caught (Suspicion reaches 100) puts a write-up in your HR file, sends your equipped weapon to Mr. Feeney's drawer for 3 minutes (Dale can get it back for half its price), and lets your target regroup. A write-up fades after 10 minutes without getting caught. Three write-ups is Final Warning; get caught again and you're fired: you lose your bands and this stage's progress, keep your weapons, upgrades and team, and HR rehires you on Monday with a clean file.

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
| `src/sim/ball.ts` | Your rubber band ball: winding bands on, its four sizes and their perks (the Barrage is in the engine) |
| `src/ui/ball.ts` | The ball on your desk and the Barrage key under it |
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
| `tests/` | Unit tests, the pacing bots, and the career pacing test (hours to CEO) |

The simulation never touches the page, so tests can play the whole game in about a second. Balancing mostly means editing numbers in `content.ts` and running `npm test`, which prints how long each bot took per stage and how often it got caught.

## Art

Everything you look at is painted: the oak desk and green desk mat, the hands, weapons and rubber bands, the desk drawer and office junk, the delivery boxes, Dale and his supply closet with all his goods, coins and cash, every coworker (a head-and-shoulders portrait per facial expression: idle, hit, angry, worried and so on), you in four outfits as you're promoted, your friends Adam and Danielle, the office pets (Bailey in five poses and her bed, Joey, Muffins), your ID badge, and your work computer: the beige CRT bezel and badge, keyboard, mouse and desk phone, four wallpapers, the app icons, the flying-stapler screensaver, receipts, the rubber stamp and the red grade ring. The people you hire have portraits of their own, your rubber band ball comes in four sizes, and Mr. Feeney leaning in to peer at your screen is prepared for what comes next. The full-size originals live in `art/source/` (each weapon comes as a loaded and an empty version on a shared canvas, with the wrist at the same spot; the script snaps the ruler in half and draws every weapon at the same scale so your hand never changes size). `python3 tools/prepare-art.py` (needs Pillow) crops them, extends the shirt sleeves, scales them to what the game draws and writes WebP sprites to `src/assets/art/` plus their anchor points to `src/ui/art.ts` (and the portraits and closet art to `src/ui/portrait-art.ts`). Re-run it after replacing any source image. The Drill-Powered Gatling is already prepared for Stage 3.

## Design

The full design and development map lives in the FLICK design doc (Claude Docs). Stages 3–7, replay runs and the Steam build are planned there.
