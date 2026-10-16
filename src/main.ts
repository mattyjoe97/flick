import '@fontsource/libre-caslon-text/latin-400.css';
import '@fontsource/libre-franklin/latin-400.css';
import '@fontsource/libre-franklin/latin-500.css';
import '@fontsource/libre-franklin/latin-600.css';
import '@fontsource/libre-franklin/latin-700.css';
import '@fontsource/libre-franklin/latin-800.css';
import '@fontsource/kalam/latin-400.css';
import '@fontsource/kalam/latin-700.css';
import './ui/styles.css';
import { TUNING } from './sim/content';
import { applyOffline, step } from './sim/engine';
import { clearStorage, deserialize, exportSave, importSave, loadFromStorage, saveToStorage, serialize } from './sim/save';
import { newGame, type GameState } from './sim/state';
import { WORK } from './sim/work';
import { UI, type GameHost } from './ui/app';

interface HotHook {
  data?: { save?: string };
  ready?: (start: (data: { save?: string }) => void) => void;
  snapshot?: (fn: () => { save: string }) => void;
}
declare global {
  interface Window {
    claude?: { hot?: HotHook };
    flick?: unknown;
  }
}

function boot(hotData: { save?: string }) {
  let state: GameState;
  const fromHot = hotData.save ? deserialize(hotData.save) : null;
  const fromStorage = fromHot ? null : loadFromStorage();
  if (fromHot) state = fromHot.state;
  else if (fromStorage) {
    state = fromStorage.state;
    applyOffline(state, (Date.now() - fromStorage.savedAt) / 1000);
  } else state = newGame();

  let speed = 1;

  const host: GameHost = {
    get state() {
      return state;
    },
    save: () => saveToStorage(state),
    exportText: () => exportSave(state),
    importText(text) {
      const loaded = importSave(text);
      if (!loaded) return false;
      state = loaded.state;
      saveToStorage(state);
      return true;
    },
    reset() {
      clearStorage();
      state = newGame();
      saveToStorage(state);
    },
  };

  const ui = new UI(host);

  // Fixed 100 ms simulation steps, rendered every animation frame.
  let acc = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const real = Math.min(1, (now - last) / 1000);
    last = now;
    acc += real * speed;
    const dt = TUNING.stepSeconds;
    let guard = 0;
    while (acc >= dt && guard++ < 2000) {
      step(state, dt);
      acc -= dt;
    }
    // A bug in drawing should never stop the game: log it and keep the loop going.
    try {
      if (state.events.length) ui.handleEvents(state.events);
      ui.render();
    } catch (err) {
      console.error(err);
    }
    state.events.length = 0;
    // Actions taken between frames also emit events; handle them on the next frame.
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Saving: every 10 s, and whenever the tab is hidden or closed.
  setInterval(() => host.save(), 10_000);
  let hiddenAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      host.save();
    } else if (hiddenAt !== null) {
      // The simulation pauses while hidden; passive income catches up here.
      applyOffline(state, (Date.now() - hiddenAt) / 1000);
      hiddenAt = null;
      last = performance.now();
    }
  });
  window.addEventListener('pagehide', () => host.save());

  // Keep the game running across live updates of the page.
  window.claude?.hot?.snapshot?.(() => ({ save: serialize(state) }));

  // ?debug=1 shows a speed control and exposes the state for testing.
  if (new URLSearchParams(location.search).has('debug') || location.hash === '#debug') {
    const wrap = document.getElementById('speed-wrap')!;
    wrap.hidden = false;
    const sel = document.getElementById('speed') as HTMLSelectElement;
    sel.addEventListener('change', () => (speed = Number(sel.value)));
    window.flick = {
      get state() {
        return state;
      },
      setSpeed: (n: number) => (speed = n),
      ui,
      /** Make work show up now: 'mail' (a burst), 'call' (ring), 'expense' or 'sheet' (ready). */
      work: (kind: 'mail' | 'call' | 'expense' | 'sheet') => {
        const w = state.work;
        if (kind === 'mail') w.mailWaiting = Math.max(w.mailWaiting, 5);
        else if (kind === 'call') w.nextCallAt = state.time;
        else if (kind === 'expense') w.expenseAt = state.time;
        else w.sheetAt = state.time;
        return WORK;
      },
    };
  }
}

/**
 * On the real website (not a preview), FLICK can be added to the home screen: a manifest
 * for the icon and full-screen launch, and a service worker so it opens offline.
 */
function installable() {
  const web = location.protocol === 'https:' || location.hostname === 'localhost';
  let top = true;
  try {
    top = window.self === window.top;
  } catch {
    top = false;
  }
  if (!web || !top) return;
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = './manifest.webmanifest';
  document.head.append(link);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
installable();

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(boot);
else boot(hot?.data ?? {});
