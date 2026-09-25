// Axolotl Guardian — shared rendering helpers:
//   • GLSL snippets (noise, caustics, sky) shared by water / sky / terrain / grass
//   • a global material patch applied to every lit material: underwater caustics
//     dance on anything below the surface, and a fresnel rim light makes
//     characters pop against the scenery
//   • soft billboarded light beams (replace the old solid "god ray" cylinders)
G.gfx = (function () {
  const X = {};

  // uniforms shared by every patched material (same object references)
  X.shared = {
    uGTime: { value: 0 },
    uGSun: { value: 1 },                                   // 0 night … 1 noon
    uGRimCol: { value: new THREE.Color(0xcfeaff) },
    uGUnder: { value: 0 },                                 // camera underwater
  };

  X.GLSL_NOISE = `
    float gHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float gNoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x),
                 mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float gFbm(vec2 p) { return gNoise(p) * 0.55 + gNoise(p * 2.13 + 7.1) * 0.3 + gNoise(p * 4.37 + 3.3) * 0.15; }
    // tileable-looking animated caustic web (after Dave Hoskins' water caustic)
    float gCaustic(vec2 p, float t) {
      vec2 i = p;
      float c = 1.0;
      float inten = 0.005;
      for (int n = 0; n < 4; n++) {
        float tt = t * (1.0 - (3.5 / float(n + 1)));
        i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
        c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
      }
      c /= 4.0;
      c = 1.17 - pow(c, 1.4);
      return pow(abs(c), 8.0);
    }
  `;

  // sky gradient + sun halo; shared so water reflects exactly the sky we draw
  X.GLSL_SKY = `
    uniform vec3 uSkyTop; uniform vec3 uSkyHorizon; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunVis;
    vec3 skyColor(vec3 dir, float disc) {
      float y = dir.y;
      float t = pow(clamp(y, 0.0, 1.0), 0.5);
      vec3 col = mix(uSkyHorizon, uSkyTop, t);
      col = mix(col, uSkyHorizon * 0.82, clamp(-y * 3.0, 0.0, 1.0));
      float sd = max(dot(dir, uSunDir), 0.0);
      col += uSunCol * (pow(sd, 6.0) * 0.22 + pow(sd, 48.0) * 0.5) * uSunVis;
      col += uSunCol * smoothstep(0.99945, 0.99975, sd) * 22.0 * uSunVis * disc;
      return col;
    }
  `;

  // ---------------- global lit-material patch ----------------
  const PATCH_V_HEAD = `
    varying vec3 vGW;
    varying vec3 vGN;
  `;
  const PATCH_V_BODY = `
    #include <worldpos_vertex>
    {
      vec4 gw = vec4(transformed, 1.0);
      vec3 gn = objectNormal;
      #ifdef USE_INSTANCING
        gw = instanceMatrix * gw;
        gn = mat3(instanceMatrix) * gn;
      #endif
      vGW = (modelMatrix * gw).xyz;
      vGN = normalize(mat3(modelMatrix) * gn);
    }
  `;
  const PATCH_F_HEAD = `
    varying vec3 vGW;
    varying vec3 vGN;
    uniform float uGTime; uniform float uGSun; uniform vec3 uGRimCol; uniform float uGRim; uniform float uGUnder;
    ${X.GLSL_NOISE}
  `;
  const PATCH_F_BODY = `
    #include <emissivemap_fragment>
    {
      // underwater caustics — strongest just below the surface, fading with depth
      if (vGW.y < 0.15) {
        float under = smoothstep(0.15, -0.35, vGW.y) * exp(vGW.y * 0.16);
        float up = clamp(vGN.y * 0.7 + 0.3, 0.0, 1.0);
        float cst = min(gCaustic(vGW.xz * 0.55, uGTime * 0.55), 1.6);
        cst += min(gCaustic(vGW.xz * 0.23 + 3.7, uGTime * 0.4), 1.6) * 0.5;
        totalEmissiveRadiance += diffuseColor.rgb * vec3(0.5, 0.9, 1.0) * cst * under * up * (0.08 + uGSun * 0.42);
      }
      // fresnel rim light
      if (uGRim > 0.0) {
        vec3 gv = normalize(vViewPosition);
        float fr = pow(1.0 - clamp(dot(normal, gv), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += uGRimCol * fr * uGRim * (0.35 + uGSun * 0.65);
      }
    }
  `;

  // extra per-material hooks: { vHead, vBody, fHead, fColor, uniforms }
  // (tracked outside userData: Material.clone() copies userData but not onBeforeCompile)
  const patched = new WeakSet();
  const rimU = new WeakMap();
  X.patch = function (mat, extra) {
    if (!mat || patched.has(mat)) return mat;
    if (!(mat.isMeshLambertMaterial || mat.isMeshPhongMaterial)) return mat;
    patched.add(mat);
    const rim = { value: mat.userData.rim || 0 };
    rimU.set(mat, rim);
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = function (shader, renderer) {
      if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(this, shader, renderer);
      Object.assign(shader.uniforms, X.shared, { uGRim: rim });
      if (extra && extra.uniforms) Object.assign(shader.uniforms, extra.uniforms);
      shader.vertexShader = PATCH_V_HEAD + (extra && extra.vHead || '') + shader.vertexShader
        .replace('#include <worldpos_vertex>', PATCH_V_BODY + (extra && extra.vBody || ''));
      let fs = PATCH_F_HEAD + (extra && extra.fHead || '') + shader.fragmentShader;
      if (extra && extra.fColor) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + extra.fColor);
      fs = fs.replace('#include <emissivemap_fragment>', PATCH_F_BODY);
      shader.fragmentShader = fs;
    };
    const key = extra && extra.key ? 'g-' + extra.key : 'g-std';
    mat.customProgramCacheKey = () => key;
    mat.needsUpdate = true;
    return mat;
  };

  X.setRim = function (obj, amount) {
    obj.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        m.userData.rim = amount;
        X.patch(m);
        const r = rimU.get(m);
        if (r) r.value = amount;
      }
    });
  };

  // patch everything currently in the scene (cheap; skips already-patched)
  X.sweep = function () {
    G.scene.traverse(o => {
      if (!o.isMesh || !o.material) return;
      if (Array.isArray(o.material)) o.material.forEach(m => X.patch(m));
      else X.patch(o.material);
    });
  };

  // ---------------- soft light beams ----------------
  const beamGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
  beamGeo.translate(0, -0.5, 0);            // pivot at the top
  const beams = [];
  X.makeBeamMaterial = function (color, strength = 0.35) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uCol: { value: new THREE.Color(color) }, uStr: { value: strength }, uTime: X.shared.uGTime, uSeed: { value: Math.random() * 10 } },
      vertexShader: `
        varying vec2 vUv; varying float vFade;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vFade = smoothstep(1.0, 6.0, -mv.z);           // no hard clipping when you swim through one
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec2 vUv; varying float vFade;
        uniform vec3 uCol; uniform float uStr; uniform float uTime; uniform float uSeed;
        void main() {
          float x = vUv.x;
          float edge = pow(sin(3.14159 * x), 2.0);
          float along = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.7, vUv.y) * (0.35 + 0.65 * vUv.y);
          float streak = 0.65 + 0.35 * sin(x * 17.0 + uSeed + uTime * 0.6) * sin(x * 7.0 - uTime * 0.4 + uSeed * 2.0);
          float a = edge * along * streak * uStr * vFade;
          gl_FragColor = vec4(uCol * a, a);
        }`,
    });
  };
  X.beam = function (parent, x, y, z, w, h, mat, tilt = 0) {
    const m = new THREE.Mesh(beamGeo, mat);
    m.scale.set(w, h, 1);
    m.position.set(x, y, z);
    m.userData.tilt = tilt;
    m.renderOrder = 3;
    parent.add(m);
    beams.push(m);
    return m;
  };
  const _wp = new THREE.Vector3();
  X.updateBeams = function () {
    const cam = G.camera.position;
    for (const b of beams) {
      if (!b.visible || (b.parent && !b.parent.visible)) continue;
      b.getWorldPosition(_wp);
      b.rotation.set(0, Math.atan2(cam.x - _wp.x, cam.z - _wp.z), 0);
      b.rotateZ(b.userData.tilt);
    }
  };

  X.update = function (dt) {
    X.shared.uGTime.value = G.time;
  };

  return X;
})();
