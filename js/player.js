// Axolotl Guardian — player: model, movement, camera, combat
G.makePlayer = function () {
  const P = {};
  const WATER_Y = 0;

  // ---------------- Model (Blender-authored, see blender/characters.py) ----------------
  const grp = new THREE.Group();
  const model = G.assets.make('axolotl');
  grp.add(model);

  const headGrp = model.getObjectByName('head');
  const tailGrp = model.getObjectByName('tail');
  const tailGlow = model.getObjectByName('tailGlow');
  const gills = [0, 1, 2, 3, 4, 5].map(i => model.getObjectByName('gill' + i));
  const legs = ['legFL', 'legFR', 'legBL', 'legBR'].map(n => model.getObjectByName(n));
  // remember rest poses — animation is applied relative to them
  gills.forEach(g => { g.userData.ry0 = g.rotation.y; });
  headGrp.userData.ry0 = headGrp.rotation.y;
  legs.forEach(l => { l.userData.y0 = l.position.y; l.userData.rx0 = l.rotation.x; });

  // skin tints (multiply the vertex-colored materials) — unlocked by relics
  const SKINS = [
    { name: 'Rose Pink', tint: 0xffffff },
    { name: 'Golden Albino', tint: 0xffe9a0 },
    { name: 'Moonlight Lucy', tint: 0x9fc0ff },
    { name: 'Wild Shadow', tint: 0x8a7a6a },
  ];
  const skinMats = new Set();
  model.traverse(o => { if (o.isMesh && o.material.vertexColors && !o.material.transparent) skinMats.add(o.material); });

  // bubble shield mesh
  const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 14),
    new THREE.MeshPhongMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.28, shininess: 120, depthWrite: false, side: THREE.DoubleSide }));
  shieldMesh.visible = false;
  grp.add(shieldMesh);

  // whirlpool visual
  const whirlMesh = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.5, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  whirlMesh.rotation.x = Math.PI / 2;
  whirlMesh.visible = false;
  grp.add(whirlMesh);

  // whip swoosh: a flat ribbon arc whose bright leading edge sweeps across it,
  // leaving a fading gradient trail (angle-based alpha in the shader)
  function makeSwoosh(arc, r0, r1) {
    const geo = new THREE.RingGeometry(r0, r1, 48, 1, -Math.PI / 2 - arc / 2, arc);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uHead: { value: 0 }, uOp: { value: 0 }, uDir: { value: 1 }, uArc: { value: arc }, uStart: { value: -Math.PI / 2 - arc / 2 },
        uR: { value: new THREE.Vector2(r0, r1) }, uCol: { value: new THREE.Color(0x8fe8ff) } },
      vertexShader: `varying vec2 vL; void main(){ vL = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec2 vL; uniform float uHead, uOp, uDir, uArc, uStart; uniform vec2 uR; uniform vec3 uCol;
        void main(){
          float th = atan(vL.y, vL.x) - uStart;
          th = mod(th + 6.2831853, 6.2831853);
          float t = clamp(th / uArc, 0.0, 1.0);
          if (uDir < 0.0) t = 1.0 - t;
          float trail = smoothstep(uHead - 0.55, uHead, t) * step(t, uHead + 0.02);
          float r = (length(vL) - uR.x) / (uR.y - uR.x);
          float band = smoothstep(0.0, 0.35, r) * smoothstep(1.0, 0.8, r);
          float edge = smoothstep(0.6, 1.0, r) * 0.9;
          vec3 c = mix(uCol, vec3(1.0), edge + pow(trail, 6.0) * 0.6);
          gl_FragColor = vec4(c * 0.8, trail * band * uOp * 0.7);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(m);
    holder.visible = false;
    G.scene.add(holder);
    return { holder, mat, t: 1, dur: 0.2 };
  }
  const swooshes = {
    a: makeSwoosh(2.4, 1.0, 3.3),
    b: makeSwoosh(2.4, 1.0, 3.3),
    spin: makeSwoosh(Math.PI * 2 - 0.01, 0.8, 4.4),
  };
  swooshes.spin.mat.uniforms.uCol.value.set(0xffd8f0);
  function playSwoosh(sw, yaw, dir, dur, y = 0.2) {
    sw.holder.visible = true;
    sw.holder.rotation.set(0, yaw, 0);
    sw.holder.position.copy(P.pos).y += y;
    sw.mat.uniforms.uDir.value = dir;
    sw.t = 0; sw.dur = dur;
  }
  function updateSwooshes(dt) {
    for (const k in swooshes) {
      const sw = swooshes[k];
      if (sw.t >= sw.dur + 0.14) { sw.holder.visible = false; continue; }
      sw.t += dt;
      const f = sw.t / sw.dur;
      sw.holder.position.x = P.pos.x; sw.holder.position.z = P.pos.z;
      sw.mat.uniforms.uHead.value = Math.min(f, 1) * 1.2;
      sw.mat.uniforms.uOp.value = f < 1 ? 1 : Math.max(0, 1 - (sw.t - sw.dur) / 0.14);
    }
  }

  // dash afterimages: translucent additive copies of the axolotl
  const ghosts = [];
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xff9fd0, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 6; i++) {
    const gm = G.assets.make('axolotl', { shadows: false });
    const mats = [];
    gm.traverse(o => { if (o.isMesh) { o.material = ghostMat.clone(); mats.push(o.material); o.castShadow = false; } });
    gm.visible = false;
    G.scene.add(gm);
    ghosts.push({ m: gm, mats, t: 1 });
  }
  let ghostIdx = 0, ghostTimer = 0;
  function spawnGhost() {
    const g = ghosts[ghostIdx++ % ghosts.length];
    grp.updateMatrixWorld();
    model.updateMatrixWorld();
    model.matrixWorld.decompose(g.m.position, g.m.quaternion, g.m.scale);
    g.m.visible = true;
    g.t = 0;
  }
  function updateGhosts(dt) {
    for (const g of ghosts) {
      if (g.t >= 0.32) { g.m.visible = false; continue; }
      g.t += dt;
      const op = 0.4 * (1 - g.t / 0.32);
      for (const m of g.mats) m.opacity = op;
    }
  }

  // lock-on reticle
  const reticleTex = (function () {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d');
    c.strokeStyle = '#ffe98a'; c.lineWidth = 7; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      c.beginPath(); c.arc(64, 64, 46, i * Math.PI / 2 + 0.25, i * Math.PI / 2 + Math.PI / 2 - 0.25); c.stroke();
      const a = i * Math.PI / 2 + Math.PI / 4;
      c.beginPath(); c.moveTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54); c.lineTo(64 + Math.cos(a) * 36, 64 + Math.sin(a) * 36); c.stroke();
    }
    c.fillStyle = '#fff4c8'; c.beginPath(); c.arc(64, 64, 6, 0, Math.PI * 2); c.fill();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: reticleTex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  reticle.renderOrder = 22;
  reticle.visible = false;
  G.scene.add(reticle);

  // cosmetics (Blender-authored hats/accessories)
  const cosmetics = { none: null };
  function buildCosmetics() {
    const lily = G.assets.make('hat_lily');
    lily.position.set(0, 0.45, 0);
    cosmetics.lilyhat = lily;
    const shell = G.assets.make('hat_shell');
    shell.position.set(-0.08, 0.5, 0);
    shell.scale.setScalar(1.15);
    cosmetics.shell = shell;
    const scarf = G.assets.make('hat_scarf');
    scarf.position.set(-0.35, 0.0, 0);
    scarf.rotation.z = -0.2;
    cosmetics.scarf = scarf;
    const crown = G.assets.make('hat_crown');
    crown.position.set(0, 0.5, 0);
    cosmetics.crown = crown;
  }
  buildCosmetics();
  let wornKey = 'none', wornMesh = null;

  G.scene.add(grp);

  // ---------------- State ----------------
  P.grp = grp;
  P.pos = grp.position;
  P.pos.set(0, -0.5, 192);
  P.vel = new THREE.Vector3();
  P.yaw = Math.PI;                 // facing angle (visual)
  P.camYaw = 0; P.camPitch = 0.28; // camera starts south of player, looking north
  P.radius = 0.9;
  P.onGround = false;
  P.inWater = true;
  P.invuln = 0;
  P.dead = false;

  const cd = { whip: 0, blast: 0, shield: 0, whirl: 0, dash: 0 };
  P.cd = cd;
  const CD = { whip: 0.34, blast: 1.0, shield: 8.5, whirl: 6.5, dash: 1.25 };
  P.CD = CD;
  let charging = false, chargeT = 0;
  let shieldT = 0, whirlT = 0, whipT = 0, dashT = 0;
  // combo / feel state
  let comboStep = 0, comboWin = 0, whipQueued = 0, whipDir = 1, spinT = 0, airSpinT = 0;
  let dashWin = 0, perfectThisDash = false;
  let landSq = 0, stepT = 0, swimPhase = 0, roll = 0, lastYaw = P.yaw, wasGround = false, fallVel = 0;
  let hitChain = 0, hitChainT = 0;
  P.critReady = false;
  P.lock = null;
  P.isShielded = () => shieldT > 0;

  const projectiles = [];
  const sporeProjectiles = [];     // enemy projectiles (frogs, boss) — handled here for reflection
  P.sporeProjectiles = sporeProjectiles;

  // ---------------- Combat ----------------
  function enemiesAndBoss() {
    const list = G.enemies.filter(e => e.alive);
    if (G.boss && G.boss.alive) list.push(G.boss);
    return list;
  }

  // ---------------- targeting ----------------
  function lockValid(t) {
    return t && t.alive && !t.defeated && t.pos.distanceTo(P.pos) < 40;
  }
  // best enemy in a cone around the camera's horizontal forward
  const _fwd = new THREE.Vector3(), _to = new THREE.Vector3();
  function aimTarget(range, minDot) {
    if (lockValid(P.lock) && P.lock.pos.distanceTo(P.pos) < range * 1.6) return P.lock;
    _fwd.set(-Math.sin(P.camYaw), 0, -Math.cos(P.camYaw));
    let best = null, bestS = -1e9;
    for (const e of enemiesAndBoss()) {
      _to.copy(e.pos).sub(P.pos);
      const dist = _to.length();
      if (dist > range + (e.radius || 0.8)) continue;
      _to.y = 0; _to.normalize();
      const dot = _to.dot(_fwd);
      if (dot < minDot && dist > 1.6) continue;
      const sc = dot * 2 - dist / range;
      if (sc > bestS) { bestS = sc; best = e; }
    }
    return best;
  }
  P.aimTarget = aimTarget;

  P.toggleLock = function () {
    if (P.lock) { P.lock = null; return; }
    const t = aimTarget(30, 0.3);
    if (t) {
      P.lock = t;
      G.audio.play('lockOn');
      G.fx.ring(U.v1.copy(t.pos).setY(Math.max(t.pos.y, 0.1)), 0xffe98a, 2.4, 0.35);
    } else {
      G.ui.toast('No target in view', 900);
    }
  };

  // ---------------- whip combo ----------------
  const _wdir = new THREE.Vector3(), _wd = new THREE.Vector3();
  P.whip = function () {
    if (whirlT > 0) return;
    if (cd.whip > 0) { if (cd.whip < 0.2) whipQueued = 0.25; return; }
    doWhip();
  };

  function doWhip() {
    const airborne = !P.inWater && !P.onGround && P.pos.y > 0.6;
    comboStep = (comboWin > 0 && comboStep < 3 && !airborne) ? comboStep + 1 : 1;
    const step = airborne ? 4 : comboStep;          // 4 = air spin
    const finisher = step === 3;
    const spin = finisher || step === 4;
    cd.whip = CD.whip = finisher ? 0.6 : step === 4 ? 0.4 : 0.22;
    comboWin = cd.whip + 0.5;
    if (finisher) comboStep = 0;
    whipT = spin ? 0.36 : 0.2;
    whipDir = step === 2 ? -1 : 1;
    G.audio.play(step === 2 ? 'combo2' : spin ? 'combo3' : 'whip');
    if (step === 1 || step === 4) G.audio.play('whip');
    tailGlow.material.opacity = 0.9;

    // aim assist & lunge toward target
    const tgt = aimTarget(finisher ? 7 : 6, 0.35);
    const dir = _wdir;
    if (tgt) dir.copy(tgt.pos).sub(P.pos).setY(0);
    else dir.set(-Math.sin(P.camYaw), 0, -Math.cos(P.camYaw));
    if (dir.lengthSq() < 1e-4) dir.set(-Math.sin(P.camYaw), 0, -Math.cos(P.camYaw));
    dir.normalize();
    const atkYaw = Math.atan2(dir.x, dir.z);
    P.yaw = atkYaw;
    const tDist = tgt ? tgt.pos.distanceTo(P.pos) - (tgt.radius || 0.8) : 99;
    const lunge = tgt ? U.clamp(tDist - 0.8, 0, 3.2) * 3 : 3;
    P.vel.x += dir.x * lunge; P.vel.z += dir.z * lunge;
    if (step === 4) { P.vel.y = Math.max(P.vel.y, 3.2); airSpinT = 0.4; }
    if (finisher) spinT = 0.34;

    if (spin) playSwoosh(swooshes.spin, atkYaw, whipDir, 0.3);
    else playSwoosh(whipDir > 0 ? swooshes.a : swooshes.b, atkYaw, whipDir, 0.16);

    const range = finisher ? 4.4 : step === 4 ? 3.8 : 3.5;
    const dmg = finisher ? 2 : 1;
    let hitAny = false;
    for (const e of enemiesAndBoss()) {
      const d = _wd.copy(e.pos).sub(P.pos);
      const dist = d.length();
      if (dist > range + (e.radius || 0.8)) continue;
      d.setY(0).normalize();
      if (!spin && d.dot(dir) < 0.1 && dist > 1.5) continue;
      e.hit(dmg, 'whip', P.pos);
      if (finisher && e.vel && e.alive && e.type !== 'boss') e.vel.addScaledVector(d, 7);
      hitAny = true;
    }
    if (finisher) {
      G.fx.ring(U.v1.set(P.pos.x, Math.max(P.pos.y - 0.3, 0.06), P.pos.z), 0xffd8f0, 5, 0.4);
      G.fx.shake(0.12, 0.2);
    }
    if (hitAny) G.audio.play('whipHit');
  }

  // called by G.hitFeedback when a hit lands — drives the HUD combo counter
  P.registerHit = function (crit, blocked) {
    if (blocked) return;
    hitChain = hitChainT > 0 ? hitChain + 1 : 1;
    hitChainT = 2.2;
    if (G.ui.combo) G.ui.combo(hitChain, crit);
  };

  P.startCharge = function () {
    if (!G.state.abilities.blast || cd.blast > 0) return;
    charging = true; chargeT = 0;
  };

  P.releaseCharge = function () {
    if (!charging) return;
    charging = false;
    if (cd.blast > 0) return;
    const p = U.clamp(chargeT / 0.9, 0.15, 1);
    cd.blast = CD.blast;
    G.audio.play('blast');
    const dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);
    const tgt = aimTarget(42, 0.9);
    const origin = U.v1.copy(P.pos).add(U.v2.set(0, 0.3, 0));
    if (tgt) {
      const aimed = U.v2.copy(tgt.pos).add(U.v3.set(0, tgt.type === 'boss' ? 0.8 : 0.3, 0)).sub(origin).normalize();
      if (aimed.dot(dir) > 0.82 || tgt === P.lock) dir.copy(aimed);
    }
    const size = 0.32 + p * 0.55;
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8),
      U.emissiveMat(0x9fe8ff, 0x4fc8ff, 1, { transparent: true, opacity: 0.9 }));
    m.position.copy(P.pos).add(U.v1.set(0, 0.3, 0)).add(U.v2.copy(dir).multiplyScalar(1.2));
    G.scene.add(m);
    projectiles.push({ m, dir: dir.clone(), speed: 30, life: 2.2, dmg: p >= 0.95 ? 3 : (p > 0.5 ? 2 : 1), size, pierce: p >= 0.95, hitSet: new Set(), homing: lockValid(P.lock) ? P.lock : null });
    G.fx.burst(m.position, 0x9fe8ff, 8, 3, 0.4);
    // recoil
    P.vel.addScaledVector(dir, -4 * p);
    G.ui.charge(0);
  };

  P.shield = function () {
    if (!G.state.abilities.shield || cd.shield > 0) return;
    cd.shield = CD.shield;
    shieldT = 2.6;
    shieldMesh.visible = true;
    G.audio.play('shield');
    G.fx.ring(P.pos, 0x9fe8ff, 2.4, 0.5);
  };

  P.whirl = function () {
    if (!G.state.abilities.whirl || cd.whirl > 0) return;
    cd.whirl = CD.whirl;
    whirlT = 0.85;
    whirlMesh.visible = true;
    G.audio.play('whirl');
    G.fx.ring(P.pos, 0x6fd8ff, 5.5, 0.7);
    for (const e of enemiesAndBoss()) {
      const dist = U.v1.copy(e.pos).sub(P.pos).length();
      if (dist < 5.6 + (e.radius || 0.8)) {
        e.hit(2, 'whirl', P.pos);
      }
    }
    // pull nearby pearls hard
    for (const it of G.pickups) {
      if (it.kind === 'pearl' && it.mesh.position.distanceTo(P.pos) < 9) it.scatter = 0;
    }
  };

  P.dash = function () {
    if (cd.dash > 0) return;
    cd.dash = CD.dash;
    dashT = 0.28;
    dashWin = 0.34;
    perfectThisDash = false;
    ghostTimer = 0;
    P.invuln = Math.max(P.invuln, 0.32);
    G.audio.play('dash');
    const dir = new THREE.Vector3();
    // dash along input direction, or facing if idle
    const ix = (G.key('KeyD') ? 1 : 0) - (G.key('KeyA') ? 1 : 0);
    const iz = (G.key('KeyS') ? 1 : 0) - (G.key('KeyW') ? 1 : 0);
    if (ix || iz) {
      dir.set(ix, 0, iz).normalize();
      dir.applyAxisAngle(U.v1.set(0, 1, 0), P.camYaw);
    } else {
      G.camera.getWorldDirection(dir);
      dir.y = 0; dir.normalize();
    }
    if (P.inWater) {
      const look = new THREE.Vector3();
      G.camera.getWorldDirection(look);
      dir.y = look.y * 0.7;
      dir.normalize();
    }
    P.vel.addScaledVector(dir, P.inWater ? 20 : 14);
    G.fx.burst(P.pos, 0xbfeeff, 12, 4, 0.45);
    // dash-through damages goblins & insects lightly
    for (const e of enemiesAndBoss()) {
      if (U.v1.copy(e.pos).sub(P.pos).length() < 2.2 && (e.type === 'goblin' || e.type === 'swarm')) e.hit(1, 'dash', P.pos);
    }
  };

  // ---------------- Damage ----------------
  function perfectDodge() {
    if (perfectThisDash) return;
    perfectThisDash = true;
    P.critReady = true;
    G.fx.slowmo(0.4, 0.3);
    G.fx.ring(U.v1.copy(P.pos), 0x7fe8ff, 5, 0.45);
    G.fx.ring(U.v1.copy(P.pos), 0xffffff, 3, 0.3, true);
    G.fx.star(U.v1.copy(P.pos).add(U.v2.set(0, 0.6, 0)), 0x9fefff, 3.4, 0.3);
    G.fx.text(U.v1.copy(P.pos).add(U.v2.set(0, 1.8, 0)), 'PERFECT!', { color: '#8fefff', color2: '#3fb8ff', stroke: '#06304a', crit: true, vy: 2 });
    G.audio.play('shield');
    G.audio.play('crit');
    if (G.ui.perfect) G.ui.perfect();
  }

  P.damage = function (n, fromPos) {
    if (P.dead) return false;
    if (dashWin > 0) { perfectDodge(); return false; }
    if (P.invuln > 0) return false;
    if (shieldT > 0) {
      G.audio.play('shieldPop');
      G.fx.ring(P.pos, 0x9fe8ff, 3, 0.4);
      shieldT = Math.max(shieldT - 0.8, 0.1);
      return false;
    }
    G.state.hearts -= n;
    P.invuln = 1.2;
    hitChain = 0; hitChainT = 0;
    if (G.ui.combo) G.ui.combo(0);
    G.audio.play('hurt');
    G.fx.shake(0.3, 0.35);
    G.fx.hitStop(0.05);
    G.ui.hurtFlash();
    G.ui.hud();
    if (fromPos) {
      U.v1.copy(P.pos).sub(fromPos).setY(0.3).normalize();
      P.vel.addScaledVector(U.v1, 9);
    }
    G.fx.burst(P.pos, 0xff8a9e, 10, 4);
    if (G.state.hearts <= 0) {
      P.dead = true;
      G.onPlayerDeath();
    }
    return true;
  };

  P.addCosmetic = function (key) {
    if (!G.state.cosmetics.includes(key)) G.state.cosmetics.push(key);
    P.wear(key);
  };
  P.wear = function (key) {
    if (wornMesh) { headGrp.remove(wornMesh); wornMesh = null; }
    wornKey = key;
    if (key !== 'none' && cosmetics[key]) {
      wornMesh = cosmetics[key];
      headGrp.add(wornMesh);
    }
  };
  P.cycleCosmetic = function () {
    const owned = ['none', ...G.state.cosmetics];
    const idx = (owned.indexOf(wornKey) + 1) % owned.length;
    P.wear(owned[idx]);
    if (owned[idx] !== 'none') G.audio.play('pearl');
  };

  P.applySkin = function (idx) {
    idx = U.clamp(idx, 0, SKINS.length - 1);
    G.state.skin = idx;
    skinMats.forEach(m => m.color.set(SKINS[idx].tint));
  };
  P.cycleSkin = function () {
    const unlocked = 1 + Math.min(G.state.relics, SKINS.length - 1);
    if (unlocked <= 1) {
      G.ui.toast('🏺 Find ancient relics to unlock new colors!');
      return;
    }
    P.applySkin((G.state.skin + 1) % unlocked);
    G.audio.play('pearl');
    G.ui.toast(`✨ ${SKINS[G.state.skin].name}`, 2000);
  };

  // ---------------- Update ----------------
  const camTarget = new THREE.Vector3();
  P.update = function (dt) {
    if (P.dead) return;
    if (P.riding) {
      P.lock = null; reticle.visible = false;
      // carried on the King's back — just look pretty and steer the camera
      grp.rotation.y = P.yaw - Math.PI / 2;
      grp.rotation.z = 0;
      tailGrp.rotation.y = Math.sin(G.time * 5) * 0.35;
      gills.forEach((g, i) => { g.rotation.y = g.userData.ry0 + Math.sin(G.time * 2.6 + i) * 0.18; });
      if (Math.random() < dt * 10) G.fx.trailDot(U.v2.copy(P.pos).add(U.v3.set(U.rand(-1, 1), -0.5, U.rand(-1, 1))), 0xcfeeff, 0.4, 0.6);
      updateCamera(dt);
      return;
    }
    // cooldowns
    for (const k in cd) cd[k] = Math.max(0, cd[k] - dt);
    P.invuln = Math.max(0, P.invuln - dt);
    dashWin = Math.max(0, dashWin - dt);
    comboWin = Math.max(0, comboWin - dt);
    if (hitChainT > 0) { hitChainT -= dt; if (hitChainT <= 0 && G.ui.combo) G.ui.combo(0); }
    if (whipQueued > 0) { whipQueued -= dt; if (cd.whip <= 0) { whipQueued = 0; if (whirlT <= 0) doWhip(); } }
    if (P.lock && !lockValid(P.lock)) P.lock = null;

    const groundH = G.world.heightAt(P.pos.x, P.pos.z);
    const pad = G.world.padUnder(P.pos.x, P.pos.z);
    const floorH = pad ? Math.max(groundH, pad.y) : groundH;
    P.inWater = P.pos.y < WATER_Y + 0.15 && groundH < -0.45 && !(pad && P.pos.y > pad.y - 0.1);

    // input direction (camera relative)
    const ix = (G.key('KeyD') ? 1 : 0) - (G.key('KeyA') ? 1 : 0);
    const iz = (G.key('KeyS') ? 1 : 0) - (G.key('KeyW') ? 1 : 0);
    const moveDir = U.v1.set(ix, 0, iz);
    const moving = moveDir.lengthSq() > 0;
    if (moving) moveDir.normalize().applyAxisAngle(U.v2.set(0, 1, 0), P.camYaw);

    const chargeSlow = charging ? 0.45 : 1;

    if (P.inWater) {
      // fluid 3D swim
      const accel = 46 * chargeSlow;
      if (moving) {
        // pitch swim direction with camera when pressing W
        const look = U.v3;
        G.camera.getWorldDirection(look);
        const vertFactor = iz < 0 ? look.y : 0;
        P.vel.x += moveDir.x * accel * dt;
        P.vel.z += moveDir.z * accel * dt;
        P.vel.y += vertFactor * accel * 0.8 * dt;
      }
      if (G.key('Space')) P.vel.y += 30 * dt;
      if (G.key('KeyC')) P.vel.y -= 30 * dt;
      // buoyancy toward surface + drag
      P.vel.y += (P.pos.y < -1.5 ? 1.2 : 0.4) * dt;
      const drag = Math.exp(-3.4 * dt);
      P.vel.multiplyScalar(drag);
      const maxV = dashT > 0 ? 24 : 11 * chargeSlow;
      if (P.vel.length() > maxV) P.vel.setLength(maxV);
      // breach: leap out of water
      if (P.pos.y > WATER_Y - 0.35 && P.vel.y > 4.5 && !P.breached) {
        P.breached = true;
        P.vel.y = Math.max(P.vel.y, 10.5);          // a proper arcing leap
        G.audio.play('splash');
        G.fx.splash(P.pos, 34);
        G.fx.ring(U.v3.set(P.pos.x, 0.05, P.pos.z), 0xe8faff, 3.4, 0.7);
      }
      if (P.pos.y < WATER_Y - 0.9) P.breached = false;
    } else {
      // land / lily pad
      const accel = 40 * chargeSlow;
      if (moving) {
        P.vel.x += moveDir.x * accel * dt;
        P.vel.z += moveDir.z * accel * dt;
      }
      P.vel.y -= 22 * dt; // gravity
      const dragH = Math.exp(-(P.onGround ? 6.5 : 1.6) * dt);
      P.vel.x *= dragH; P.vel.z *= dragH;
      const maxH = dashT > 0 ? 22 : 7.5 * chargeSlow;
      const hv = Math.hypot(P.vel.x, P.vel.z);
      if (hv > maxH) { P.vel.x *= maxH / hv; P.vel.z *= maxH / hv; }
      if (G.key('Space') && P.onGround && !P.jumpHeld) {
        P.vel.y = 8.5;
        P.onGround = false;
        P.jumpHeld = true;
        G.audio.play('hop');
        if (pad) G.fx.ring(U.v2.set(P.pos.x, pad.y + 0.05, P.pos.z), 0xaef3c8, 1.6, 0.4);
      }
    }
    if (!G.key('Space')) P.jumpHeld = false;

    dashT = Math.max(0, dashT - dt);
    if (dashT > 0) { ghostTimer -= dt; if (ghostTimer <= 0) { ghostTimer = 0.045; spawnGhost(); } }
    fallVel = P.vel.y;
    P.pos.addScaledVector(P.vel, dt);

    // floor collision
    P.onGround = false;
    const minY = floorH + 0.42;
    if (P.pos.y < minY) {
      if (!P.inWater || floorH > -0.6) {
        P.pos.y = minY;
        if (P.vel.y < -7) { G.audio.play('splash'); G.fx.splash(P.pos); }
        P.vel.y = Math.max(0, P.vel.y);
        P.onGround = true;
      } else {
        P.pos.y = Math.max(P.pos.y, groundH + 0.42);
        if (P.pos.y < groundH + 0.5) P.vel.y = Math.max(P.vel.y, 0);
      }
    }
    // landing squash + dust
    if (P.onGround && !wasGround && fallVel < -5) {
      landSq = 0.24;
      G.fx.burst(U.v1.set(P.pos.x, P.pos.y - 0.35, P.pos.z), pad ? 0xbfeecf : 0xd8c49a, 10, 3.5, 0.45, 0.4);
      G.audio.play('footstep');
    }
    wasGround = P.onGround;
    // footsteps on land / pads
    const hvNow = Math.hypot(P.vel.x, P.vel.z);
    if (P.onGround && hvNow > 2.2) {
      stepT -= dt;
      if (stepT <= 0) {
        stepT = 0.27;
        G.audio.play('footstep');
        G.fx.burst(U.v1.set(P.pos.x, P.pos.y - 0.38, P.pos.z), pad ? 0xcff4dc : 0xd8c49a, 3, 1.6, 0.35, 0.35, 1.5);
      }
    } else stepT = 0.05;

    // entering water splash
    if (P.wasAbove && P.pos.y < 0.05 && P.inWater) { G.audio.play('splash'); G.fx.splash(P.pos); }
    P.wasAbove = P.pos.y > 0.4;
    // cap fly-off above water
    if (P.pos.y > 14) P.pos.y = 14;

    G.world.collide(P.pos, 0.7);

    // surface ripples trail behind a swimming axolotl
    P.rippleT = (P.rippleT || 0) - dt;
    if (P.inWater && P.pos.y > -1.1 && Math.hypot(P.vel.x, P.vel.z) > 2.5 && P.rippleT <= 0) {
      P.rippleT = 0.16;
      G.fx.ring(U.v2.set(P.pos.x, 0.03, P.pos.z), 0xd8f6ff, U.rand(1.3, 2), 0.75);
    }

    // charging
    if (charging) {
      chargeT += dt;
      const p = U.clamp(chargeT / 0.9, 0, 1);
      G.ui.charge(p);
      if (Math.random() < dt * 20) G.fx.trailDot(U.v2.copy(P.pos).add(U.v3.set(0, 0.4, 0)), 0x9fe8ff, 0.3 + p * 0.4, 0.3);
      if (Math.floor(chargeT * 8) !== Math.floor((chargeT - dt) * 8)) G.audio.play('chargeLoopTick', p);
    }

    // timers & visuals
    if (shieldT > 0) {
      shieldT -= dt;
      shieldMesh.material.opacity = 0.1 + Math.abs(Math.sin(G.time * 5)) * 0.22;
      shieldMesh.scale.setScalar(1 + Math.sin(G.time * 6) * 0.05);
      if (shieldT <= 0) { shieldMesh.visible = false; G.audio.play('shieldPop'); }
    }
    if (whirlT > 0) {
      whirlT -= dt;
      whirlMesh.visible = true;
      whirlMesh.rotation.z += dt * 18;
      whirlMesh.scale.setScalar(1 + (0.85 - whirlT) * 1.4);
      whirlMesh.material.opacity = whirlT * 0.7;
      grp.rotation.y += dt * 22;
      if (Math.random() < dt * 30) G.fx.trailDot(U.v2.copy(P.pos).add(U.v3.set(U.rand(-2, 2), U.rand(-0.4, 0.8), U.rand(-2, 2))), 0x6fd8ff, 0.5, 0.4);
      if (whirlT <= 0) whirlMesh.visible = false;
    }
    const hv = Math.hypot(P.vel.x, P.vel.z);
    if (whipT > 0) {
      whipT -= dt;
      tailGrp.rotation.y = Math.sin(whipT * 28) * 0.9 * whipDir;
      tailGlow.material.opacity = whipT * 3;
      if (spinT > 0) { spinT -= dt; P.yaw += dt * 19; }
      grp.rotation.y = P.yaw - Math.PI / 2;
      headGrp.rotation.y = headGrp.userData.ry0 - whipDir * 0.3;
    } else if (whirlT <= 0) {
      // face movement direction (or the lock-on target while fighting)
      if (P.lock && hv < 4.5) {
        P.yaw = U.angleDamp(P.yaw, Math.atan2(P.lock.pos.x - P.pos.x, P.lock.pos.z - P.pos.z), 8, dt);
      } else if (hv > 0.6) {
        const targetYaw = Math.atan2(P.vel.x, P.vel.z);
        P.yaw = U.angleDamp(P.yaw, targetYaw, 10, dt);
      }
      grp.rotation.y = P.yaw - Math.PI / 2;
      // body pitch: follow vertical motion when swimming or leaping
      const airborne = !P.inWater && !P.onGround;
      const pitchTarget = (P.inWater || airborne) ? U.clamp(P.vel.y * (airborne ? 0.07 : 0.08), -0.9, 0.9) : 0;
      grp.rotation.z = U.damp(grp.rotation.z, pitchTarget, 6, dt);
      // swim undulation: a travelling wave from head to tail
      const swimAmt = P.inWater ? U.clamp(hv / 8, 0.15, 1) : (moving ? 0.35 : 0.12);
      swimPhase += dt * (P.inWater ? 5 + hv * 0.9 : moving ? 11 : 3.2);
      headGrp.rotation.y = headGrp.userData.ry0 + Math.sin(swimPhase) * 0.14 * swimAmt;
      tailGrp.rotation.y = Math.sin(swimPhase - 1.7) * (0.3 + 0.45 * swimAmt);
    }
    // banking roll into turns + air-whip barrel roll
    let yawRate = (P.yaw - lastYaw) % U.TAU;
    if (yawRate > Math.PI) yawRate -= U.TAU;
    if (yawRate < -Math.PI) yawRate += U.TAU;
    lastYaw = P.yaw;
    const rollTarget = whipT > 0 ? 0 : U.clamp(-yawRate / Math.max(dt, 1e-3) * 0.07, -0.55, 0.55) * U.clamp(hv / 5, 0, 1);
    roll = U.damp(roll, rollTarget, 7, dt);
    if (airSpinT > 0) airSpinT -= dt;
    model.rotation.x = roll + (airSpinT > 0 ? (1 - airSpinT / 0.4) * U.TAU : 0);
    // breathing idle + landing squash
    let sy = 1 + Math.sin(G.time * 2.3) * 0.022, sxz = 1 - Math.sin(G.time * 2.3) * 0.01;
    if (landSq > 0) {
      landSq -= dt;
      const k = Math.sin((landSq / 0.24) * Math.PI) * 0.28;
      sy -= k; sxz += k * 0.7;
    }
    model.scale.set(sxz, sy, sxz);
    gills.forEach((g, i) => { g.rotation.y = g.userData.ry0 + Math.sin(G.time * 2.6 + i) * 0.18; });
    legs.forEach((l, i) => {
      const sw = (moving && P.onGround) ? Math.sin(G.time * 11 + i * Math.PI) * 0.18 : 0;
      l.position.y = l.userData.y0 + Math.abs(sw) * 0.4;
      l.rotation.x = l.userData.rx0 + sw * 2;
    });
    // hurt blink
    grp.visible = P.invuln <= 0 || Math.floor(G.time * 14) % 2 === 0;

    // swim bubbles
    if (P.inWater && Math.hypot(P.vel.x, P.vel.z) > 3 && Math.random() < dt * 14)
      G.fx.trailDot(U.v2.copy(P.pos).add(U.v3.set(U.rand(-0.3, 0.3), 0.2, U.rand(-0.3, 0.3))), 0xcfeeff, 0.28, 0.7);

    updateProjectiles(dt);
    updateSwooshes(dt);
    updateGhosts(G.fx.realDt());
    updateReticle(dt);
    updateCamera(dt);
  };

  function updateReticle(dt) {
    const t = P.lock;
    reticle.visible = !!t;
    if (!t) return;
    const h = t.type === 'boss' ? 3.2 : (t.barH || 1.9) * 0.45;
    reticle.position.set(t.pos.x, t.pos.y + h, t.pos.z);
    reticle.material.rotation += dt * 1.8;
    const dist = G.camera.position.distanceTo(reticle.position);
    reticle.scale.setScalar((t.type === 'boss' ? 1.5 : 1) * (1.4 + Math.sin(G.time * 6) * 0.08) * U.clamp(dist / 12, 0.8, 2.4));
    // camera gently turns to keep the target framed
    const dx = t.pos.x - P.pos.x, dz = t.pos.z - P.pos.z;
    if (dx * dx + dz * dz > 4) P.camYaw = U.angleDamp(P.camYaw, Math.atan2(-dx, -dz), 2.4, dt);
  }

  // lock-on input (F / middle mouse) — only while actually playing
  function inPlay() { return document.pointerLockElement === G.renderer.domElement && !P.dead && !P.riding; }
  document.addEventListener('keydown', e => { if (e.code === 'KeyF' && !e.repeat && inPlay()) P.toggleLock(); });
  G.renderer.domElement.addEventListener('mousedown', e => { if (e.button === 1 && inPlay()) { e.preventDefault(); P.toggleLock(); } });

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i];
      pr.life -= dt;
      if (pr.homing && pr.homing.alive && !pr.hitSet.has(pr.homing)) {
        U.v1.copy(pr.homing.pos).sub(pr.m.position).normalize();
        pr.dir.lerp(U.v1, 1 - Math.exp(-3.5 * dt)).normalize();
      }
      pr.m.position.addScaledVector(pr.dir, pr.speed * dt);
      if (Math.random() < dt * 30) G.fx.trailDot(pr.m.position, 0x9fe8ff, pr.size, 0.35);
      let dead = pr.life <= 0;
      // terrain hit
      if (pr.m.position.y < G.world.heightAt(pr.m.position.x, pr.m.position.z) + 0.2) dead = true;
      // enemy hit
      if (!dead) {
        for (const e of G.enemies) {
          if (!e.alive || pr.hitSet.has(e)) continue;
          if (pr.m.position.distanceTo(e.pos) < (e.radius || 0.9) + pr.size + 0.25) {
            e.hit(pr.dmg, 'blast', pr.m.position);
            pr.hitSet.add(e);
            G.audio.play('blastHit');
            G.fx.burst(pr.m.position, 0x9fe8ff, 14, 5);
            if (!pr.pierce) { dead = true; break; }
          }
        }
        if (!dead && G.boss && G.boss.alive && !pr.hitSet.has(G.boss) &&
            pr.m.position.distanceTo(G.boss.pos) < G.boss.radius + pr.size + 0.3) {
          G.boss.hit(pr.dmg, 'blast', pr.m.position);
          pr.hitSet.add(G.boss);
          G.audio.play('blastHit');
          G.fx.burst(pr.m.position, 0x9fe8ff, 16, 6);
          dead = true;
        }
      }
      if (dead) {
        G.fx.burst(pr.m.position, 0x7fd8ff, 8, 3, 0.4);
        G.scene.remove(pr.m);
        pr.m.geometry.dispose();
        projectiles.splice(i, 1);
      }
    }

    // enemy spores (thrown by frogs / boss) — can be reflected by shield
    for (let i = sporeProjectiles.length - 1; i >= 0; i--) {
      const s = sporeProjectiles[i];
      s.life -= dt;
      s.vel.y -= (s.grav || 10) * dt;
      s.m.position.addScaledVector(s.vel, dt);
      if (Math.random() < dt * 16) G.fx.trailDot(s.m.position, s.color || 0xb03fe8, 0.35, 0.4);
      let dead = s.life <= 0;
      const distP = s.m.position.distanceTo(P.pos);
      if (distP < 1.2) {
        if (shieldT > 0 && !s.reflected) {
          // reflect!
          s.reflected = true;
          U.v1.copy(s.m.position).sub(P.pos).normalize();
          s.vel.copy(U.v1).multiplyScalar(16);
          s.vel.y = 4;
          G.audio.play('shieldPop');
        } else if (!s.reflected) {
          P.damage(1, s.m.position);
          dead = true;
        }
      }
      if (s.reflected) {
        for (const e of G.enemies) {
          if (!e.alive) continue;
          if (s.m.position.distanceTo(e.pos) < (e.radius || 0.9) + 0.5) {
            e.hit(2, 'blast', s.m.position);
            dead = true; break;
          }
        }
      }
      if (s.m.position.y < G.world.heightAt(s.m.position.x, s.m.position.z) + 0.15) {
        dead = true;
        G.fx.burst(s.m.position, s.color || 0xb03fe8, 10, 3);
      }
      if (dead) {
        G.scene.remove(s.m);
        sporeProjectiles.splice(i, 1);
      }
    }
  }

  function updateCamera(dt) {
    const dist = 7.6;
    const cy = P.camYaw, cp = P.camPitch;
    camTarget.set(
      P.pos.x + Math.sin(cy) * Math.cos(cp) * dist,
      P.pos.y + Math.sin(cp) * dist + 1.4,
      P.pos.z + Math.cos(cy) * Math.cos(cp) * dist
    );
    // keep camera above terrain
    const th = G.world.heightAt(camTarget.x, camTarget.z) + 0.5;
    if (camTarget.y < th) camTarget.y = th;
    G.camera.position.lerp(camTarget, 1 - Math.exp(-14 * dt));
    U.v1.copy(P.pos).add(U.v2.set(0, 1.1, 0));
    G.camera.lookAt(U.v1);
  }

  return P;
};
