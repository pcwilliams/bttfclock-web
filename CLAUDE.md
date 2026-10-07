# bttfclock-web: Claude Code Project Reference

The web version of [bttfclock](https://github.com/pcwilliams/bttfclock).
It shows the time in three configurable world cities on a recreation of the
Back to the Future DeLorean **Time Circuits**, rendered as a subtle 3D scene
with three.js. Each row has red, green or amber LED segments, grey-on-red
caption plates, AM/PM lamps and a colon that ticks in step with wall-clock
seconds. The panel tilts gently towards the mouse, or follows the phone's
gyro.

The visual design, segment maths, colours, catalog and behaviour are ported
1:1 from the Swift app. When the two disagree, the Swift app is the
reference.

## Owner

- **Developer:** pwilliams (GitHub: pcwilliams)
- **Repo:** `pcwilliams/bttfclock-web` (public)
- **Hosting:** GitHub Pages via GitHub Actions →
  `https://pcwilliams.github.io/bttfclock-web/`

## Tech stack

- **No build step.** Plain ES modules plus an import map in `index.html`.
- **three.js r186** (`0.186.1`) from `cdn.jsdelivr.net`. Uses the core
  plus these addons: `EffectComposer`, `RenderPass`, `UnrealBloomPass`,
  `OutputPass` and `RoomEnvironment`.
- **Lexend Exa** (Google Fonts) stands in for SF Pro Expanded Heavy on
  the plates and in the UI.
- **Persistence:** `localStorage`, key `bttfclock.selectedCityIds.v1`.
  This is the same key and the same id list as the app's UserDefaults.
- **Tests:** Node's built-in runner (`node --test`), 53 tests, zero
  dependencies.
- **Zero npm dependencies.** `package.json` exists only for `"type":
  "module"` and the `npm test` alias.

## Run locally

ES modules don't load over `file://`, so serve the folder:

```bash
python3 -m http.server 8000      # or: npx serve .
open http://localhost:8000/
```

Run the tests:

```bash
node --test          # or: npm test
```

The tests need Node 20+ with full ICU (the default build) so that
`Intl.DateTimeFormat` knows every IANA zone.

## URL parameters (the web's launch arguments)

URL parameters are applied after `localStorage` loads, so they win, the
same way the app's launch args do.

| Param         | Example                              | Effect |
|---------------|--------------------------------------|--------|
| `frozendate`  | `?frozendate=1985-10-26T01:21:00-07:00` | Pins the clock at that instant. The colon keeps ticking. An offset or `Z` is **required**. |
| `cities`      | `?cities=london,tokyo,sydney`        | Replaces the selection (and persists it, like the app). Unknown ids are dropped. |
| `settings`    | `?settings`                          | Opens the CITIES panel on load. |
| `notilt`      | `?notilt`                            | Disables the parallax tilt. |

**Gotcha:** `URLSearchParams` decodes `+` as a space, so an unencoded
`+01:00` arrives as ` 01:00`. `parseFrozenDate` puts the `+` back.

Keyboard: `,` or `C` opens the CITIES panel. `Esc` closes it.
`⌘,` isn't used because browsers reserve it.

## Project structure

```
bttfclock-web/
├── index.html                 # import map, fonts, canvas, CITIES button, <dialog>
├── favicon.svg
├── package.json               # "type": "module", "test": "node --test"
├── css/style.css              # page chrome + settings dialog (dark tokens)
├── js/
│   ├── main.js                # bootstrap: store, clock, URL params, ticks, scene
│   ├── models/                # pure: no DOM, no three.js (all unit-tested)
│   │   ├── cityCatalog.js     # 40 cities + DEFAULT_SELECTION (NY, London, HK)
│   │   ├── rowColor.js        # red/green/amber tints (same sRGB as the app)
│   │   ├── palette.js         # caption red, chrome grey, city-plate black
│   │   ├── timeReadout.js     # Date × IANA zone → MMM DD YYYY hh mm AM/PM
│   │   ├── segmentMaps.js     # char → 7-seg / 14-seg bitmask tables
│   │   ├── segmentGeometry.js # beveled-hexagon segment polygons (port of SegmentShapes.swift)
│   │   └── layout.js          # row + enclosure layout in natural points
│   ├── services/
│   │   ├── cityStore.js       # 3-city cap, injected Storage, subscribe()
│   │   ├── clock.js           # ClockModel (frozen/live) + isColonLit step fn
│   │   └── launchArgs.js      # URL parameter parsing
│   ├── scene/
│   │   ├── timeCircuitsScene.js  # three.js model, bloom, camera fit, tilt, on-demand render
│   │   └── textures.js           # canvas textures: brushed metal, gel, label plates
│   └── ui/
│       ├── settingsPanel.js   # <dialog>: reorder / remove / add / search / reset
│       └── tilt.js            # pointer + DeviceOrientation → scene tilt target
├── tests/                     # node:test, *.test.js (auto-discovered)
├── docs/                      # screenshots used by README / HTML docs / og:image
├── .github/workflows/pages.yml   # test, then deploy to Pages on main
├── README.md
├── architecture.html          # Mermaid diagrams + rendering notes
└── tutorial.html              # build narrative
```

## Architecture

The web version keeps the app's MVVM-ish split:

- **Models** (`js/models/`) are pure functions and data with no DOM and no
  three.js. That's what lets Node test them directly.
- **Services** hold state: `CityStore` is the app's `CityStore`, and
  `ClockModel` is the app's `ClockViewModel`.
- **Scene** is the "view". `TimeCircuitsScene` exposes `setCities`,
  `setReadouts`, `setColonLit`, `setTiltTarget`, `resize` and `renderNow`.
- **UI** is the DOM chrome (settings dialog, tilt input).

`main.js` wires them together, and the scene is dynamically `import()`ed
after the font loads.

### Timing model (no polling, no 60 Hz loop)

- One self-rescheduling `setTimeout` fires on each **wall-clock
  half-second boundary** (`500 - ms % 500`). It sets the colon from
  `isColonLit(Date.now())`. It also checks whether the minute key
  (`floor(now / 60000)`) changed, and only then recomputes the three
  `TimeReadout`s.
- `visibilitychange` forces a refresh when the tab returns, because
  background tabs throttle timers.
- The scene **renders on demand**. `requestRender()` coalesces into one
  rAF, and the rAF only re-queues itself while the tilt is still easing.
  A steady clock draws 2 frames per second.
- The colon is phase-locked to wall-clock seconds even when the date is
  frozen. This matches the app's `TimelineView` behaviour.

### Scene construction

World units are the Swift app's natural points: x is right, y is up, z
is towards the viewer, and the enclosure is centred on the origin.
`layout.js` produces y-down rects in points, and the scene flips y once
in `#world()`.

| Element | Geometry | Material |
|---|---|---|
| Enclosure | `ExtrudeGeometry` rounded rect r=14, bevelled, front face at z=0 | `MeshStandardMaterial` + brushed-metal canvas map (dark 4-stop gradient) |
| Row panel | Extruded rounded rect r=5, front at `PANEL_Z` | Same, with the lighter gradient |
| Display gel | Plane per field | `MeshBasicMaterial` + 4×64 gradient (black → windowTint → black, 35% darker) |
| Ghost segments | **One merged `ShapeGeometry` per row** | Basic, `ghost` colour |
| Lit segments | One mesh per character; geometry swapped from a `(kind, mask)` **glyph cache** | Basic, HDR `lit` colour |
| Bezel | Extruded rounded frame with the window as a hole | Black standard |
| Glass | Plane over each window | Black standard, **additive** blending: reflection only, never dims LEDs |
| Plates | Plane + canvas texture (text measured to size, like `.fixedSize()`) | Basic, transparent |
| Lamps, colon, rivets | Flattened hemispheres | Basic HDR (lamps) / metal standard (rivets) |

The glyph cache means a character change costs a pointer swap and no
allocation. Over a whole day only a few dozen glyph geometries exist.

### Selective bloom from one HDR pass

- The `EffectComposer` renders into a **HalfFloat + 4×MSAA** target, so
  colours above 1.0 survive.
- LED materials take the saturated `lit` colour and **normalise it to a
  target luminance** (`LED_LUMINANCE = 2.0`). This makes red glow as
  strongly as green and amber, even though red is dim luminance-wise.
- Everything else (chrome text, panels, specular) stays under the bloom
  `threshold` (0.8), so only LEDs bloom. No layers and no second render.
- `NeutralToneMapping` (applied in the `OutputPass`) desaturates the hot
  core towards white, which gives the app's pale `litCore`. The bloom
  keeps the full row colour, which gives the app's `bloom` shadows. One
  colour produces both looks.
- `UnrealBloomPass` mip weights are overridden to
  `[0.7, 0.4, 0.12, 0.02, 0]`. The stock `[1, .8, .6, .4, .2]` washes
  the whole panel in haze.

### Tilt

The `rig` group rotates and the camera stays put. Max ±0.11 rad (≈6°),
eased at 0.12 per frame.

- **Mouse/pen:** the target follows the pointer relative to the window
  centre, and recentres on leave or blur.
- **Touch devices:** `deviceorientation` measured against a slowly
  drifting baseline, so any holding angle reads as level. It handles
  landscape by swapping beta and gamma. iOS needs
  `DeviceOrientationEvent.requestPermission()`, which runs on the first
  tap on the canvas.
- Tilt is disabled by `prefers-reduced-motion` and by `?notilt`.

### Camera fit

The `PerspectiveCamera` uses a 22° FOV, so it's nearly orthographic but
the tilt still shows depth. The distance fits the enclosure's width and
height with an 8% margin. `onLayout` reports the clock's pixel height to
CSS (`--clock-height`). The CITIES button then sits under the clock when
there's room (phones in portrait). Otherwise it moves to the bottom-right
corner and fades after 2.5 s idle.

## Row colour mapping (slot, not identity)

| Slot | Colour | Default city |
|------|--------|--------------|
| 0 | Red | New York |
| 1 | Green | London |
| 2 | Amber | Hong Kong |

Reordering a city recolours it, the same as in the app.

## Tests (53)

- `segmentMaps.test.js` (9): the 8 app tests plus the A/S/V mask
  regressions.
- `timeReadout.test.js` (9): the 7 app tests plus unknown-zone→UTC
  fallback and London DST.
- `cityStore.test.js` (11): the 9 app tests plus corrupt-storage
  fallback and subscriber notifications.
- `clock.test.js` (8): the app's ClockViewModel (3) and ColonPulse (4)
  tests, plus `msUntilNextMinute`.
- `launchArgs.test.js` (10): the app's 4 LaunchArgs tests, catalog
  integrity (40 unique ids, every zone known to Intl) and URL parsing,
  including the `+`→space gotcha.
- `geometry.test.js` (6): segment polygons, the italic skew invariant,
  row width = Swift's 358.52pt, field ordering, AM/PM clearance, and
  enclosure sizing.

Rule of thumb, as in the app: put decision logic in `js/models` or
`js/services` as pure functions with explicit inputs, and test it there.
The three.js layer stays thin.

### Visual checks (headless)

Chromium with SwiftShader renders the scene well enough for screenshots:

```bash
python3 -m http.server 8123 &
# Playwright: chromium.launch({ args: ['--use-angle=swiftshader',
#   '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
# then goto http://localhost:8123/?frozendate=1985-10-26T01:21:00-07:00
```

`window.timeCircuits = { scene, store, clock }` is exposed for poking
at from devtools or Playwright, for example
`timeCircuits.scene.bloom.strength = 0`.
Headless SwiftShader throttles rAF to about 2 fps, so don't use it to
judge frame rates.

## Deploy

`.github/workflows/pages.yml` runs `node --test` on every push and PR.
On `main` it then assembles `_site/` (static files only) and deploys
with `actions/deploy-pages`.

**One-time repo setup:** go to Settings → Pages → Build and deployment →
Source and choose **GitHub Actions**. The workflow's `GITHUB_TOKEN`
can't turn Pages on by itself.

## Design decisions

- **Subtle 3D, not a free-orbit model.** Seen head-on it reads like the
  app. The depth (raised panels, recessed windows, glass, domed lamps
  and rivets) only shows as you move.
- **Segments are geometry, not a font or a texture.** They're the same
  hexagon polygons as `SegmentShapes.swift`, so they stay crisp at any
  size and the ghost/lit layering is exact.
- **Plates are canvas textures.** Text is measured first and the plate
  is sized to fit, which reproduces SwiftUI's
  `.fixedSize().padding()` behaviour.
- **One HDR render + luminance threshold for selective bloom**, rather
  than layer-masked double rendering. That's half the draw work.
- **On-demand rendering** rather than a rAF loop, for battery life on
  phones, given the display changes twice a second.
- **Colon centred on the digits.** The app's colon sits about 3pt low
  because of its spacer arithmetic, and on the web it's centred like the
  prop. This is the only intentional layout deviation.
- **`<dialog>` for settings.** It gives focus trapping, `Esc`, a backdrop
  and accessibility for free. Up/down buttons replace drag handles
  because they're keyboard- and screen-reader-friendly.
- **`localStorage` probe-and-fallback.** Private modes can throw on
  access, so `defaultStorage()` falls back to an in-memory store and the
  clock never breaks.

## Gotchas

- **ES modules need HTTP.** Opening `index.html` from disk fails with
  CORS errors. Use a static server.
- **`+` in `?frozendate=`** becomes a space (see above).
- **Canvas text needs the web font loaded first.** `main.js` awaits
  `document.fonts.load` (with a 2 s cap) before building any plate
  texture. Otherwise the plates are measured in the fallback font.
- **`UnrealBloomPass` default mip weights** produce a full-screen haze
  (see above).
- **Ghost and lit segments share a plane.** They're separated by 0.05
  units in z, with near/far set relative to the camera distance to avoid
  z-fighting.
- **`Intl.DateTimeFormat` construction is slow.** Formatters are cached
  per zone (`timeReadout.js`, `settingsPanel.js`).
