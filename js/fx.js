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

  return {
    init,
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
      if (stopT > 0) { stopT -= dt; return 0.1; }
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
