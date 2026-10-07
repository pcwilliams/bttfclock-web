// "Install as app": captures Chromium's beforeinstallprompt, tracks
// whether we're already installed, and registers the offline service
// worker. The UI (header button + CITIES panel section) subscribes.

import { installMode, INSTALL_HINTS, isStandalone } from '../services/install.js';

export class Installer {
  constructor(win = window) {
    this.win = win;
    this.deferred = null;
    this.installed = isStandalone(win);
    this.listeners = new Set();
    win.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // we show our own button instead of the mini-infobar
      this.deferred = e;
      this.#emit();
    });
    win.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.installed = true;
      this.#emit();
    });
  }

  get mode() {
    const nav = this.win.navigator;
    return installMode({
      standalone: this.installed,
      hasPrompt: this.deferred !== null,
      userAgent: nav.userAgent,
      maxTouchPoints: nav.maxTouchPoints,
    });
  }

  get hint() {
    return INSTALL_HINTS[this.mode] ?? '';
  }

  /** Calls `fn(mode)` now and on every change. */
  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.mode);
  }

  /** Shows the browser's install dialog (only in 'prompt' mode). */
  async prompt() {
    const e = this.deferred;
    if (!e) return;
    this.deferred = null; // a prompt event can only be used once
    e.prompt();
    await e.userChoice.catch(() => {});
    this.#emit();
  }

  #emit() {
    for (const fn of this.listeners) fn(this.mode);
  }
}

/**
 * Registers sw.js, then hands it every resource this page loaded so the
 * first visit is enough to work offline. No-op on insecure origins.
 */
export function registerServiceWorker(win = window) {
  const nav = win.navigator;
  if (!('serviceWorker' in nav) || !win.isSecureContext) return;
  nav.serviceWorker.register('sw.js')
    .then(() => nav.serviceWorker.ready)
    .then((reg) => {
      const here = new URL(win.location.href);
      const urls = new Set([
        here.origin + here.pathname,
        new URL('manifest.webmanifest', here).href,
        new URL('favicon.svg', here).href,
        new URL('icons/icon-192.png', here).href,
        new URL('icons/apple-touch-icon.png', here).href,
      ]);
      for (const entry of win.performance.getEntriesByType('resource')) {
        if (/^https?:/.test(entry.name)) urls.add(entry.name);
      }
      reg.active?.postMessage({ type: 'warm', urls: [...urls] });
    })
    .catch(() => {}); // offline support is a bonus, never an error
}
