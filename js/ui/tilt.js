// Parallax tilt: the panel turns gently towards the mouse pointer, or
// follows the phone's attitude via DeviceOrientation. Disabled for
// prefers-reduced-motion and the ?notilt parameter.

const DEG_RANGE = 18; // degrees of device tilt for full deflection

export function attachTilt(scene, { enabled }) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const active = () => enabled && !reduce.matches;

  // Mouse / pen: position relative to the window centre.
  window.addEventListener('pointermove', (e) => {
    if (!active() || e.pointerType === 'touch') return;
    scene.setTiltTarget((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  });
  const recentre = () => scene.setTiltTarget(0, 0);
  document.documentElement.addEventListener('pointerleave', recentre);
  window.addEventListener('blur', recentre);
  reduce.addEventListener('change', recentre);

  // Device orientation, relative to a slowly drifting baseline so any
  // comfortable holding angle reads as "level".
  let base = null;
  const onOrientation = (e) => {
    if (!active() || e.beta == null || e.gamma == null) return;
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    let x = e.gamma;
    let y = e.beta;
    if (angle === 90) [x, y] = [e.beta, -e.gamma];
    else if (angle === -90 || angle === 270) [x, y] = [-e.beta, e.gamma];
    if (!base) base = { x, y };
    base.x += (x - base.x) * 0.01;
    base.y += (y - base.y) * 0.01;
    scene.setTiltTarget((x - base.x) / DEG_RANGE, (y - base.y) / DEG_RANGE);
  };

  const listen = () => window.addEventListener('deviceorientation', onOrientation);
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {
    // iOS Safari: permission must be requested from a user gesture.
    const ask = () => {
      DOE.requestPermission().then((s) => { if (s === 'granted') listen(); }).catch(() => {});
    };
    scene.canvas.addEventListener('pointerup', ask, { once: true });
  } else if (DOE) {
    listen();
  }
}
