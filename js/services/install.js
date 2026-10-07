// Decides how "Install as app" can be offered in the current browser.
// Pure, so the browser-sniffing rules are unit-tested.
//
//   installed   already running as an installed app: offer nothing
//   prompt      Chromium fired `beforeinstallprompt`: show an Install button
//   ios         iPhone/iPad (any browser): Share → Add to Home Screen
//   mac-safari  Safari 17+ on macOS: File → Add to Dock
//   menu        Chromium without a prompt (yet): use the browser menu
//   unsupported e.g. Firefox desktop: explain that it can't install

/**
 * @param {{ standalone: boolean, hasPrompt: boolean, userAgent: string, maxTouchPoints?: number }} env
 */
export function installMode({ standalone, hasPrompt, userAgent, maxTouchPoints = 0 }) {
  if (standalone) return 'installed';
  if (hasPrompt) return 'prompt';
  const ua = userAgent || '';
  // iPadOS reports a Mac user agent; touch points give it away.
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (iOS) return 'ios';
  const chromium = /(Chrome|Chromium|Edg|OPR|SamsungBrowser)\//.test(ua);
  const firefox = /Firefox\//.test(ua);
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !chromium && !firefox) return 'mac-safari';
  if (chromium) return 'menu';
  return 'unsupported';
}

/** One-line instruction shown in the CITIES panel for each mode. */
export const INSTALL_HINTS = Object.freeze({
  prompt: 'Opens full-screen from your home screen, dock or app list, and keeps working offline.',
  ios: 'Tap the Share button, then “Add to Home Screen”. It opens full-screen with no browser bars.',
  'mac-safari': 'In Safari, choose File → Add to Dock. It opens in its own window.',
  menu: 'Use “Install app” (or “Add to Home screen”) in your browser’s menu.',
  unsupported: 'This browser can’t install web apps. Try Chrome, Edge or Safari.',
});

/** True when the page is running as an installed app. */
export function isStandalone(win = globalThis) {
  const mq = (q) => win.matchMedia?.(q).matches ?? false;
  return mq('(display-mode: fullscreen)') || mq('(display-mode: standalone)')
    || win.navigator?.standalone === true;
}
