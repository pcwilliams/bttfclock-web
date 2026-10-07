import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMode, INSTALL_HINTS } from '../js/services/install.js';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:131.0) Gecko/20100101 Firefox/131.0',
};

const mode = (ua, extra = {}) => installMode({ standalone: false, hasPrompt: false, userAgent: ua, ...extra });

test('already installed wins over everything', () => {
  assert.equal(installMode({ standalone: true, hasPrompt: true, userAgent: UA.macChrome }), 'installed');
  assert.equal(installMode({ standalone: true, hasPrompt: false, userAgent: UA.iphoneSafari }), 'installed');
});

test('a captured beforeinstallprompt means a real Install button', () => {
  assert.equal(mode(UA.androidChrome, { hasPrompt: true }), 'prompt');
  assert.equal(mode(UA.winEdge, { hasPrompt: true }), 'prompt');
});

test('iPhone and iPad, in any browser, use Add to Home Screen', () => {
  assert.equal(mode(UA.iphoneSafari), 'ios');
  assert.equal(mode(UA.iphoneChrome), 'ios');
  assert.equal(mode(UA.ipadOS, { maxTouchPoints: 5 }), 'ios');
});

test('Safari on a Mac uses Add to Dock', () => {
  assert.equal(mode(UA.macSafari, { maxTouchPoints: 0 }), 'mac-safari');
});

test('Chromium without a prompt points at the browser menu', () => {
  assert.equal(mode(UA.macChrome), 'menu');
  assert.equal(mode(UA.winEdge), 'menu');
  assert.equal(mode(UA.androidChrome), 'menu');
});

test('Firefox desktop is unsupported, and every mode has a hint', () => {
  assert.equal(mode(UA.macFirefox), 'unsupported');
  assert.equal(mode(''), 'unsupported');
  for (const m of ['prompt', 'ios', 'mac-safari', 'menu', 'unsupported']) assert.ok(INSTALL_HINTS[m], m);
});
