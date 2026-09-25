// Axolotl Guardian — shared namespace + small helpers
window.G = {
  scene: null, camera: null, renderer: null,
  player: null, world: null, enemies: [], pickups: [], boss: null,
  state: null, keys: {}, pad: {}, mouse: { down: false, rdown: false },
  time: 0, paused: false,
};
// merged keyboard + gamepad lookup
G.key = c => G.keys[c] || G.pad[c];

const U = window.U = {
  TAU: Math.PI * 2,

  rand(a, b) { return a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(U.rand(a, b + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  // frame-rate independent exponential smoothing
  damp(a, b, rate, dt) { return U.lerp(a, b, 1 - Math.exp(-rate * dt)); },
  smoothstep(t) { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); },

  angleLerp(a, b, t) {
    let d = (b - a) % U.TAU;
    if (d > Math.PI) d -= U.TAU;
    if (d < -Math.PI) d += U.TAU;
    return a + d * t;
  },
  angleDamp(a, b, rate, dt) { return U.angleLerp(a, b, 1 - Math.exp(-rate * dt)); },

  dist2d(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); },

  // Scratch vectors (never hold across calls that also use them)
  v1: null, v2: null, v3: null,

  // Simple value noise for terrain (deterministic)
  hash(x, z) {
    let h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return h - Math.floor(h);
  },
  vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const a = U.hash(xi, zi), b = U.hash(xi + 1, zi);
    const c = U.hash(xi, zi + 1), d = U.hash(xi + 1, zi + 1);
    const ux = xf * xf * (3 - 2 * xf), uz = zf * zf * (3 - 2 * zf);
    return U.lerp(U.lerp(a, b, ux), U.lerp(c, d, ux), uz);
  },
  fbm(x, z) {
    return U.vnoise(x, z) * 0.6 + U.vnoise(x * 2.7 + 13, z * 2.7 + 7) * 0.28 + U.vnoise(x * 6.1 + 41, z * 6.1 + 23) * 0.12;
  },
};

// Populated after THREE loads (three.min.js is loaded before this file)
U.v1 = new THREE.Vector3();
U.v2 = new THREE.Vector3();
U.v3 = new THREE.Vector3();

// Shared material helper: toon-ish lambert with optional emissive
U.mat = function (color, opts = {}) {
  const m = new THREE.MeshLambertMaterial(Object.assign({ color }, opts));
  return G.gfx ? G.gfx.patch(m) : m;
};
U.emissiveMat = function (color, emissive, intensity = 0.6, opts = {}) {
  const m = new THREE.MeshLambertMaterial(Object.assign({ color, emissive, emissiveIntensity: intensity }, opts));
  return G.gfx ? G.gfx.patch(m) : m;
};
