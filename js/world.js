// Axolotl Guardian — world: terrain, water, sky, vegetation, zones, gates, weather, day/night
G.world = (function () {
  const W = {};
  const SIZE = 520;               // terrain extent
  const colliders = [];           // {x, z, r} static cylinders
  W.colliders = colliders;
  W.gates = [];
  W.lilyPads = [];                // jumpable platforms {x, z, r, y}
  let waterMat, skyMat, sunLight, hemiLight, moonGlow;
  let rainPts, rainOn = false, rainVel = [];
  let caveCrystals = [], godRays = [], shrines = [];
  let terrainMesh;

  // ---------------- Zone layout ----------------
  const ZONES = {
    marsh:  { x: 0,   z: 150,  r: 95 },
    forest: { x: 0,   z: 20,   r: 95 },
    ruins:  { x: 62,  z: -95,  r: 62 },
    cavern: { x: -62, z: -95,  r: 58 },
    temple: { x: 0,   z: -200, r: 52 },
  };
  W.ZONES = ZONES;

  W.zoneAt = function (x, z) {
    let best = 'path', bd = 1e9;
    for (const k in ZONES) {
      const zo = ZONES[k];
      const d = U.dist2d(x, z, zo.x, zo.z) - zo.r;
      if (d < 0 && d < bd) { bd = d; best = k; }
    }
    return best;
  };

  // ---------------- Terrain height ----------------
  function bowl(x, z, cx, cz, r, depth) {
    const d = U.dist2d(x, z, cx, cz);
    if (d > r) return 0;
    const t = 1 - d / r;
    return depth * U.smoothstep(t);
  }

  W.heightAt = function (x, z) {
    // gentle banks with noise
    let h = U.fbm(x * 0.02 + 5, z * 0.02 + 9) * 6 - 1.6;
    // main channel down the middle (south to north)
    const chan = Math.max(0, 1 - Math.pow(Math.abs(x) / 26, 2));
    if (z > -235 && z < 235) h -= chan * 4.2;
    // zone bowls
    h -= bowl(x, z, ZONES.marsh.x, ZONES.marsh.z, ZONES.marsh.r, 4.5);
    h -= bowl(x, z, ZONES.forest.x, ZONES.forest.z, ZONES.forest.r, 6.0);
    h -= bowl(x, z, ZONES.ruins.x, ZONES.ruins.z, ZONES.ruins.r, 5.5);
    h -= bowl(x, z, ZONES.cavern.x, ZONES.cavern.z, ZONES.cavern.r, 6.5);
    h -= bowl(x, z, ZONES.temple.x, ZONES.temple.z, ZONES.temple.r, 8.0);
    // challenge cave pit (east marsh)
    h -= bowl(x, z, 88, 172, 16, 5);
    // world edge walls
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (edge > 215) h += Math.pow((edge - 215) / 30, 2) * 26;
    return h;
  };

  W.waterDepthAt = function (x, z) { return Math.max(0, -W.heightAt(x, z)); };

  // Resolve a position against cylinder colliders; mutates and returns pos
  W.collide = function (pos, radius) {
    for (const c of colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const rr = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = c.x + dx / d * rr;
        pos.z = c.z + dz / d * rr;
      }
    }
    pos.x = U.clamp(pos.x, -230, 230);
    pos.z = U.clamp(pos.z, -232, 230);
    return pos;
  };

  // ---------------- Build helpers ----------------
  function addCollider(x, z, r) { colliders.push({ x, z, r }); }

  function makeTerrain() {
    const seg = 190;
    const g = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colArr = new Float32Array(pos.count * 3);
    const cSand = new THREE.Color(0xc9b478), cGrass = new THREE.Color(0x5fae4e),
          cDeep = new THREE.Color(0x2e6b52), cMoss = new THREE.Color(0x4a8f57),
          cCave = new THREE.Color(0x5a5f86), cTemple = new THREE.Color(0x7d9282);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = W.heightAt(x, z);
      pos.setY(i, h);
      const zone = W.zoneAt(x, z);
      let c;
      if (h < -3.2) c = cDeep;
      else if (h < -0.4) c = cSand.clone().lerp(cDeep, U.clamp((-h - 0.4) / 3, 0, 1));
      else c = cSand.clone().lerp(cGrass, U.clamp(h / 1.4, 0, 1));
      if (zone === 'cavern' && h < 1) c = c.clone().lerp(cCave, 0.65);
      if (zone === 'temple' && h < 1) c = c.clone().lerp(cTemple, 0.55);
      if (zone === 'ruins' && h < 1) c = c.clone().lerp(cMoss, 0.4);
      const n = U.fbm(x * 0.11, z * 0.11) * 0.22;
      colArr[i * 3] = U.clamp(c.r + n - 0.11, 0, 1);
      colArr[i * 3 + 1] = U.clamp(c.g + n - 0.11, 0, 1);
      colArr[i * 3 + 2] = U.clamp(c.b + n - 0.11, 0, 1);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    terrainMesh = new THREE.Mesh(g, m);
    terrainMesh.receiveShadow = true;
    G.scene.add(terrainMesh);
  }

  function makeWater() {
    const g = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1);
    g.rotateX(-Math.PI / 2);
    waterMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uShallow: { value: new THREE.Color(0x49c8d8) },
        uDeepC: { value: new THREE.Color(0x1a6f9c) },
        uSunFactor: { value: 1.0 },
      },
      vertexShader: `
        varying vec3 vWorld;
        uniform float uTime;
        void main() {
          vec3 p = position;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        varying vec3 vWorld;
        uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeepC; uniform float uSunFactor;
        void main() {
          float w1 = sin(vWorld.x * 0.25 + uTime * 1.1) * sin(vWorld.z * 0.21 - uTime * 0.9);
          float w2 = sin(vWorld.x * 0.61 - uTime * 1.7 + vWorld.z * 0.43);
          float shimmer = w1 * 0.5 + w2 * 0.5;
          vec3 col = mix(uDeepC, uShallow, 0.58 + shimmer * 0.2);
          // fine sparkle highlights
          float sp = smoothstep(0.88, 1.0, sin(vWorld.x * 4.3 + uTime * 2.2) * sin(vWorld.z * 4.9 - uTime * 1.7));
          col += vec3(0.9, 0.98, 1.0) * sp * 0.4 * uSunFactor;
          col *= (0.55 + 0.5 * uSunFactor);
          gl_FragColor = vec4(col, 0.58);
        }`,
    });
    const mesh = new THREE.Mesh(g, waterMat);
    mesh.position.y = 0;
    mesh.renderOrder = 1;
    G.scene.add(mesh);
  }

  function makeSky() {
    skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x3fa7dd) },
        uBottom: { value: new THREE.Color(0xcfeef7) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec3 vPos; uniform vec3 uTop; uniform vec3 uBottom;
        void main() {
          float t = clamp(normalize(vPos).y * 1.4 + 0.25, 0.0, 1.0);
          gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 14), skyMat);
    G.scene.add(sky);
  }

  // ---------------- Vegetation & props ----------------
  function instancedFromGeo(geoList, mat, transforms, castShadow) {
    // merge simple: create one InstancedMesh per geometry
    const meshes = [];
    for (const geo of geoList) {
      const im = new THREE.InstancedMesh(geo, mat, transforms.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
      transforms.forEach((t, i) => {
        e.set(t.rx || 0, t.ry || 0, t.rz || 0);
        q.setFromEuler(e);
        s.setScalar(t.s || 1);
        if (t.sy) s.y = t.sy;
        m4.compose(new THREE.Vector3(t.x, t.y, t.z), q, s);
        im.setMatrixAt(i, m4);
      });
      im.castShadow = !!castShadow;
      im.instanceMatrix.needsUpdate = true;
      G.scene.add(im);
      meshes.push(im);
    }
    return meshes;
  }

  function scatterOnBank(count, minH, maxH, fn, avoid) {
    let placed = 0, guard = 0;
    while (placed < count && guard++ < count * 40) {
      const x = U.rand(-215, 215), z = U.rand(-215, 215);
      const h = W.heightAt(x, z);
      if (h < minH || h > maxH) continue;
      if (avoid && avoid(x, z)) continue;
      fn(x, z, h);
      placed++;
    }
  }

  function makeVegetation() {
    // Reeds (Blender asset, instanced)
    const reedAsset = G.assets.geo('reed');
    const reeds = [];
    scatterOnBank(550, -0.35, 1.6, (x, z, h) => {
      const n = U.randInt(2, 4);
      for (let i = 0; i < n; i++)
        reeds.push({ x: x + U.rand(-0.9, 0.9), y: h - 0.15, z: z + U.rand(-0.9, 0.9), ry: U.rand(0, U.TAU), rz: U.rand(-0.14, 0.14), s: U.rand(0.6, 1.3) });
    }, (x, z) => W.zoneAt(x, z) === 'temple' || W.zoneAt(x, z) === 'cavern');
    instancedFromGeo([reedAsset.geometry], reedAsset.material, reeds);

    // Cattails
    const catAsset = G.assets.geo('cattail');
    const cattails = [];
    scatterOnBank(160, -0.5, 0.9, (x, z, h) => cattails.push({ x, y: h - 0.1, z, ry: U.rand(0, U.TAU), rz: U.rand(-0.1, 0.1), s: U.rand(0.8, 1.35) }),
      (x, z) => W.zoneAt(x, z) === 'temple');
    instancedFromGeo([catAsset.geometry], catAsset.material, cattails);

    // Trees (Blender marsh willows, two variants)
    scatterOnBank(46, 0.5, 3.2, (x, z, h) => {
      const grp = G.assets.make(Math.random() < 0.55 ? 'tree' : 'tree2', { cloneMats: false });
      const s = U.rand(0.8, 1.6);
      grp.scale.setScalar(s);
      grp.position.set(x, h - 0.2, z);
      grp.rotation.y = U.rand(0, U.TAU);
      G.scene.add(grp);
      addCollider(x, z, 0.75 * s);
    }, (x, z) => W.zoneAt(x, z) === 'temple' || W.zoneAt(x, z) === 'cavern' || Math.abs(x) < 12);

    // Rocks (mossy boulders, two variants)
    scatterOnBank(90, -2.5, 2.5, (x, z, h) => {
      const r = G.assets.make(Math.random() < 0.5 ? 'rock' : 'rock2', { cloneMats: false });
      const s = U.rand(0.5, 2.2);
      r.scale.set(s, s * U.rand(0.6, 1), s);
      r.position.set(x, h - s * 0.15, z);
      r.rotation.y = U.rand(0, U.TAU);
      G.scene.add(r);
      if (s > 1.1) addCollider(x, z, s * 0.85);
    });

    // Lily pads — small decorative (instanced) + big jumpable platforms
    const padAsset = G.assets.geo('lilypad');
    const smallPads = [];
    scatterOnBank(150, -5, -0.25, (x, z, h) => {
      smallPads.push({ x, y: 0.03, z, ry: U.rand(0, U.TAU), s: U.rand(0.5, 1.2) });
      if (Math.random() < 0.22) {
        const f = G.assets.make('lotus', { cloneMats: false });
        f.position.set(x, 0.08, z);
        f.rotation.y = U.rand(0, U.TAU);
        G.scene.add(f);
      }
    }, (x, z) => W.zoneAt(x, z) === 'temple');
    instancedFromGeo([padAsset.geometry], padAsset.material, smallPads);

    // Giant pads (platforms) placed by hand through the forest + some in marsh
    const giantPads = [
      [0, 168, 2.6], [-8, 148, 2.2], [9, 130, 2.4],                        // marsh hoppers
      [-16, 62, 3.2], [3, 48, 3.6], [-24, 34, 3.0], [14, 20, 4.2],
      [-6, 2, 3.4], [22, -8, 3.0], [-30, 8, 2.8], [-45, -6, 3.2],
      [38, 30, 2.8], [-52, 40, 2.6],
    ];
    for (const [x, z, r] of giantPads) {
      const p = G.assets.make('lilypad_big', { cloneMats: false });
      p.scale.set(r, 1.2, r);
      p.position.set(x, 0.05, z);
      p.rotation.y = U.rand(0, U.TAU);
      p.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
      G.scene.add(p);
      W.lilyPads.push({ x, z, r: r * 0.92, y: 0.14, mesh: p, bob: U.rand(0, 6) });
      if (Math.random() < 0.5) {
        const f = G.assets.make('lotus', { cloneMats: false });
        f.scale.setScalar(1.8);
        f.position.set(x + r * 0.5, 0.3, z + r * 0.3);
        f.rotation.y = U.rand(0, U.TAU);
        G.scene.add(f);
      }
    }

    // Fallen logs (platforms)
    const logs = [[6, 108, 0.4], [-14, 96, -0.3], [30, -30, 0.2], [-38, -40, 0.9], [52, -60, 0.1]];
    for (const [x, z, ry] of logs) {
      const l = G.assets.make('log', { cloneMats: false });
      l.rotation.y = ry;
      l.position.set(x, 0.35, z);
      G.scene.add(l);
      W.lilyPads.push({ x, z, r: 3.2, y: 0.95, mesh: null, bob: 0, isLog: true, ry });
    }
  }

  // ---------------- Ruins, cavern, temple ----------------
  function column(x, z, h, broken, radius = 0.9) {
    // Blender column: unit-height 'shaft' stretched to h, 'cap'/'base' scaled to radius
    const grp = G.assets.make(broken ? 'column_broken' : 'column', { cloneMats: false });
    const shaft = grp.getObjectByName('shaft');
    shaft.scale.set(radius, h, radius);
    if (broken) shaft.rotation.z = U.rand(-0.1, 0.1);
    const cap = grp.getObjectByName('cap');
    if (cap) { cap.position.y = h; cap.scale.setScalar(radius); }
    const base = grp.getObjectByName('base');
    if (base) base.scale.set(radius, 1, radius);
    const rubble = grp.getObjectByName('rubble');
    if (rubble) { rubble.scale.setScalar(radius); rubble.rotation.y = U.rand(0, U.TAU); }
    // sink base below the analytic height — the render mesh can sit lower on steep slopes
    const gh = W.heightAt(x, z) - 1.4;
    grp.position.set(x, gh, z);
    G.scene.add(grp);
    addCollider(x, z, radius + 0.25);
    return grp;
  }

  function makeRuins() {
    const zc = ZONES.ruins;
    // ring of mossy columns + broken walls
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * U.TAU;
      const r = zc.r * 0.62;
      column(zc.x + Math.cos(a) * r, zc.z + Math.sin(a) * r, U.rand(3, 6.5), Math.random() < 0.45);
    }
    const wallMat = U.mat(0x8a9a89);
    for (let i = 0; i < 6; i++) {
      const a = U.rand(0, U.TAU), r = U.rand(14, zc.r * 0.85);
      const x = zc.x + Math.cos(a) * r, z = zc.z + Math.sin(a) * r;
      const w = new THREE.Mesh(new THREE.BoxGeometry(U.rand(4, 8), U.rand(1.5, 3.5), 1.1), wallMat);
      w.position.set(x, W.heightAt(x, z) + 0.8, z);
      w.rotation.y = U.rand(0, U.TAU);
      w.castShadow = true;
      G.scene.add(w);
      addCollider(x, z, 2.4);
    }
    // arch gateway into ruins: two carved columns + a lintel
    const arch = new THREE.Group();
    for (const px of [-3.4, 3.4]) {
      const col = G.assets.make('column', { cloneMats: false });
      col.getObjectByName('shaft').scale.set(0.55, 6.6, 0.55);
      col.getObjectByName('cap').position.y = 6.6;
      col.getObjectByName('cap').scale.setScalar(0.55);
      col.getObjectByName('base').scale.set(0.6, 1, 0.6);
      col.position.x = px;
      arch.add(col);
    }
    const top = G.assets.make('lintel', { cloneMats: false });
    top.scale.set(9.2, 2.2, 2.6);
    top.position.y = 7.15;
    arch.add(top);
    arch.position.set(34, W.heightAt(34, -68) - 0.6, -68);
    arch.rotation.y = 0.7;
    G.scene.add(arch);
  }

  function makeCavern() {
    const zc = ZONES.cavern;
    // Crystal clusters — ambient teal + a few corrupted magenta
    for (let i = 0; i < 42; i++) {
      const a = U.rand(0, U.TAU), r = U.rand(4, zc.r * 0.95);
      const x = zc.x + Math.cos(a) * r, z = zc.z + Math.sin(a) * r;
      const corrupted = Math.random() < 0.25;
      const grp = G.assets.make(corrupted ? 'crystal_dark' : 'crystal', { cloneMats: false });
      const s = U.rand(0.7, 1.9);
      grp.scale.set(s, s * U.rand(0.9, 1.6), s);
      grp.rotation.y = U.rand(0, U.TAU);
      grp.position.set(x, W.heightAt(x, z) - 0.1, z);
      G.scene.add(grp);
      caveCrystals.push(grp);
      if (Math.random() < 0.4) addCollider(x, z, 1.2);
    }
    // slender stone arches overhead for cave feel
    const archMat = U.emissiveMat(0x8a8fb8, 0x3a3f66, 0.25);
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(U.rand(9, 14), U.rand(0.9, 1.5), 7, 18, Math.PI), archMat);
      const a = U.rand(0, U.TAU), r = U.rand(6, 26);
      t.position.set(zc.x + Math.cos(a) * r, U.rand(-1, 1), zc.z + Math.sin(a) * r);
      t.rotation.set(0, U.rand(0, U.TAU), 0);
      t.castShadow = true;
      G.scene.add(t);
    }
    // moody cavern glow lights
    const teal = new THREE.PointLight(0x3fd8d4, 1.1, 55);
    teal.position.set(zc.x, 6, zc.z);
    const magenta = new THREE.PointLight(0xb03fe8, 0.9, 45);
    magenta.position.set(zc.x - 18, 4, zc.z + 12);
    G.scene.add(teal, magenta);
    // glow mushrooms
    for (let i = 0; i < 30; i++) {
      const a = U.rand(0, U.TAU), r = U.rand(3, zc.r);
      const x = zc.x + Math.cos(a) * r, z = zc.z + Math.sin(a) * r;
      const h = W.heightAt(x, z);
      if (h > 0.5) continue;
      const grp = G.assets.make('mushroom', { cloneMats: false });
      grp.scale.setScalar(U.rand(0.7, 2.0));
      grp.rotation.y = U.rand(0, U.TAU);
      grp.position.set(x, h, z);
      G.scene.add(grp);
    }
    makeGodRays(zc.x, zc.z, 4, 0x7fe8ff);
  }

  function makeGodRays(cx, cz, n, color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (let i = 0; i < n; i++) {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(U.rand(1, 2.2), U.rand(3.5, 6), 34, 8, 1, true), mat);
      cone.position.set(cx + U.rand(-24, 24), 12, cz + U.rand(-24, 24));
      cone.rotation.z = U.rand(-0.12, 0.12);
      G.scene.add(cone);
      godRays.push(cone);
    }
  }

  function makeTemple() {
    const zc = ZONES.temple;
    // circular arena of columns
    W.templePillars = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * U.TAU;
      const r = zc.r * 0.75;
      const x = zc.x + Math.cos(a) * r, z = zc.z + Math.sin(a) * r;
      const col = column(x, z, U.rand(7, 10), i % 3 === 0, 1.15);
      W.templePillars.push({ x, z, mesh: col, alive: true });
    }
    // grand entry arch + steps at (0,-160)
    const grand = new THREE.Group();
    for (const px of [-5.5, 5.5]) {
      const col = G.assets.make('column', { cloneMats: false });
      col.getObjectByName('shaft').scale.set(0.95, 10.6, 0.95);
      col.getObjectByName('cap').position.y = 10.6;
      col.getObjectByName('cap').scale.setScalar(0.95);
      col.position.x = px;
      grand.add(col);
    }
    const gtop = G.assets.make('lintel', { cloneMats: false });
    gtop.scale.set(15.5, 3.6, 3.2);
    gtop.position.y = 11.35;
    grand.add(gtop);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), U.emissiveMat(0xb03fe8, 0xd05fff, 1));
    gem.position.y = 14.4;
    grand.add(gem);
    grand.position.set(0, W.heightAt(0, -158) - 1.2, -158);
    G.scene.add(grand);
    W.templeGem = gem;
    addCollider(-5.5, -158, 1.4); addCollider(5.5, -158, 1.4);
    // altar in center (boss cleansing point)
    const altar = G.assets.make('altar', { cloneMats: false });
    altar.scale.set(3.5, 1.35, 3.5);
    altar.position.set(zc.x, W.heightAt(zc.x, zc.z) - 0.1, zc.z);
    altar.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    G.scene.add(altar);
    // corrupted crystals around arena
    const shardAsset = G.assets.geo('crystal_shard');
    W.templeCrystals = [];
    for (let i = 0; i < 10; i++) {
      const a = U.rand(0, U.TAU), r = U.rand(10, zc.r * 0.9);
      const x = zc.x + Math.cos(a) * r, z = zc.z + Math.sin(a) * r;
      const c = new THREE.Mesh(shardAsset.geometry, shardAsset.material.clone());
      const s = U.rand(0.9, 2.2);
      c.scale.set(s, s * U.rand(1.1, 1.9), s);
      c.position.set(x, W.heightAt(x, z) - 0.2, z);
      c.rotation.y = U.rand(0, U.TAU);
      c.castShadow = true;
      G.scene.add(c);
      W.templeCrystals.push(c);
    }
    makeGodRays(zc.x, zc.z, 5, 0xd8bfff);
  }

  // ---------------- Gates ----------------
  function makeGate(x, z, ry, need, name, ability, desc) {
    const grp = new THREE.Group();
    const p1 = G.assets.make('gatepost', { cloneMats: false });
    p1.position.set(-6, 0, 0);
    const p2 = G.assets.make('gatepost', { cloneMats: false });
    p2.position.set(6, 0, 0);
    p2.rotation.y = Math.PI * 0.7;
    const orb1 = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), U.emissiveMat(0x7fe8ff, 0x4fd8ff, 1));
    orb1.position.set(-6, 8.4, 0);
    const orb2 = orb1.clone(); orb2.position.x = 6;
    grp.add(p1, p2, orb1, orb2);
    const barrierMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uOpen: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv; uniform float uTime; uniform float uOpen;
        void main(){
          float bands = sin(vUv.y * 26.0 + uTime * 3.0) * 0.5 + 0.5;
          float a = (0.24 + bands * 0.22) * (1.0 - uOpen);
          a *= smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          gl_FragColor = vec4(0.45, 0.9, 1.0, a);
        }`,
    });
    const barrier = new THREE.Mesh(new THREE.PlaneGeometry(12, 8.2), barrierMat);
    barrier.position.y = 4.1;
    grp.add(barrier);
    const gh = Math.min(W.heightAt(x, z), -0.4);
    grp.position.set(x, gh, z);
    grp.rotation.y = ry;
    G.scene.add(grp);
    const gate = {
      x, z, need, name, ability, desc, open: false, grp, barrierMat,
      orbs: [orb1, orb2], openT: 0,
      colliderA: { x: x - Math.cos(ry) * 6, z: z + Math.sin(ry) * 6, r: 1.2 },
      colliderB: { x: x + Math.cos(ry) * 6, z: z - Math.sin(ry) * 6, r: 1.2 },
      blocker: { x, z, r: 6.5 },
    };
    colliders.push(gate.colliderA, gate.colliderB, gate.blocker);
    W.gates.push(gate);
    return gate;
  }

  // Ability shrines (visual pedestal where unlocks happen)
  function makeShrine(x, z, color) {
    const grp = new THREE.Group();
    const base = G.assets.make('shrine', { cloneMats: false });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), U.emissiveMat(color, color, 1, { transparent: true, opacity: 0.95 }));
    orb.position.y = 1.7;
    grp.add(base, orb);
    grp.position.set(x, Math.max(W.heightAt(x, z), -0.6), z);
    G.scene.add(grp);
    shrines.push({ grp, orb, t: U.rand(0, 9) });
    return grp;
  }

  // ---------------- Day / night + weather ----------------
  const env = {
    t: 0.32,                 // 0..1 day phase (0.32 = bright morning)
    daySpeed: 1 / 560,       // full cycle ≈ 9.3 min
    rainTimer: 75,           // first rain event
    raining: false, rainLeft: 0, lightningT: 0,
  };
  W.env = env;

  const SKY_KEYS = [
    // t, top, bottom, sun, sunIntensity, fog
    [0.00, 0x0a1a3a, 0x18304a, 0x8fb0ff, 0.10, 0x0e2233],
    [0.20, 0x2f6f9e, 0xffc98a, 0xffd9a0, 0.55, 0x9fc8c8],
    [0.30, 0x3fa7dd, 0xcfeef7, 0xfff2d8, 1.00, 0xbfe8ef],
    [0.50, 0x3fb2e8, 0xd8f4fa, 0xffffff, 1.10, 0xc8eef2],
    [0.70, 0x3f9ad0, 0xffd9a8, 0xffe8c0, 0.85, 0xbfe0e0],
    [0.80, 0x9a4f7a, 0xff9f6a, 0xffb070, 0.45, 0x8f7a8a],
    [0.90, 0x11224a, 0x2a3a5e, 0x9fb8ff, 0.12, 0x14263a],
    [1.00, 0x0a1a3a, 0x18304a, 0x8fb0ff, 0.10, 0x0e2233],
  ];
  const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color(), _c4 = new THREE.Color();

  function skyLerp(t) {
    let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      if (t >= SKY_KEYS[i][0] && t <= SKY_KEYS[i + 1][0]) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
    }
    const f = (t - a[0]) / Math.max(b[0] - a[0], 0.0001);
    return {
      top: _c1.set(a[1]).lerp(_c2.set(b[1]), f).clone(),
      bottom: _c3.set(a[2]).lerp(_c4.set(b[2]), f).clone(),
      sun: new THREE.Color(a[3]).lerp(new THREE.Color(b[3]), f),
      intensity: U.lerp(a[4], b[4], f),
      fog: new THREE.Color(a[5]).lerp(new THREE.Color(b[5]), f),
    };
  }

  function makeLights() {
    hemiLight = new THREE.HemisphereLight(0xbfe8ff, 0x3f6f4a, 0.75);
    G.scene.add(hemiLight);
    sunLight = new THREE.DirectionalLight(0xfff2d8, 1);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    const sc = sunLight.shadow.camera;
    sc.near = 10; sc.far = 220;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
    sunLight.shadow.bias = -0.0008;
    G.scene.add(sunLight);
    G.scene.add(sunLight.target);
    moonGlow = new THREE.PointLight(0x8fb8ff, 0, 60);
    G.scene.add(moonGlow);
  }

  function makeRain() {
    const N = 900;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = U.rand(-60, 60); pos[i * 3 + 1] = U.rand(0, 40); pos[i * 3 + 2] = U.rand(-60, 60);
      rainVel.push(U.rand(26, 40));
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xaaccee, size: 0.18, transparent: true, opacity: 0.55, depthWrite: false });
    rainPts = new THREE.Points(g, m);
    rainPts.visible = false;
    rainPts.frustumCulled = false;
    G.scene.add(rainPts);
  }

  // ---------------- Public build ----------------
  W.build = function () {
    G.scene.fog = new THREE.FogExp2(0xbfe8ef, 0.0088);
    makeSky();
    makeLights();
    makeTerrain();
    makeWater();
    makeVegetation();
    makeRuins();
    makeCavern();
    makeTemple();
    makeRain();

    // Gates: Lily Gate (marsh→forest), Ruin Gate (forest→ruins/cavern), Temple Gate
    makeGate(0, 82, 0, 6, 'Lily Gate', 'blast', 'WATER BLAST unlocked!  Hold RMB to charge, release to fire.');
    makeGate(0, -46, 0, 16, 'Mossgate', 'shield', 'BUBBLE SHIELD unlocked!  Press Q to block attacks.');
    makeGate(0, -158, 0, 26, 'Temple Seal', null, null);

    makeShrine(-14, 40, 0x4fd8ff);   // decorative shrines
    makeShrine(60, -90, 0x7fffd0);
    W.whirlShrine = makeShrine(14, -6, 0xffd85f); // whirlpool unlock spot (forest event)

    // challenge cave marker (glowing ring of stones east marsh)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * U.TAU;
      const s = G.assets.make('stone_marker', { cloneMats: false });
      s.rotation.y = U.rand(0, U.TAU);
      s.position.set(88 + Math.cos(a) * 10, W.heightAt(88 + Math.cos(a) * 10, 172 + Math.sin(a) * 10) - 0.2, 172 + Math.sin(a) * 10);
      G.scene.add(s);
    }
  };

  // Try to open gates when player near; returns gate object if just opened
  W.tryGates = function () {
    for (const g of W.gates) {
      if (g.open) continue;
      const d = U.dist2d(G.player.pos.x, G.player.pos.z, g.x, g.z);
      if (d < 14) {
        if (G.state.pearls >= g.need) {
          g.open = true; g.openT = 0;
          const bi = colliders.indexOf(g.blocker);
          if (bi >= 0) colliders.splice(bi, 1);
          return g;
        } else if (!g.hinted || G.time - g.hinted > 5) {
          g.hinted = G.time;
          G.ui.toast(`${g.name} needs ${g.need} spirit pearls  (you have ${G.state.pearls})`);
        }
      }
    }
    return null;
  };

  W.padUnder = function (x, z) {
    for (const p of W.lilyPads) {
      if (U.dist2d(x, z, p.x, p.z) < p.r) return p;
    }
    return null;
  };

  // ---------------- Frame update ----------------
  W.update = function (dt) {
    const t = G.time;
    if (waterMat) waterMat.uniforms.uTime.value = t;

    // day / night
    env.t = (env.t + dt * env.daySpeed) % 1;
    const sk = skyLerp(env.t);
    const rainDim = env.raining ? 0.55 : 1;
    skyMat.uniforms.uTop.value.copy(sk.top).multiplyScalar(rainDim);
    skyMat.uniforms.uBottom.value.copy(sk.bottom).multiplyScalar(rainDim);
    G.scene.fog.color.copy(sk.fog).multiplyScalar(rainDim);
    // underwater tint
    const underwater = G.camera.position.y < -0.15;
    G.scene.fog.density = underwater ? 0.028 : (env.raining ? 0.012 : 0.0088);
    if (underwater) G.scene.fog.color.set(0x1a6f9c).multiplyScalar(0.55 + sk.intensity * 0.4);

    const sunA = (env.t - 0.25) * U.TAU; // sunrise east
    const px = G.player ? G.player.pos.x : 0, pz = G.player ? G.player.pos.z : 0;
    sunLight.position.set(px + Math.cos(sunA) * 90, Math.sin(sunA) * 110 + 12, pz + 40);
    sunLight.target.position.set(px, 0, pz);
    sunLight.intensity = Math.max(0.04, sk.intensity) * rainDim;
    sunLight.color.copy(sk.sun);
    hemiLight.intensity = (0.28 + sk.intensity * 0.55) * rainDim;
    if (waterMat) waterMat.uniforms.uSunFactor.value = sk.intensity * rainDim;
    const night = sk.intensity < 0.3;
    moonGlow.intensity = night ? 0.7 : 0;
    if (G.player) moonGlow.position.set(px, 8, pz);

    // fireflies at night near the player
    if (night && !underwater && Math.random() < dt * 6) {
      G.fx.trailDot(U.v1.set(px + U.rand(-16, 16), U.rand(0.5, 4), pz + U.rand(-16, 16)), 0xbfff7a, U.rand(0.25, 0.5), 1.4);
    }

    // weather
    if (!env.raining) {
      env.rainTimer -= dt;
      if (env.rainTimer <= 0) {
        env.raining = true; env.rainLeft = U.rand(30, 45);
        rainPts.visible = true;
        G.ui.toast('☔ A crystal-rain drifts over the marsh...');
      }
    } else {
      env.rainLeft -= dt;
      env.lightningT -= dt;
      if (env.lightningT <= 0) {
        env.lightningT = U.rand(4, 11);
        hemiLight.intensity = 1.6;
        G.audio.play('thunder');
      }
      if (env.rainLeft <= 0) {
        env.raining = false; rainPts.visible = false;
        env.rainTimer = U.rand(140, 220);
      }
      // move rain
      const pos = rainPts.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - rainVel[i] * dt;
        if (y < 0) {
          y = U.rand(24, 40);
          pos.setX(i, px + U.rand(-55, 55));
          pos.setZ(i, pz + U.rand(-55, 55));
        }
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    // animated props
    for (const p of W.lilyPads) {
      if (p.mesh) p.mesh.position.y = 0.05 + Math.sin(t * 1.1 + p.bob) * 0.06;
    }
    for (const s of shrines) {
      s.orb.position.y = 1.7 + Math.sin(t * 1.8 + s.t) * 0.18;
      s.orb.rotation.y = t * 0.8;
    }
    for (const g of W.gates) {
      g.barrierMat.uniforms.uTime.value = t;
      if (g.open && g.openT < 1) {
        g.openT = Math.min(1, g.openT + dt * 0.8);
        g.barrierMat.uniforms.uOpen.value = g.openT;
        g.orbs.forEach(o => o.scale.setScalar(1 + g.openT * 0.6));
      }
      g.orbs.forEach((o, i) => { o.position.y = 8.4 + Math.sin(t * 2 + i * 2) * 0.15; });
    }
    for (const gr of godRays) gr.rotation.y = t * 0.1;
    if (W.templeGem) { W.templeGem.rotation.y = t * 1.2; }
    // corrupted temple crystal pulse
    if (W.templeCrystals) {
      for (const c of W.templeCrystals) {
        if (c.userData.cleansed) continue;
        c.material.emissiveIntensity = 0.7 + Math.sin(t * 3 + c.position.x) * 0.3;
      }
    }
  };

  return W;
})();
