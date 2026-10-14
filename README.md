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
| 1–4 | Switch between the weapons you own (or click one on the rack under Flick) |
| 1–9 | On your computer: pick an email reply, dial an extension |

The game has two modes. At war you flick at your coworkers while Suspicion climbs. Press Esc and you're at your work computer: a beige CRT on your desk (keyboard, mouse and desk phone in front of it) running a 90s office OS with a Start menu, a taskbar, pop-up notifications and a flying-stapler screensaver. Mr. Feeney can't catch you there, Suspicion cools, and your Shooters keep firing at half speed. When he walks the floor you hear his footsteps get louder and see his reflection grow in the glass; he stops behind you, comments on whatever you have open, and moves on.

Work comes in short rounds with a clock and a grade (A to F). Every item done right pays, cools Suspicion and builds the combo; a clean, quick round earns a grade bonus. A round's clock only runs while you're looking at it.

- **Mail:** work email arrives in bursts. Each one needs one thing: **Reply** (and pick the right reply; never Reply All), **Forward** it to the right department, or **Delete** it. Story email lands in the Inbox; coworkers who want to join your side email you, with a Recruit button right in the message.
- **Phone:** the desk phone rings every minute or two, even at war. Put the caller through using today's directory (it's reshuffled every morning); some want you ("Speaking"), some are pranks (hang up), and sometimes it's Mr. Feeney checking you're at your desk. Ignoring it costs nothing.
- **Spreadsheet:** some cells broke (#REF!, #N/A...). Every row adds up to its Total, so work out what belongs in each broken cell and pick it from three options. The Budget and Headcount sheets unlock as you progress and pay more.
- **Expenses:** stamp each receipt Approved or Denied by today's rule (it changes daily, and gains an exception once you're senior). Your own rubber band order sometimes turns up: approve it for free bands, if you don't mind Accounting noticing.
- **Messenger:** a buddy list with away messages and a conversation with each coworker. Their bubbles on the left, yours on the right, "Gary is typing…", and quick replies when there's something to say back (Dale might find you a deal).
- **Supply Catalog, Org Chart, My Documents, Recycle Bin:** band orders; your team (recruiting, roles, promotions and the floor plan); and a few files to poke at.

Bands come from three places besides Gary. **Your desk drawer** (S) slides open full of junk and a few stray bands; your hand picks them out one at a time, and a few more turn up every few seconds. Sometimes there's something better in there: a tangle of bands, a rubber band ball, or loose change. **Supply orders** (O) get stamped and sent off in an inter-office envelope; 10 seconds later a box lands on your desk, and you open it (O again) for the bands. Don't leave it sitting there: Mr. Feeney asks about unopened boxes.

**Dale from Facilities** runs the office black market out of the supply closet (D), and it's the only shop. Every rubber band gun hangs on his pegboard; the band upgrades Procurement would never approve (Rummage Deeper, Waxed Bands, Silent Flick Technique, Shooter Training, Double-Thick Bands, the Supply Closet Key, Fake Calendar Invites) are on his table; and office upgrades (the chair, Auto-Reply, the Monitor Riser and so on) are on the Procurement clipboard by the door, forms his cousin pre-stamps. He can also get a confiscated weapon back out of Mr. Feeney's drawer. Every few minutes he leans over your cubicle wall ("Psst") with a deal for 30 seconds: at most 15% off, or something before it unlocks at a markup. The closet closes, and Dale vanishes, the moment Mr. Feeney's footsteps start.

You don't have to go looking. The **shopping list** on your desk always shows the next weapon and the cheapest things you could buy, with a bar filling up toward each price; tap one and you're at Dale's with it in your hand (or at the Org Chart, for a coworker). A red number on the closet card says how many things you can afford right now. The guns you own sit on a **rack** under the Flick key, numbered 1–4, with the next one on an empty hook. Click a teammate in the office to change their role on the spot.

**Money.** Work pays Salary and cools Suspicion. Items done one after another build a **combo** (each one inside 15 seconds of the last adds 10% pay, up to ×2); a wrong answer or a long pause ends it. A quick player earns about the same per minute from any of the four jobs. Coins fly into your Salary when you're paid. Beating someone pays their **bounty** (Gary's lunch money, Brad's commission check, the Printer Corner's petty cash, Rick's discretionary fund) and **promotes you**: each promotion is a pay grade, from Junior Associate (×1) to Floor Manager (×4), that multiplies everything work pays. Nothing piles up or goes overdue.

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
| `src/sim/workdata.ts` | The words for your job: emails, callers, receipts, expense rules, the phone directory |
| `src/sim/shop.ts` | What's for sale, the shopping list and the affordable-count badges |
| `src/sim/chat.ts` | Messenger: a conversation per person, typing delays, quick replies, the buddy list |
| `src/sim/supplies.ts` | Your desk drawer, supply orders and deliveries |
| `src/ui/scene.ts` | The office across the aisle: people, cover, flying bands, Mr. Feeney, clock and light |
| `src/ui/portraits.ts` | Places the painted coworker portraits in the scene and swaps their expressions |
| `src/ui/characters.ts` | Each coworker's lines and resting face (plus the old drawn fallback) |
| `src/ui/computer.ts` | Your computer: the desk, monitor, desktop, Start menu, windows, taskbar, notifications, screensaver and Mr. Feeney's reflection |
| `src/ui/apps/` | The computer's apps: Mail, Phone, Expenses, Spreadsheet, Messenger, My Documents and the Catalog |
| `src/ui/supplies.ts` | The drawer (your hand picking bands out of the junk), the order paperwork and the delivery box |
| `src/ui/closet.ts` | The supply closet, the only shop: Dale, his pegboard of weapons, band upgrades, the Procurement clipboard, Lost and Found, and his "Psst" deals |
| `src/ui/goods-art.ts` | Pictures of everything for sale, shared by the closet, shopping list and weapon rack |
| `src/ui/juice.ts` | Money you can see: coins and cash flying into your Salary, and the bounty floater |
| `src/ui/launcher.ts` | Your hand and weapon: aiming, hold to stretch, Perfect release, snapping |
| `src/ui/art.ts` | Sprite sizes and anchor points (generated by `tools/prepare-art.py`) |
| `art/source/` | Full-size original art (hands, weapons, bands), generated with Astra |
| `src/ui/sound.ts` | Sound effects synthesized in code |
| `src/ui/` (other) | The desk layout, panels, dialogs and input |
| `tests/` | Unit tests and the pacing bots |

The simulation never touches the page, so tests can play the whole game in about a second. Balancing mostly means editing numbers in `content.ts` and running `npm test`, which prints how long each bot took per stage and how often it got caught.

## Art

Everything you look at is painted: the oak desk and green desk mat, the hands, weapons and rubber bands, the desk drawer and office junk, the delivery boxes, Dale and his supply closet with all his goods, coins and cash, and every coworker (a head-and-shoulders portrait per facial expression: idle, hit, angry, worried and so on). The full-size originals live in `art/source/` (each weapon comes as a loaded and an empty version on a shared canvas, with the wrist at the same spot; the script snaps the ruler in half and draws every weapon at the same scale so your hand never changes size). `python3 tools/prepare-art.py` (needs Pillow) crops them, extends the shirt sleeves, scales them to what the game draws and writes WebP sprites to `src/assets/art/` plus their anchor points to `src/ui/art.ts` (and the portraits and closet art to `src/ui/portrait-art.ts`). Re-run it after replacing any source image. The Drill-Powered Gatling is already prepared for Stage 3.

## Design

The full design and development map lives in the FLICK design doc (Claude Docs). Stages 3–7, replay runs and the Steam build are planned there.
