// Axolotl Guardian — world map: corner minimap + TAB full-map overlay.
// The terrain image is painted once at boot straight from W.heightAt(), so the
// map always matches the world. Secrets (babies, relics, chests) appear once
// you swim near them; gates show open/closed; the next objective pulses.
G.map = (function () {
  const M = {};
  const EXT = 250;              // world half-extent shown
  const BASE = 256;             // terrain sample resolution (upscaled smoothly)
  const MINI_SPAN = 120;        // world units across the minimap
  let base, mini, mctx, big, bctx, screenEl;
  let open = false;
  const discovered = new Set();

  // ---------------- terrain base image ----------------
  function buildBase() {
    base = document.createElement('canvas');
    base.width = base.height = BASE;
    const ctx = base.getContext('2d');
    const img = ctx.createImageData(BASE, BASE);
    const d = img.data;
    const W = G.world;
    for (let py = 0; py < BASE; py++) {
      const z = -EXT + (py / (BASE - 1)) * 2 * EXT;      // top = north = -z
      for (let px = 0; px < BASE; px++) {
        const x = -EXT + (px / (BASE - 1)) * 2 * EXT;
        const h = W.heightAt(x, z);
        let r, g, b;
        if (h < -0.2) {
          // water: shallow turquoise -> deep blue
          const t = Math.min(1, -h / 6);
          r = 0x53 + (0x15 - 0x53) * t;
          g = 0xd6 + (0x6a - 0xd6) * t;
          b = 0xe0 + (0x9e - 0xe0) * t;
        } else {
          // land: sand -> grass
          const t = U.clamp(h / 1.6, 0, 1);
          r = 0xd8 + (0x5f - 0xd8) * t;
          g = 0xc4 + (0xae - 0xc4) * t;
          b = 0x8a + (0x4e - 0x8a) * t;
          const zone = W.zoneAt(x, z);
          if (zone === 'cavern') { r = r * 0.55 + 60; g = g * 0.55 + 55; b = b * 0.55 + 95; }
          if (zone === 'temple') { r = r * 0.6 + 45; g = g * 0.7 + 55; b = b * 0.65 + 50; }
          if (zone === 'ruins') { r = r * 0.75 + 25; g = g * 0.85 + 30; b = b * 0.75 + 25; }
        }
        const i = (py * BASE + px) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // static landmarks: platforms + challenge ring
    const s = BASE / (2 * EXT);
    const mx = wx => (wx + EXT) * s, my = wz => (wz + EXT) * s;
    ctx.fillStyle = '#3f9c50';
    for (const p of G.world.lilyPads) {
      ctx.beginPath();
      ctx.arc(mx(p.x), my(p.z), Math.max(1.4, (p.r || 3) * s), 0, U.TAU);
      ctx.fill();
    }
    ctx.strokeStyle = '#ffb84f';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(mx(88), my(172), 10 * s + 2, 0, U.TAU);
    ctx.stroke();
  }

  // ---------------- dynamic markers ----------------
  function nextObjective() {
    for (const g of G.world.gates) if (!g.open) return { x: g.x, z: g.z };
    if (G.boss && !G.boss.defeated) return { x: 0, z: -200 };
    return null;
  }

  function drawMarkers(ctx, toX, toY, s, full) {
    const t = G.time;
    // gates
    for (const g of G.world.gates) {
      ctx.strokeStyle = g.open ? '#7dffb0' : '#7fe8ff';
      ctx.lineWidth = full ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(toX(g.x - 6), toY(g.z));
      ctx.lineTo(toX(g.x + 6), toY(g.z));
      ctx.stroke();
    }
    // pulsing next-objective halo
    const ob = nextObjective();
    if (ob) {
      ctx.strokeStyle = 'rgba(255,233,138,' + (0.55 + Math.sin(t * 4) * 0.35) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(toX(ob.x), toY(ob.z), (full ? 13 : 11) + Math.sin(t * 4) * 2.5, 0, U.TAU);
      ctx.stroke();
    }
    // discovered, still-uncollected secrets
    ctx.fillStyle = '#ffe98a';
    for (const it of discovered) {
      if (G.pickups.indexOf(it) < 0 || it.rescued || it.opened) continue;
      const p = it.mesh.position;
      ctx.beginPath();
      ctx.arc(toX(p.x), toY(p.z), full ? 4.5 : 3.5, 0, U.TAU);
      ctx.fill();
    }
    // nearby corrupted creatures (minimap only — keeps the big map clean)
    if (!full) {
      ctx.fillStyle = '#d05fff';
      for (const e of G.enemies) {
        if (!e.alive) continue;
        const dx = e.pos.x - G.player.pos.x, dz = e.pos.z - G.player.pos.z;
        if (dx * dx + dz * dz > (MINI_SPAN * 0.55) * (MINI_SPAN * 0.55)) continue;
        ctx.beginPath();
        ctx.arc(toX(e.pos.x), toY(e.pos.z), 2.6, 0, U.TAU);
        ctx.fill();
      }
    }
    if (G.boss && G.boss.alive && !G.boss.defeated) {
      ctx.fillStyle = '#ff5fbe';
      ctx.beginPath();
      ctx.arc(toX(G.boss.pos.x), toY(G.boss.pos.z), full ? 6 : 5, 0, U.TAU);
      ctx.fill();
    }
    // player arrow (north-up map: yaw PI faces north/up)
    const px = toX(G.player.pos.x), py = toY(G.player.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - G.player.yaw);
    ctx.fillStyle = '#ff9fb8';
    ctx.strokeStyle = 'rgba(40,10,20,0.8)';
    ctx.lineWidth = 1.5;
    const a = full ? 9 : 8;
    ctx.beginPath();
    ctx.moveTo(0, -a);
    ctx.lineTo(a * 0.7, a);
    ctx.lineTo(0, a * 0.55);
    ctx.lineTo(-a * 0.7, a);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ---------------- minimap ----------------
  function drawMini() {
    const w = mini.width;                    // 312 backing px, 156 css
    const s = w / MINI_SPAN;
    const cx = G.player.pos.x, cz = G.player.pos.z;
    mctx.clearRect(0, 0, w, w);
    mctx.save();
    mctx.beginPath();
    mctx.arc(w / 2, w / 2, w / 2 - 2, 0, U.TAU);
    mctx.clip();
    const bs = BASE / (2 * EXT);
    const srcW = MINI_SPAN * bs;
    mctx.drawImage(base,
      (cx + EXT) * bs - srcW / 2, (cz + EXT) * bs - srcW / 2, srcW, srcW,
      0, 0, w, w);
    drawMarkers(mctx,
      wx => (wx - cx) * s + w / 2,
      wz => (wz - cz) * s + w / 2,
      s, false);
    mctx.restore();
    // N compass
    mctx.fillStyle = 'rgba(255,255,255,0.85)';
    mctx.font = 'bold 20px "Avenir Next", Verdana, sans-serif';
    mctx.textAlign = 'center';
    mctx.fillText('N', w / 2, 24);
  }

  // ---------------- full map ----------------
  const LABELS = [
    ['Sunlit Marsh', 0, 150], ['Giant Lily Forest', 0, 20],
    ['Moss Ruins', 68, -95], ['Crystal Caverns', -68, -95],
    ['Sunken Temple', 0, -200], ['Challenge Cave', 118, 172],
  ];

  function drawBig() {
    const w = big.width;
    bctx.clearRect(0, 0, w, w);
    bctx.drawImage(base, 0, 0, w, w);
    const s = w / (2 * EXT);
    const toX = wx => (wx + EXT) * s, toY = wz => (wz + EXT) * s;
    drawMarkers(bctx, toX, toY, s, true);
    bctx.font = 'bold 26px "Avenir Next", Verdana, sans-serif';
    bctx.textAlign = 'center';
    for (const [name, x, z] of LABELS) {
      bctx.fillStyle = 'rgba(10,30,40,0.55)';
      const tw = bctx.measureText(name).width;
      bctx.fillRect(toX(x) - tw / 2 - 8, toY(z) - 34, tw + 16, 30);
      bctx.fillStyle = '#f4fbff';
      bctx.fillText(name, toX(x), toY(z) - 12);
    }
    bctx.fillStyle = 'rgba(255,255,255,0.9)';
    bctx.font = 'bold 30px "Avenir Next", Verdana, sans-serif';
    bctx.fillText('N', 30, 40);
  }

  // ---------------- public ----------------
  M.init = function () {
    mini = document.getElementById('minimap');
    mctx = mini.getContext('2d');
    big = document.getElementById('map-canvas');
    bctx = big.getContext('2d');
    screenEl = document.getElementById('map-screen');
    buildBase();
  };

  M.toggle = function () {
    open = !open;
    screenEl.style.display = open ? 'flex' : 'none';
    if (open) { drawBig(); G.audio.play('pearl'); }
  };
  M.close = function () {
    open = false;
    screenEl.style.display = 'none';
  };
  M.isOpen = () => open;

  M.update = function () {
    // reveal secrets you swim close to
    for (const it of G.pickups) {
      if ((it.kind === 'baby' || it.kind === 'relic' || it.kind === 'chest') &&
          !discovered.has(it) &&
          it.mesh.position.distanceTo(G.player.pos) < 30) {
        discovered.add(it);
      }
    }
    drawMini();
    if (open) drawBig();
  };

  return M;
})();
