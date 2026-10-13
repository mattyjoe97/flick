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
| F | Flick at the current target |
| S | Scrounge your drawer for bands |
| W | Do work (earns Salary, lowers Suspicion) |
| O | Order supplies |
| Esc or B | Look busy (the Boss Key spreadsheet) |

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
| `src/sim/engine.ts` | The simulation step and every player action |
| `src/sim/mods.ts` | Values derived from upgrades and allies |
| `src/sim/save.ts` | Saving, loading, migration, export and import |
| `src/ui/` | The intranet-style interface, the band animation and the Boss Key spreadsheet |
| `tests/` | Unit tests and the pacing bots |

The simulation never touches the page, so tests can play the whole game in about a second. Balancing mostly means editing numbers in `content.ts` and running `npm test`, which prints how long each bot took per stage and how often it got caught.

## Design

The full design and development map lives in the FLICK design doc (Claude Docs). Stages 3–7, replay runs and the Steam build are planned there.
