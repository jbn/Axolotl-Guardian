// Axolotl Guardian — 7 enemy types with readable telegraphs & weaknesses
(function () {
  const CORRUPT = 0xb03fe8;   // corruption crystal color

  function baseEnemy(type, x, z, radius, hp) {
    const grp = new THREE.Group();
    const y = Math.max(G.world.heightAt(x, z) + 0.6, -2.2);
    grp.position.set(x, y, z);
    G.scene.add(grp);
    return {
      type, grp, pos: grp.position, home: new THREE.Vector3(x, y, z),
      radius, hp, maxHp: hp, alive: true,
      state: 'idle', t: U.rand(0, 2), flash: 0, stun: 0,
      vel: new THREE.Vector3(), mats: [], pearls: 2,
      attackCd: U.rand(1, 3), touchCd: 0,
    };
  }

  function collectMats(e) {
    e.mats = [];
    e.grp.traverse(o => { if (o.isMesh && o.material && o.material.emissive) e.mats.push(o.material); });
  }

  function flashHit(e) {
    e.flash = 0.15;
    for (const m of e.mats) { m._e0 = m._e0 ?? m.emissiveIntensity; m.emissiveIntensity = 1.4; m._ec = m._ec || m.emissive.clone(); m.emissive.set(0xffffff); }
  }
  function unflash(e) {
    for (const m of e.mats) { if (m._ec) { m.emissive.copy(m._ec); m.emissiveIntensity = m._e0 ?? 0.3; } }
  }

  function die(e, opts = {}) {
    e.alive = false;
    G.state.kills++;
    G.audio.play('enemyDie');
    G.fx.burst(e.pos, CORRUPT, 18, 6);
    G.fx.burst(e.pos, 0x9fefff, 14, 4);
    G.fx.ring(U.v1.set(e.pos.x, Math.max(e.pos.y, 0.1), e.pos.z), 0xc8f4ff, 3, 0.5);
    G.pickupSys.spawnPearl(e.pos, e.pearls);
    if (Math.random() < (opts.heartChance ?? 0.14)) G.pickupSys.spawnHeart(U.v1.copy(e.pos).add(U.v2.set(0, 0.5, 0)));
    G.scene.remove(e.grp);
    if (e.onDie) e.onDie();
  }

  function knockback(e, fromPos, power = 6) {
    U.v1.copy(e.pos).sub(fromPos).setY(0).normalize();
    e.vel.addScaledVector(U.v1, power);
  }

  function moveWithCollision(e, dt, floorOffset = 0.6) {
    e.pos.addScaledVector(e.vel, dt);
    e.vel.multiplyScalar(Math.exp(-4 * dt));
    G.world.collide(e.pos, e.radius * 0.7);
    const gh = G.world.heightAt(e.pos.x, e.pos.z);
    const targetY = Math.max(gh + floorOffset, e.waterY ?? -1.4);
    e.pos.y = U.damp(e.pos.y, targetY, 5, dt);
  }

  function playerDist(e) { return e.pos.distanceTo(G.player.pos); }

  function facePlayer(e, dt, rate = 5) {
    const ty = Math.atan2(G.player.pos.x - e.pos.x, G.player.pos.z - e.pos.z);
    e.grp.rotation.y = U.angleDamp(e.grp.rotation.y, ty, rate, dt);
  }

  function tryTouchDamage(e, dt, range, dmg) {
    e.touchCd -= dt;
    if (e.touchCd <= 0 && playerDist(e) < range) {
      if (G.player.damage(dmg, e.pos)) e.touchCd = 1.2;
    }
  }

  // ================= CRYSTAL CRAB =================
  function makeCrab(x, z) {
    const e = baseEnemy('crab', x, z, 1.1, 4);
    e.pearls = 2;
    const bodyMat = U.emissiveMat(0xe8734a, 0x992f11, 0.15);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 9), bodyMat);
    body.scale.set(1.25, 0.7, 1);
    body.castShadow = true;
    e.grp.add(body);
    // crystal shell (armor)
    const shellGrp = new THREE.Group();
    const cMat = U.emissiveMat(0x8a2fb8, CORRUPT, 0.7, { transparent: true, opacity: 0.95 });
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.8, 5), cMat);
      c.position.set(U.rand(-0.5, 0.5), 0.55, U.rand(-0.4, 0.4));
      c.rotation.set(U.rand(-0.4, 0.4), 0, U.rand(-0.4, 0.4));
      shellGrp.add(c);
    }
    e.grp.add(shellGrp);
    e.shellGrp = shellGrp; e.shellHp = 2;
    // claws
    const clawMat = U.mat(0xd85f3a);
    const claws = [];
    for (let s = -1; s <= 1; s += 2) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 7), clawMat);
      claw.scale.set(1.3, 0.8, 0.9);
      claw.position.set(0.75, -0.05, s * 0.62);
      e.grp.add(claw);
      claws.push(claw);
    }
    e.claws = claws;
    // eyes on stalks
    for (let s = -1; s <= 1; s += 2) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.4, 5), clawMat);
      st.position.set(0.55, 0.5, s * 0.22);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 7), U.emissiveMat(0xffffff, 0xd05fff, 0.8));
      eye.position.set(0.55, 0.72, s * 0.22);
      e.grp.add(st, eye);
    }
    collectMats(e);

    e.hit = function (dmg, kind, fromPos) {
      if (e.stun <= 0 && e.shellHp > 0 && kind !== 'whirl') {
        e.shellHp -= (kind === 'blast' ? 2 : 1);
        G.audio.play('crack');
        G.fx.burst(U.v1.copy(e.pos).add(U.v2.set(0, 0.6, 0)), CORRUPT, 10, 4);
        flashHit(e);
        if (e.shellHp <= 0) {
          e.grp.remove(e.shellGrp);
          G.fx.burst(e.pos, CORRUPT, 22, 7);
          G.audio.play('crack');
        }
        knockback(e, fromPos, 3);
        return;
      }
      e.hp -= dmg;
      flashHit(e);
      G.audio.play('enemyHurt');
      knockback(e, fromPos, 5);
      if (kind === 'whirl') { e.stun = 2.4; if (e.shellHp > 0) { e.shellHp = 0; e.grp.remove(e.shellGrp); G.audio.play('crack'); } }
      if (e.hp <= 0) die(e);
    };

    e.update = function (dt) {
      e.t += dt;
      if (e.stun > 0) {
        e.stun -= dt;
        e.grp.rotation.z = Math.sin(e.t * 20) * 0.15 + Math.PI * 0.08;
        return;
      }
      e.grp.rotation.z = 0;
      const d = playerDist(e);
      if (e.state === 'idle') {
        // scuttle sideways around home
        e.grp.position.x = e.home.x + Math.cos(e.t * 0.8) * 2.5;
        e.grp.position.z = e.home.z + Math.sin(e.t * 0.8) * 2.5;
        facePlayer(e, dt, 2);
        if (d < 11) { e.state = 'strafe'; e.t = 0; }
      } else if (e.state === 'strafe') {
        facePlayer(e, dt, 6);
        // sidestep approach
        U.v1.copy(G.player.pos).sub(e.pos).setY(0).normalize();
        U.v2.set(-U.v1.z, 0, U.v1.x).multiplyScalar(Math.sin(e.t * 1.7) * 2.6);
        e.vel.addScaledVector(U.v1, (d > 3.4 ? 5.5 : 0) * dt * 6);
        e.vel.addScaledVector(U.v2, dt * 6);
        e.attackCd -= dt;
        if (d < 3.6 && e.attackCd <= 0) { e.state = 'windup'; e.t = 0; }
        if (d > 16) e.state = 'idle';
      } else if (e.state === 'windup') {
        // telegraph: claws raise + shake
        facePlayer(e, dt, 8);
        e.claws.forEach(c => { c.position.y = -0.05 + Math.min(e.t * 1.6, 0.55) + Math.sin(e.t * 30) * 0.04; });
        if (e.t > 0.55) { e.state = 'lunge'; e.t = 0; G.audio.play('dash'); }
      } else if (e.state === 'lunge') {
        if (e.t < 0.08) {
          U.v1.copy(G.player.pos).sub(e.pos).setY(0).normalize();
          e.vel.copy(U.v1).multiplyScalar(15);
        }
        tryTouchDamage(e, dt, 1.9, 1);
        if (e.t > 0.4) { e.state = 'strafe'; e.t = 0; e.attackCd = U.rand(1.6, 2.8); e.claws.forEach(c => c.position.y = -0.05); }
      }
      moveWithCollision(e, dt);
    };
    return e;
  }

  // ================= THORN VINE =================
  function makeVine(x, z) {
    const e = baseEnemy('vine', x, z, 1.0, 3);
    e.pearls = 1;
    e.waterY = G.world.heightAt(x, z) + 0.2;
    const stalkMat = U.emissiveMat(0x3f7a2f, 0x1f4f1f, 0.2);
    const thornMat = U.mat(0x8a5a3a);
    const segs = [];
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.02, 0.19 - i * 0.02, 0.7, 6), stalkMat);
      s.position.y = 0.35 + i * 0.62;
      e.grp.add(s);
      segs.push(s);
      for (let j = 0; j < 3; j++) {
        const th = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 4), thornMat);
        const a = U.rand(0, U.TAU);
        th.position.set(Math.cos(a) * 0.18, 0.35 + i * 0.62, Math.sin(a) * 0.18);
        th.rotation.z = -Math.cos(a) * 1.4;
        th.rotation.x = Math.sin(a) * 1.4;
        e.grp.add(th);
      }
    }
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.42, 9, 8), U.emissiveMat(0xc82f8a, 0xff3fae, 0.6));
    bud.position.y = 3.4;
    bud.scale.y = 1.25;
    e.grp.add(bud);
    e.segs = segs; e.bud = bud;
    e.grp.scale.y = 0.12; // starts coiled underwater
    collectMats(e);

    e.hit = function (dmg, kind, fromPos) {
      if (e.state === 'dormant') { e.state = 'rising'; e.t = 0; }
      e.hp -= (kind === 'blast' ? dmg * 2 : dmg);
      flashHit(e);
      G.audio.play('enemyHurt');
      if (e.hp <= 0) die(e, { heartChance: 0.1 });
    };

    e.update = function (dt) {
      e.t += dt;
      const d = playerDist(e);
      if (e.state === 'idle' || e.state === 'dormant') {
        e.state = 'dormant';
        e.grp.scale.y = U.damp(e.grp.scale.y, 0.12, 4, dt);
        if (d < 6.5) { e.state = 'rising'; e.t = 0; G.audio.play('spore'); }
      } else if (e.state === 'rising') {
        // telegraph: quivering rise
        e.grp.scale.y = U.damp(e.grp.scale.y, 1, 6, dt);
        e.grp.rotation.y += Math.sin(e.t * 40) * 0.05;
        if (e.t > 0.7) { e.state = 'active'; e.t = 0; }
      } else if (e.state === 'active') {
        segs.forEach((s, i) => { s.position.x = Math.sin(e.t * 2.2 + i * 0.8) * 0.14 * i; });
        bud.position.x = Math.sin(e.t * 2.2 + 4) * 0.6;
        facePlayer(e, dt, 3);
        e.attackCd -= dt;
        if (d < 4.6 && e.attackCd <= 0) { e.state = 'windup'; e.t = 0; }
        if (d > 10) e.state = 'retract';
      } else if (e.state === 'windup') {
        // pull back + flash bud
        e.grp.rotation.x = U.damp(e.grp.rotation.x, -0.5, 8, dt);
        bud.scale.setScalar(1 + Math.sin(e.t * 26) * 0.16);
        if (e.t > 0.55) {
          e.state = 'whipAtk'; e.t = 0;
          G.audio.play('whip');
        }
      } else if (e.state === 'whipAtk') {
        e.grp.rotation.x = U.damp(e.grp.rotation.x, 0.75, 22, dt);
        if (e.t > 0.1 && e.t < 0.3) tryTouchDamage(e, dt, 4.6, 1);
        if (e.t > 0.5) { e.state = 'active'; e.t = 0; e.attackCd = U.rand(1.4, 2.4); e.grp.rotation.x = 0; }
      } else if (e.state === 'retract') {
        e.grp.scale.y = U.damp(e.grp.scale.y, 0.12, 4, dt);
        if (e.grp.scale.y < 0.2) e.state = 'dormant';
      }
    };
    return e;
  }

  // ================= SHADOW FROG =================
  function makeFrog(x, z) {
    const e = baseEnemy('frog', x, z, 0.9, 3);
    e.pearls = 2;
    const bodyMat = U.emissiveMat(0x5f3a8a, 0x3a1f66, 0.5);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), bodyMat);
    body.scale.set(1, 0.82, 1.1);
    body.castShadow = true;
    e.grp.add(body);
    e.body = body;
    for (let s = -1; s <= 1; s += 2) {
      const leg = new THREE.Mesh(new THREE.SphereGeometry(0.26, 7, 6), bodyMat);
      leg.position.set(s * 0.55, -0.25, -0.3);
      leg.scale.set(0.8, 0.6, 1.3);
      e.grp.add(leg);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 7), U.emissiveMat(0xffdf5f, 0xffbf2f, 1));
      eye.position.set(s * 0.3, 0.42, 0.4);
      e.grp.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), U.mat(0x1a0a2a));
      pupil.position.set(s * 0.3, 0.44, 0.53);
      e.grp.add(pupil);
    }
    collectMats(e);
    e.hopT = U.rand(0, 1.4);

    e.hit = function (dmg, kind, fromPos) {
      const mult = e.state === 'inflate' ? 2 : 1;   // hit while inflated = big damage + stun
      e.hp -= dmg * mult;
      if (e.state === 'inflate') { e.stun = 1.6; e.state = 'hop'; e.body.scale.set(1, 0.82, 1.1); }
      flashHit(e);
      G.audio.play('enemyHurt');
      knockback(e, fromPos, 6);
      if (e.hp <= 0) die(e);
    };

    e.update = function (dt) {
      e.t += dt;
      if (e.stun > 0) { e.stun -= dt; e.grp.rotation.z = Math.sin(e.t * 22) * 0.2; return; }
      e.grp.rotation.z = 0;
      const d = playerDist(e);
      if (e.state === 'idle') {
        if (d < 17) { e.state = 'hop'; }
      } else if (e.state === 'hop') {
        e.hopT -= dt;
        facePlayer(e, dt, 4);
        if (e.hopT <= 0) {
          e.hopT = U.rand(0.7, 1.3);
          // hop: sideways-biased to be slippery
          U.v1.copy(G.player.pos).sub(e.pos).setY(0).normalize();
          const side = Math.random() < 0.5 ? 1 : -1;
          U.v2.set(-U.v1.z * side, 0, U.v1.x * side);
          const toward = d > 9 ? 0.8 : (d < 5 ? -0.6 : 0.1);
          e.vel.addScaledVector(U.v1, toward * 7).addScaledVector(U.v2, 5);
          e.vy = 4.5;
          G.audio.play('hop');
        }
        e.attackCd -= dt;
        if (e.attackCd <= 0 && d < 15 && d > 3) { e.state = 'inflate'; e.t = 0; }
        if (d > 24) e.state = 'idle';
      } else if (e.state === 'inflate') {
        // telegraph: puffing up
        facePlayer(e, dt, 6);
        const p = Math.min(e.t / 0.75, 1);
        e.body.scale.set(1 + p * 0.5, 0.82 + p * 0.55, 1.1 + p * 0.4);
        if (e.t > 0.75) {
          e.state = 'hop'; e.attackCd = U.rand(2.2, 3.6);
          e.body.scale.set(1, 0.82, 1.1);
          // lob spore at player
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 7), U.emissiveMat(0xb03fe8, 0xd05fff, 0.9));
          m.position.copy(e.pos).setY(e.pos.y + 0.6);
          G.scene.add(m);
          const toP = U.v1.copy(G.player.pos).sub(e.pos);
          const dist = toP.length();
          toP.normalize();
          const vel = new THREE.Vector3(toP.x, 0, toP.z).multiplyScalar(Math.min(dist * 1.15, 16));
          vel.y = 6.5;
          G.player.sporeProjectiles.push({ m, vel, life: 3, color: 0xd05fff, grav: 10 });
          G.audio.play('spore');
        }
      }
      // hop physics
      if (e.vy !== undefined) {
        e.pos.y += e.vy * dt;
        e.vy -= 14 * dt;
        const gh = Math.max(G.world.heightAt(e.pos.x, e.pos.z) + 0.5, -1.0);
        if (e.pos.y <= gh) { e.pos.y = gh; e.vy = 0; }
      }
      e.pos.addScaledVector(e.vel, dt);
      e.vel.multiplyScalar(Math.exp(-3 * dt));
      G.world.collide(e.pos, 0.6);
    };
    return e;
  }

  // ================= INSECT SWARM =================
  function makeSwarm(x, z) {
    const e = baseEnemy('swarm', x, z, 1.6, 3);
    e.pearls = 2;
    e.waterY = 0.8;
    const bugGeo = new THREE.OctahedronGeometry(0.13);
    const bugMat = new THREE.MeshBasicMaterial({ color: 0xdfff5f }); // unlit — always glows
    e.bugs = [];
    for (let i = 0; i < 13; i++) {
      const b = new THREE.Mesh(bugGeo, bugMat);
      b.userData = { a: U.rand(0, U.TAU), r: U.rand(0.4, 1.6), sp: U.rand(2, 5), ph: U.rand(0, 9) };
      e.grp.add(b);
      e.bugs.push(b);
    }
    const glow = new THREE.PointLight(0xcfff4f, 0.8, 8);
    e.grp.add(glow);
    collectMats(e);

    e.hit = function (dmg, kind, fromPos) {
      if (kind === 'whirl') dmg = 99;   // whirlpool scatters the whole swarm
      e.hp -= dmg;
      flashHit(e);
      G.audio.play('enemyHurt');
      // shrink swarm visually with hp
      const target = Math.max(2, Math.ceil(13 * e.hp / e.maxHp));
      while (e.bugs.length > target) { const b = e.bugs.pop(); e.grp.remove(b); G.fx.burst(e.pos, 0xcfff4f, 4, 3); }
      knockback(e, fromPos, 4);
      if (e.hp <= 0) die(e);
    };

    e.update = function (dt) {
      e.t += dt;
      for (const b of e.bugs) {
        const u = b.userData;
        u.a += u.sp * dt;
        b.position.set(Math.cos(u.a) * u.r, Math.sin(e.t * 3 + u.ph) * 0.5, Math.sin(u.a) * u.r);
      }
      const d = playerDist(e);
      if (d < 20) {
        U.v1.copy(G.player.pos).sub(e.pos).normalize();
        e.vel.addScaledVector(U.v1, 6 * dt);
        if (e.vel.length() > 3.4) e.vel.setLength(3.4);
      } else {
        U.v1.copy(e.home).sub(e.pos).normalize();
        e.vel.addScaledVector(U.v1, 2 * dt);
      }
      tryTouchDamage(e, dt, 1.7, 1);
      e.pos.addScaledVector(e.vel, dt);
      const gh = G.world.heightAt(e.pos.x, e.pos.z);
      e.pos.y = Math.max(e.pos.y, gh + 1);
      e.pos.y += Math.sin(e.t * 1.4) * 0.01;
    };
    return e;
  }

  // ================= SNAPPING TURTLE =================
  function makeTurtle(x, z) {
    const e = baseEnemy('turtle', x, z, 1.5, 6);
    e.pearls = 3;
    const shellMat = U.emissiveMat(0x2f5e3f, 0x0f2f1f, 0.2);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 9), shellMat);
    shell.scale.set(1.25, 0.62, 1.1);
    shell.castShadow = true;
    e.grp.add(shell);
    // crystal armor spikes on shell
    const cMat = U.emissiveMat(0x8a2fb8, CORRUPT, 0.75, { transparent: true, opacity: 0.95 });
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 5), cMat);
      const a = (i / 6) * U.TAU;
      c.position.set(Math.cos(a) * 0.55, 0.62, Math.sin(a) * 0.55);
      c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      e.grp.add(c);
    }
    const skinMat = U.mat(0x5a8a4f);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), skinMat);
    head.position.set(1.35, -0.05, 0);
    e.grp.add(head);
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 4), U.emissiveMat(0xffdf9f, 0xff8f2f, 0));
    jaw.rotation.z = -Math.PI / 2;
    jaw.position.set(1.75, -0.08, 0);
    e.grp.add(jaw);
    e.jaw = jaw; e.head = head;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 5), skinMat);
    tail.rotation.z = Math.PI / 2;
    tail.position.set(-1.4, -0.1, 0);
    e.grp.add(tail);
    for (const [fx2, fz] of [[0.7, 0.85], [0.7, -0.85], [-0.7, 0.85], [-0.7, -0.85]]) {
      const fin = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 6), skinMat);
      fin.position.set(fx2, -0.35, fz);
      fin.scale.set(1.4, 0.4, 0.8);
      e.grp.add(fin);
    }
    collectMats(e);

    e.hit = function (dmg, kind, fromPos) {
      // armored from the front — attacks bounce off unless behind or while tired/flipped
      // (whirlpool surrounds the turtle, so it bypasses the armor)
      if (e.stun <= 0 && e.state !== 'tired' && kind !== 'whirl') {
        const fwd = U.v1.set(Math.sin(e.grp.rotation.y), 0, Math.cos(e.grp.rotation.y));
        const toAtk = U.v2.copy(fromPos).sub(e.pos).setY(0).normalize();
        if (fwd.dot(toAtk) > -0.15) {
          G.audio.play('crack');
          G.fx.burst(U.v3.copy(e.pos).add(fwd.multiplyScalar(1.2)), 0xd8d8ff, 6, 4);
          if (kind === 'blast' && e.state === 'windup') {   // blast interrupts the charge windup
            e.state = 'tired'; e.t = 0;
            G.audio.play('roar');
          }
          return;
        }
      }
      e.hp -= dmg * (e.state === 'tired' || e.stun > 0 ? 2 : 1);
      flashHit(e);
      G.audio.play('enemyHurt');
      if (kind === 'whirl') e.stun = 2.2;
      if (e.hp <= 0) die(e, { heartChance: 0.25 });
    };

    e.update = function (dt) {
      e.t += dt;
      if (e.stun > 0) {
        e.stun -= dt;
        e.grp.rotation.z = Math.PI * 0.14 + Math.sin(e.t * 16) * 0.06;  // flipped wobble
        return;
      }
      e.grp.rotation.z = 0;
      const d = playerDist(e);
      if (e.state === 'idle') {
        // slow patrol around home
        const a = e.t * 0.3;
        U.v1.set(e.home.x + Math.cos(a) * 4, 0, e.home.z + Math.sin(a) * 4).sub(e.pos).setY(0);
        if (U.v1.lengthSq() > 0.2) { U.v1.normalize(); e.vel.addScaledVector(U.v1, 3 * dt); }
        e.grp.rotation.y = U.angleDamp(e.grp.rotation.y, Math.atan2(e.vel.x, e.vel.z), 2, dt);
        if (d < 12) { e.state = 'track'; }
      } else if (e.state === 'track') {
        facePlayer(e, dt, 2.2);
        U.v1.copy(G.player.pos).sub(e.pos).setY(0).normalize();
        e.vel.addScaledVector(U.v1, 4 * dt);
        e.attackCd -= dt;
        if (e.attackCd <= 0 && d < 9) { e.state = 'windup'; e.t = 0; }
        if (d > 18) e.state = 'idle';
      } else if (e.state === 'windup') {
        // telegraph: jaw opens & glows
        facePlayer(e, dt, 3.5);
        e.jaw.material.emissiveIntensity = Math.min(e.t * 1.6, 1);
        e.jaw.scale.setScalar(1 + Math.min(e.t, 0.8) * 0.5);
        e.head.position.x = 1.35 - Math.min(e.t * 0.3, 0.25);
        if (e.t > 0.85) {
          e.state = 'charge'; e.t = 0;
          G.audio.play('roar');
          U.v1.set(Math.sin(e.grp.rotation.y), 0, Math.cos(e.grp.rotation.y));
          e.vel.copy(U.v1).multiplyScalar(16);
        }
      } else if (e.state === 'charge') {
        tryTouchDamage(e, dt, 2.3, 2);
        if (Math.random() < dt * 20) G.fx.trailDot(e.pos, 0xd8f0ff, 0.5, 0.4);
        if (e.t > 1.0) {
          e.state = 'tired'; e.t = 0;
          e.jaw.material.emissiveIntensity = 0;
          e.jaw.scale.setScalar(1);
          e.head.position.x = 1.35;
        }
      } else if (e.state === 'tired') {
        // vulnerable window — pants
        e.grp.position.y += Math.sin(e.t * 10) * 0.01;
        if (e.t > 1.8) { e.state = 'track'; e.attackCd = U.rand(2, 3.2); }
      }
      moveWithCollision(e, dt, 0.7);
    };
    return e;
  }

  // ================= ELECTRIC EEL =================
  function makeEel(x, z, path) {
    const e = baseEnemy('eel', x, z, 1.3, 8);
    e.pearls = 4;
    e.waterY = -1.2;
    e.path = path; e.pathIdx = 0;
    const headMat = U.emissiveMat(0x3a4a8a, 0x1f2f6f, 0.4);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 11, 9), headMat);
    head.scale.set(1.3, 0.9, 0.9);
    e.grp.add(head);
    for (let s = -1; s <= 1; s += 2) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 7), U.emissiveMat(0xffe95f, 0xffcf2f, 1));
      eye.position.set(0.4, 0.2, s * 0.3);
      e.grp.add(eye);
    }
    // trailing segments (independent meshes that follow)
    e.segs = [];
    const segMat = U.emissiveMat(0x4a5a9e, 0x2f3f7f, 0.35);
    const finMat = U.emissiveMat(0x7fd8ff, 0x4fc8ff, 0.5);
    for (let i = 0; i < 7; i++) {
      const sg = new THREE.Group();
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.5 - i * 0.05, 9, 7), segMat);
      s.scale.set(1.25, 0.85, 0.85);
      sg.add(s);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), finMat);
      fin.position.y = 0.45 - i * 0.04;
      sg.add(fin);
      sg.position.copy(e.pos);
      G.scene.add(sg);
      e.segs.push(sg);
    }
    // electric aura
    const aura = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0x9fdfff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    e.grp.add(aura);
    e.aura = aura;
    e.charged = false; e.cycleT = U.rand(0, 3);
    collectMats(e);
    e.onDie = () => e.segs.forEach(s => G.scene.remove(s));

    e.hit = function (dmg, kind, fromPos) {
      if (e.charged) {
        // touching a charged eel hurts YOU — attacks fizzle
        G.audio.play('zap');
        G.fx.burst(e.pos, 0x9fdfff, 8, 5);
        return;
      }
      e.hp -= dmg;
      flashHit(e);
      G.audio.play('enemyHurt');
      if (e.hp <= 0) die(e, { heartChance: 0.3 });
    };

    e.update = function (dt) {
      e.t += dt; e.cycleT += dt;
      // patrol along waypoints
      const wp = e.path[e.pathIdx];
      U.v1.set(wp[0], -1.2, wp[1]).sub(e.pos);
      if (U.v1.length() < 2) e.pathIdx = (e.pathIdx + 1) % e.path.length;
      U.v1.setY(0).normalize();
      const chase = playerDist(e) < 10 && !e.charged;
      if (chase) U.v1.copy(G.player.pos).sub(e.pos).setY(0).normalize();
      e.vel.addScaledVector(U.v1, 8 * dt);
      if (e.vel.length() > (e.charged ? 6.5 : 4.5)) e.vel.setLength(e.charged ? 6.5 : 4.5);
      e.pos.addScaledVector(e.vel, dt);
      const gh = G.world.heightAt(e.pos.x, e.pos.z);
      e.pos.y = U.damp(e.pos.y, Math.max(gh + 0.8, -2.2), 3, dt);
      e.grp.rotation.y = U.angleDamp(e.grp.rotation.y, Math.atan2(e.vel.x, e.vel.z), 5, dt);
      // segments follow with delay
      let prev = e.pos;
      for (const sg of e.segs) {
        U.v2.copy(prev).sub(sg.position);
        const dl = U.v2.length();
        if (dl > 0.62) sg.position.addScaledVector(U.v2.normalize(), (dl - 0.62) * Math.min(dt * 14, 1));
        sg.position.y += Math.sin(e.t * 4 + sg.position.x) * 0.004;
        prev = sg.position;
      }
      // charge cycle: 4s calm → 1s telegraph sparks → 2.5s charged field
      const cyc = e.cycleT % 7.5;
      if (cyc < 4) {
        e.charged = false;
        e.aura.material.opacity = 0;
      } else if (cyc < 5) {
        // telegraph
        e.charged = false;
        if (Math.random() < dt * 24) {
          G.fx.trailDot(U.v3.copy(e.pos).add(U.v2.set(U.rand(-1.4, 1.4), U.rand(-0.4, 1), U.rand(-1.4, 1.4))), 0xcfefff, 0.5, 0.25);
        }
        if (!e.warned) { G.audio.play('zap'); e.warned = true; }
      } else {
        if (!e.charged) { e.charged = true; G.audio.play('zap'); }
        e.warned = false;
        e.aura.material.opacity = 0.16 + Math.abs(Math.sin(e.t * 12)) * 0.14;
        if (playerDist(e) < 3.0) G.player.damage(1, e.pos);
      }
    };
    return e;
  }

  // ================= MUD GOBLIN =================
  function makeGoblin(x, z) {
    const e = baseEnemy('goblin', x, z, 0.8, 3);
    e.pearls = 2; e.stolen = 0;
    const mudMat = U.emissiveMat(0x6b4f2f, 0x3a2a12, 0.2);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), mudMat);
    body.scale.set(1, 1.15, 1);
    body.castShadow = true;
    e.grp.add(body);
    for (let s = -1; s <= 1; s += 2) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 5), mudMat);
      ear.position.set(s * 0.32, 0.62, 0);
      ear.rotation.z = -s * 0.7;
      e.grp.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 7), U.emissiveMat(0xffffff, 0xffdf7f, 0.9));
      eye.position.set(s * 0.22, 0.28, 0.42);
      e.grp.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), U.mat(0x221408));
      pupil.position.set(s * 0.22, 0.28, 0.53);
      e.grp.add(pupil);
    }
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 7), U.mat(0x9a8a5f));
    sack.position.set(-0.5, 0.15, -0.15);
    e.grp.add(sack);
    e.sack = sack;
    collectMats(e);

    e.hit = function (dmg, kind, fromPos) {
      e.hp -= dmg;
      flashHit(e);
      G.audio.play('goblin');
      knockback(e, fromPos, 7);
      if (e.hp <= 0) {
        // returns anything stolen, plus interest
        if (e.stolen > 0) {
          G.pickupSys.spawnPearl(e.pos, e.stolen + 2);
          G.ui.toast('💰 The mud goblin dropped your pearls!');
          e.pearls = 0;
        }
        die(e);
      }
    };

    e.update = function (dt) {
      e.t += dt;
      const d = playerDist(e);
      if (e.state === 'idle') {
        e.grp.position.y += Math.sin(e.t * 3) * 0.003;
        if (d < 14 && G.state.pearls > 0) { e.state = 'sneak'; G.audio.play('goblin'); }
      } else if (e.state === 'sneak') {
        // creep toward player, freeze-ish when looked at
        facePlayer(e, dt, 6);
        const camDir = U.v2; G.camera.getWorldDirection(camDir);
        const toGob = U.v3.copy(e.pos).sub(G.camera.position).normalize();
        const watched = camDir.dot(toGob) > 0.86;
        U.v1.copy(G.player.pos).sub(e.pos).setY(0).normalize();
        e.vel.addScaledVector(U.v1, (watched ? 2.2 : 7.5) * dt);
        if (e.vel.length() > (watched ? 1.6 : 4.6)) e.vel.setLength(watched ? 1.6 : 4.6);
        // sneaky wobble
        e.grp.rotation.z = Math.sin(e.t * 9) * 0.1;
        if (d < 1.6 && G.state.pearls > 0) {
          const grab = Math.min(3, G.state.pearls);
          G.state.pearls -= grab;
          e.stolen += grab;
          e.sack.scale.setScalar(1 + e.stolen * 0.12);
          e.state = 'flee'; e.fleeT = 9;
          G.audio.play('goblin');
          G.ui.toast(`🍄 A mud goblin stole ${grab} pearls! Catch it!`);
          G.ui.hud();
          G.fx.burst(e.pos, 0x9a8a5f, 12, 4);
        }
        if (d > 20) e.state = 'idle';
      } else if (e.state === 'flee') {
        e.fleeT -= dt;
        U.v1.copy(e.pos).sub(G.player.pos).setY(0).normalize();
        e.vel.addScaledVector(U.v1, 9 * dt);
        if (e.vel.length() > 5.6) e.vel.setLength(5.6);
        e.grp.rotation.y = Math.atan2(e.vel.x, e.vel.z);
        if (Math.random() < dt * 8) G.fx.trailDot(e.pos, 0x9a8a5f, 0.4, 0.4);
        if (e.fleeT <= 0) {
          // burrows away with the loot!
          G.fx.burst(e.pos, 0x6b4f2f, 20, 5);
          G.ui.toast('The goblin burrowed away with your pearls...');
          e.alive = false;
          G.scene.remove(e.grp);
        }
      }
      moveWithCollision(e, dt, 0.55);
    };
    return e;
  }

  // ================= Factory & update loop =================
  const factories = { crab: makeCrab, vine: makeVine, frog: makeFrog, swarm: makeSwarm, turtle: makeTurtle, eel: makeEel, goblin: makeGoblin };

  G.spawnEnemy = function (type, x, z, opts) {
    const e = factories[type](x, z, opts);
    G.enemies.push(e);
    return e;
  };

  G.updateEnemies = function (dt) {
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (!e.alive) { G.enemies.splice(i, 1); continue; }
      // skip far-away enemies for perf
      if (playerDist(e) > 70) continue;
      if (e.flash > 0) { e.flash -= dt; if (e.flash <= 0) unflash(e); }
      e.update(dt);
    }
  };
})();
