// Entry point: wires the city store, clock, URL parameters, settings
// panel and the three.js scene together.
//
// Timing model (no polling loop):
// - A self-rescheduling timeout fires on every wall-clock half-second
//   boundary to flip the colon. That same tick checks whether the
//   minute changed and, only then, recomputes the three readouts.
// - The scene renders on demand, so an idle clock costs two frames/s.

import { CityStore } from './services/cityStore.js';
import { ClockModel, isColonLit } from './services/clock.js';
import { parseLaunchArgs } from './services/launchArgs.js';
import { cityWithId } from './models/cityCatalog.js';
import { SettingsPanel } from './ui/settingsPanel.js';
import { attachTilt } from './ui/tilt.js';
import { LABEL_FONT_FAMILY } from './scene/textures.js';

async function fontsReady() {
  // Plates are painted into canvases, so the web font must be loaded
  // first. Give up after 2s and use the fallback stack.
  if (!document.fonts?.load) return;
  const family = LABEL_FONT_FAMILY.split(',')[0];
  await Promise.race([
    Promise.all([document.fonts.load(`800 16px ${family}`), document.fonts.load(`600 16px ${family}`)]),
    new Promise((r) => setTimeout(r, 2000)),
  ]).catch(() => {});
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

/** Adds body.idle after a few seconds without pointer or key activity. */
function trackIdle() {
  let timer = null;
  const wake = () => {
    document.body.classList.remove('idle');
    clearTimeout(timer);
    timer = setTimeout(() => document.body.classList.add('idle'), 2500);
  };
  for (const ev of ['pointermove', 'pointerdown', 'keydown']) window.addEventListener(ev, wake, { passive: true });
  wake();
}

async function main() {
  const args = parseLaunchArgs(location.search);
  const store = new CityStore();

  // URL overrides are applied after persistence loads, so they win.
  if (args.cityIds) {
    const cities = args.cityIds.map(cityWithId).filter(Boolean);
    if (cities.length) store.replace(cities);
  }

  const clock = new ClockModel({ frozenDate: args.frozenDate });
  const panel = new SettingsPanel(document.getElementById('settings'), store, () => clock.now);

  const openButton = document.getElementById('open-settings');
  openButton.addEventListener('click', () => panel.open());
  window.addEventListener('keydown', (e) => {
    if (panel.isOpen || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ',' || e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      panel.open();
    }
  });

  if (!webglAvailable()) {
    document.body.classList.add('no-webgl');
    if (args.openSettings) panel.open();
    return;
  }

  await fontsReady();
  const { TimeCircuitsScene } = await import('./scene/timeCircuitsScene.js');

  const root = document.documentElement;
  const scene = new TimeCircuitsScene(document.getElementById('clock'), {
    onLayout: ({ clockHeightPx }) => {
      root.style.setProperty('--clock-height', `${clockHeightPx}px`);
      // Button below the clock if there's room, else in the corner.
      document.body.classList.toggle('corner-btn', (window.innerHeight - clockHeightPx) / 2 < 84);
    },
  });
  trackIdle();
  window.timeCircuits = { scene, store, clock }; // handy from devtools

  let minuteKey = null;
  const refreshReadouts = (force = false) => {
    const now = clock.now;
    const key = Math.floor(now.getTime() / 60_000);
    if (!force && key === minuteKey) return;
    minuteKey = key;
    scene.setReadouts(clock.readouts(store.selected, now));
    if (panel.isOpen) panel.render();
  };

  scene.setCities(store.selected);
  refreshReadouts(true);
  store.subscribe((cities) => {
    scene.setCities(cities);
    refreshReadouts(true);
  });

  // Half-second tick, phase-locked to the wall clock.
  const tick = () => {
    const ms = Date.now();
    scene.setColonLit(isColonLit(ms));
    refreshReadouts();
    setTimeout(tick, 500 - (ms % 500) + 2);
  };
  tick();

  // Background tabs throttle timers; catch up immediately on return.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshReadouts(true);
  });

  attachTilt(scene, { enabled: !args.noTilt });
  document.body.classList.add('ready');
  if (args.openSettings) panel.open();
}

main().catch((err) => {
  console.error(err);
  document.body.classList.add('no-webgl');
});
