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
  let sunSprite, moonSprite, stars, starsBright, clouds = [], cloudMat;
  let shaftGrp, weedMesh, weedData = [], rainbow, rainbowT = 0;
  let skyMesh, hills, hillMat;
  const meteors = [];
  const _dir = new THREE.Vector3();
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();

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
    if (edge > 215) h += Math.min(Math.pow((edge - 215) / 30, 2) * 26, 13 + (edge - 215) * 0.08);
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
      if (zone === 'temple') c = c.clone().lerp(cTemple, h < 1 ? 0.55 : 0.8);
      if (zone === 'ruins' && h < 1) c = c.clone().lerp(cMoss, 0.4);
      const n = U.fbm(x * 0.11, z * 0.11) * 0.22;
      colArr[i * 3] = U.clamp(c.r + n - 0.11, 0, 1);
      colArr[i * 3 + 1] = U.clamp(c.g + n - 0.11, 0, 1);
      colArr[i * 3 + 2] = U.clamp(c.b + n - 0.11, 0, 1);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    g.computeVertexNormals();
    // subtle procedural detail texture so the ground isn't flat color up close
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#f4f2ee';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3200; i++) {
      const l = 205 + Math.floor(Math.random() * 55);
      ctx.fillStyle = `rgba(${l},${l},${Math.floor(l * 0.96)},${0.25 + Math.random() * 0.3})`;
      const w = 1 + Math.random() * 2.4;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, w, w * (0.5 + Math.random()));
    }
    const detail = new THREE.CanvasTexture(cv);
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.repeat.set(56, 56);
    detail.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: detail });
    // procedural surface: grass tint variation, rock on steep slopes, a wet
    // darkened band at the waterline and rippled sand underwater
    G.gfx.patch(m, {
      key: 'terrain',
      fColor: `
        {
          float slope = 1.0 - clamp(vGN.y, 0.0, 1.0);
          float n1 = gFbm(vGW.xz * 0.07);
          float n2 = gNoise(vGW.xz * 0.9);
          float land = smoothstep(0.05, 0.6, vGW.y);
          vec3 tint = mix(vec3(0.8, 0.95, 0.62), vec3(1.18, 1.08, 0.78), n1);
          diffuseColor.rgb *= mix(vec3(1.0), tint, land);
          float strata = 0.86 + 0.14 * sin(vGW.y * 6.5 + gNoise(vGW.xz * 0.4) * 5.0);
          float crack = smoothstep(0.08, 0.0, abs(gNoise(vGW.xz * 0.6 + vGW.y * 0.3) - 0.5));
          vec3 rock = vec3(0.17, 0.155, 0.13) * (0.7 + 0.5 * n2) * strata * (1.0 - crack * 0.45);
          diffuseColor.rgb = mix(diffuseColor.rgb, rock, smoothstep(0.32, 0.55, slope) * land);
          float wet = smoothstep(0.5, 0.05, vGW.y) * smoothstep(-0.7, -0.05, vGW.y);
          diffuseColor.rgb *= 1.0 - wet * 0.38;
          float under = smoothstep(-0.2, -1.2, vGW.y);
          float rip = sin(vGW.x * 2.1 + vGW.z * 0.7 + gNoise(vGW.xz * 0.45) * 7.0) * 0.5 + 0.5;
          diffuseColor.rgb *= 1.0 + under * (rip * 0.16 - 0.08);
        }`,
    });
    terrainMesh = new THREE.Mesh(g, m);
    terrainMesh.receiveShadow = true;
    G.scene.add(terrainMesh);
  }

  // shared sky uniforms (sky dome, water reflection, distant hills all read them)
  const skyU = {
    uSkyTop: { value: new THREE.Color(0x3fa7dd) },
    uSkyHorizon: { value: new THREE.Color(0xcfeef7) },
    uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.4).normalize() },
    uSunCol: { value: new THREE.Color(0xfff2d8) },
    uSunVis: { value: 1 },
  };
  W.skyU = skyU;

  function makeWater() {
    // Subdivided plane with a per-vertex terrain-depth attribute (drives shore
    // foam and swell damping). Shading uses the post prepass: refraction of the
    // scene beneath, true thickness-based absorption, contact foam around
    // anything that touches the surface, fresnel sky reflection and sun glints.
    const seg = 200;
    const g = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const depthArr = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      depthArr[i] = Math.max(0, -W.heightAt(pos.getX(i), pos.getZ(i)));
    }
    g.setAttribute('depth', new THREE.BufferAttribute(depthArr, 1));
    waterMat = new THREE.ShaderMaterial({
      fog: true, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 },
        uShallow: { value: new THREE.Color(0x3fd0c8) },
        uDeepC: { value: new THREE.Color(0x0b4a78) },
        uSunFactor: { value: 1.0 },
        uRefr: { value: null }, uDepthTex: { value: null },
        uScreen: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 }, uFar: { value: 1200 },
        uRain: { value: 0 },
        uPlayer: { value: new THREE.Vector4(0, 0, 0, 0) },
      }]),
      vertexShader: `
        attribute float depth;
        varying vec3 vWorld;
        varying float vDepth;
        varying float vViewZ;
        uniform float uTime;
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float amp = 0.05 * clamp(depth, 0.0, 1.0);
          wp.y += (sin(wp.x * 0.35 + uTime * 1.4) * sin(wp.z * 0.3 - uTime * 1.1)
                 + sin(wp.x * 0.13 - uTime * 0.6) * 0.6) * amp;
          vWorld = wp.xyz;
          vDepth = depth;
          vec4 mvPosition = viewMatrix * wp;
          vViewZ = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        varying vec3 vWorld;
        varying float vDepth;
        varying float vViewZ;
        uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeepC; uniform float uSunFactor;
        uniform sampler2D uRefr; uniform sampler2D uDepthTex; uniform vec2 uScreen;
        uniform float uNear; uniform float uFar; uniform float uRain; uniform vec4 uPlayer;
        #include <fog_pars_fragment>
        ${G.gfx.GLSL_NOISE}
        ${G.gfx.GLSL_SKY}

        float linDepth(float d) { return (uNear * uFar) / ((uFar - uNear) * d - uFar) * -1.0; }

        // sum of directional waves (golden-angle directions → no visible grid)
        vec2 waveGrad(vec2 p, float t) {
          vec2 g = vec2(0.0);
          float a = 0.4, f = 0.28, sp = 1.1;
          for (int i = 0; i < 7; i++) {
            float ang = float(i) * 2.39996 + 0.3;
            vec2 d = vec2(cos(ang), sin(ang));
            float ph = dot(d, p) * f + t * sp * (1.0 + float(i) * 0.13);
            g += d * cos(ph) * a * f;
            a *= 0.72; f *= 1.47; sp *= 1.16;
          }
          return g;
        }
        vec2 rippleGrad(vec2 p, float t) {
          // rain: expanding rings in random cells
          vec2 cell = floor(p * 0.9);
          vec2 g = vec2(0.0);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 c = cell + vec2(float(i), float(j));
            float h = gHash(c);
            vec2 ctr = (c + vec2(gHash(c + 3.1), gHash(c + 7.7))) / 0.9;
            float ph = fract(t * 1.1 + h);
            vec2 dv = p - ctr;
            float d = length(dv);
            float r = ph * 1.3;
            float w = sin((d - r) * 28.0) * smoothstep(0.18, 0.0, abs(d - r)) * (1.0 - ph);
            g += normalize(dv + 1e-4) * w;
          }
          return g * 0.35;
        }

        void main() {
          bool below = cameraPosition.y < vWorld.y;
          vec3 toCam = cameraPosition - vWorld;
          float dist = length(toCam);
          vec3 V = toCam / dist;

          // ---- normal ----
          float fade = 1.0 / (1.0 + dist * 0.025);
          vec2 grad = waveGrad(vWorld.xz, uTime) * (0.35 + 0.65 * fade);
          // fine detail
          vec2 q = vWorld.xz * 1.7 + vec2(uTime * 0.35, -uTime * 0.27);
          float n0 = gNoise(q), nx = gNoise(q + vec2(0.07, 0.0)), nz = gNoise(q + vec2(0.0, 0.07));
          grad += vec2(nx - n0, nz - n0) * 3.2 * fade;
          if (uRain > 0.01) grad += rippleGrad(vWorld.xz, uTime) * uRain * fade;
          // wake rings around a moving axolotl
          vec2 pd = vWorld.xz - uPlayer.xy;
          float pl = length(pd);
          grad += normalize(pd + 1e-4) * sin(pl * 5.0 - uTime * 9.0) * exp(-pl * 0.45) * 0.35 * uPlayer.z;
          vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
          if (below) N = -N;

          // ---- scene behind the surface (prepass) ----
          vec2 suv = gl_FragCoord.xy / uScreen;
          float sceneZ = linDepth(texture2D(uDepthTex, suv).r);
          float thick = max(sceneZ - vViewZ, 0.0);
          vec2 ruv = suv + N.xz * 0.045 * clamp(thick * 0.6, 0.0, 1.0) * fade;
          float sceneZr = linDepth(texture2D(uDepthTex, ruv).r);
          if (sceneZr < vViewZ) { ruv = suv; sceneZr = sceneZ; }   // don't refract things in front
          float thickR = max(sceneZr - vViewZ, 0.0);
          vec3 refr = texture2D(uRefr, ruv).rgb;

          vec3 col;
          float NdV = clamp(dot(N, V), 0.0, 1.0);
          if (!below) {
            // absorption along the path through water: shallows stay glassy
            float heroA = mix(1.0, mix(0.15, 1.0, smoothstep(0.8, 3.0, pl)), uPlayer.w);
            float path = thickR * (0.35 + 0.65 * (1.0 - V.y)) * heroA;
            vec3 absorb = exp(-path * vec3(0.46, 0.13, 0.085));
            vec3 waterTint = mix(uShallow, uDeepC, clamp(path / 7.0, 0.0, 1.0)) * (0.2 + 0.8 * uSunFactor);
            col = refr * absorb + waterTint * (1.0 - absorb) * 0.9;
            // reflection
            vec3 R = reflect(-V, N);
            R.y = abs(R.y);
            vec3 refl = skyColor(R, 0.0);
            float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
            float hero = mix(1.0, smoothstep(0.8, 3.4, pl), uPlayer.w);   // keep the axolotl readable
            col = mix(col, refl, clamp(fres, 0.0, 1.0) * 0.92 * mix(0.3, 1.0, hero));
            // sun glint
            vec3 H = normalize(uSunDir + V);
            float spec = pow(max(dot(N, H), 0.0), 900.0) * 60.0 + pow(max(dot(N, H), 0.0), 90.0) * 0.6;
            col += uSunCol * spec * uSunVis;
          } else {
            // looking up from below: Snell's window, total internal reflection outside it
            float cosT = NdV;
            float window = smoothstep(0.62, 0.72, cosT);
            vec3 tir = uDeepC * (0.35 + 0.5 * uSunFactor);
            col = mix(tir, refr * vec3(0.8, 0.97, 1.05) + uSunCol * pow(cosT, 30.0) * 0.8 * uSunVis, window);
          }

          // ---- foam: shoreline (terrain depth) + contact foam (scene thickness) ----
          float foamN = gFbm(vWorld.xz * 1.6 + vec2(uTime * 0.25, uTime * 0.18));
          float shore = smoothstep(0.22, 0.0, vDepth);
          float contact = smoothstep(0.07, 0.0, thick);
          float foamMask = max(shore, contact * 0.9 * mix(1.0, smoothstep(0.8, 2.6, pl), uPlayer.w));
          float bands = 0.5 + 0.5 * sin((vDepth * 3.0 + thick) * 18.0 - uTime * 2.4 + foamN * 5.0);
          float foam = smoothstep(0.45, 0.8, foamMask * (0.5 + 0.7 * foamN) * (0.55 + 0.45 * bands));
          col = mix(col, vec3(0.9, 0.97, 1.0) * (0.3 + 0.55 * uSunFactor), foam * 0.8 * (below ? 0.3 : 1.0));

          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(g, waterMat);
    mesh.position.y = 0;
    mesh.layers.set(G.post.WATER_LAYER);
    mesh.frustumCulled = false;
    G.scene.add(mesh);
    W.waterMesh = mesh;
  }

  function makeSky() {
    skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: skyU,
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;   // pin to the far plane
        }`,
      fragmentShader: `
        varying vec3 vPos;
        ${G.gfx.GLSL_SKY}
        void main() { gl_FragColor = vec4(skyColor(normalize(vPos), 1.0), 1.0); }`,
    });
    skyMesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 18), skyMat);
    skyMesh.frustumCulled = false;
    skyMesh.renderOrder = -10;
    G.scene.add(skyMesh);
  }

  // distant layered hills that ride with the camera, so the world never ends in a fog wall
  function makeHills() {
    hillMat = new THREE.ShaderMaterial({
      fog: false, depthWrite: false, side: THREE.DoubleSide,
      uniforms: Object.assign({ uHillCol: { value: new THREE.Color(0x3f7f6a) } }, skyU),
      vertexShader: `
        attribute float layer;
        varying float vLayer; varying float vH; varying vec3 vDir;
        void main() {
          vLayer = layer; vH = position.y;
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying float vLayer; varying float vH; varying vec3 vDir;
        uniform vec3 uHillCol;
        ${G.gfx.GLSL_SKY}
        void main() {
          vec3 haze = skyColor(normalize(vec3(vDir.x, 0.02, vDir.z)), 0.0);
          float aerial = mix(0.45, 0.82, vLayer);            // farther layers dissolve into haze
          vec3 c = mix(uHillCol * (0.5 + 0.5 * uSunVis) * (0.85 + vH * 0.004), haze, aerial);
          c = mix(c, haze, smoothstep(10.0, -6.0, vH) * 0.6); // misty feet
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const positions = [], layers = [], idx = [];
    const SEGS = 160;
    const rings = [[520, 38, 0], [610, 70, 1]];
    let base = 0;
    for (const [R, amp, layer] of rings) {
      for (let i = 0; i <= SEGS; i++) {
        const a = (i / SEGS) * U.TAU;
        const n = U.fbm(Math.cos(a) * 3 + layer * 9, Math.sin(a) * 3 + layer * 5);
        const ridge = 1 - Math.abs(U.vnoise(i * 0.35 + layer * 17, layer * 3) * 2 - 1);
        const h = 6 + (n * 0.75 + ridge * 0.35) * amp;
        const x = Math.cos(a) * R, z = Math.sin(a) * R;
        positions.push(x, -30, z, x, h, z);
        layers.push(layer, layer);
        if (i < SEGS) {
          const k = base + i * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      base += (SEGS + 1) * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('layer', new THREE.Float32BufferAttribute(layers, 1));
    g.setIndex(idx);
    hills = new THREE.Mesh(g, hillMat);
    hills.frustumCulled = false;
    hills.renderOrder = -9;
    G.scene.add(hills);
  }

  // canvas-drawn celestial sprites: sun, moon, clouds, stars (no external files)
  function radialTex(size, stops) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const gr = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [t, c] of stops) gr.addColorStop(t, c);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function cloudTex() {
    const cv = document.createElement('canvas');
    cv.width = 320; cv.height = 160;
    const ctx = cv.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const x = 50 + Math.random() * 220, y = 70 + Math.random() * 50, r = 26 + Math.random() * 34;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.85)');
      gr.addColorStop(0.65, 'rgba(255,255,255,0.4)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 320, 160);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeSkyExtras() {
    // the sun itself is an HDR disc in the sky shader (it blooms); only the moon is a sprite
    const moonTex = radialTex(256, [[0, 'rgba(235,242,255,1)'], [0.4, 'rgba(215,228,255,0.9)'],
      [0.5, 'rgba(200,215,255,0.25)'], [1, 'rgba(190,210,255,0)']]);
    moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
    moonSprite.scale.setScalar(90);
    moonSprite.renderOrder = -1;
    G.scene.add(moonSprite);

    // stars — two layers on the upper dome
    function starPoints(n, size) {
      const g = new THREE.BufferGeometry();
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = U.rand(0, U.TAU), e = Math.asin(U.rand(0.06, 1));
        arr[i * 3] = Math.cos(a) * Math.cos(e) * 850;
        arr[i * 3 + 1] = Math.sin(e) * 850;
        arr[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 850;
      }
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const m = new THREE.PointsMaterial({ color: 0xeaf2ff, size, transparent: true, opacity: 0, depthWrite: false, fog: false, sizeAttenuation: false });
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      G.scene.add(p);
      return p;
    }
    stars = starPoints(520, 1.6);
    starsBright = starPoints(70, 3.2);

    // drifting clouds
    cloudMat = new THREE.SpriteMaterial({ map: cloudTex(), transparent: true, opacity: 0.75, depthWrite: false, fog: false });
    for (let i = 0; i < 13; i++) {
      const c = new THREE.Sprite(cloudMat);
      const s = U.rand(55, 130);
      c.scale.set(s, s * 0.45, 1);
      c.position.set(U.rand(-430, 430), U.rand(55, 100), U.rand(-430, 430));
      c.userData.speed = U.rand(0.6, 1.6);
      G.scene.add(c);
      clouds.push(c);
    }
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

  // one InstancedMesh per sub-mesh of a Blender asset — for big static crowds
  const _im4 = new THREE.Matrix4();
  function instancedAsset(name, mats) {
    const tpl = G.assets.make(name, { cloneMats: false, shadows: false });
    tpl.updateMatrixWorld(true);
    tpl.traverse(o => {
      if (!o.isMesh) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material, mats.length);
      mats.forEach((m4, i) => im.setMatrixAt(i, _im4.multiplyMatrices(m4, o.matrixWorld)));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      G.scene.add(im);
    });
  }

  // dense woods on the rising world rim — the marsh sits in a forested valley
  function makeRimForest() {
    const variants = { tree: [], tree2: [] };
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let guard = 0, placed = 0;
    while (placed < 900 && guard++ < 20000) {
      const x = U.rand(-258, 258), z = U.rand(-258, 258);
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge < 188) continue;
      const h = W.heightAt(x, z);
      if (h < 0.6) continue;
      if (U.dist2d(x, z, ZONES.temple.x, ZONES.temple.z) < ZONES.temple.r + 22) continue;
      const s = U.rand(1.3, 2.6) * (1 + (edge - 188) / 90);
      q.setFromAxisAngle(up, U.rand(0, U.TAU));
      p.set(x, h - 0.4, z);
      sc.set(s, s * U.rand(0.85, 1.25), s);
      variants[Math.random() < 0.5 ? 'tree' : 'tree2'].push(new THREE.Matrix4().compose(p, q, sc));
      placed++;
    }
    instancedAsset('tree', variants.tree);
    instancedAsset('tree2', variants.tree2);
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
      grp.traverse(o => {
        if (o.isMesh && o.material.emissive && !o.material.userData.caveBoost) {
          o.material.userData.caveBoost = true;
          if (!corrupted) { o.material.color.set(0x7fe0e0); o.material.emissive.set(0x1fb8c0); }
          o.material.emissiveIntensity = Math.max(o.material.emissiveIntensity, 0.6) * 1.6;
        }
      });
      if (Math.random() < 0.4) addCollider(x, z, 1.2);
    }
    // craggy natural rock arches (noise-displaced, mossy on top) framing the cavern
    for (let i = 0; i < 5; i++) {
      const R = U.rand(8, 13), tube = U.rand(1.3, 2.1);
      const g = new THREE.TorusGeometry(R, tube, 12, 44, Math.PI);
      const pos = g.attributes.position, nrm = g.attributes.normal;
      const cols = new Float32Array(pos.count * 3);
      const cRock = new THREE.Color(0x3c4058), cRock2 = new THREE.Color(0x5a5a78), cMoss = new THREE.Color(0x4f7a52), c = new THREE.Color();
      const seed = U.rand(0, 50);
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
        const n = U.fbm(x * 0.35 + seed, y * 0.35 + z * 0.5) - 0.5;
        const d = n * tube * 1.1 + (U.hash(Math.round(x * 3), Math.round(y * 3 + z * 7)) - 0.5) * 0.25;
        pos.setXYZ(k, x + nrm.getX(k) * d, y + nrm.getY(k) * d, z + nrm.getZ(k) * d);
        c.copy(cRock).lerp(cRock2, U.clamp(n + 0.5, 0, 1));
        if (nrm.getY(k) > 0.45 && y > R * 0.5) c.lerp(cMoss, 0.75);
        cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      g.computeVertexNormals();
      const arch = new THREE.Mesh(g, U.mat(0xffffff, { vertexColors: true }));
      const a = U.rand(0, U.TAU), r = U.rand(8, 30);
      const x = zc.x + Math.cos(a) * r, z = zc.z + Math.sin(a) * r;
      arch.position.set(x, W.heightAt(x, z) - 1.8, z);
      arch.rotation.set(0, U.rand(0, U.TAU), U.rand(-0.08, 0.08));
      arch.castShadow = true; arch.receiveShadow = true;
      G.scene.add(arch);
      // feet are solid
      const ax = Math.cos(arch.rotation.y) * R, az = -Math.sin(arch.rotation.y) * R;
      addCollider(x + ax, z + az, tube + 0.4);
      addCollider(x - ax, z - az, tube + 0.4);
    }
    // moody cavern glow lights
    const teal = new THREE.PointLight(0x3fd8d4, 1.6, 60);
    teal.position.set(zc.x, 6, zc.z);
    const magenta = new THREE.PointLight(0xb03fe8, 1.3, 50);
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

  // ---------------- underwater dressing ----------------
  function makeUnderwaterFX() {
    // soft light shafts that follow the player while submerged
    shaftGrp = new THREE.Group();
    const shaftMat = G.gfx.makeBeamMaterial(0xbfeaff, 0.22);
    for (let i = 0; i < 12; i++) {
      G.gfx.beam(shaftGrp, U.rand(-18, 18), 0.2, U.rand(-18, 18), U.rand(1.6, 4.2), U.rand(9, 16), shaftMat, U.rand(-0.22, -0.08));
    }
    shaftGrp.visible = false;
    G.scene.add(shaftGrp);

    // swaying seaweed in the deeper channels (tinted reuse of the reed mesh)
    const reed = G.assets.geo('reed');
    const weedMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x5a9aa8 });
    const spots = [];
    let guard = 0;
    while (spots.length < 110 && guard++ < 4000) {
      const x = U.rand(-200, 200), z = U.rand(-215, 215);
      const h = W.heightAt(x, z);
      if (h > -1.8) continue;
      spots.push({ x, z, y: h - 0.1, s: U.rand(1.1, 2.4), ry: U.rand(0, U.TAU), ph: U.rand(0, 9) });
    }
    weedMesh = new THREE.InstancedMesh(reed.geometry, weedMat, spots.length);
    weedData = spots;
    G.scene.add(weedMesh);
  }

  function updateSeaweed(t) {
    for (let i = 0; i < weedData.length; i++) {
      const w = weedData[i];
      _e.set(Math.sin(t * 1.1 + w.ph) * 0.16, w.ry, Math.cos(t * 0.9 + w.ph * 1.7) * 0.16);
      _q.setFromEuler(_e);
      _s.set(w.s, w.s, w.s);
      _m4.compose(U.v1.set(w.x, w.y, w.z), _q, _s);
      weedMesh.setMatrixAt(i, _m4);
    }
    weedMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------- rainbow (appears when crystal-rain clears) ----------------
  function makeRainbow() {
    rainbow = new THREE.Group();
    const cols = [0xff5f5f, 0xffb44f, 0xffe95f, 0x6fdf7f, 0x5fb8ff, 0xa06fff];
    cols.forEach((c, i) => {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(58 - i * 2.3, 1.05, 6, 40, Math.PI),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      rainbow.add(arc);
    });
    rainbow.position.set(-20, -6, 95);
    rainbow.rotation.y = 0.35;
    rainbow.visible = false;
    G.scene.add(rainbow);
  }

  function makeGodRays(cx, cz, n, color) {
    const mat = G.gfx.makeBeamMaterial(color, 0.13);
    for (let i = 0; i < n; i++) {
      const b = G.gfx.beam(G.scene, cx + U.rand(-24, 24), 26, cz + U.rand(-24, 24), U.rand(2.5, 5), 30, mat, U.rand(-0.18, 0.18));
      godRays.push(b);
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
    t: 0.262,                // 0..1 day phase (0.26 = sunrise glow over the title screen)
    daySpeed: 1 / 560,       // full cycle ≈ 9.3 min
    rainTimer: 75,           // first rain event
    raining: false, rainLeft: 0, lightningT: 0,
  };
  W.env = env;

  const SKY_KEYS = [
    // t, top, horizon, sun, sunIntensity, fog tint
    [0.00, 0x06122e, 0x14284a, 0x8fb0ff, 0.10, 0x0e2233],
    [0.20, 0x2a5f96, 0xf5b27a, 0xffc890, 0.55, 0xd8a08a],
    [0.30, 0x2f8fd6, 0x9fd6ee, 0xfff0d0, 1.00, 0xa8d8e8],
    [0.50, 0x2a86d8, 0xa6dcf0, 0xffffff, 1.10, 0xaee0ee],
    [0.70, 0x3485c8, 0xf0c89a, 0xffe2b8, 0.85, 0xd8c8b0],
    [0.80, 0x6a3f86, 0xff8f5a, 0xffa060, 0.45, 0xb07a7a],
    [0.90, 0x0c1a40, 0x243658, 0x9fb8ff, 0.12, 0x14263a],
    [1.00, 0x06122e, 0x14284a, 0x8fb0ff, 0.10, 0x0e2233],
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
    G.scene.fog = new THREE.FogExp2(0xbfe8ef, 0.0058);
    makeSky();
    makeHills();
    makeSkyExtras();
    makeLights();
    makeTerrain();
    makeWater();
    makeUnderwaterFX();
    makeRainbow();
    makeVegetation();
    makeRimForest();
    makeRuins();
    makeCavern();
    makeTemple();
    makeRain();
    G.grass.init();

    // Gates: Lily Gate (marsh→forest), Ruin Gate (forest→ruins/cavern), Temple Gate
    makeGate(0, 82, 0, 6, 'Lily Gate', 'blast', G.hint('WATER BLAST unlocked!  Hold RMB to charge, release to fire.', 'WATER BLAST unlocked!  Hold 💧 to charge, release to fire.'));
    makeGate(0, -46, 0, 16, 'Mossgate', 'shield', G.hint('BUBBLE SHIELD unlocked!  Press Q to block attacks.', 'BUBBLE SHIELD unlocked!  Tap 🫧 to block attacks.'));
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
  // per-zone atmosphere, blended smoothly as you travel
  const ATMOS = {
    marsh:  { light: 1.0,  tint: 0xffffff, mix: 0.0,  dens: 1.0, bloom: 0.55 },
    forest: { light: 0.92, tint: 0x9fd8a8, mix: 0.18, dens: 1.1, bloom: 0.6 },
    ruins:  { light: 0.95, tint: 0xb8d0b0, mix: 0.2,  dens: 1.1, bloom: 0.6 },
    cavern: { light: 0.42, tint: 0x2c3068, mix: 0.62, dens: 1.9, bloom: 0.95 },
    temple: { light: 0.55, tint: 0x3a2150, mix: 0.55, dens: 1.5, bloom: 0.85 },
    templeFree: { light: 1.0, tint: 0xffe2b8, mix: 0.2, dens: 1.0, bloom: 0.7 },
  };
  const atm = { light: 1, mix: 0, dens: 1, bloom: 0.55, tint: new THREE.Color(0xffffff) };
  const _atmTint = new THREE.Color();
  function updateAtmos(dt) {
    let zone = W.zoneAt(G.camera.position.x, G.camera.position.z);
    if (zone === 'path') zone = 'marsh';
    if (zone === 'temple' && G.boss && G.boss.defeated) zone = 'templeFree';
    const a = ATMOS[zone] || ATMOS.marsh;
    const k = 1 - Math.exp(-1.1 * dt);
    atm.light += (a.light - atm.light) * k;
    atm.mix += (a.mix - atm.mix) * k;
    atm.dens += (a.dens - atm.dens) * k;
    atm.bloom += (a.bloom - atm.bloom) * k;
    atm.tint.lerp(_atmTint.set(a.tint), k);
    W.zoneNow = zone;
  }

  const _moonCol = new THREE.Color(0x9fb8ff), _uwFog = new THREE.Color();
  let rainAmt = 0;
  W.update = function (dt) {
    const t = G.time;
    G.gfx.update(dt);

    // day / night
    env.t = (env.t + dt * env.daySpeed) % 1;
    const sk = skyLerp(env.t);
    const rainDim = env.raining ? 0.55 : 1;
    rainAmt = U.damp(rainAmt, env.raining ? 1 : 0, 0.6, dt);
    updateAtmos(dt);
    const zl = 0.45 + 0.55 * atm.light;
    skyU.uSkyTop.value.copy(sk.top).lerp(atm.tint, atm.mix * 0.6).multiplyScalar(rainDim * zl);
    skyU.uSkyHorizon.value.copy(sk.bottom).lerp(sk.fog, 0.25).lerp(atm.tint, atm.mix).multiplyScalar(rainDim * zl);
    G.post.bloom = atm.bloom;
    G.scene.fog.color.copy(skyU.uSkyHorizon.value);
    const cam = G.camera.position;
    skyMesh.position.copy(cam);
    hills.position.set(cam.x, 0, cam.z);

    // underwater tint + muffled audio + dreamy light shafts and bubbles
    const underwater = G.camera.position.y < -0.05;
    G.scene.fog.density = (underwater ? 0.034 : (env.raining ? 0.0105 : 0.0058)) * atm.dens;
    if (underwater) G.scene.fog.color.copy(_uwFog.set(0x0f5f7f).multiplyScalar(0.3 + sk.intensity * 0.55));
    G.audio.setUnderwater(underwater);
    G.post.setUnderwater(underwater);
    G.gfx.shared.uGUnder.value = underwater ? 1 : 0;
    W.underwater = underwater;
    shaftGrp.visible = underwater && sk.intensity > 0.25;
    if (shaftGrp.visible && G.player) {
      shaftGrp.position.set(G.player.pos.x, 0, G.player.pos.z);
    }
    if (underwater && G.player && Math.random() < dt * 9) {
      G.fx.sparkle(U.v1.set(G.player.pos.x + U.rand(-9, 9), G.player.pos.y + U.rand(-2, 1), G.player.pos.z + U.rand(-9, 9)), 0xbfe8ff, 2, 0.32);
    }
    updateSeaweed(t);

    // sun / moon
    const sunA = (env.t - 0.25) * U.TAU; // sunrise east
    const px = G.player ? G.player.pos.x : 0, pz = G.player ? G.player.pos.z : 0;
    _dir.set(Math.cos(sunA), Math.sin(sunA) * 1.1 + 0.12, 0.42).normalize();
    const sunUp = _dir.y > -0.02;
    const lightDir = sunUp ? _dir : U.v3.copy(_dir).negate();
    sunLight.position.set(px + lightDir.x * 120, Math.max(lightDir.y, 0.15) * 120, pz + lightDir.z * 120);
    sunLight.target.position.set(px, 0, pz);
    sunLight.intensity = (sunUp ? Math.max(0.04, sk.intensity) * 1.05 : 0.2) * rainDim * atm.light;
    sunLight.color.copy(sunUp ? sk.sun : _moonCol);
    hemiLight.intensity = (0.26 + sk.intensity * 0.42) * rainDim * (0.35 + 0.65 * atm.light);
    skyU.uSunDir.value.copy(lightDir);
    skyU.uSunCol.value.copy(sunUp ? sk.sun : _moonCol).multiplyScalar(sunUp ? 1 : 0.35);
    skyU.uSunVis.value = (sunUp ? U.clamp((_dir.y + 0.04) * 6, 0, 1) : 0.6) * (env.raining ? 0.25 : 1);
    G.gfx.shared.uGSun.value = sk.intensity * rainDim * atm.light;
    // drifting crystal motes in the cavern, corruption embers at the temple
    if (!underwater && G.player && (W.zoneNow === 'cavern' || W.zoneNow === 'temple') && Math.random() < dt * 14) {
      const c = W.zoneNow === 'cavern' ? U.pick([0x7fffe8, 0x9fd8ff, 0xd08fff]) : 0xc05fff;
      G.fx.sparkle(U.v1.set(px + U.rand(-14, 14), U.rand(0.2, 3), pz + U.rand(-14, 14)), c, 1, 0.35);
    }
    const night = sk.intensity < 0.3;
    moonGlow.intensity = night ? 0.7 : 0;
    if (G.player) moonGlow.position.set(px, 8, pz);

    // water
    if (waterMat) {
      const wu = waterMat.uniforms;
      wu.uTime.value = t;
      wu.uSunFactor.value = sk.intensity * rainDim;
      wu.uRefr.value = G.post.refrTex || null;
      wu.uDepthTex.value = G.post.depthTex || null;
      G.renderer.getDrawingBufferSize(wu.uScreen.value);
      wu.uNear.value = G.camera.near; wu.uFar.value = G.camera.far;
      wu.uRain.value = rainAmt;
      if (G.player) {
        const sp = Math.hypot(G.player.vel.x, G.player.vel.z);
        const nearSurf = U.clamp(1 - Math.abs(G.player.pos.y) / 1.2, 0, 1);
        wu.uPlayer.value.set(G.player.pos.x, G.player.pos.z, U.clamp(sp / 9, 0, 1) * nearSurf, G.player.pos.y < 0.05 ? 1 : 0);
      }
    }
    G.gfx.updateBeams();
    G.grass.update();

    moonSprite.position.set(cam.x - _dir.x * 780, cam.y - _dir.y * 780, cam.z - _dir.z * 780);
    moonSprite.material.opacity = U.clamp((-_dir.y + 0.05) * 4, 0, 0.95) * rainDim;
    const starVis = U.clamp(1 - sk.intensity * 2.6, 0, 1) * (env.raining ? 0.25 : 1);
    stars.material.opacity = starVis * 0.85;
    starsBright.material.opacity = starVis * (0.75 + Math.sin(t * 2.2) * 0.25);
    cloudMat.opacity = (0.35 + sk.intensity * 0.45) * (env.raining ? 0.95 : 1);
    cloudMat.color.setScalar(env.raining ? 0.45 : 0.6 + sk.intensity * 0.4);
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt * (env.raining ? 3 : 1);
      if (c.position.x > 460) c.position.x = -460;
    }

    // fireflies at night near the player
    if (night && !underwater && Math.random() < dt * 6) {
      G.fx.trailDot(U.v1.set(px + U.rand(-16, 16), U.rand(0.5, 4), pz + U.rand(-16, 16)), 0xbfff7a, U.rand(0.25, 0.5), 1.4);
    }
    // shooting stars
    if (night && !env.raining && Math.random() < dt * 0.09) {
      const a = U.rand(0, U.TAU);
      meteors.push({
        x: px + Math.cos(a) * U.rand(80, 160), y: U.rand(70, 120), z: pz + Math.sin(a) * U.rand(80, 160),
        vx: U.rand(-55, 55), vy: U.rand(-26, -14), vz: U.rand(-55, 55), life: U.rand(0.9, 1.5),
      });
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.life -= dt;
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
      G.fx.trailDot(U.v1.set(m.x, m.y, m.z), 0xeaf4ff, 1.5, 0.7);
      if (Math.random() < 0.6) G.fx.trailDot(U.v1.set(m.x + U.rand(-1, 1), m.y + U.rand(-1, 1), m.z), 0x9fd0ff, 0.8, 0.9);
      if (m.life <= 0) meteors.splice(i, 1);
    }
    // rainbow after the rain
    if (rainbowT > 0) {
      rainbowT -= dt;
      rainbow.visible = rainbowT > 0;
      const op = Math.min(1, (22 - rainbowT) / 3, rainbowT / 4) * 0.22;
      rainbow.children.forEach(arc => { arc.material.opacity = op; });
    }
    W.daylight = sk.intensity;

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
        if (sk.intensity > 0.3) {
          rainbowT = 22;
          G.ui.toast('🌈 A rainbow arcs over the marsh!', 3600);
        }
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
