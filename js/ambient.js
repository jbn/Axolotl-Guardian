// Axolotl Guardian — ambient life: fish schools, dragonflies, birds, snails.
// Creatures that aren't for fighting or collecting — they just make the marsh alive.
G.ambient = (function () {
  const A = {};
  const schools = [];
  const dragonflies = [];
  const birds = [];
  const snails = [];
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);

  // ---------------- fish schools ----------------
  function makeSchool(cx, cz, n, color) {
    const geo = new THREE.OctahedronGeometry(0.14);
    geo.scale(0.55, 0.8, 2.3);
    const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    G.scene.add(mesh);
    const fish = [];
    for (let i = 0; i < n; i++) {
      fish.push({
        r: U.rand(1.5, 6), a: U.rand(0, U.TAU), sp: U.rand(0.7, 1.3),
        y: U.rand(-2.6, -0.9), ph: U.rand(0, 9),
        px: cx, py: -1.5, pz: cz,
      });
    }
    schools.push({ mesh, fish, cx, cz, t0: U.rand(0, 99), scared: 0 });
  }

  function updateSchool(s, dt, t) {
    // school centre wanders a slow loop; individuals orbit it
    const wx = s.cx + Math.cos(t * 0.11 + s.t0) * 14;
    const wz = s.cz + Math.sin(t * 0.083 + s.t0 * 1.7) * 14;
    const pp = G.player.pos;
    for (let i = 0; i < s.fish.length; i++) {
      const f = s.fish[i];
      f.a += f.sp * dt * (s.scared > 0 ? 2.6 : 1);
      let x = wx + Math.cos(f.a) * f.r;
      let z = wz + Math.sin(f.a) * f.r;
      let y = f.y + Math.sin(t * 2 + f.ph) * 0.3;
      // dart away from the player
      const dx = x - pp.x, dz = z - pp.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 30 && d2 > 0.01) {
        const d = Math.sqrt(d2), push = (5.5 - d) * 1.2;
        x += dx / d * push; z += dz / d * push;
        s.scared = 0.8;
      }
      const gh = G.world.heightAt(x, z);
      y = Math.max(y, gh + 0.5);
      y = Math.min(y, -0.45);
      const vx = x - f.px, vy = y - f.py, vz = z - f.pz;
      _e.set(U.clamp(-vy * 2, -0.5, 0.5), Math.atan2(vx, vz), Math.sin(t * 9 + f.ph) * 0.15);
      _q.setFromEuler(_e);
      _m4.compose(U.v1.set(x, y, z), _q, _s);
      s.mesh.setMatrixAt(i, _m4);
      f.px = x; f.py = y; f.pz = z;
    }
    s.scared = Math.max(0, s.scared - dt);
    s.mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------- dragonflies ----------------
  function makeDragonfly(hx, hz) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.42, 3, 6),
      new THREE.MeshLambertMaterial({ color: 0x3fc8d8, emissive: 0x1f8a9e, emissiveIntensity: 0.6 }));
    body.rotation.x = Math.PI / 2;
    grp.add(body);
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    const wings = [];
    for (const [sx, sz] of [[-1, 0.08], [1, 0.08], [-1, -0.08], [1, -0.08]]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.09), wingMat);
      w.position.set(sx * 0.18, 0.04, sz);
      w.rotation.z = sx * 0.25;
      grp.add(w);
      wings.push(w);
    }
    G.scene.add(grp);
    dragonflies.push({ grp, wings, hx, hz, tx: hx, ty: 1.2, tz: hz, retarget: 0, ph: U.rand(0, 9) });
  }

  function updateDragonfly(d, dt, t) {
    d.retarget -= dt;
    if (d.retarget <= 0) {
      d.retarget = U.rand(1.6, 3.5);
      d.tx = d.hx + U.rand(-20, 20);
      d.tz = d.hz + U.rand(-20, 20);
      d.ty = U.rand(0.6, 2.4);
    }
    const p = d.grp.position;
    const k = 1 - Math.exp(-2.2 * dt);
    p.x += (d.tx - p.x) * k;
    p.y += (d.ty + Math.sin(t * 3 + d.ph) * 0.2 - p.y) * k;
    p.z += (d.tz - p.z) * k;
    d.grp.rotation.y = U.angleDamp(d.grp.rotation.y, Math.atan2(d.tx - p.x, d.tz - p.z), 4, dt);
    const flap = Math.sin(t * 42 + d.ph) * 0.7;
    d.wings.forEach((w, i) => { w.rotation.x = flap * (i % 2 ? 1 : -1); });
  }

  // ---------------- birds ----------------
  function makeFlock(n) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x2e3a44, side: THREE.DoubleSide });
    const flock = { members: [], dir: U.rand(0, U.TAU), speed: U.rand(9, 13) };
    for (let i = 0; i < n; i++) {
      const grp = new THREE.Group();
      const wings = [];
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.45), mat);
        w.position.x = s * 0.72;
        grp.add(w);
        wings.push(w);
      }
      // V formation
      const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      grp.position.set(U.rand(-250, 250) + side * row * 3.2, U.rand(62, 88), U.rand(-250, 250) - row * 3.5);
      grp.userData = { wings, ph: i * 0.6 };
      G.scene.add(grp);
      flock.members.push(grp);
    }
    birds.push(flock);
  }

  function updateFlock(fl, dt, t) {
    const vis = (G.world.daylight || 0) > 0.25;
    const dx = Math.sin(fl.dir) * fl.speed * dt, dz = Math.cos(fl.dir) * fl.speed * dt;
    for (const b of fl.members) {
      b.visible = vis;
      b.position.x += dx;
      b.position.z += dz;
      if (b.position.x > 380) b.position.x = -380;
      if (b.position.x < -380) b.position.x = 380;
      if (b.position.z > 380) b.position.z = -380;
      if (b.position.z < -380) b.position.z = 380;
      b.rotation.y = fl.dir;
      const flap = Math.sin(t * 7 + b.userData.ph) * 0.55;
      b.userData.wings[0].rotation.x = flap;
      b.userData.wings[1].rotation.x = -flap;
    }
  }

  // ---------------- log snails ----------------
  function makeSnail(lx, lz, ry) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xc8b48a }));
    body.scale.set(1.0, 0.55, 2.0);
    body.position.y = 0.08;
    grp.add(body);
    const shell = G.assets.make('hat_shell', { cloneMats: false });
    shell.scale.setScalar(0.85);
    shell.position.set(0, 0.16, -0.05);
    grp.add(shell);
    const stalkMat = new THREE.MeshLambertMaterial({ color: 0xc8b48a });
    for (const s of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), stalkMat);
      st.position.set(s * 0.06, 0.22, 0.3);
      grp.add(st);
    }
    G.scene.add(grp);
    snails.push({ grp, lx, lz, ry, ph: U.rand(0, 9) });
  }

  function updateSnail(sn, t) {
    const along = Math.sin(t * 0.07 + sn.ph) * 2.5;
    const ax = Math.cos(sn.ry), az = -Math.sin(sn.ry);
    sn.grp.position.set(sn.lx + ax * along, 1.02, sn.lz + az * along);
    const fwd = Math.cos(t * 0.07 + sn.ph) >= 0 ? 1 : -1;
    sn.grp.rotation.y = Math.atan2(ax * fwd, az * fwd);
  }

  // ---------------- public ----------------
  A.init = function () {
    makeSchool(0, 150, 24, 0x8fc8e8);
    makeSchool(-4, 30, 22, 0xffd08a);
    makeSchool(52, -92, 20, 0xa8e8c0);
    for (const [hx, hz] of [[8, 155], [-20, 120], [10, 45], [-30, 15], [30, -20]]) makeDragonfly(hx, hz);
    makeFlock(5);
    makeFlock(4);
    makeSnail(6, 108, 0.4);
    makeSnail(-38, -40, 0.9);
  };

  A.update = function (dt) {
    const t = G.time;
    for (const s of schools) updateSchool(s, dt, t);
    for (const d of dragonflies) updateDragonfly(d, dt, t);
    for (const f of birds) updateFlock(f, dt, t);
    for (const sn of snails) updateSnail(sn, t);
  };

  return A;
})();
