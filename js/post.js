// Axolotl Guardian — post-processing: lightweight bloom (threshold → blur → add).
// Makes crystals, pearls, orbs and glow-eyes actually *glow*. No dependencies —
// hand-rolled two-target composer that degrades to a plain render on any failure.
G.post = (function () {
  const P = {};
  let ok = false;
  let rtScene, rtA, rtB;
  let quadScene, quadCam, quadMesh;
  let matBright, matBlur, matCombine;
  let W = 0, H = 0;

  const VERT = `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  function makeRT(w, h) {
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    });
  }

  function build(w, h) {
    dispose();
    W = w; H = h;
    rtScene = makeRT(w, h);
    rtScene.depthBuffer = true;
    const bw = Math.max(64, w >> 2), bh = Math.max(64, h >> 2);
    rtA = makeRT(bw, bh);
    rtB = makeRT(bw, bh);
  }

  function dispose() {
    for (const rt of [rtScene, rtA, rtB]) if (rt) rt.dispose();
    rtScene = rtA = rtB = null;
  }

  P.init = function () {
    try {
      quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      quadScene = new THREE.Scene();
      quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
      quadMesh.frustumCulled = false;
      quadScene.add(quadMesh);

      matBright = new THREE.ShaderMaterial({
        uniforms: { tex: { value: null }, uThresh: { value: 0.82 } },
        vertexShader: VERT,
        fragmentShader: `
          varying vec2 vUv; uniform sampler2D tex; uniform float uThresh;
          void main() {
            vec3 c = texture2D(tex, vUv).rgb;
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            float k = smoothstep(uThresh, uThresh + 0.28, l);
            gl_FragColor = vec4(c * k, 1.0);
          }`,
        depthWrite: false, depthTest: false,
      });
      matBlur = new THREE.ShaderMaterial({
        uniforms: { tex: { value: null }, uDir: { value: new THREE.Vector2(1, 0) } },
        vertexShader: VERT,
        fragmentShader: `
          varying vec2 vUv; uniform sampler2D tex; uniform vec2 uDir;
          void main() {
            vec3 s = texture2D(tex, vUv).rgb * 0.227027;
            vec2 o1 = uDir * 1.3846153, o2 = uDir * 3.2307692;
            s += (texture2D(tex, vUv + o1).rgb + texture2D(tex, vUv - o1).rgb) * 0.3162162;
            s += (texture2D(tex, vUv + o2).rgb + texture2D(tex, vUv - o2).rgb) * 0.0702702;
            gl_FragColor = vec4(s, 1.0);
          }`,
        depthWrite: false, depthTest: false,
      });
      matCombine = new THREE.ShaderMaterial({
        uniforms: { tex: { value: null }, bloom: { value: null }, uStrength: { value: 0.85 }, uUnder: { value: 0 } },
        vertexShader: VERT,
        fragmentShader: `
          varying vec2 vUv; uniform sampler2D tex; uniform sampler2D bloom; uniform float uStrength; uniform float uUnder;
          void main() {
            vec3 c = texture2D(tex, vUv).rgb + texture2D(bloom, vUv).rgb * uStrength;
            // dreamy underwater grade: cool tint + soft edge vignette
            vec3 uw = c * vec3(0.68, 0.9, 1.06) + vec3(0.0, 0.02, 0.05);
            float d = distance(vUv, vec2(0.5));
            uw *= 1.0 - smoothstep(0.42, 0.85, d) * 0.45;
            gl_FragColor = vec4(mix(c, uw, uUnder), 1.0);
          }`,
        depthWrite: false, depthTest: false,
      });
      matBright.toneMapped = matBlur.toneMapped = matCombine.toneMapped = false;
      ok = true;
    } catch (e) {
      ok = false;
    }
  };

  function pass(mat, target) {
    quadMesh.material = mat;
    G.renderer.setRenderTarget(target);
    G.renderer.render(quadScene, quadCam);
  }

  let underTarget = 0;
  P.setUnderwater = function (u) { underTarget = u ? 1 : 0; };

  P.render = function () {
    if (!ok) { G.renderer.render(G.scene, G.camera); return; }
    try {
      const uu = matCombine.uniforms.uUnder;
      uu.value += (underTarget - uu.value) * 0.09;
      const size = G.renderer.getDrawingBufferSize(new THREE.Vector2());
      if (size.x !== W || size.y !== H) build(size.x, size.y);

      G.renderer.setRenderTarget(rtScene);
      G.renderer.render(G.scene, G.camera);

      matBright.uniforms.tex.value = rtScene.texture;
      pass(matBright, rtA);
      for (let i = 0; i < 2; i++) {
        matBlur.uniforms.tex.value = rtA.texture;
        matBlur.uniforms.uDir.value.set(1 / rtA.width, 0);
        pass(matBlur, rtB);
        matBlur.uniforms.tex.value = rtB.texture;
        matBlur.uniforms.uDir.value.set(0, 1 / rtA.height);
        pass(matBlur, rtA);
      }
      matCombine.uniforms.tex.value = rtScene.texture;
      matCombine.uniforms.bloom.value = rtA.texture;
      pass(matCombine, null);
      G.renderer.setRenderTarget(null);
    } catch (e) {
      ok = false;
      G.renderer.setRenderTarget(null);
      G.renderer.render(G.scene, G.camera);
    }
  };

  return P;
})();
