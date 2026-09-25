// Axolotl Guardian — GPU grass & wildflowers.
// A fixed set of blade instances tiles a square window that follows the camera
// (each blade snaps to the repetition of its offset nearest the window centre),
// so ~60k blades cover the whole world at no CPU cost. Heights and a density
// mask are baked once from G.world.heightAt into a half-float texture.
G.grass = (function () {
  const GR = {};
  const EXT = 260, RES = 512;
  const R = 40, S = R * 2;
  let mapTex, bladeMat, flowerMat, blades, flowers;

  function bakeMap() {
    const W = G.world;
    const data = new Uint16Array(RES * RES * 4);
    const toH = THREE.DataUtils.toHalfFloat;
    const step = (2 * EXT) / (RES - 1);
    for (let j = 0; j < RES; j++) {
      const z = -EXT + j * step;
      for (let i = 0; i < RES; i++) {
        const x = -EXT + i * step;
        const h = W.heightAt(x, z);
        const hx = W.heightAt(x + 1, z) - h, hz = W.heightAt(x, z + 1) - h;
        const slope = Math.hypot(hx, hz);
        const zone = W.zoneAt(x, z);
        let dens = U.smoothstep((h - 0.12) / 0.45) * (1 - U.smoothstep((slope - 0.55) / 0.5));
        dens *= zone === 'temple' ? 0 : zone === 'cavern' ? 0.25 : zone === 'ruins' ? 0.75 : 1;
        dens *= 0.35 + 0.65 * U.smoothstep((U.fbm(x * 0.045 + 3, z * 0.045 - 8) - 0.3) / 0.3);
        const tint = zone === 'ruins' ? 0.7 : zone === 'cavern' ? 1 : zone === 'forest' ? 0.35 : 0;
        const k = (j * RES + i) * 4;
        data[k] = toH(h); data[k + 1] = toH(dens); data[k + 2] = toH(tint); data[k + 3] = toH(1);
      }
    }
    mapTex = new THREE.DataTexture(data, RES, RES, THREE.RGBAFormat, THREE.HalfFloatType);
    mapTex.minFilter = mapTex.magFilter = THREE.LinearFilter;
    mapTex.needsUpdate = true;
  }

  const shared = {
    uCenter: { value: new THREE.Vector3() },
    uPlayer: { value: new THREE.Vector3(0, -99, 0) },
    uLight: { value: new THREE.Color(1, 1, 1) },
    uSunDir: null, uSunCol: null,
  };

  const PLACE = `
    uniform sampler2D uMap; uniform vec3 uCenter; uniform vec3 uPlayer; uniform float uTime;
    const float S = ${S.toFixed(1)}, R = ${R.toFixed(1)}, EXT = ${EXT.toFixed(1)};
    vec2 placeXZ(vec2 off) { return off + floor((uCenter.xz - off) / S + 0.5) * S; }
    vec4 mapAt(vec2 xz) { return texture2D(uMap, (xz + EXT) / (2.0 * EXT)); }
  `;

  function makeBlades(n) {
    // tapered blade, 3 segments
    const g = new THREE.InstancedBufferGeometry();
    const pos = [], idx = [];
    const rows = [[0, 1], [0.35, 0.85], [0.7, 0.55]];
    for (const [y, w] of rows) pos.push(-0.5 * w, y, 0, 0.5 * w, y, 0);
    pos.push(0, 1, 0);
    for (let r = 0; r < 2; r++) { const k = r * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    idx.push(4, 5, 6);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const off = new Float32Array(n * 4), size = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      off[i * 4] = Math.random() * S; off[i * 4 + 1] = Math.random() * S;
      off[i * 4 + 2] = Math.random() * U.TAU; off[i * 4 + 3] = Math.random();
      size[i * 2] = U.rand(0.35, 0.95) * (Math.random() < 0.08 ? 1.6 : 1); size[i * 2 + 1] = U.rand(0.07, 0.13);
    }
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 2));
    g.instanceCount = n;

    bladeMat = new THREE.ShaderMaterial({
      fog: true, side: THREE.DoubleSide,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: mapTex } }]),
      vertexShader: `
        attribute vec4 aOff; attribute vec2 aSize;
        ${PLACE}
        ${G.gfx.GLSL_NOISE}
        varying float vH; varying float vRand; varying float vTint; varying float vSide;
        #include <fog_pars_vertex>
        void main() {
          vec2 xz = placeXZ(aOff.xy);
          vec4 m = mapAt(xz);
          float d = distance(xz, uCenter.xz);
          float edge = 1.0 - smoothstep(R * 0.7, R, d);
          float keep = step(aOff.w, m.g) * edge;
          vec3 p = position;
          float ht = aSize.x * (0.55 + 0.45 * keep) * keep;
          p.x *= aSize.y; p.y *= ht;
          float c = cos(aOff.z), s = sin(aOff.z);
          p = vec3(p.x * c, p.y, p.x * s);
          // wind gusts rolling across the marsh + per-blade flutter
          float gust = gNoise(xz * 0.06 + vec2(uTime * 0.32, uTime * 0.2));
          float bend = (0.15 + gust * 0.75) + sin(uTime * 2.3 + aOff.w * 20.0 + xz.x * 0.4) * 0.12;
          float k = position.y * position.y;
          p.x += bend * k * ht * 0.9;
          p.z += bend * k * ht * 0.35;
          // part around the player
          vec2 aw = xz - uPlayer.xz;
          float pd = length(aw);
          float push = smoothstep(1.6, 0.2, pd) * step(uPlayer.y - m.r, 1.8);
          p.xz += normalize(aw + 1e-4) * push * k * ht * 1.4;
          p.y *= 1.0 - push * 0.5 * position.y;
          vec4 wp = vec4(xz.x + p.x, m.r - 0.04 + p.y, xz.y + p.z, 1.0);
          vH = position.y; vRand = aOff.w; vTint = m.b; vSide = gust;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        varying float vH; varying float vRand; varying float vTint; varying float vSide;
        uniform vec3 uLight;
        #include <fog_pars_fragment>
        void main() {
          vec3 base = vec3(0.022, 0.07, 0.012);
          vec3 tipA = vec3(0.2, 0.42, 0.05), tipB = vec3(0.42, 0.5, 0.1);
          vec3 tip = mix(tipA, tipB, vRand);
          tip = mix(tip, vec3(0.1, 0.34, 0.12), vTint * 0.6);          // mossy blue-green in the ruins
          vec3 col = mix(base, tip, smoothstep(0.0, 1.0, vH));
          col *= 0.85 + vSide * 0.35;                                  // gust highlights
          col *= uLight;
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    });
    Object.assign(bladeMat.uniforms, { uCenter: shared.uCenter, uPlayer: shared.uPlayer, uLight: shared.uLight, uTime: G.gfx.shared.uGTime });
    blades = new THREE.Mesh(g, bladeMat);
    blades.frustumCulled = false;
    blades.layers.set(G.post.NOREFR_LAYER);
    G.scene.add(blades);
  }

  function makeFlowers(n) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const off = new Float32Array(n * 4), col = new Float32Array(n * 3);
    const palette = [0xff8fc8, 0xfff2a8, 0xffffff, 0xc8a8ff, 0xffb070, 0x8fd8ff].map(h => new THREE.Color(h));
    for (let i = 0; i < n; i++) {
      off[i * 4] = Math.random() * S; off[i * 4 + 1] = Math.random() * S;
      off[i * 4 + 2] = U.rand(0.25, 0.7); off[i * 4 + 3] = Math.random();
      // flowers cluster by colour: pick palette from a coarse hash of position
      const c = palette[Math.floor(U.hash(Math.floor(off[i * 4] / 9), Math.floor(off[i * 4 + 1] / 9)) * palette.length)];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
    g.instanceCount = n;
    flowerMat = new THREE.ShaderMaterial({
      fog: true, transparent: false,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: mapTex } }]),
      vertexShader: `
        attribute vec4 aOff; attribute vec3 aCol;
        ${PLACE}
        varying vec2 vUv; varying vec3 vCol;
        #include <fog_pars_vertex>
        void main() {
          vec2 xz = placeXZ(aOff.xy);
          vec4 m = mapAt(xz);
          float d = distance(xz, uCenter.xz);
          float keep = step(aOff.w * 3.2, m.g) * (1.0 - smoothstep(R * 0.6, R * 0.9, d));
          float sz = 0.3 * keep;
          float sway = sin(uTime * 1.7 + aOff.w * 30.0) * 0.06;
          vec3 wp = vec3(xz.x + sway, m.r + aOff.z * keep, xz.y);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          mv.xy += position.xy * sz;                  // camera-facing
          vUv = uv; vCol = aCol;
          vec4 mvPosition = mv;
          gl_Position = projectionMatrix * mv;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        varying vec2 vUv; varying vec3 vCol;
        uniform vec3 uLight;
        #include <fog_pars_fragment>
        void main() {
          vec2 c = vUv - 0.5;
          float r = length(c) * 2.0;
          float a = atan(c.y, c.x);
          float petal = 0.55 + 0.45 * cos(a * 5.0);
          if (r > petal) discard;
          vec3 col = mix(vec3(1.0, 0.82, 0.25), vCol, smoothstep(0.18, 0.3, r));
          col *= (0.75 + 0.25 * (1.0 - r)) * uLight * 1.15;
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    });
    Object.assign(flowerMat.uniforms, { uCenter: shared.uCenter, uPlayer: shared.uPlayer, uLight: shared.uLight, uTime: G.gfx.shared.uGTime });
    flowers = new THREE.Mesh(g, flowerMat);
    flowers.frustumCulled = false;
    flowers.layers.set(G.post.NOREFR_LAYER);
    G.scene.add(flowers);
  }

  GR.init = function () {
    bakeMap();
    GR.mapTex = mapTex;
    makeBlades(62000);
    makeFlowers(2600);
  };

  const _fwd = new THREE.Vector3();
  GR.update = function () {
    if (!blades) return;
    // centre the window ahead of the camera so the visible field is always full
    const cam = G.camera;
    cam.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() > 1e-4) _fwd.normalize();
    shared.uCenter.value.set(cam.position.x + _fwd.x * R * 0.55, 0, cam.position.z + _fwd.z * R * 0.55);
    if (G.player) shared.uPlayer.value.copy(G.player.pos);
    // match the scene lighting: ambient + sun, dimmed at night and in rain
    const sun = G.gfx.shared.uGSun.value;
    const sc = G.world.skyU.uSunCol.value;
    shared.uLight.value.setRGB(0.28 + sun * 0.55 * sc.r + 0.1, 0.3 + sun * 0.55 * sc.g + 0.1, 0.34 + sun * 0.5 * sc.b + 0.1);
    blades.visible = flowers.visible = !G.world.underwater || G.camera.position.y > -3;
  };

  return GR;
})();
