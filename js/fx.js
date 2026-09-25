// Axolotl Guardian — particle effects: pooled points, rings, floating text
G.fx = (function () {
  const MAX = 2600;
  let geo, points, positions, colors, sizesAttr;
  const parts = []; // {x,y,z,vx,vy,vz,life,maxLife,r,g,b,size,drag,grav}
  const rings = [];
  let ringGeo, ringMat;

  function init() {
    geo = new THREE.BufferGeometry();
    positions = new Float32Array(MAX * 3);
    colors = new Float32Array(MAX * 3);
    const sizes = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    sizesAttr = geo.attributes.size;

    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size; varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vColor, a);
        }`,
      vertexColors: true,
    });
    points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    G.scene.add(points);

    ringGeo = new THREE.RingGeometry(0.85, 1, 28);
    ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  }

  function spawn(x, y, z, opts) {
    if (parts.length >= MAX) parts.shift();
    parts.push({
      x, y, z,
      vx: opts.vx || 0, vy: opts.vy || 0, vz: opts.vz || 0,
      life: 0, maxLife: opts.life || 1,
      r: opts.r, g: opts.g, b: opts.b,
      size: opts.size || 1, drag: opts.drag !== undefined ? opts.drag : 2, grav: opts.grav || 0,
    });
  }

  function colorOf(hex) {
    const c = new THREE.Color(hex);
    return { r: c.r, g: c.g, b: c.b };
  }

  // ---------------- game-feel juice: hit-stop + camera shake ----------------
  let stopT = 0, shakeT = 0, shakeDur = 0, shakeAmp = 0;
  let slowT = 0, slowScale = 1, realDt = 0.016;

  // ---------------- pooled world-space sprites: damage text, star flashes, alerts ----------------
  const texts = [], stars = [], alerts = [];
  let starTex = null, alertTex = null;

  function canvasTex(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function spriteMat(map, additive) {
    return new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  }

  function initSprites() {
    starTex = canvasTex(128, 128, (c, w) => {
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      for (let i = 0; i < 16; i++) {           // 8-point star: long + short spikes
        const a = i / 16 * Math.PI * 2, r = i % 4 === 0 ? 64 : i % 2 === 0 ? 30 : 11;
        c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      }
      c.fill();
    });
    alertTex = canvasTex(128, 128, c => {
      c.fillStyle = '#ff4f6a';
      c.beginPath(); c.moveTo(64, 8); c.lineTo(122, 112); c.lineTo(6, 112); c.closePath(); c.fill();
      c.lineWidth = 8; c.strokeStyle = '#fff4c8'; c.lineJoin = 'round'; c.stroke();
      c.fillStyle = '#fff'; c.font = '900 72px "Avenir Next", "Trebuchet MS", sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 64, 76);
    });
    for (let i = 0; i < 26; i++) {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(spriteMat(tex, false));
      sp.renderOrder = 20; sp.visible = false; sp.center.set(0.5, 0.25);
      G.scene.add(sp);
      texts.push({ sp, cv, ctx: cv.getContext('2d'), tex, t: 1, dur: 1, vy: 0, base: 1 });
    }
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(spriteMat(starTex, true));
      sp.renderOrder = 19; sp.visible = false;
      G.scene.add(sp);
      stars.push({ sp, t: 1, dur: 0.2, size: 1 });
    }
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Sprite(spriteMat(alertTex, false));
      sp.renderOrder = 21; sp.visible = false;
      G.scene.add(sp);
      alerts.push({ sp, t: 1, dur: 0.6, ref: null, yOff: 2, size: 1 });
    }
  }

  function oldest(pool) {
    let best = pool[0];
    for (const p of pool) { if (p.t >= p.dur) return p; if (p.t / p.dur > best.t / best.dur) best = p; }
    return best;
  }

  function updateSprites(dt) {
    for (const o of texts) {
      if (o.t >= o.dur) continue;
      o.t += dt;
      const f = o.t / o.dur;
      if (f >= 1) { o.sp.visible = false; continue; }
      o.sp.position.y += o.vy * dt;
      o.vy *= Math.exp(-3 * dt);
      const pop = f < 0.12 ? 0.6 + (f / 0.12) * 0.7 : 1.3 - Math.min((f - 0.12) * 3, 0.3);
      o.sp.scale.set(o.base * 4 * pop, o.base * pop, 1);
      o.sp.material.opacity = f < 0.7 ? 1 : 1 - (f - 0.7) / 0.3;
    }
    for (const o of stars) {
      if (o.t >= o.dur) continue;
      o.t += dt;
      const f = o.t / o.dur;
      if (f >= 1) { o.sp.visible = false; continue; }
      o.sp.scale.setScalar(o.size * (0.4 + Math.sqrt(f) * 1.2));
      o.sp.material.opacity = 1 - f * f;
    }
    for (const o of alerts) {
      if (o.t >= o.dur) continue;
      o.t += dt;
      const f = o.t / o.dur;
      if (f >= 1 || (o.alive && !o.alive())) { o.t = o.dur; o.sp.visible = false; continue; }
      if (o.ref) o.sp.position.set(o.ref.x, o.ref.y + o.yOff, o.ref.z);
      const bounce = f < 0.15 ? f / 0.15 * 1.35 : 1 + Math.sin(o.t * 30) * 0.06;
      o.sp.scale.setScalar(o.size * bounce);
      o.sp.material.opacity = f > 0.8 ? (1 - f) / 0.2 : 1;
    }
  }

  return {
    init() { init(); initSprites(); },
    // brief global slow-motion (perfect dodge etc.)
    slowmo(dur, scale = 0.3) { slowT = Math.max(slowT, dur); slowScale = scale; },
    realDt() { return realDt; },
    // floating text (damage numbers, PERFECT!, BLOCK...). opts: color, size, crit, stroke
    text(pos, str, opts = {}) {
      const o = oldest(texts);
      const c = o.ctx, crit = !!opts.crit;
      c.clearRect(0, 0, 512, 128);
      let px = opts.px || (crit ? 72 : 60);
      const setFont = () => { c.font = `900 ${px}px "Avenir Next", "Trebuchet MS", Verdana, sans-serif`; };
      setFont();
      const w = c.measureText(str).width;
      if (w > 470) { px = Math.floor(px * 470 / w); setFont(); }
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineJoin = 'round'; c.lineWidth = 12;
      c.strokeStyle = opts.stroke || (crit ? '#7a2a00' : '#0c2a3a');
      c.strokeText(str, 256, 66);
      const g = c.createLinearGradient(0, 66 - px * 0.5, 0, 66 + px * 0.5);
      const col = opts.color || (crit ? '#ffe24a' : '#ffffff');
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, col); g.addColorStop(1, opts.color2 || col);
      c.fillStyle = g;
      c.fillText(str, 256, 66);
      o.tex.needsUpdate = true;
      o.sp.position.set(pos.x + U.rand(-0.35, 0.35), pos.y, pos.z + U.rand(-0.35, 0.35));
      o.base = (opts.size || 1) * (crit ? 0.95 : 0.7);
      o.vy = opts.vy ?? 3.2;
      o.t = 0; o.dur = opts.dur || (crit ? 1.1 : 0.85);
      o.sp.material.opacity = 1;
      o.sp.visible = true;
    },
    // bright star-shaped impact flash
    star(pos, hex = 0xffffff, size = 1.6, dur = 0.18) {
      const o = oldest(stars);
      o.sp.position.copy(pos);
      o.sp.material.color.set(hex);
      o.sp.material.rotation = U.rand(0, U.TAU);
      o.size = size; o.t = 0; o.dur = dur;
      o.sp.visible = true;
    },
    // "!" telegraph that tracks a position (e.g. enemy.pos) for dur seconds
    alert(ref, yOff = 2, dur = 0.6, size = 1.1, alive = null) {
      const o = oldest(alerts);
      o.ref = ref; o.yOff = yOff; o.t = 0; o.dur = dur; o.size = size; o.alive = alive;
      o.sp.position.set(ref.x, ref.y + yOff, ref.z);
      o.sp.visible = true;
    },
    // directional spark spray — biased along dir (unit Vector3)
    sparks(pos, dir, hex, n = 12, speed = 9) {
      const c = colorOf(hex);
      for (let i = 0; i < n; i++) {
        const s = U.rand(speed * 0.35, speed);
        spawn(pos.x, pos.y, pos.z, {
          vx: (dir.x + U.rand(-0.7, 0.7)) * s, vy: (dir.y + U.rand(-0.3, 0.9)) * s, vz: (dir.z + U.rand(-0.7, 0.7)) * s,
          life: U.rand(0.18, 0.42), r: c.r, g: c.g, b: c.b, size: U.rand(0.18, 0.4), drag: 5,
        });
      }
    },
    // brief slow-motion freeze on meaty hits
    hitStop(d) { stopT = Math.max(stopT, d); },
    // decaying camera shake
    shake(amp, dur) {
      if (amp >= shakeAmp * (shakeT / Math.max(shakeDur, 0.001))) {
        shakeAmp = amp; shakeDur = dur; shakeT = dur;
      }
    },
    // called with real dt; returns the timescale for game updates this frame
    timeScale(dt) {
      realDt = dt;
      if (stopT > 0) { stopT -= dt; return 0.1; }
      if (slowT > 0) { slowT -= dt; return slowScale; }
      return 1;
    },
    applyShake(cam, dt) {
      if (shakeT <= 0) return;
      shakeT -= dt;
      const a = shakeAmp * (shakeT / shakeDur);
      cam.position.x += U.rand(-a, a);
      cam.position.y += U.rand(-a, a) * 0.6;
      cam.position.z += U.rand(-a, a);
    },
    // radial burst
    burst(pos, hex, n = 14, speed = 5, size = 0.6, life = 0.7, grav = 0) {
      const c = colorOf(hex);
      for (let i = 0; i < n; i++) {
        const th = U.rand(0, U.TAU), ph = U.rand(-1, 1);
        const s = U.rand(speed * 0.3, speed);
        spawn(pos.x, pos.y, pos.z, {
          vx: Math.cos(th) * Math.sqrt(1 - ph * ph) * s,
          vy: ph * s, vz: Math.sin(th) * Math.sqrt(1 - ph * ph) * s,
          life: U.rand(life * 0.5, life), r: c.r, g: c.g, b: c.b,
          size: U.rand(size * 0.5, size), grav,
        });
      }
    },
    // gentle upward sparkle column
    sparkle(pos, hex, n = 8, size = 0.5) {
      const c = colorOf(hex);
      for (let i = 0; i < n; i++) {
        spawn(pos.x + U.rand(-0.6, 0.6), pos.y + U.rand(-0.3, 0.3), pos.z + U.rand(-0.6, 0.6), {
          vy: U.rand(0.8, 2.4), life: U.rand(0.6, 1.3), r: c.r, g: c.g, b: c.b,
          size: U.rand(size * 0.5, size), drag: 0.5,
        });
      }
    },
    trailDot(pos, hex, size = 0.4, life = 0.5) {
      const c = colorOf(hex);
      spawn(pos.x, pos.y, pos.z, { life, r: c.r, g: c.g, b: c.b, size, drag: 1 });
    },
    splash(pos, n = 16) {
      const c = colorOf(0xbfeeff);
      for (let i = 0; i < n; i++) {
        const th = U.rand(0, U.TAU), s = U.rand(1.5, 5);
        spawn(pos.x, 0.05, pos.z, {
          vx: Math.cos(th) * s * 0.6, vy: U.rand(2, 5.5), vz: Math.sin(th) * s * 0.6,
          life: U.rand(0.35, 0.8), r: c.r, g: c.g, b: c.b, size: U.rand(0.3, 0.65), grav: -11, drag: 0.4,
        });
      }
      this.ring(new THREE.Vector3(pos.x, 0.06, pos.z), 0xd8f6ff, 2.4, 0.55);
    },
    ring(pos, hex, maxR = 3, dur = 0.5, vertical = false) {
      const m = new THREE.Mesh(ringGeo, ringMat.clone());
      m.material.color.set(hex);
      m.position.copy(pos);
      if (!vertical) m.rotation.x = -Math.PI / 2;
      else m.lookAt(G.camera.position);
      m.scale.setScalar(0.15);
      G.scene.add(m);
      rings.push({ m, t: 0, dur, maxR });
    },
    update(dt) {
      updateSprites(realDt);
      // particles
      let i = 0;
      for (let p of parts) { p.life += dt; }
      for (let k = parts.length - 1; k >= 0; k--) if (parts[k].life >= parts[k].maxLife) parts.splice(k, 1);
      for (let p of parts) {
        const dr = Math.exp(-p.drag * dt);
        p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.grav * dt * -1;
        if (p.grav) p.vy += p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const fade = 1 - p.life / p.maxLife;
        positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
        colors[i * 3] = p.r * fade; colors[i * 3 + 1] = p.g * fade; colors[i * 3 + 2] = p.b * fade;
        sizesAttr.array[i] = p.size * (0.5 + 0.5 * fade);
        i++;
      }
      geo.setDrawRange(0, i);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      sizesAttr.needsUpdate = true;
      // rings
      for (let k = rings.length - 1; k >= 0; k--) {
        const r = rings[k];
        r.t += dt;
        const f = r.t / r.dur;
        if (f >= 1) { G.scene.remove(r.m); r.m.material.dispose(); rings.splice(k, 1); continue; }
        r.m.scale.setScalar(0.15 + f * r.maxR);
        r.m.material.opacity = 1 - f;
      }
    },
  };
})();
