// Axolotl Guardian — embedded GLB assets (authored in Blender, see blender/).
// Minimal GLB parser for the exact feature set our exporter emits:
// nodes + TRS, meshes (pos/normal/COLOR_0, indices), flat PBR materials mapped
// onto MeshLambertMaterial so loaded models match the game's lighting & fog.
// Assets are base64-embedded (assets-data.js) so index.html still runs from file://.
G.assets = (function () {
  const A = {};
  const templates = {};   // name -> prototype Group (lazy-parsed)

  const CTYPE = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

  function b64buf(b64) {
    const s = atob(b64);
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }

  function accessor(g, bin, idx) {
    const a = g.accessors[idx];
    const bv = g.bufferViews[a.bufferView];
    const Arr = CTYPE[a.componentType];
    const n = NCOMP[a.type];
    const elemBytes = Arr.BYTES_PER_ELEMENT * n;
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const stride = bv.byteStride || elemBytes;
    let arr;
    if (stride === elemBytes) {
      arr = new Arr(bin.slice(base, base + a.count * elemBytes));
    } else {
      arr = new Arr(a.count * n);
      const src = new Uint8Array(bin);
      const dst = new Uint8Array(arr.buffer);
      for (let i = 0; i < a.count; i++)
        dst.set(src.subarray(base + i * stride, base + i * stride + elemBytes), i * elemBytes);
    }
    return new THREE.BufferAttribute(arr, n, !!a.normalized);
  }

  function makeMaterial(g, idx, hasVC) {
    const md = (idx !== undefined && g.materials && g.materials[idx]) || {};
    const pbr = md.pbrMetallicRoughness || {};
    const bc = pbr.baseColorFactor || [1, 1, 1, 1];
    const m = new THREE.MeshLambertMaterial();
    m.color.setRGB(bc[0], bc[1], bc[2]);
    if (md.emissiveFactor) {
      m.emissive.setRGB(md.emissiveFactor[0], md.emissiveFactor[1], md.emissiveFactor[2]);
      const es = md.extensions && md.extensions.KHR_materials_emissive_strength;
      if (es) m.emissiveIntensity = es.emissiveStrength;
    }
    if ((md.alphaMode === 'BLEND' || md.alphaMode === 'MASK') && bc[3] < 1) {
      m.transparent = true;
      m.opacity = bc[3];
      m.depthWrite = false;
    }
    if (md.doubleSided) m.side = THREE.DoubleSide;
    if (hasVC) m.vertexColors = true;
    m.name = md.name || '';
    return m;
  }

  function parseGLB(buf) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('bad glb');
    let off = 12, json = null, bin = null;
    while (off < buf.byteLength) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      const chunk = buf.slice(off + 8, off + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
      else if (type === 0x004e4942) bin = chunk;
      off += 8 + len;
    }
    const matCache = {};
    function material(idx, hasVC) {
      const key = idx + (hasVC ? 'v' : '');
      return matCache[key] || (matCache[key] = makeMaterial(json, idx, hasVC));
    }
    function buildNode(idx) {
      const nd = json.nodes[idx];
      let obj;
      if (nd.mesh !== undefined) {
        const prims = json.meshes[nd.mesh].primitives.map(p => {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', accessor(json, bin, p.attributes.POSITION));
          if (p.attributes.NORMAL !== undefined) geo.setAttribute('normal', accessor(json, bin, p.attributes.NORMAL));
          if (p.attributes.COLOR_0 !== undefined) geo.setAttribute('color', accessor(json, bin, p.attributes.COLOR_0));
          if (p.indices !== undefined) geo.setIndex(accessor(json, bin, p.indices));
          return new THREE.Mesh(geo, material(p.material, p.attributes.COLOR_0 !== undefined));
        });
        if (prims.length === 1) obj = prims[0];
        else { obj = new THREE.Group(); prims.forEach(pm => obj.add(pm)); }
      } else {
        obj = new THREE.Group();
      }
      obj.name = nd.name || '';
      if (nd.matrix) {
        const m = new THREE.Matrix4().fromArray(nd.matrix);
        m.decompose(obj.position, obj.quaternion, obj.scale);
      }
      if (nd.translation) obj.position.fromArray(nd.translation);
      if (nd.rotation) obj.quaternion.fromArray(nd.rotation);
      if (nd.scale) obj.scale.fromArray(nd.scale);
      (nd.children || []).forEach(ci => obj.add(buildNode(ci)));
      return obj;
    }
    const root = new THREE.Group();
    const scene = json.scenes[json.scene || 0];
    scene.nodes.forEach(ni => root.add(buildNode(ni)));
    return root;
  }

  function template(name) {
    if (!templates[name]) {
      if (!window.ASSET_DATA || !ASSET_DATA[name]) throw new Error('missing asset: ' + name);
      templates[name] = parseGLB(b64buf(ASSET_DATA[name]));
      templates[name].updateMatrixWorld(true);
    }
    return templates[name];
  }

  // Instantiate an asset. opts:
  //   cloneMats: clone materials per-instance (default true — needed wherever
  //              game code tints/flashes materials). Pass false for scattered
  //              static props to keep material count down.
  //   shadows:   cast shadows from opaque meshes (default true)
  A.make = function (name, opts = {}) {
    const inst = template(name).clone(true);
    const cloneMats = opts.cloneMats !== false;
    const shadows = opts.shadows !== false;
    const seen = new Map();
    inst.traverse(o => {
      if (!o.isMesh) return;
      if (cloneMats) {
        if (!seen.has(o.material)) seen.set(o.material, o.material.clone());
        o.material = seen.get(o.material);
      }
      o.castShadow = shadows && !o.material.transparent;
    });
    return inst;
  };

  // Geometry + material of one mesh inside an asset (for InstancedMesh use).
  // World transform within the asset is baked into the returned geometry.
  A.geo = function (name, nodeName) {
    const t = template(name);
    let mesh = null;
    t.traverse(o => { if (!mesh && o.isMesh && (!nodeName || o.name === nodeName)) mesh = o; });
    if (!mesh) throw new Error('no mesh ' + name + '/' + (nodeName || ''));
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    return { geometry: geo, material: mesh.material };
  };

  return A;
})();
