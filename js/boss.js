// Axolotl Guardian — Crystal Catfish King: 3-phase temple boss with cleansing finale
G.makeBoss = function () {
  const B = {};
  const ARENA = { x: 0, z: -200, r: 42 };
  const CORRUPT = 0xb03fe8;

  // ---------------- Model (Blender-authored, see blender/characters.py) ----------------
  const grp = new THREE.Group();
  const model = G.assets.make('boss');
  // facePlayerBoss() points the group's local -X at the player; the model's
  // head is authored toward +X, so flip it around
  const flip = new THREE.Group();
  flip.rotation.y = Math.PI;
  flip.add(model);
  grp.add(flip);

  const headGrp = model.getObjectByName('head');
  const mouth = model.getObjectByName('mouth');
  const tailGrp = model.getObjectByName('tail');
  const bodyMat = model.getObjectByName('body').material;
  const eyeMats = [model.getObjectByName('eyeL').material];   // shared by both eyes
  const whiskers = [0, 1, 2, 3].map(i => model.getObjectByName('whisker' + i));
  whiskers.forEach(w => { w.userData.rz0 = w.rotation.z; });
  const crystals = [0, 1, 2, 3, 4, 5].map(i => model.getObjectByName('crystal' + i));
  crystals.forEach(c => { c.material = c.material.clone(); });  // independent pulse/cleanse
  const heartCrys = model.getObjectByName('heart');
  heartCrys.visible = false;

  grp.position.set(ARENA.x, -2.5, ARENA.z - 18);
  grp.visible = false;
  G.scene.add(grp);

  // ---------------- State ----------------
  B.grp = grp;
  B.pos = grp.position;
  B.radius = 3.6;
  B.maxHp = 60;
  B.hp = B.maxHp;
  B.alive = false;         // becomes true when fight starts
  B.type = 'boss';
  B.defeated = false;
  let state = 'circle', t = 0, angle = 0, chargeCount = 0;
  let vel = new THREE.Vector3();
  let attackTimer = 5, flash = 0, stagger = 0;
  const shockwaves = [];   // {mesh, r, speed}
  const shards = [];       // {targetMesh, x, z, t, fell, crysMesh}
  let summonTimer = 12;

  function phase() { return B.hp > B.maxHp * 0.66 ? 1 : B.hp > B.maxHp * 0.33 ? 2 : 3; }
  B.phase = phase;

  // ---------------- Combat ----------------
  B.hit = function (dmg, kind, fromPos) {
    if (!B.alive || B.defeated) return;
    const mult = stagger > 0 ? 2 : 1;
    B.hp = Math.max(0, B.hp - dmg * mult);
    flash = 0.12;
    bodyMat.emissive.set(0xffffff); bodyMat.emissiveIntensity = 1;
    G.audio.play('bossHit');
    G.fx.burst(fromPos || B.pos, CORRUPT, 12, 6);
    // shatter a crystal at hp milestones
    const shouldRemain = Math.ceil(crystals.length * B.hp / B.maxHp);
    let visCount = crystals.filter(c => c.visible).length;
    while (visCount > Math.max(shouldRemain, 0)) {
      const c = crystals.find(cc => cc.visible);
      if (!c) break;
      c.visible = false; visCount--;
      G.audio.play('crack');
      c.getWorldPosition(U.v1);
      G.fx.burst(U.v1, CORRUPT, 26, 8);
    }
    G.ui.bossBar(B.hp / B.maxHp);
    if (B.hp <= 0) {
      B.defeated = true;
      G.onBossDefeated();
    }
  };

  function chargeAt(speed = 26) {
    U.v1.copy(G.player.pos).sub(B.pos).setY(0).normalize();
    vel.copy(U.v1).multiplyScalar(speed);
    state = 'charge'; t = 0;
    G.audio.play('roar');
  }

  function spawnShockwave() {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.45, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0x9fdfff, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = Math.PI / 2;
    m.position.set(B.pos.x, 0.4, B.pos.z);
    G.scene.add(m);
    shockwaves.push({ m, r: 1, speed: 13 });
    G.audio.play('blast');
    G.fx.splash(B.pos, 26);
  }

  function spawnShardVolley(n) {
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, U.TAU), r = U.rand(0, 9);
      const x = G.player.pos.x + Math.cos(a) * r, z = G.player.pos.z + Math.sin(a) * r;
      const target = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 20),
        new THREE.MeshBasicMaterial({ color: 0xff5fbe, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      target.rotation.x = -Math.PI / 2;
      target.position.set(x, Math.max(G.world.heightAt(x, z) + 0.3, 0.1), z);
      G.scene.add(target);
      const crys = G.assets.make('crystal_shard');
      crys.scale.setScalar(0.75);
      crys.position.set(x, 26, z);
      crys.rotation.x = Math.PI;
      crys.visible = false;
      G.scene.add(crys);
      shards.push({ target, crys, x, z, t: -0.2 - i * 0.12, fell: false });
    }
    G.audio.play('zap');
  }

  function summonMinions() {
    const p = phase();
    if (p === 1) {
      G.spawnEnemy('swarm', B.pos.x + U.rand(-8, 8), B.pos.z + U.rand(-8, 8));
      G.ui.toast('The King calls a corrupted swarm!');
    } else {
      G.spawnEnemy('crab', ARENA.x + U.rand(-14, 14), ARENA.z + U.rand(-14, 14));
      G.ui.toast('The King summons a crystal crab!');
    }
  }

  // ---------------- Fight update ----------------
  B.startFight = function () {
    B.alive = true;
    grp.visible = true;
    state = 'circle'; t = 0;
    attackTimer = 3.5;
    G.audio.setMood('boss');
    G.ui.bossBar(1, true);
  };

  B.update = function (dt) {
    if (!grp.visible) return;
    t += dt;
    if (flash > 0) { flash -= dt; if (flash <= 0) { bodyMat.emissive.set(0x232b3f); bodyMat.emissiveIntensity = 0.35; } }

    // animate whiskers & tail always
    whiskers.forEach((w, i) => { w.rotation.x += Math.sin(G.time * 2.4 + i * 1.7) * 0.006; });
    tailGrp.rotation.y = Math.sin(G.time * (state === 'charge' ? 12 : 4)) * 0.5;
    for (const c of crystals) if (c.visible) c.material.emissiveIntensity = 0.75 + Math.sin(G.time * 4 + c.position.x * 3) * 0.25;

    if (B.defeated || !B.alive) return;

    const p = phase();
    const d = B.pos.distanceTo(G.player.pos);

    if (stagger > 0) {
      stagger -= dt;
      heartCrys.visible = true;
      heartCrys.rotation.y += dt * 4;
      heartCrys.material.emissiveIntensity = 0.8 + Math.sin(G.time * 8) * 0.4;
      grp.position.y = U.damp(grp.position.y, -1.2, 2, dt);
      grp.rotation.z = U.damp(grp.rotation.z, 0.35, 3, dt);
      if (Math.random() < dt * 8) G.fx.sparkle(heartCrys.getWorldPosition(U.v1), 0xff5fbe, 3, 0.6);
      if (stagger <= 0) {
        heartCrys.visible = false;
        grp.rotation.z = 0;
        state = 'circle'; t = 0;
        G.ui.toast('The King recovers!');
      }
      return;
    }

    if (state === 'circle') {
      // orbit arena center, drifting toward player's radius
      angle += dt * (0.35 + p * 0.1);
      const orbitR = U.clamp(U.dist2d(G.player.pos.x, G.player.pos.z, ARENA.x, ARENA.z) + 6, 12, 30);
      U.v1.set(ARENA.x + Math.cos(angle) * orbitR, -2.2 + Math.sin(G.time * 0.8) * 0.8, ARENA.z + Math.sin(angle) * orbitR);
      U.v2.copy(U.v1).sub(B.pos);
      vel.lerp(U.v2.multiplyScalar(1.6), 1 - Math.exp(-2 * dt));
      if (vel.length() > 11 + p * 2) vel.setLength(11 + p * 2);
      B.pos.addScaledVector(vel, dt);
      grp.rotation.y = U.angleDamp(grp.rotation.y, Math.atan2(vel.x, vel.z) - Math.PI / 2 + Math.PI, 4, dt);

      attackTimer -= dt;
      if (attackTimer <= 0) {
        t = 0;
        const roll = Math.random();
        if (p === 1) {
          state = 'windup';
        } else if (p === 2) {
          state = roll < 0.4 ? 'windup' : roll < 0.7 ? 'whiskerSlam' : 'shardRain';
        } else {
          state = roll < 0.5 ? 'windup' : roll < 0.7 ? 'vortex' : roll < 0.85 ? 'whiskerSlam' : 'shardRain';
        }
      }
      summonTimer -= dt;
      if (summonTimer <= 0) { summonTimer = p === 3 ? 14 : 18; summonMinions(); }
    } else if (state === 'windup') {
      // telegraph: rear back, mouth glows, roar
      facePlayerBoss(dt, 6);
      grp.position.y = U.damp(grp.position.y, -0.6, 4, dt);
      mouth.scale.y = 1 + Math.min(t, 0.8) * 2.4;
      if (t > 0.35 && !B.roared) { G.audio.play('roar'); B.roared = true; }
      if (Math.random() < dt * 16) G.fx.trailDot(headGrp.getWorldPosition(U.v1), 0xd05fff, 0.8, 0.3);
      if (t > (p === 3 ? 0.6 : 0.9)) {
        B.roared = false;
        mouth.scale.y = 1;
        chargeAt(p === 3 ? 32 : 26);
      }
    } else if (state === 'charge') {
      B.pos.addScaledVector(vel, dt);
      grp.rotation.y = U.angleDamp(grp.rotation.y, Math.atan2(vel.x, vel.z) - Math.PI / 2 + Math.PI, 10, dt);
      if (Math.random() < dt * 40) G.fx.trailDot(B.pos, 0x9fdfff, 1.2, 0.4);
      if (d < 4.2) G.player.damage(2, B.pos);
      // pillar crash check (phase 3 stagger mechanic)
      let crashed = false;
      if (G.world.templePillars) {
        for (const pl of G.world.templePillars) {
          if (!pl.alive) continue;
          if (U.dist2d(B.pos.x, B.pos.z, pl.x, pl.z) < 3.4) {
            crashed = true;
            pl.alive = false;
            // topple the pillar
            const mesh = pl.mesh;
            G.audio.play('crack'); G.audio.play('thunder');
            G.fx.burst(new THREE.Vector3(pl.x, 3, pl.z), 0xd8d8d8, 30, 9);
            mesh.rotation.x = U.rand(-1.2, 1.2); mesh.rotation.z = U.rand(-1.2, 1.2);
            mesh.position.y -= 2;
            break;
          }
        }
      }
      const outOfArena = U.dist2d(B.pos.x, B.pos.z, ARENA.x, ARENA.z) > ARENA.r - 3;
      if (crashed || (p >= 3 && outOfArena && chargeCount % 3 === 2)) {
        chargeCount++;
        stagger = 4.2;
        G.audio.play('crack');
        G.fx.ring(B.pos, 0xff5fbe, 8, 0.9);
        G.ui.toast('💥 The King is dazed — strike the heart crystal!');
        vel.set(0, 0, 0);
      } else if (t > 1.25 || outOfArena) {
        chargeCount++;
        vel.multiplyScalar(0.2);
        if (p >= 2 && Math.random() < 0.5) { state = 'whiskerSlam'; t = 0; }
        else { state = 'circle'; t = 0; attackTimer = U.rand(2.5, 4) - p * 0.4; }
      }
      keepInArena();
    } else if (state === 'whiskerSlam') {
      // telegraph: raise up... then slam → expanding shockwave (jump or dash to avoid)
      facePlayerBoss(dt, 4);
      if (t < 0.9) {
        grp.position.y = U.damp(grp.position.y, 2.4, 5, dt);
        whiskers.forEach(w => { w.rotation.z = U.damp(w.rotation.z, w.userData.rz0 - 0.85, 6, dt); });
      } else if (t < 1.0) {
        grp.position.y = -2.8;
        if (!B.slammed) {
          B.slammed = true;
          spawnShockwave();
          if (p === 3) setTimeout(() => { if (state === 'whiskerSlam' || state === 'circle') spawnShockwave(); }, 450);
        }
      } else if (t > 1.6) {
        B.slammed = false;
        whiskers.forEach(w => { w.rotation.z = w.userData.rz0; });
        state = 'circle'; t = 0; attackTimer = U.rand(2.4, 3.6);
      }
    } else if (state === 'shardRain') {
      facePlayerBoss(dt, 3);
      grp.position.y = U.damp(grp.position.y, -0.4, 3, dt);
      if (!B.volleyed) { B.volleyed = true; spawnShardVolley(p === 3 ? 8 : 5); G.ui.toast('☄️ Crystal shards incoming — watch the circles!'); }
      if (t > 2.4) { B.volleyed = false; state = 'circle'; t = 0; attackTimer = U.rand(2.6, 4); }
    } else if (state === 'vortex') {
      // pull the player in — dash away or ride it out with shield
      facePlayerBoss(dt, 5);
      mouth.scale.y = 3;
      if (!B.vortexing) { B.vortexing = true; G.audio.play('whirl'); G.ui.toast('🌀 The King inhales — dash away!'); }
      U.v1.copy(B.pos).sub(G.player.pos).setY(0);
      const pd = U.v1.length();
      if (pd > 3) {
        U.v1.normalize();
        G.player.vel.addScaledVector(U.v1, 26 * dt * U.clamp(1 - pd / 45, 0.2, 1) * 3);
      } else {
        G.player.damage(1, B.pos);
      }
      if (Math.random() < dt * 20) {
        const a = U.rand(0, U.TAU), r = U.rand(4, 14);
        G.fx.trailDot(U.v2.set(B.pos.x + Math.cos(a) * r, U.rand(-1, 2), B.pos.z + Math.sin(a) * r), 0x9fdfff, 0.7, 0.5);
      }
      if (t > 2.6) { B.vortexing = false; mouth.scale.y = 1; state = 'circle'; t = 0; attackTimer = U.rand(2, 3.4); }
    }

    updateHazards(dt);
  };

  function facePlayerBoss(dt, rate) {
    const ty = Math.atan2(G.player.pos.x - B.pos.x, G.player.pos.z - B.pos.z) - Math.PI / 2 + Math.PI;
    grp.rotation.y = U.angleDamp(grp.rotation.y, ty, rate, dt);
  }

  function keepInArena() {
    const dd = U.dist2d(B.pos.x, B.pos.z, ARENA.x, ARENA.z);
    if (dd > ARENA.r) {
      U.v1.set(ARENA.x - B.pos.x, 0, ARENA.z - B.pos.z).normalize();
      B.pos.x = ARENA.x - U.v1.x * -ARENA.r;
      B.pos.z = ARENA.z - U.v1.z * -ARENA.r;
    }
    B.pos.y = U.clamp(B.pos.y, -4.5, 3);
  }

  function updateHazards(dt) {
    // shockwaves
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.r += sw.speed * dt;
      sw.m.scale.set(sw.r, sw.r, 1);
      sw.m.material.opacity = Math.max(0, 0.75 - sw.r / 40);
      const pd = U.dist2d(G.player.pos.x, G.player.pos.z, sw.m.position.x, sw.m.position.z);
      if (Math.abs(pd - sw.r) < 1.1 && G.player.pos.y < 1.6) {
        G.player.damage(1, sw.m.position);
      }
      if (sw.r > 44) { G.scene.remove(sw.m); sw.m.material.dispose(); shockwaves.splice(i, 1); }
    }
    // falling shards
    for (let i = shards.length - 1; i >= 0; i--) {
      const sh = shards[i];
      sh.t += dt;
      sh.target.material.opacity = 0.35 + Math.abs(Math.sin(G.time * 8)) * 0.3;
      if (sh.t > 0.9 && !sh.fell) {
        sh.crys.visible = true;
        sh.crys.position.y -= 60 * dt * ((sh.t - 0.9) * 4 + 0.4);
        const groundY = Math.max(G.world.heightAt(sh.x, sh.z), -3);
        if (sh.crys.position.y <= groundY + 1) {
          sh.fell = true;
          G.audio.play('crack');
          G.fx.burst(new THREE.Vector3(sh.x, groundY + 0.6, sh.z), CORRUPT, 20, 7);
          G.fx.ring(new THREE.Vector3(sh.x, Math.max(groundY, 0) + 0.1, sh.z), 0xd05fff, 3, 0.4);
          if (U.dist2d(G.player.pos.x, G.player.pos.z, sh.x, sh.z) < 2.4) G.player.damage(1, sh.crys.position);
          G.scene.remove(sh.target); G.scene.remove(sh.crys);
          shards.splice(i, 1);
        }
      } else if (sh.t > 4) {
        G.scene.remove(sh.target); G.scene.remove(sh.crys);
        shards.splice(i, 1);
      }
    }
  }

  // ---------------- Cleansing finale ----------------
  B.cleanse = function (progress) {
    // 0→1: corruption drains, colors soften to gold
    eyeMats.forEach(m => {
      m.emissive.lerpColors(new THREE.Color(0xb03fe8), new THREE.Color(0xffd85f), progress);
      m.color.lerpColors(new THREE.Color(0xd05fff), new THREE.Color(0xffe98a), progress);
    });
    // body is vertex-colored: tint from white toward a soft living green
    bodyMat.emissive.lerpColors(new THREE.Color(0x232b3f), new THREE.Color(0x3f5a4a), progress);
    bodyMat.color.lerpColors(new THREE.Color(0xffffff), new THREE.Color(0xa8e0c0), progress);
    crystals.forEach(c => { if (c.visible) c.scale.setScalar(Math.max(0.001, 1 - progress)); });
    grp.rotation.z = 0;
  };
  B.bowPos = function () { return new THREE.Vector3(ARENA.x, -1, ARENA.z + 6); };
  B.cleanupHazards = function () {
    for (const sw of shockwaves) { G.scene.remove(sw.m); }
    shockwaves.length = 0;
    for (const sh of shards) { G.scene.remove(sh.target); G.scene.remove(sh.crys); }
    shards.length = 0;
  };
  B.headWorldPos = function () { return headGrp.getWorldPosition(U.v1).clone(); };
  B.ARENA = ARENA;

  return B;
};
