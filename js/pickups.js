// Axolotl Guardian — pickups: spirit pearls, hearts, babies, relics, cosmetic chests
G.pickupSys = (function () {
  const P = {};
  const items = [];
  G.pickups = items;

  let pearlGeo, pearlMat, heartGeo, heartMat, relicGeo, relicMat;

  function initGeo() {
    pearlGeo = new THREE.SphereGeometry(0.32, 10, 8);
    pearlMat = U.emissiveMat(0xd8fbff, 0x7fe8ff, 1, { transparent: true, opacity: 0.95 });
    heartGeo = new THREE.SphereGeometry(0.34, 8, 8);
    heartMat = U.emissiveMat(0xff7a9e, 0xff3f7a, 0.9);
    relicGeo = new THREE.OctahedronGeometry(0.55);
    relicMat = U.emissiveMat(0xffd85f, 0xffb82f, 1);
  }

  function add(item) { items.push(item); G.scene.add(item.mesh); return item; }

  P.spawnPearl = function (pos, n = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(pearlGeo, pearlMat);
      m.position.copy(pos);
      m.position.x += U.rand(-0.8, 0.8); m.position.z += U.rand(-0.8, 0.8);
      m.position.y = Math.max(m.position.y + U.rand(0, 0.8), G.world.heightAt(m.position.x, m.position.z) + 0.5);
      add({
        kind: 'pearl', mesh: m, t: U.rand(0, 9), magnet: true,
        vx: U.rand(-2, 2), vy: U.rand(1, 3.4), vz: U.rand(-2, 2), scatter: 0.5,
      });
    }
  };

  P.spawnHeart = function (pos) {
    const grp = new THREE.Group();
    const s1 = new THREE.Mesh(heartGeo, heartMat); s1.position.x = -0.17;
    const s2 = new THREE.Mesh(heartGeo, heartMat); s2.position.x = 0.17;
    const s3 = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.55, 4), heartMat);
    s3.position.y = -0.4; s3.rotation.x = Math.PI; s3.rotation.y = Math.PI / 4;
    grp.add(s1, s2, s3);
    grp.scale.setScalar(0.8);
    grp.position.copy(pos);
    add({ kind: 'heart', mesh: grp, t: U.rand(0, 9), magnet: true });
  };

  P.spawnRelic = function (x, z, name) {
    const m = new THREE.Mesh(relicGeo, relicMat);
    m.position.set(x, Math.max(G.world.heightAt(x, z) + 1.1, 0.8), z);
    add({ kind: 'relic', mesh: m, t: 0, name });
  };

  // Baby axolotl: tiny pink friend that waits, then follows the player when rescued
  P.spawnBaby = function (x, z, name) {
    const grp = new THREE.Group();
    const bodyMat = U.emissiveMat(0xffb3c8, 0xff7fa5, 0.25);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 8), bodyMat);
    body.rotation.z = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), bodyMat);
    head.position.set(0.42, 0.02, 0);
    const gillMat = U.emissiveMat(0xff5f8e, 0xff3f6e, 0.5);
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 3; i++) {
        const g = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 4), gillMat);
        g.position.set(0.5 + i * -0.07, 0.14, s * (0.14 + i * 0.05));
        g.rotation.z = 0.8; g.rotation.x = s * 0.7;
        grp.add(g);
      }
    }
    const eyeMat = U.mat(0x222233);
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat); e1.position.set(0.58, 0.1, 0.13);
    const e2 = e1.clone(); e2.position.z = -0.13;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 5), bodyMat);
    tail.rotation.z = Math.PI / 2; tail.position.x = -0.52;
    grp.add(body, head, e1, e2, tail);
    const y = Math.max(G.world.heightAt(x, z) + 0.5, -1.2);
    grp.position.set(x, y, z);
    // little glow so they're findable
    const glow = new THREE.PointLight(0xff9fbf, 0.7, 7);
    grp.add(glow);
    add({ kind: 'baby', mesh: grp, t: U.rand(0, 9), name, rescued: false, followIdx: 0 });
  };

  // Treasure chest with a cosmetic inside
  P.spawnChest = function (x, z, cosmetic, label) {
    const grp = new THREE.Group();
    const wood = U.mat(0x8a5a32);
    const gold = U.emissiveMat(0xffd85f, 0xdd9f2f, 0.4);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), wood);
    base.position.y = 0.35;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.2, 8, 1, false, 0, Math.PI), wood);
    lid.rotation.z = Math.PI / 2; lid.position.y = 0.72;
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.1), gold);
    clasp.position.set(0, 0.55, 0.42);
    grp.add(base, lid, clasp);
    grp.position.set(x, G.world.heightAt(x, z) + 0.1, z);
    grp.rotation.y = U.rand(0, U.TAU);
    add({ kind: 'chest', mesh: grp, t: 0, cosmetic, label, opened: false, lid });
  };

  // ---------------- Update & collection ----------------
  P.update = function (dt) {
    const pp = G.player.pos;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.t += dt;
      const m = it.mesh;

      if (it.kind === 'pearl') {
        // scatter physics then float
        if (it.scatter > 0) {
          it.scatter -= dt;
          m.position.x += it.vx * dt; m.position.y += it.vy * dt; m.position.z += it.vz * dt;
          it.vy -= 9 * dt;
          const gh = G.world.heightAt(m.position.x, m.position.z) + 0.4;
          if (m.position.y < gh) { m.position.y = gh; it.vy = 0; }
        } else {
          m.position.y += Math.sin(it.t * 2.4) * 0.004;
        }
        m.rotation.y += dt * 2;
        // magnet toward player
        const d = m.position.distanceTo(pp);
        if (d < 5.5) {
          U.v1.copy(pp).sub(m.position).normalize().multiplyScalar(dt * (14 - d));
          m.position.add(U.v1);
        }
        if (d < 1.1) {
          G.state.pearls++;
          G.audio.play('pearl');
          G.fx.sparkle(m.position, 0x9fefff, 6);
          G.ui.hud();
          G.scene.remove(m); items.splice(i, 1);
          continue;
        }
      } else if (it.kind === 'heart') {
        m.position.y += Math.sin(it.t * 2.2) * 0.005;
        m.rotation.y += dt * 1.6;
        const d = m.position.distanceTo(pp);
        if (d < 5 && G.state.hearts < G.state.maxHearts) {
          U.v1.copy(pp).sub(m.position).normalize().multiplyScalar(dt * 10);
          m.position.add(U.v1);
        }
        if (d < 1.2) {
          if (G.state.hearts < G.state.maxHearts) {
            G.state.hearts++;
            G.audio.play('heart');
            G.fx.burst(m.position, 0xff7a9e, 12, 3);
            G.ui.hud();
            G.scene.remove(m); items.splice(i, 1);
          }
          continue;
        }
      } else if (it.kind === 'relic') {
        m.rotation.y += dt * 1.4;
        m.position.y += Math.sin(it.t * 2) * 0.005;
        if (Math.random() < dt * 3) G.fx.trailDot(m.position, 0xffd85f, 0.35, 0.6);
        if (m.position.distanceTo(pp) < 1.6) {
          G.state.relics++;
          G.audio.play('chest');
          G.fx.burst(m.position, 0xffd85f, 24, 5);
          G.ui.unlock('RELIC FOUND', `${it.name}  (${G.state.relics}/3 ancient relics)`);
          G.ui.hud();
          G.scene.remove(m); items.splice(i, 1);
          continue;
        }
      } else if (it.kind === 'baby') {
        if (!it.rescued) {
          // wiggle in place, cry for help sparkles
          m.rotation.y = Math.sin(it.t * 3) * 0.4;
          if (Math.random() < dt * 1.5) G.fx.sparkle(m.position, 0xffb3d8, 3, 0.4);
          if (m.position.distanceTo(pp) < 2) {
            it.rescued = true;
            G.state.babies.push(it);
            it.followIdx = G.state.babies.length;
            G.audio.play('baby');
            G.fx.burst(m.position, 0xffb3d8, 20, 4);
            G.ui.unlock('BABY RESCUED', `${it.name} joins you!  (${G.state.babies.length}/3 lost babies)`);
            G.ui.hud();
          }
        } else {
          // follow in a chain behind the player
          const target = U.v1.copy(pp);
          const back = it.followIdx * 1.4 + 1.2;
          target.x -= Math.sin(G.player.yaw) * -back;
          target.z -= Math.cos(G.player.yaw) * -back;
          target.y = Math.max(target.y - 0.3, G.world.heightAt(target.x, target.z) + 0.35);
          m.position.lerp(target, 1 - Math.exp(-3.2 * dt));
          m.rotation.y = U.angleDamp(m.rotation.y, G.player.yaw + Math.PI / 2, 6, dt);
          m.position.y += Math.sin(it.t * 5 + it.followIdx) * 0.01;
        }
      } else if (it.kind === 'chest') {
        if (!it.opened) {
          if (Math.random() < dt * 1.2) G.fx.trailDot(U.v1.copy(m.position).add(U.v2.set(0, 0.9, 0)), 0xffd85f, 0.3, 0.6);
          if (m.position.distanceTo(pp) < 2.2) {
            it.opened = true;
            it.lid.rotation.x = -1.2;
            G.audio.play('chest');
            G.fx.burst(U.v1.copy(m.position).add(U.v2.set(0, 1, 0)), 0xffd85f, 30, 6);
            G.player.addCosmetic(it.cosmetic);
            G.ui.unlock('TREASURE!', `${it.label} — press H to swap accessories`);
            P.spawnPearl(m.position, 3);
          }
        }
      }
    }
  };

  P.init = function () {
    initGeo();
    // ---- hand-placed collectibles across the world ----
    // ambient pearls: marsh intro trail
    const trail = [[0, 176], [-4, 165], [5, 155], [-7, 143], [3, 133], [10, 120], [-6, 112], [2, 100], [-3, 92]];
    for (const [x, z] of trail) P.spawnPearl(new THREE.Vector3(x, 0.6, z), 1);
    // forest pearls
    for (const [x, z] of [[-16, 62], [3, 48], [14, 20], [-30, 8], [22, -8], [-45, -6], [38, 30]])
      P.spawnPearl(new THREE.Vector3(x, 1.2, z), 1);
    // ruins + cavern pearls
    for (const [x, z] of [[50, -80], [72, -100], [58, -115], [-50, -85], [-70, -100], [-58, -118]])
      P.spawnPearl(new THREE.Vector3(x, 0.6, z), 1);

    // hearts
    P.spawnHeart(new THREE.Vector3(12, 0.7, 88));
    P.spawnHeart(new THREE.Vector3(-40, 0.7, 12));
    P.spawnHeart(new THREE.Vector3(56, 0.7, -96));
    P.spawnHeart(new THREE.Vector3(0, 0.7, -150));

    // babies: hidden in reeds (marsh), under forest log, cavern nook
    P.spawnBaby(34, 190, 'Pip');
    P.spawnBaby(-52, -12, 'Momo');
    P.spawnBaby(-84, -118, 'Bean');

    // relics
    P.spawnRelic(-52, 40, 'Lotus Crown Fragment');
    P.spawnRelic(88, 172, 'Sunstone Petal');          // challenge cave reward area
    P.spawnRelic(78, -128, 'Tidewoven Charm');

    // cosmetic chests
    P.spawnChest(22, 128, 'lilyhat', 'Lily Pad Hat');
    P.spawnChest(-66, -80, 'shell', 'Traveler\'s Snail Shell');
    P.spawnChest(46, -66, 'scarf', 'Sunset Scarf');
  };

  return P;
})();
