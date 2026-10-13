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
| 1–4 | Switch between the weapons you own (or click the weapon name under Flick) |
| 1–9 | On your computer: pick an email reply, dial an extension |

The game has two modes. At war you flick at your coworkers while Suspicion climbs. Press Esc and you're at your work computer, a retro desktop where Mr. Feeney can't catch you, Suspicion cools, and your Shooters keep firing at half speed. Its apps:

- **Mail:** story messages, plus work emails to answer (pick the right reply; never Reply All).
- **Phone:** the desk phone rings every minute or two, even at war. Answering puts you at your computer; dial the right extension to transfer the caller. Ignoring it costs nothing.
- **Spreadsheet:** fix cells with red corners before their fuse runs out. Fixes in a row build a streak, and one right as Mr. Feeney walks past pays double. The Budget and Headcount tabs unlock as you progress.
- **Expenses:** approve or deny receipts. Your own rubber band order sometimes turns up: approve it for free bands, if you don't mind Accounting noticing.
- **Messenger:** coworkers and rivals message you.
- **Procurement, Supply Catalog, Org Chart:** requisitions, band orders, and your team (recruiting, roles, promotions, and the floor plan).

Bands come from three places besides Gary. **Your desk drawer** (S) slides open full of junk and a few stray bands; your hand picks them out one at a time, and a few more turn up every few seconds. Sometimes there's something better in there: a tangle of bands, a rubber band ball, or loose change. **Supply orders** (O) get stamped and sent off in an inter-office envelope; 10 seconds later a box lands on your desk, and you open it (O again) for the bands. Don't leave it sitting there: Mr. Feeney asks about unopened boxes.

**Dale from Facilities** runs the office black market out of the supply closet (D). He sells every rubber band gun and the band upgrades Procurement would never approve (Rummage Deeper, Waxed Bands, Silent Flick Technique, Shooter Training, Double-Thick Bands, the Supply Closet Key, Fake Calendar Invites), and he can get a confiscated weapon back out of Mr. Feeney's drawer. Every few minutes he leans over your cubicle wall ("Psst") with a deal for 30 seconds: at most 15% off, or something before it unlocks at a markup. The closet closes, and Dale vanishes, the moment Mr. Feeney's footsteps start. Office upgrades (the chair, Auto-Reply, the Monitor Riser and so on) still come from Procurement on your computer.

Work pays Salary and cools Suspicion, with a bonus for quick answers; the longer you stay at your computer, the less each task pays. Nothing piles up or goes overdue.

Getting caught (Suspicion reaches 100) puts a write-up in your HR file, sends your equipped weapon to Mr. Feeney's drawer for 3 minutes (Dale can get it back for half its price), and lets your target regroup. A write-up fades after 10 minutes without getting caught. Three write-ups is Final Warning; get caught again and you're fired: you lose your bands and this stage's progress, keep your weapons, requisitions and team, and HR rehires you on Monday with a clean file.

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
| `src/sim/minigame.ts` | The Spreadsheet app's mini-game: flags, streaks, fatigue, tabs |
| `src/sim/work.ts` | Your job: work emails, phone calls and expense reports, and their content |
| `src/sim/chat.ts` | Messenger lines: reactions to events, banter and tips |
| `src/sim/supplies.ts` | Your desk drawer, supply orders and deliveries |
| `src/ui/scene.ts` | The office across the aisle: people, cover, flying bands, Mr. Feeney, clock and light |
| `src/ui/portraits.ts` | Places the painted coworker portraits in the scene and swaps their expressions |
| `src/ui/characters.ts` | Each coworker's lines and resting face (plus the old drawn fallback) |
| `src/ui/sheet.ts` | The spreadsheet view: column-aware numbers, formulas and totals |
| `src/ui/computer.ts` | Your computer: the desktop, windows, and the Mail, Phone, Expenses, Messenger and Catalog apps |
| `src/ui/supplies.ts` | The drawer (your hand picking bands out of the junk), the order paperwork and the delivery box |
| `src/ui/closet.ts` | The supply closet: Dale, his pegboard of weapons, band upgrades, Lost and Found, and his "Psst" deals |
| `src/ui/launcher.ts` | Your hand and weapon: aiming, hold to stretch, Perfect release, snapping |
| `src/ui/art.ts` | Sprite sizes and anchor points (generated by `tools/prepare-art.py`) |
| `art/source/` | Full-size original art (hands, weapons, bands), generated with Astra |
| `src/ui/sound.ts` | Sound effects synthesized in code |
| `src/ui/` (other) | The desk layout, panels, dialogs and input |
| `tests/` | Unit tests and the pacing bots |

The simulation never touches the page, so tests can play the whole game in about a second. Balancing mostly means editing numbers in `content.ts` and running `npm test`, which prints how long each bot took per stage and how often it got caught.

## Art

Everything you look at is painted: the hands, weapons and rubber bands, the desk drawer and office junk, the delivery boxes, Dale and his supply closet, and every coworker (a head-and-shoulders portrait per facial expression: idle, hit, angry, worried and so on). The full-size originals live in `art/source/` (each weapon comes as a loaded and an empty version on a shared canvas, with the wrist at the same spot; the script snaps the ruler in half and draws every weapon at the same scale so your hand never changes size). `python3 tools/prepare-art.py` (needs Pillow) crops them, extends the shirt sleeves, scales them to what the game draws and writes WebP sprites to `src/assets/art/` plus their anchor points to `src/ui/art.ts` (and the portraits and closet art to `src/ui/portrait-art.ts`). Re-run it after replacing any source image. The Drill-Powered Gatling is already prepared for Stage 3.

## Design

The full design and development map lives in the FLICK design doc (Claude Docs). Stages 3–7, replay runs and the Steam build are planned there.
