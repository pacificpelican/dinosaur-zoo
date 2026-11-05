/* Procedural dinosaur builder (Babylon.js). Dinosaurs get the most detailed art in the game:
   PBR sheen, painted vertex colors (countershading + patterns), and thin-instanced feather coats with per-feather color. */
(function (Z) {
  const B = BABYLON;
  const D = Z.Dino = { feathers: null, mats: {} };

  // ---------- shared geometry ----------
  D.featherProto = function (scene) {
    if (D.feathers) return D.feathers;
    const pos = [], col = [], idx = [], N = 6;
    for (let i = 0; i <= N; i++) {
      const t = i / N, w = Math.max(0.03, Math.sin(Math.PI * Math.pow(t, 0.75)) * 0.5) * (i === N ? 0.15 : 1), y = -0.12 * t * t;
      pos.push(-w, y, t, w, y, t, 0, y + 0.012, t);
      const sh = 0.72 + 0.28 * t;
      col.push(sh * 0.9, sh * 0.9, sh * 0.9, 1, sh, sh, sh, 1, sh * 0.6, sh * 0.6, sh * 0.6, 1);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 3, b = (i + 1) * 3;
      idx.push(a, b, a + 2, a + 2, b, b + 2, a + 2, b + 2, a + 1, a + 1, b + 2, b + 1);
    }
    const m = new B.Mesh('featherProto', scene), vd = new B.VertexData();
    vd.positions = pos; vd.indices = idx; vd.colors = col; vd.normals = [];
    B.VertexData.ComputeNormals(pos, idx, vd.normals);
    vd.applyToMesh(m); m.isVisible = false; m.setEnabled(false);
    D.feathers = m; return m;
  };

  D.materials = function (scene, sp, tag) {
    const key = sp.id + (tag || '');
    if (D.mats[key]) return D.mats[key];
    const pbr = new B.PBRMaterial('dino_' + key, scene);
    pbr.albedoColor = new B.Color3(1, 1, 1); pbr.metallic = 0; pbr.roughness = sp.form === 'raptor' && sp.id === 'micro' ? 0.35 : 0.62;
    pbr.environmentIntensity = 0.45;
    pbr.sheen.isEnabled = true; pbr.sheen.intensity = 0.35;
    if (sp.id === 'micro' || sp.id === 'budgie') { pbr.iridescence.isEnabled = true; pbr.iridescence.intensity = 0.35; }
    const fea = pbr.clone('fea_' + key); fea.backFaceCulling = false; fea.twoSidedLighting = true; fea.roughness = 0.5; fea.sheen.intensity = 0.55;
    return (D.mats[key] = { skin: pbr, feather: fea });
  };

  // ---------- painting ----------
  const sstep = (a, b, x) => { const t = Z.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const h2 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

  // kind: 'sphere' (up = +y) or 'tube' (cylinder rotated: up = -z, along = y)
  D.paint = function (mesh, sp, o) {
    o = o || {};
    const P = mesh.getVerticesData(B.VertexBuffer.PositionKind), N = mesh.getVerticesData(B.VertexBuffer.NormalKind);
    const base = Z.hex(o.base || sp.colors.base), acc = Z.hex(o.accent || sp.colors.accent), bel = Z.hex(o.belly || sp.colors.belly);
    const n = P.length / 3, out = new Float32Array(n * 4), pat = o.pattern || sp.pattern, L = o.L || 1, zOff = o.zOff || 0;
    const sx = o.sx || 1, sy = o.sy || 1, sz = o.sz || 1, tube = o.kind === 'tube';
    for (let i = 0; i < n; i++) {
      const nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
      const up = tube ? -nz : ny, ang = tube ? Math.atan2(nx, -nz) : Math.atan2(nx, ny);
      const along = tube ? P[i * 3 + 1] * (o.len || 1) : P[i * 3 + 2] * sz;
      const zN = (zOff + along) / L;
      let p = 0;
      if (pat === 'stripes') p = sstep(0.55, 0.85, Math.sin(zN * 62 + 1.6 * Math.sin(ang * 2 + zN * 9))) * sstep(-0.35, 0.1, up);
      else if (pat === 'bands') p = sstep(0.2, 0.9, Math.sin(zN * 34)) * 0.75 * sstep(-0.2, 0.3, up);
      else if (pat === 'spots') p = (h2(Math.floor(zN * 46), Math.floor((ang + 3.3) * 2.3)) > 0.78 ? 1 : 0) * sstep(-0.3, 0.2, up);
      p *= o.patternAmt === undefined ? 1 : o.patternAmt;
      const k = sstep(-0.55, 0.45, up);
      let r = bel.r + (base.r - bel.r) * k, g = bel.g + (base.g - bel.g) * k, b = bel.b + (base.b - bel.b) * k;
      r += (acc.r - r) * p * 0.9; g += (acc.g - g) * p * 0.9; b += (acc.b - b) * p * 0.9;
      const dap = 1 + (h2(P[i * 3] * 91 + zOff, P[i * 3 + 2] * 57 + P[i * 3 + 1] * 13) - 0.5) * 0.14;
      out[i * 4] = r * dap; out[i * 4 + 1] = g * dap; out[i * 4 + 2] = b * dap; out[i * 4 + 3] = 1;
    }
    mesh.setVerticesData(B.VertexBuffer.ColorKind, out);
  };

  // ---------- primitives ----------
  const tn = (scene, parent, x, y, z) => { const n = new B.TransformNode('n', scene); n.parent = parent; n.position.set(x || 0, y || 0, z || 0); return n; };
  D.tn = tn;

  D.ell = function (scene, parent, rx, ry, rz, mat, sp, o) {
    o = o || {};
    const m = B.MeshBuilder.CreateSphere('e', { diameter: 1, segments: o.seg || 18 }, scene);
    m.scaling.set(rx * 2, ry * 2, rz * 2); m.parent = parent; m.material = mat;
    if (o.color) m.material = o.color;
    D.paint(m, sp, Object.assign({ kind: 'sphere', sz: rz * 2 }, o.paint || {}));
    return m;
  };

  // A tapered segment pointing along +Z from its joint. Returns {joint, tip}.
  D.seg = function (scene, parent, len, r0, r1, mat, sp, o) {
    o = o || {};
    const joint = tn(scene, parent, o.x, o.y, o.z);
    const m = B.MeshBuilder.CreateCylinder('s', { height: len, diameterBottom: r0 * 2, diameterTop: r1 * 2, tessellation: o.tess || 12 }, scene);
    m.rotation.x = Math.PI / 2; m.position.z = len / 2; m.parent = joint; m.material = mat;
    D.paint(m, sp, Object.assign({ kind: 'tube', len }, o.paint || {}));
    if (o.ball !== false) {
      const s = B.MeshBuilder.CreateSphere('b', { diameter: r0 * 2, segments: 10 }, scene); s.parent = joint; s.material = mat;
      D.paint(s, sp, Object.assign({ kind: 'sphere' }, o.paint || {}));
    }
    const tip = tn(scene, joint, 0, 0, len);
    return { joint, tip };
  };

  D.cone = function (scene, parent, len, r, color, x, y, z, rx, ry, rz) {
    const m = B.MeshBuilder.CreateCylinder('c', { height: len, diameterTop: 0, diameterBottom: r * 2, tessellation: 8 }, scene);
    m.parent = parent; m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0);
    m.material = D.flatMat(scene, color); return m;
  };
  const flats = {};
  D.flatMat = function (scene, hex, emissive) {
    const k = hex + (emissive ? 'e' : '');
    if (!flats[k]) { const m = new B.StandardMaterial('flat' + k, scene); m.diffuseColor = Z.hex(hex); m.specularColor = new B.Color3(0.12, 0.12, 0.12); if (emissive) m.emissiveColor = Z.hex(hex).scale(0.6); flats[k] = m; }
    return flats[k];
  };

  D.eye = function (scene, parent, x, y, z, r, tint) {
    const e = B.MeshBuilder.CreateSphere('eye', { diameter: r * 2, segments: 8 }, scene);
    e.parent = parent; e.position.set(x, y, z); e.material = D.flatMat(scene, tint || '#17121c');
    const g = B.MeshBuilder.CreateSphere('glint', { diameter: r * 0.6, segments: 4 }, scene);
    g.parent = e; g.position.set(Math.sign(x) * 0.25 * r, 0.35 * r, 0.7 * r); g.material = D.flatMat(scene, '#ffffff', true);
    return e;
  };

  // Thin-instanced feather patch over an ellipsoid-ish region.
  D.featherPatch = function (scene, parent, o) {
    const proto = D.featherProto(scene), m = new B.Mesh('fp', scene);
    m.parent = parent; m.material = o.mat; m.isPickable = false;
    const rng = Z.makeRng(o.seed || 7), cnt = Math.max(1, Math.round(o.count));
    const mats = new Float32Array(cnt * 16), cols = new Float32Array(cnt * 4);
    const tmp = B.Matrix.Identity(), ax = new B.Vector3(), ay = new B.Vector3(), az = new B.Vector3(), nn = new B.Vector3();
    const cb = Z.hex(o.base), ca = Z.hex(o.accent), cbel = Z.hex(o.belly), cc = o.crest ? Z.hex(o.crest) : ca;
    const zr = o.zRange || [-1, 1], ctr = o.center || [0, 0, 0], bk = o.back === undefined ? 0.9 : o.back, up = o.upBias === undefined ? 0.5 : o.upBias;
    for (let i = 0; i < cnt; i++) {
      const u = zr[0] + (zr[1] - zr[0]) * rng(), ring = Math.sqrt(Math.max(0.02, 1 - u * u));
      let phi = rng() * Math.PI * 2; if (rng() < up) phi = (rng() - 0.5) * Math.PI * 1.4;
      const sx = Math.sin(phi), cy = Math.cos(phi);
      const px = o.rx * ring * sx, py = o.ry * ring * cy, pz = o.rz * u;
      nn.set(px / (o.rx * o.rx), py / (o.ry * o.ry), pz / (o.rz * o.rz)).normalize();
      az.set(nn.x * 0.5 * (o.flare === undefined ? 1 : o.flare), nn.y * 0.5 * (o.flare === undefined ? 1 : o.flare) + 0.1, -bk).normalize();
      ay.copyFrom(nn).subtractInPlace(az.scale(B.Vector3.Dot(nn, az))).normalize();
      B.Vector3.CrossToRef(ay, az, ax);
      const len = (o.lenMin + (o.lenMax - o.lenMin) * rng()), wid = len * (o.width || 0.32);
      ax.scaleInPlace(wid); az.scaleInPlace(len); ay.scaleInPlace(len);
      B.Matrix.FromXYZAxesToRef(ax, ay.clone(), az.clone(), tmp);
      tmp.setTranslation(new B.Vector3(px + ctr[0], py + ctr[1], pz + ctr[2]));
      tmp.copyToArray(mats, i * 16);
      const topness = Z.clamp(cy * 0.6 + 0.4, 0, 1);
      let c = o.colorFn ? o.colorFn(u, cy, sx, rng) : null;
      if (!c) {
        const pv = o.pattern === 'stripes' ? sstep(0.55, 0.85, Math.sin(u * 14 + rng() * 0.6)) : o.pattern === 'bands' ? sstep(0.3, 0.9, Math.sin(u * 8)) * 0.8 : rng() < 0.18 ? 0.8 : 0;
        const pbase = B.Color3.Lerp(cbel, cb, sstep(0.1, 0.7, topness));
        c = B.Color3.Lerp(pbase, ca, pv * sstep(0.3, 0.7, topness));
        if (o.crestFrac && u > 0.5 && rng() < o.crestFrac) c = cc;
      }
      const j = 0.9 + rng() * 0.2;
      cols[i * 4] = Z.clamp(c.r * j, 0, 1.2); cols[i * 4 + 1] = Z.clamp(c.g * j, 0, 1.2); cols[i * 4 + 2] = Z.clamp(c.b * j, 0, 1.2); cols[i * 4 + 3] = 1;
    }
    // Bake instances into one static mesh (more robust than thin instances across GPUs/materials).
    const pp = proto.getVerticesData(B.VertexBuffer.PositionKind), pn = proto.getVerticesData(B.VertexBuffer.NormalKind), pc = proto.getVerticesData(B.VertexBuffer.ColorKind), pi = proto.getIndices();
    const nv = pp.length / 3, P = new Float32Array(cnt * nv * 3), N = new Float32Array(cnt * nv * 3), C = new Float32Array(cnt * nv * 4), I = new Uint32Array(cnt * pi.length);
    for (let i = 0; i < cnt; i++) {
      const q = mats.subarray(i * 16, i * 16 + 16);
      for (let k = 0; k < nv; k++) {
        const x = pp[k * 3], y = pp[k * 3 + 1], z = pp[k * 3 + 2], nx = pn[k * 3], ny = pn[k * 3 + 1], nz = pn[k * 3 + 2], o3 = (i * nv + k) * 3;
        P[o3] = x * q[0] + y * q[4] + z * q[8] + q[12]; P[o3 + 1] = x * q[1] + y * q[5] + z * q[9] + q[13]; P[o3 + 2] = x * q[2] + y * q[6] + z * q[10] + q[14];
        const tx = nx * q[0] + ny * q[4] + nz * q[8], ty = nx * q[1] + ny * q[5] + nz * q[9], tz = nx * q[2] + ny * q[6] + nz * q[10], tl = Math.hypot(tx, ty, tz) || 1;
        N[o3] = tx / tl; N[o3 + 1] = ty / tl; N[o3 + 2] = tz / tl;
        const c4 = (i * nv + k) * 4;
        C[c4] = pc[k * 4] * cols[i * 4]; C[c4 + 1] = pc[k * 4 + 1] * cols[i * 4 + 1]; C[c4 + 2] = pc[k * 4 + 2] * cols[i * 4 + 2]; C[c4 + 3] = 1;
      }
      for (let k = 0; k < pi.length; k++) I[i * pi.length + k] = pi[k] + i * nv;
    }
    const vd = new B.VertexData();
    vd.positions = P; vd.normals = N; vd.colors = C; vd.indices = I; vd.applyToMesh(m);
    return m;
  };

  // ---------- land animals ----------
  const FORM = {
    theropod:    { bi: 1, body: [0.075, 0.105, 0.17], neck: { n: 3, len: 0.12, r0: 0.06, r1: 0.04, pitch: 0.75 }, head: { l: 0.14, h: 0.075, w: 0.06, kind: 'theropod' }, tail: { n: 5, len: 0.36, r0: 0.062 }, leg: { th: 0.15, sh: 0.15, ft: 0.07, r: 0.04 }, arms: 0.05 },
    raptor:      { bi: 1, body: [0.045, 0.065, 0.14], neck: { n: 4, len: 0.2, r0: 0.032, r1: 0.02, pitch: 0.95 }, head: { l: 0.09, h: 0.035, w: 0.03, kind: 'theropod' }, tail: { n: 5, len: 0.42, r0: 0.032 }, leg: { th: 0.17, sh: 0.19, ft: 0.08, r: 0.022 }, arms: 0.1, wings: true },
    hadrosaur:   { bi: 1, body: [0.07, 0.1, 0.17], neck: { n: 4, len: 0.14, r0: 0.05, r1: 0.032, pitch: 0.6 }, head: { l: 0.13, h: 0.05, w: 0.05, kind: 'duck' }, tail: { n: 5, len: 0.34, r0: 0.055 }, leg: { th: 0.15, sh: 0.16, ft: 0.07, r: 0.04 }, arms: 0.07 },
    ceratopsian: { quad: 1, body: [0.12, 0.14, 0.22], neck: { n: 2, len: 0.05, r0: 0.1, r1: 0.09, pitch: 0.05 }, head: { l: 0.2, h: 0.11, w: 0.09, kind: 'beak' }, tail: { n: 3, len: 0.2, r0: 0.065 }, leg: { th: 0.12, sh: 0.1, ft: 0.05, r: 0.05 } },
    stegosaur:   { quad: 1, body: [0.11, 0.13, 0.2], neck: { n: 3, len: 0.1, r0: 0.06, r1: 0.04, pitch: -0.5 }, head: { l: 0.08, h: 0.04, w: 0.035, kind: 'small' }, tail: { n: 4, len: 0.26, r0: 0.065 }, leg: { th: 0.1, sh: 0.1, ft: 0.05, r: 0.04 }, hind: 1.3 },
    sauropod:    { quad: 1, body: [0.12, 0.12, 0.17], neck: { n: 7, len: 0.34, r0: 0.055, r1: 0.022, pitch: 0.6 }, head: { l: 0.05, h: 0.025, w: 0.022, kind: 'small' }, tail: { n: 8, len: 0.33, r0: 0.06 }, leg: { th: 0.13, sh: 0.12, ft: 0.05, r: 0.04 } },
    tinybird:    { bi: 1, body: [0.09, 0.11, 0.16], neck: { n: 3, len: 0.2, r0: 0.05, r1: 0.032, pitch: 0.8 }, head: { l: 0.14, h: 0.06, w: 0.05, kind: 'theropod' }, tail: { n: 3, len: 0.4, r0: 0.04 }, leg: { th: 0.2, sh: 0.22, ft: 0.09, r: 0.03 }, arms: 0.12, wings: true, legFeathers: true },
    ankylosaur:  { quad: 1, body: [0.17, 0.095, 0.22], neck: { n: 2, len: 0.05, r0: 0.07, r1: 0.06, pitch: 0.0 }, head: { l: 0.1, h: 0.055, w: 0.07, kind: 'small' }, tail: { n: 4, len: 0.3, r0: 0.06 }, leg: { th: 0.07, sh: 0.07, ft: 0.04, r: 0.05 }, club: 1 }
  };
  D.FORM = FORM;

  D.build = function (scene, sp, scale, seed, opts) {
    if (sp.form === 'pterosaur') return Z.Birds.buildPtero(scene, sp, scale, seed);
    if (sp.form === 'budgie') return Z.Birds.buildBudgie(scene, sp, scale, seed, opts);
    return buildLand(scene, sp, scale, seed);
  };

  function buildLand(scene, sp, scale, seed) {
    const F = FORM[sp.form] || FORM.theropod, L = sp.len * scale, rng = Z.makeRng(seed || 1);
    const M = D.materials(scene, sp), skin = M.skin, fea = M.feather;
    const root = new B.TransformNode('dino_' + sp.id, scene);
    const trait = sp.trait || ({ spino: 'sail', dilo: 'crest', trex: 'brow', para: 'tubecrest', pachy: 'dome', trike: 'frill', steg: 'plates', anky: 'armor' })[sp.id] ||
      (sp.form === 'ceratopsian' ? 'frill' : sp.form === 'stegosaur' ? 'plates' : sp.form === 'ankylosaur' ? 'armor' : null);
    const [rxF, ryF, rzF] = F.body, rx = rxF * L, ry = ryF * L, rz = rzF * L;
    const th = F.leg.th * L, sh = F.leg.sh * L, ft = F.leg.ft * L, lr = F.leg.r * L;

    // leg geometry decides how high the body sits
    const biSet = F.bi ? { a1: 0.9, a2: 1.35, a3: -1.7 } : { a1: 1.5, a2: 0.1, a3: -0.2 };
    const vert = (k) => k * (th * Math.sin(biSet.a1) + sh * Math.sin(biSet.a1 + biSet.a2) + ft * 0.15);
    const hindK = F.hind || 1, vH = vert(hindK), vF = F.quad ? vert(1) : vH;
    const hipH = vH + ry * 0.35;

    const body = tn(scene, root, 0, hipH, 0), core = tn(scene, body, 0, 0, 0);
    body.rotation.x = F.quad ? Math.atan2(vH - vF, rz * 1.2) * 0.9 : 0;
    D.ell(scene, core, rx, ry, rz, skin, sp, { paint: { L, zOff: 0 }, seg: 20 });
    const anim = { legs: [], neck: [], tail: [], arms: [], body, root, L, hipH, F, parts: [] };

    // legs
    const mkLeg = (side, zOff, k, front) => {
      const hip = tn(scene, core, side * rx * 0.8, -ry * 0.45, zOff);
      const a1 = biSet.a1, kscale = front ? 1 : hindK;
      const t = D.seg(scene, hip, th * kscale * (front ? 0.95 : 1), lr * 1.25, lr, skin, sp, { paint: { L, zOff: zOff } });
      hip.rotation.x = a1;
      if (F.legFeathers) D.featherPatch(scene, hip, { mat: fea, rx: lr * 1.2, ry: lr * 1.2, rz: th * 0.5, center: [side * lr, 0, th * 0.5], count: 16, lenMin: L * 0.12, lenMax: L * 0.2, back: 0.9, flare: 0.5, base: sp.colors.base, accent: sp.colors.accent, belly: sp.colors.belly, pattern: 'bands', seed: seed + 60 + side, upBias: 0.2 });
      const knee = t.tip; knee.rotation.x = biSet.a2;
      const s = D.seg(scene, knee, sh * kscale * (front ? 0.95 : 1), lr, lr * 0.75, skin, sp, { paint: { L, zOff: zOff } });
      const ankle = s.tip; ankle.rotation.x = biSet.a3;
      const foot = D.seg(scene, ankle, ft, lr * 0.8, lr * 0.55, skin, sp, { ball: true, paint: { base: sp.colors.belly } });
      // claws/toes
      for (let c = -1; c <= 1; c++) D.cone(scene, foot.tip, lr * 1.4, lr * 0.3, '#2b2330', c * lr * 0.5, 0, lr * 0.5, Math.PI / 2, 0, 0);
      anim.legs.push({ hip, knee, ankle, side, front: !!front, base: { a1, a2: biSet.a2, a3: biSet.a3 }, phase: (side > 0 ? 0 : Math.PI) + (front ? Math.PI : 0) });
    };
    if (F.bi) { mkLeg(-1, -rz * 0.05, 1); mkLeg(1, -rz * 0.05, 1); }
    else { mkLeg(-1, rz * 0.55, 1, true); mkLeg(1, rz * 0.55, 1, true); mkLeg(-1, -rz * 0.6, 1); mkLeg(1, -rz * 0.6, 1); }

    // arms
    if (F.arms) {
      [-1, 1].forEach((s) => {
        const sh0 = tn(scene, core, s * rx * 0.85, -ry * 0.1, rz * 0.7); sh0.rotation.x = 1.0;
        const u = D.seg(scene, sh0, F.arms * L, lr * 0.6, lr * 0.45, skin, sp, {});
        u.tip.rotation.x = 0.7; const f = D.seg(scene, u.tip, F.arms * L * 0.8, lr * 0.45, lr * 0.3, skin, sp, {});
        for (let c = -1; c <= 1; c += 2) D.cone(scene, f.tip, lr * 0.9, lr * 0.2, '#2b2330', c * lr * 0.2, 0, lr * 0.3, Math.PI / 2, 0, 0);
        anim.arms.push({ n: sh0, s, base: sh0.rotation.x });
        if (F.wings) {
          const wing = D.featherPatch(scene, sh0, { mat: fea, rx: lr * 0.5, ry: lr * 0.5, rz: F.arms * L * 0.9, center: [s * 0.01, 0, F.arms * L], count: 16 * (sp.feathers || 0.5) + 4, lenMin: L * 0.12, lenMax: L * 0.2, back: 0.8, flare: 2.2,
            base: sp.colors.base, accent: sp.colors.accent, belly: sp.colors.belly, pattern: 'bands', seed: seed + s * 5, upBias: 0.2 });
        }
      });
    }

    // neck chain
    let parent = tn(scene, core, 0, ry * 0.3, rz * 0.82);
    const nk = F.neck, nSeg = nk.n, nLen = nk.len * L / nSeg;
    for (let i = 0; i < nSeg; i++) {
      const t = i / nSeg, r0 = (nk.r0 + (nk.r1 - nk.r0) * t) * L, r1 = (nk.r0 + (nk.r1 - nk.r0) * (t + 1 / nSeg)) * L;
      const s = D.seg(scene, parent, nLen, r0, r1, skin, sp, { paint: { L, zOff: rz + i * nLen } });
      const base = i === 0 ? -nk.pitch : (nk.pitch / (nSeg - 1)) * 1.0;
      s.joint.rotation.x = base; anim.neck.push({ n: s.joint, base });
      if (sp.feathers > 0.2 && i < nSeg) anim.parts.push(D.featherPatch(scene, s.joint, { mat: fea, rx: r0 * 0.95, ry: r0 * 0.95, rz: nLen * 0.5, center: [0, 0, nLen * 0.5], count: 10 * sp.feathers, lenMin: L * 0.04, lenMax: L * 0.07, base: sp.colors.base, accent: sp.colors.accent, belly: sp.colors.belly, pattern: sp.pattern, seed: seed + i * 3 }));
      parent = s.tip;
    }
    const headJoint = tn(scene, parent, 0, 0, 0); anim.head = headJoint;
    buildHead(scene, headJoint, sp, L, F.head, skin, fea, trait, anim, seed);

    // tail chain
    const tl = F.tail; let tp = tn(scene, core, 0, ry * 0.1, -rz * 0.85); tp.rotation.y = Math.PI;
    const tLen = tl.len * L / tl.n;
    for (let i = 0; i < tl.n; i++) {
      const t = i / tl.n, r0 = tl.r0 * L * (1 - t * 0.85), r1 = tl.r0 * L * (1 - (t + 1 / tl.n) * 0.85);
      const s = D.seg(scene, tp, tLen, r0, r1, skin, sp, { paint: { L, zOff: -rz - i * tLen } });
      s.joint.rotation.x = i === 0 ? 0.12 : 0.03 * (i < 3 ? 1 : -1);
      anim.tail.push({ n: s.joint, base: s.joint.rotation.x });
      if (sp.feathers > 0.2) anim.parts.push(D.featherPatch(scene, s.joint, { mat: fea, rx: r0, ry: r0, rz: tLen * 0.5, center: [0, 0, tLen * 0.5], count: 9 * sp.feathers, lenMin: L * 0.05, lenMax: L * 0.09, base: sp.colors.base, accent: sp.colors.accent, belly: sp.colors.belly, pattern: sp.pattern, seed: seed + 40 + i }));
      tp = s.tip;
    }
    if (F.club) { const c = D.ell(scene, tp, L * 0.07, L * 0.06, L * 0.08, skin, sp, { paint: { base: '#6b6048', accent: '#6b6048' } }); c.position.z = L * 0.04; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; D.cone(scene, c, L * 0.2, L * 0.12, '#cdbf99', Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.0, 0, 0, 0); } }
    if (trait === 'plates' && sp.form === 'stegosaur') {
      const tailBase = anim.tail[0].n;
      for (let i = 0; i < 4; i++) { const sp2 = D.cone(scene, anim.tail[Math.min(i + 1, tl.n - 1)].n, L * 0.1, L * 0.012, '#e8e0cc', i % 2 ? 1 : -1, 0, 0, 0, 0, 0); sp2.parent = anim.tail[Math.min(2 + (i >> 1), tl.n - 1)].n; sp2.position.set(0, 0.0, tLen * 0.5); sp2.rotation.set(-1.0, 0, (i % 2 ? 1 : -1) * 0.6); }
    }
    buildTraits(scene, core, sp, L, rx, ry, rz, trait, anim, seed);

    // body feather coat
    if (sp.feathers > 0.05) anim.parts.push(D.featherPatch(scene, core, { mat: fea, rx: rx * 0.98, ry: ry * 0.98, rz: rz * 0.98, count: 170 * sp.feathers * Math.min(1.4, L / 5 + 0.4), lenMin: L * 0.045, lenMax: L * (sp.feathers > 0.6 ? 0.1 : 0.07), base: sp.colors.base, accent: sp.colors.accent, belly: sp.colors.belly, crest: sp.colors.crest, crestFrac: 0.25, pattern: sp.pattern, seed: seed + 100, upBias: 0.35 }));

    D.shadow(scene, root, rz * 2.4 + tl.len * L * 0.4, rx * 3);
    anim.update = (t, st) => updateLand(anim, sp, t, st);
    anim.dispose = () => root.dispose(false, false);
    anim.height = (sp.height || 2) * scale; anim.radius = L * 0.5;
    return anim;
  }

  D.shadow = function (scene, root, len, wid) {
    const s = B.MeshBuilder.CreateDisc('shadow', { radius: 0.5, tessellation: 20 }, scene);
    s.rotation.x = Math.PI / 2; s.scaling.set(wid * 1.6, len, 1); s.position.y = 0.04; s.parent = root; s.isPickable = false;
    s.material = D.shadowMat || (D.shadowMat = (() => { const m = new B.StandardMaterial('shadowM', scene); m.diffuseColor = new B.Color3(0, 0, 0); m.alpha = 0.28; m.specularColor = new B.Color3(0, 0, 0); m.disableLighting = true; m.emissiveColor = new B.Color3(0, 0, 0); return m; })());
    return s;
  };

  function buildHead(scene, hj, sp, L, H, skin, fea, trait, anim, seed) {
    const hl = H.l * L, hh = H.h * L, hw = H.w * L;
    const pc = { L, zOff: L * 0.4 };
    const skull = D.ell(scene, hj, hw, hh, hl * 0.4, skin, sp, { paint: pc }); skull.position.z = hl * 0.2;
    const snout = D.ell(scene, hj, hw * 0.75, hh * (H.kind === 'duck' ? 0.45 : 0.55), hl * 0.38, skin, sp, { paint: pc }); snout.position.set(0, -hh * 0.05, hl * 0.62);
    const jaw = D.ell(scene, hj, hw * 0.6, hh * 0.3, hl * 0.4, skin, sp, { paint: Object.assign({ base: sp.colors.belly }, pc) }); jaw.position.set(0, -hh * 0.5, hl * 0.5);
    anim.jaw = jaw; anim.jawBase = jaw.rotation.x;
    if (H.kind === 'theropod') {
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) D.cone(scene, hj, hh * 0.22, hh * 0.06, '#f4eed8', s * hw * 0.55, -hh * 0.22, hl * (0.4 + i * 0.09), Math.PI, 0, 0);
    }
    if (H.kind === 'beak' || H.kind === 'small' || H.kind === 'duck') {
      const bk = D.ell(scene, hj, hw * 0.55, hh * 0.35, hl * 0.2, null, sp, { color: D.flatMat(scene, H.kind === 'beak' ? '#c9a24a' : '#d9a85a'), paint: { base: '#000', accent: '#000', belly: '#000' } });
      bk.position.set(0, -hh * 0.1, hl * 0.95); bk.scaling.y *= 0.9;
      if (H.kind === 'duck') { bk.scaling.x *= 1.5; bk.scaling.z *= 1.2; }
    }
    const ey = hh * 0.22;
    D.eye(scene, hj, -hw * 0.82, hh * 0.25, hl * 0.28, ey, '#17121c'); D.eye(scene, hj, hw * 0.82, hh * 0.25, hl * 0.28, ey, '#17121c');
    [-1, 1].forEach((s) => { const ring = B.MeshBuilder.CreateTorus('ring', { diameter: ey * 3.3, thickness: ey * 0.35, tessellation: 10 }, scene); ring.parent = hj; ring.rotation.z = Math.PI / 2; ring.position.set(s * hw * 0.78, hh * 0.25, hl * 0.28); ring.material = D.flatMat(scene, sp.colors.accent); });
    if (sp.feathers > 0.3 && H.kind === 'theropod') anim.parts.push(D.featherPatch(scene, hj, { mat: fea, rx: hw, ry: hh, rz: hl * 0.3, center: [0, hh * 0.3, hl * 0.1], count: 14 * sp.feathers, lenMin: L * 0.03, lenMax: L * 0.07, base: sp.colors.base, accent: sp.colors.crest, belly: sp.colors.belly, pattern: 'plain', seed: seed + 9, upBias: 0.9, zRange: [-1, 0.4] }));
  }

  function buildTraits(scene, core, sp, L, rx, ry, rz, trait, anim, seed) {
    const rng = Z.makeRng(seed + 77);
    const flat = (hex) => D.flatMat(scene, hex);
    const plate = (x, y, z, h, w, tilt, hexA, hexB) => {
      const m = B.MeshBuilder.CreateCylinder('plate', { height: h, diameterTop: 0.001, diameterBottom: w, tessellation: 4 }, scene);
      m.parent = core; m.position.set(x, y, z); m.scaling.z = 0.12; m.rotation.set(tilt || 0, Math.PI / 4, 0); m.rotation.z = 0;
      const mat = new B.StandardMaterial('pl', scene); mat.diffuseColor = Z.hex(hexA); mat.emissiveColor = Z.hex(hexB).scale(0.28); mat.specularColor = new B.Color3(0.2, 0.2, 0.2);
      m.material = mat; return m;
    };
    if (trait === 'plates') {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), z = rz * 0.8 - t * (rz * 1.7), size = Math.sin(Math.PI * (0.15 + t * 0.7)) * L * 0.2 + L * 0.03;
        const p = plate((i % 2 ? 1 : -1) * rx * 0.18, ry * 0.92 + size * 0.38, z, size, size * 0.7, -0.15, sp.colors.belly, sp.colors.accent);
        p.rotation.y = (i % 2 ? 1 : -1) * 0.2;
        const v = Z.hex(sp.colors.accent); p.material.diffuseColor = B.Color3.Lerp(Z.hex(sp.colors.belly), v, 0.35 + 0.5 * (i % 2));
      }
    } else if (trait === 'sail') {
      const sailMat = new B.StandardMaterial('sail', scene); sailMat.diffuseColor = Z.hex(sp.colors.accent); sailMat.emissiveColor = Z.hex(sp.colors.crest).scale(0.25); sailMat.backFaceCulling = false; sailMat.alpha = 0.92;
      const sail = B.MeshBuilder.CreateCylinder('sail', { height: ry * 2.1, diameterTop: 0.001, diameterBottom: rz * 1.6, tessellation: 3 }, scene);
      sail.parent = core; sail.position.set(0, ry * 1.3, -rz * 0.1); sail.scaling.x = 0.06; sail.rotation.y = Math.PI / 2 + 0.0; sail.material = sailMat; sail.rotation.z = Math.PI;
      sail.scaling.set(0.06, 1, 1);
    } else if (trait === 'armor') {
      for (let i = 0; i < 40; i++) {
        const u = rng() * 1.8 - 0.9, a = (rng() - 0.5) * 2.2, c = D.cone(scene, core, L * 0.07, L * 0.025, rng() < 0.3 ? sp.colors.accent : '#cdbf99', Math.sin(a) * rx * Math.sqrt(1 - u * u), Math.cos(a) * ry * Math.sqrt(1 - u * u) * 0.98, u * rz, 0, 0, Math.sin(a) * 0.8);
      }
    } else if (trait === 'dome') {
      const hd = D.ell(scene, anim.head, L * 0.045, L * 0.04, L * 0.05, null, sp, { color: D.flatMat(scene, '#e8d8b0') }); hd.position.set(0, L * 0.045, L * 0.07);
    } else if (trait === 'tubecrest') {
      const cr = D.seg(scene, anim.head, L * 0.13, L * 0.016, L * 0.012, null, sp, { ball: false }); cr.joint.position.set(0, L * 0.02, L * 0.05); cr.joint.rotation.x = -2.35; cr.joint.getChildMeshes().forEach((m) => { m.material = D.flatMat(scene, sp.colors.crest); });
    } else if (trait === 'crest') {
      [-1, 1].forEach((s) => { const pl = plate(0, 0, 0, L * 0.07, L * 0.06, 0, sp.colors.crest, sp.colors.crest); pl.parent = anim.head; pl.position.set(s * L * 0.012, L * 0.055, L * 0.07); pl.rotation.set(0, 0, 0); pl.scaling.set(0.12, 1, 0.8); });
    } else if (trait === 'frill') {
      const hj = anim.head, frillMat = new B.StandardMaterial('frill', scene); frillMat.diffuseColor = Z.hex(sp.colors.accent); frillMat.specularColor = new B.Color3(0.1, 0.1, 0.1); frillMat.emissiveColor = Z.hex(sp.colors.crest).scale(0.22);
      const fr = B.MeshBuilder.CreateDisc('frill', { radius: L * 0.13, tessellation: 24 }, scene); fr.parent = hj; fr.position.set(0, L * 0.05, -L * 0.02); fr.rotation.x = -0.4; fr.scaling.set(1.25, 1, 1); fr.material = frillMat; frillMat.backFaceCulling = false;
      for (let i = -4; i <= 4; i++) { const a = i / 4 * 1.2 - Math.PI / 2 + Math.PI; D.cone(scene, hj, L * 0.03, L * 0.013, sp.colors.belly, Math.sin(i / 4 * 1.25) * L * 0.16, L * 0.05 + Math.cos(i / 4 * 1.25) * L * 0.115, -L * 0.08, -0.4, 0, -i / 4 * 1.2); }
      [-1, 1].forEach((s) => D.cone(scene, hj, L * 0.17, L * 0.018, '#f2ead0', s * L * 0.05, L * 0.075, L * 0.15, 1.1, 0, 0));
      D.cone(scene, hj, L * 0.07, L * 0.02, '#f2ead0', 0, L * 0.04, L * 0.27, 0.7, 0, 0);
    } else if (trait === 'brow') {
      [-1, 1].forEach((s) => D.cone(scene, anim.head, L * 0.03, L * 0.015, sp.colors.crest, s * L * 0.03, L * 0.05, L * 0.04, 0, 0, 0));
    }
  }

  function updateLand(a, sp, t, st) {
    const w = st.walk || 0, sleep = st.sleep || 0, eat = st.eat || 0, F = a.F, sp0 = (st.speed || 1);
    const gait = t * (2.2 + 1.2 * sp0) * (sp.speed > 2 ? 1.3 : 1) / Math.max(0.55, Math.sqrt(a.L / 4));
    a.legs.forEach((l) => {
      const ph = gait + l.phase, s = Math.sin(ph);
      l.hip.rotation.x = l.base.a1 + (F.bi ? 0.55 : 0.32) * s * w + sleep * (F.bi ? 0.9 : 0.5);
      l.knee.rotation.x = l.base.a2 + Math.max(0, -Math.cos(ph)) * 0.55 * w - sleep * 0.4;
      l.ankle.rotation.x = l.base.a3 + Math.max(0, Math.cos(ph)) * 0.3 * w;
    });
    const bob = Math.abs(Math.sin(gait)) * a.L * 0.012 * w;
    const lower = sleep * (F.bi ? a.hipH * 0.5 : a.hipH * 0.25) + (st.bathe || 0) * a.hipH * 0.12;
    a.body.position.y = a.hipH - lower + bob + Math.sin(t * 1.3) * a.L * 0.002;
    a.body.rotation.z = Math.sin(gait) * 0.025 * w;
    const n = a.neck.length;
    a.neck.forEach((s, i) => {
      s.n.rotation.x = s.base + (i === 0 ? eat * 0.5 + sleep * 0.4 : eat * (0.9 / n) + sleep * 0.3 / n) + Math.sin(t * 0.8 + i * 0.7) * 0.025 + (F.bi && i > 0 ? Math.sin(gait * 2) * 0.03 * w : 0);
      s.n.rotation.y = sleep * (i - n / 2) * 0.14 + Math.sin(t * 0.37 + i) * 0.04 + (st.look || 0) * 0.12;
    });
    a.head.rotation.x = eat * 0.15 + sleep * 0.35 + (a.F.bi ? -0.1 : 0);
    if (a.jaw) a.jaw.rotation.x = a.jawBase + (st.roar || 0) * 0.55 * (0.6 + 0.4 * Math.sin(t * 14)) + (eat > 0.5 ? Math.max(0, Math.sin(t * 5)) * 0.18 : 0);
    a.tail.forEach((s, i) => { s.n.rotation.y = Math.sin(t * (0.9 + w * 1.4) - i * 0.55) * (0.07 + 0.08 * w) * (1 - sleep * 0.7); s.n.rotation.x = s.base + Math.sin(t * 0.7 - i * 0.4) * 0.015; });
    a.arms.forEach((m) => { m.n.rotation.x = m.base + Math.sin(t * 1.5 + m.s) * 0.08 + w * 0.2; });
  }
})(window.Z);
