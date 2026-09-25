// Axolotl Guardian — post-processing pipeline (hand-rolled, no dependencies).
//   1. water prepass: the scene minus the water surface, at half resolution, with
//      a depth texture — the water shader samples it for refraction, depth
//      absorption and contact foam.
//   2. main pass into an MSAA half-float HDR target.
//   3. dual-kawase bloom mip chain.
//   4. combine: bloom + exposure + ACES filmic + grade + vignette + underwater
//      wobble + hurt aberration + dither, then linear → sRGB.
// Degrades to a plain render if anything fails.
G.post = (function () {
  const P = {};
  const WATER_LAYER = 1, NOREFR_LAYER = 2;   // NOREFR: skipped by the water prepass (grass)
  P.WATER_LAYER = WATER_LAYER;
  P.NOREFR_LAYER = NOREFR_LAYER;
  let ok = false;
  let rtScene, rtPre;
  const down = [], up = [];
  const LEVELS = 5;
  let quadScene, quadCam, quadMesh;
  let matBright, matDown, matUp, matCombine;
  let W = 0, H = 0;
  const _size = new THREE.Vector2();

  const VERT = `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  function makeRT(w, h, opts = {}) {
    const rt = new THREE.WebGLRenderTarget(w, h, Object.assign({
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.HalfFloatType,
      depthBuffer: false, stencilBuffer: false,
    }, opts));
    return rt;
  }

  function build(w, h) {
    dispose();
    W = w; H = h;
    rtScene = makeRT(w, h, { depthBuffer: true, samples: 4 });
    // refraction/depth prepass for water
    const pw = w, ph = h;
    rtPre = makeRT(pw, ph, { depthBuffer: true });
    rtPre.depthTexture = new THREE.DepthTexture(pw, ph);
    rtPre.depthTexture.type = THREE.UnsignedIntType;
    let bw = Math.max(2, w >> 1), bh = Math.max(2, h >> 1);
    for (let i = 0; i < LEVELS; i++) {
      down.push(makeRT(bw, bh));
      up.push(makeRT(bw, bh));
      bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
    }
    P.refrTex = rtPre.texture;
    P.depthTex = rtPre.depthTexture;
    if (P.onResize) P.onResize(pw, ph);
  }

  function dispose() {
    for (const rt of [rtScene, rtPre, ...down, ...up]) if (rt) rt.dispose();
    rtScene = rtPre = null;
    down.length = 0; up.length = 0;
  }

  P.init = function () {
    try {
      quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      quadScene = new THREE.Scene();
      quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
      quadMesh.frustumCulled = false;
      quadScene.add(quadMesh);

      matBright = new THREE.ShaderMaterial({
        uniforms: { tex: { value: null }, uThresh: { value: 1.0 }, uKnee: { value: 0.6 } },
        vertexShader: VERT,
        fragmentShader: `
          varying vec2 vUv; uniform sampler2D tex; uniform float uThresh; uniform float uKnee;
          void main() {
            vec3 c = texture2D(tex, vUv).rgb;
            c = min(c, vec3(40.0));  // tame fireflies
            float l = max(c.r, max(c.g, c.b));
            float soft = clamp(l - uThresh + uKnee, 0.0, 2.0 * uKnee);
            soft = soft * soft / (4.0 * uKnee + 1e-4);
            float k = max(soft, l - uThresh) / max(l, 1e-4);
            gl_FragColor = vec4(c * k, 1.0);
          }`,
        depthWrite: false, depthTest: false,
      });
      // dual-kawase down / up sampling
      matDown = new THREE.ShaderMaterial({
        uniforms: { tex: { value: null }, uTexel: { value: new THREE.Vector2() } },
        vertexShader: VERT,
        fragmentShader: `
          varying vec2 vUv; uniform sampler2D tex; uniform vec2 uTexel;
          void main() {
            vec2 h = uTexel * 0.5;
            vec3 s = texture2D(tex, vUv).rgb * 4.0;
            s += texture2D(tex, vUv - h).rgb;
            s += texture2D(tex, vUv + h).rgb;
            s += texture2D(tex, vUv + vec2(h.x, -h.y)).rgb;
            s += texture2D(tex, vUv - vec2(h.x, -h.y)).rgb;
            gl_FragColor = vec4(s / 8.0, 1.0);
          }`,
        depthWrite: false, depthTest: false,
      });
      matUp = new THREE.ShaderMaterial({
        uniforms: { tex: { value: null }, base: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } },
        vertexShader: VERT,
        fragmentShader: `
          varying vec2 vUv; uniform sampler2D tex; uniform sampler2D base; uniform vec2 uTexel; uniform float uMix;
          void main() {
            vec2 h = uTexel * 0.5;
            vec3 s = texture2D(tex, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
            s += texture2D(tex, vUv + vec2(-h.x, h.y)).rgb * 2.0;
            s += texture2D(tex, vUv + vec2(0.0, h.y * 2.0)).rgb;
            s += texture2D(tex, vUv + vec2(h.x, h.y)).rgb * 2.0;
            s += texture2D(tex, vUv + vec2(h.x * 2.0, 0.0)).rgb;
            s += texture2D(tex, vUv + vec2(h.x, -h.y)).rgb * 2.0;
            s += texture2D(tex, vUv + vec2(0.0, -h.y * 2.0)).rgb;
            s += texture2D(tex, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
            gl_FragColor = vec4(s / 12.0 + texture2D(base, vUv).rgb * uMix, 1.0);
          }`,
        depthWrite: false, depthTest: false,
      });
      matCombine = new THREE.ShaderMaterial({
        uniforms: {
          tex: { value: null }, bloom: { value: null },
          uStrength: { value: 0.55 }, uExposure: { value: 1.0 },
          uUnder: { value: 0 }, uTime: { value: 0 }, uHurt: { value: 0 },
          uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) },
          uSat: { value: 1.12 }, uRes: { value: new THREE.Vector2(1, 1) },
          uSlow: { value: 0 },
        },
        vertexShader: VERT,
        fragmentShader: `
          varying vec2 vUv;
          uniform sampler2D tex; uniform sampler2D bloom;
          uniform float uStrength, uExposure, uUnder, uTime, uHurt, uFlash, uSat, uSlow;
          uniform vec3 uFlashCol; uniform vec2 uRes;

          vec3 aces(vec3 color) {
            // Stephen Hill's fitted ACES (same as three's ACESFilmicToneMapping)
            const mat3 ACESInputMat = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
            const mat3 ACESOutputMat = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
            color = ACESInputMat * color;
            vec3 a = color * (color + 0.0245786) - 0.000090537;
            vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
            color = ACESOutputMat * (a / b);
            return clamp(color, 0.0, 1.0);
          }
          vec3 toSRGB(vec3 c) {
            return mix(c * 12.92, pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, step(0.0031308, c));
          }
          float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

          void main() {
            vec2 uv = vUv;
            // underwater: gentle refractive wobble
            if (uUnder > 0.01) {
              uv += vec2(sin(uv.y * 22.0 + uTime * 1.7), cos(uv.x * 18.0 + uTime * 1.3)) * 0.0022 * uUnder;
            }
            vec3 c;
            if (uHurt > 0.01) {
              vec2 dir = (uv - 0.5) * 0.012 * uHurt;
              c = vec3(texture2D(tex, uv + dir).r, texture2D(tex, uv).g, texture2D(tex, uv - dir).b);
            } else {
              c = texture2D(tex, uv).rgb;
            }
            c += texture2D(bloom, uv).rgb * uStrength;
            c *= uExposure;

            // underwater grade (in linear, before tonemap): absorb reds, lift teal
            vec3 uw = c * vec3(0.55, 0.86, 1.0) + vec3(0.0, 0.012, 0.022);
            c = mix(c, uw, uUnder);

            c = aces(c);

            // grade: saturation + gentle split tone (warm highs, cool lows)
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            c = mix(vec3(l), c, uSat - uSlow * 0.6);
            c += (vec3(1.0, 0.97, 0.92) - 1.0) * l * 0.25 + (vec3(0.94, 0.98, 1.04) - 1.0) * (1.0 - l) * 0.12;

            // vignette (heavier underwater / in slow-mo)
            float d = distance(vUv, vec2(0.5));
            c *= 1.0 - smoothstep(0.45, 0.95, d) * (0.32 + uUnder * 0.25 + uSlow * 0.35);

            // screen flash (perfect dodge, unlocks, lightning)
            c = mix(c, uFlashCol, uFlash * 0.6);

            c = clamp(c, 0.0, 1.0);
            vec3 outc = toSRGB(c);
            // dither: kills gradient banding in sky & fog
            outc += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) / 255.0;
            gl_FragColor = vec4(outc, 1.0);
          }`,
        depthWrite: false, depthTest: false,
      });
      for (const m of [matBright, matDown, matUp, matCombine]) m.toneMapped = false;
      ok = true;
    } catch (e) {
      console.error(e);
      ok = false;
    }
  };

  function pass(mat, target) {
    quadMesh.material = mat;
    G.renderer.setRenderTarget(target);
    G.renderer.render(quadScene, quadCam);
  }

  let underTarget = 0, hurt = 0, flash = 0, slow = 0;
  P.setUnderwater = function (u) { underTarget = u ? 1 : 0; };
  P.hurt = function (v = 1) { hurt = Math.max(hurt, v); };
  P.flash = function (hex = 0xffffff, v = 0.8) { flash = Math.max(flash, v); matCombine && matCombine.uniforms.uFlashCol.value.set(hex); };
  P.setSlow = function (v) { slow = v; };
  P.exposure = 1.0;
  P.bloom = 0.55;

  P.render = function (dt = 1 / 60) {
    if (!ok) { G.renderer.render(G.scene, G.camera); return; }
    try {
      const r = G.renderer;
      const u = matCombine.uniforms;
      u.uUnder.value += (underTarget - u.uUnder.value) * Math.min(1, dt * 6);
      hurt = Math.max(0, hurt - dt * 2.2);
      flash = Math.max(0, flash - dt * 2.5);
      u.uHurt.value = hurt;
      u.uFlash.value = flash;
      u.uSlow.value += (slow - u.uSlow.value) * Math.min(1, dt * 10);
      u.uTime.value = G.time;
      u.uExposure.value = P.exposure;
      u.uStrength.value = P.bloom;
      r.getDrawingBufferSize(_size);
      if (_size.x !== W || _size.y !== H) build(_size.x, _size.y);
      u.uRes.value.set(W, H);

      // 1) water prepass (scene without water surface) — shadows reuse last frame
      const cam = G.camera;
      r.shadowMap.needsUpdate = false;
      cam.layers.disable(WATER_LAYER);
      cam.layers.disable(NOREFR_LAYER);
      r.setRenderTarget(rtPre);
      r.render(G.scene, cam);
      cam.layers.enable(WATER_LAYER);
      cam.layers.enable(NOREFR_LAYER);

      // 2) main HDR pass
      r.shadowMap.needsUpdate = true;
      r.setRenderTarget(rtScene);
      r.render(G.scene, cam);

      // 3) bloom
      matBright.uniforms.tex.value = rtScene.texture;
      pass(matBright, down[0]);
      for (let i = 1; i < LEVELS; i++) {
        matDown.uniforms.tex.value = down[i - 1].texture;
        matDown.uniforms.uTexel.value.set(1 / down[i - 1].width, 1 / down[i - 1].height);
        pass(matDown, down[i]);
      }
      // walk back up, adding each level
      let src = down[LEVELS - 1];
      for (let i = LEVELS - 2; i >= 0; i--) {
        matUp.uniforms.tex.value = src.texture;
        matUp.uniforms.base.value = down[i].texture;
        matUp.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        pass(matUp, up[i]);
        src = up[i];
      }

      // 4) combine to screen
      u.tex.value = rtScene.texture;
      u.bloom.value = up[0].texture;
      pass(matCombine, null);
      r.setRenderTarget(null);
    } catch (e) {
      console.error(e);
      ok = false;
      G.renderer.setRenderTarget(null);
      G.renderer.render(G.scene, G.camera);
    }
  };

  // capture the final frame (photo mode) — the canvas is rendered by the last pass
  P.ready = () => ok;
  return P;
})();
