// Axolotl Guardian — player: model, movement, camera, combat
G.makePlayer = function () {
  const P = {};
  const WATER_Y = 0;

  // ---------------- Model ----------------
  const grp = new THREE.Group();
  const bodyPink = U.emissiveMat(0xffa8bf, 0xff6f95, 0.22);
  const bellyPink = U.emissiveMat(0xffd0dc, 0xff9fb5, 0.18);
  const gillMat = U.emissiveMat(0xff5f8e, 0xff2f6e, 0.55);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.1, 6, 12), bodyPink);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;

  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.0, 5, 10), bellyPink);
  belly.rotation.z = Math.PI / 2;
  belly.position.y = -0.14;
  belly.scale.set(1, 0.8, 0.95);

  const headGrp = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), bodyPink);
  head.scale.set(1.05, 0.9, 1);
  head.castShadow = true;
  headGrp.add(head);
  // eyes with glint
  const eyeMat = U.mat(0x2a2438);
  const glintMat = U.emissiveMat(0xffffff, 0xffffff, 1);
  for (let s = -1; s <= 1; s += 2) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), eyeMat);
    eye.position.set(0.3, 0.13, s * 0.3);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), glintMat);
    glint.position.set(0.38, 0.17, s * 0.32);
    headGrp.add(eye, glint);
  }
  // smile
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 6, 10, Math.PI * 0.8), U.mat(0xd06080));
  smile.position.set(0.42, -0.05, 0);
  smile.rotation.set(Math.PI / 2 + 0.5, 0, Math.PI + 0.35);
  headGrp.add(smile);
  // signature gills (3 fronds each side)
  const gills = [];
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.55, 5), gillMat);
      g.position.set(-0.05 - i * 0.13, 0.22 + i * 0.03, s * (0.3 + i * 0.07));
      g.rotation.z = 0.9;
      g.rotation.x = s * (0.65 + i * 0.2);
      headGrp.add(g);
      gills.push(g);
    }
  }
  headGrp.position.set(0.85, 0.1, 0);

  // tail: flattened waving fin
  const tailGrp = new THREE.Group();
  const tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.25, 4), bodyPink);
  tailFin.rotation.z = Math.PI / 2 + Math.PI;
  tailFin.scale.set(1, 1, 0.28);
  tailFin.position.x = -0.6;
  tailFin.castShadow = true;
  const tailGlow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.4, 4),
    U.emissiveMat(0x7fd8ff, 0x4fc8ff, 0.8, { transparent: true, opacity: 0 }));
  tailGlow.rotation.copy(tailFin.rotation);
  tailGlow.scale.set(1.15, 1.15, 0.34);
  tailGlow.position.x = -0.62;
  tailGrp.add(tailFin, tailGlow);
  tailGrp.position.x = -0.75;

  // stubby legs
  const legs = [];
  for (const [lx, lz] of [[0.45, 0.36], [0.45, -0.36], [-0.42, 0.36], [-0.42, -0.36]]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.24, 3, 6), bodyPink);
    leg.position.set(lx, -0.38, lz);
    grp.add(leg);
    legs.push(leg);
  }

  grp.add(body, belly, headGrp, tailGrp);

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

  // whip arc visual
  const whipArc = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.18, 6, 20, 2.1),
    new THREE.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  whipArc.rotation.x = Math.PI / 2;
  grp.add(whipArc);

  // cosmetics
  const cosmetics = { none: null };
  function buildCosmetics() {
    // lily pad hat
    const lily = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.4, 0.06, 14, 1, false, 0.4, 5.6), U.mat(0x3f9c50));
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.2, 6), U.emissiveMat(0xff9fce, 0xff5f9e, 0.4));
    fl.position.y = 0.12;
    lily.add(pad, fl);
    lily.position.set(0, 0.5, 0);
    cosmetics.lilyhat = lily;
    // snail shell
    const shell = new THREE.Group();
    const sp = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.14, 8, 14), U.mat(0xd8a05f));
    sp.rotation.y = Math.PI / 2;
    const spTip = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), U.mat(0xc08a4a));
    shell.add(sp, spTip);
    shell.position.set(0, 0.52, 0);
    shell.scale.setScalar(1.1);
    cosmetics.shell = shell;
    // sunset scarf
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.13, 8, 16), U.mat(0xff8a3f));
    scarf.rotation.z = Math.PI / 2 - 0.25;
    scarf.position.set(-0.32, 0.05, 0);
    cosmetics.scarf = scarf;
    // glow crown (challenge cave reward)
    const crown = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * U.TAU;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 5), U.emissiveMat(0xffe98a, 0xffd84f, 1));
      spike.position.set(Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3);
      crown.add(spike);
    }
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 14), U.emissiveMat(0xffe98a, 0xffd84f, 0.8));
    band.rotation.x = Math.PI / 2;
    crown.add(band);
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

  P.whip = function () {
    if (cd.whip > 0 || whirlT > 0) return;
    cd.whip = CD.whip;
    whipT = 0.22;
    G.audio.play('whip');
    tailGlow.material.opacity = 0.85;
    let hitAny = false;
    for (const e of enemiesAndBoss()) {
      const d = U.v1.copy(e.pos).sub(P.pos);
      const dist = d.length();
      if (dist > 3.4 + (e.radius || 0.8)) continue;
      d.normalize();
      const facing = U.v2.set(Math.sin(P.camYaw) * -1, 0, Math.cos(P.camYaw) * -1);
      if (d.dot(facing) < 0.15 && dist > 1.4) continue;
      e.hit(1, 'whip', P.pos);
      hitAny = true;
    }
    if (hitAny) G.audio.play('whipHit');
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
    const size = 0.32 + p * 0.55;
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8),
      U.emissiveMat(0x9fe8ff, 0x4fc8ff, 1, { transparent: true, opacity: 0.9 }));
    m.position.copy(P.pos).add(U.v1.set(0, 0.3, 0)).add(U.v2.copy(dir).multiplyScalar(1.2));
    G.scene.add(m);
    projectiles.push({ m, dir: dir.clone(), speed: 30, life: 2.2, dmg: p >= 0.95 ? 3 : (p > 0.5 ? 2 : 1), size, pierce: p >= 0.95, hitSet: new Set() });
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
    P.invuln = Math.max(P.invuln, 0.32);
    G.audio.play('dash');
    const dir = new THREE.Vector3();
    // dash along input direction, or facing if idle
    const ix = (G.keys['KeyD'] ? 1 : 0) - (G.keys['KeyA'] ? 1 : 0);
    const iz = (G.keys['KeyS'] ? 1 : 0) - (G.keys['KeyW'] ? 1 : 0);
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
  P.damage = function (n, fromPos) {
    if (P.dead || P.invuln > 0) return false;
    if (shieldT > 0) {
      G.audio.play('shieldPop');
      G.fx.ring(P.pos, 0x9fe8ff, 3, 0.4);
      shieldT = Math.max(shieldT - 0.8, 0.1);
      return false;
    }
    G.state.hearts -= n;
    P.invuln = 1.2;
    G.audio.play('hurt');
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

  // ---------------- Update ----------------
  const camTarget = new THREE.Vector3();
  P.update = function (dt) {
    if (P.dead) return;
    // cooldowns
    for (const k in cd) cd[k] = Math.max(0, cd[k] - dt);
    P.invuln = Math.max(0, P.invuln - dt);

    const groundH = G.world.heightAt(P.pos.x, P.pos.z);
    const pad = G.world.padUnder(P.pos.x, P.pos.z);
    const floorH = pad ? Math.max(groundH, pad.y) : groundH;
    P.inWater = P.pos.y < WATER_Y + 0.15 && groundH < -0.45 && !(pad && P.pos.y > pad.y - 0.1);

    // input direction (camera relative)
    const ix = (G.keys['KeyD'] ? 1 : 0) - (G.keys['KeyA'] ? 1 : 0);
    const iz = (G.keys['KeyS'] ? 1 : 0) - (G.keys['KeyW'] ? 1 : 0);
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
      if (G.keys['Space']) P.vel.y += 30 * dt;
      if (G.keys['KeyC']) P.vel.y -= 30 * dt;
      // buoyancy toward surface + drag
      P.vel.y += (P.pos.y < -1.5 ? 1.2 : 0.4) * dt;
      const drag = Math.exp(-3.4 * dt);
      P.vel.multiplyScalar(drag);
      const maxV = dashT > 0 ? 24 : 11 * chargeSlow;
      if (P.vel.length() > maxV) P.vel.setLength(maxV);
      // breach: leap out of water
      if (P.pos.y > WATER_Y - 0.35 && P.vel.y > 4.5) {
        G.audio.play('splash');
        G.fx.splash(P.pos);
      }
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
      if (G.keys['Space'] && P.onGround && !P.jumpHeld) {
        P.vel.y = 8.5;
        P.onGround = false;
        P.jumpHeld = true;
        G.audio.play('hop');
        if (pad) G.fx.ring(U.v2.set(P.pos.x, pad.y + 0.05, P.pos.z), 0xaef3c8, 1.6, 0.4);
      }
    }
    if (!G.keys['Space']) P.jumpHeld = false;

    dashT = Math.max(0, dashT - dt);
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
    // entering water splash
    if (P.wasAbove && P.pos.y < 0.05 && P.inWater) { G.audio.play('splash'); G.fx.splash(P.pos); }
    P.wasAbove = P.pos.y > 0.4;
    // cap fly-off above water
    if (P.pos.y > 14) P.pos.y = 14;

    G.world.collide(P.pos, 0.7);

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
    if (whipT > 0) {
      whipT -= dt;
      whipArc.material.opacity = whipT * 3.5;
      whipArc.rotation.z = -1 + (0.22 - whipT) * 14;
      tailGrp.rotation.y = Math.sin((0.22 - whipT) * 28) * 0.9;
      tailGlow.material.opacity = whipT * 3;
    } else if (whirlT <= 0) {
      // face movement direction
      const hv = Math.hypot(P.vel.x, P.vel.z);
      if (hv > 0.6) {
        const targetYaw = Math.atan2(P.vel.x, P.vel.z);
        P.yaw = U.angleDamp(P.yaw, targetYaw, 10, dt);
      }
      grp.rotation.y = P.yaw - Math.PI / 2;
      // body pitch when swimming vertically
      const pitchTarget = P.inWater ? U.clamp(-P.vel.y * 0.09, -0.9, 0.9) : 0;
      grp.rotation.z = U.damp(grp.rotation.z, pitchTarget, 6, dt);
      // idle tail wave + gill sway
      tailGrp.rotation.y = Math.sin(G.time * (P.inWater && moving ? 10 : 3.4)) * (moving ? 0.55 : 0.25);
    }
    gills.forEach((g, i) => { g.rotation.y = Math.sin(G.time * 2.6 + i) * 0.18; });
    legs.forEach((l, i) => {
      const sw = (moving && P.onGround) ? Math.sin(G.time * 11 + i * Math.PI) * 0.18 : 0;
      l.position.y = -0.38 + Math.abs(sw) * 0.4;
      l.rotation.x = sw * 2;
    });
    // hurt blink
    grp.visible = P.invuln <= 0 || Math.floor(G.time * 14) % 2 === 0;

    // swim bubbles
    if (P.inWater && Math.hypot(P.vel.x, P.vel.z) > 3 && Math.random() < dt * 14)
      G.fx.trailDot(U.v2.copy(P.pos).add(U.v3.set(U.rand(-0.3, 0.3), 0.2, U.rand(-0.3, 0.3))), 0xcfeeff, 0.28, 0.7);

    updateProjectiles(dt);
    updateCamera(dt);
  };

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i];
      pr.life -= dt;
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
