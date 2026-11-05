/* Budgerigars (the small colorful stars), and pterosaurs. */
(function (Z) {
  const B = BABYLON, D = Z.Dino, tn = D.tn;
  const Bd = Z.Birds = {};

  const sstep = (a, b, x) => { const t = Z.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // Real budgie color mutations. mask = face/crown color, bar = barring color on a pale ground
  Bd.VARIANTS = {
    green:  { body: '#58c850', belly: '#8fe07a', mask: '#f6e45a', bar: '#17140f', wing: '#3a9a3a', tail: '#2c5fa8', cheek: '#7a3fc0', cere: '#3a74d8' },
    mint:   { body: '#8fd9b4', belly: '#b9ecd2', mask: '#f3efc0', bar: '#2a2a2a', wing: '#6bb89a', tail: '#4d86b8', cheek: '#8a6ac8', cere: '#c9a9d8' },
    blue:   { body: '#3f9be0', belly: '#78bdf0', mask: '#f4f6fa', bar: '#1a1a22', wing: '#2a6fb8', tail: '#26407a', cheek: '#6a3fc0', cere: '#2a60c8' },
    violet: { body: '#7a62d6', belly: '#a28ae8', mask: '#f1eef8', bar: '#1a1a22', wing: '#4a3a98', tail: '#2c2a70', cheek: '#5a2fa8', cere: '#3a4ac8' },
    yellow: { body: '#f5df4a', belly: '#fbef7a', mask: '#fdf6a8', bar: '#e6c93a', wing: '#e6cc3a', tail: '#e9d84a', cheek: '#f0d86a', cere: '#e8a0a8' }
  };
  Bd.variantFor = (uid) => ['green', 'green', 'blue', 'mint', 'green', 'violet', 'yellow', 'blue'][uid % 8];

  function paintHead(m, v) {
    const N = m.getVerticesData(B.VertexBuffer.NormalKind), n = N.length / 3, out = new Float32Array(n * 4);
    const mask = Z.hex(v.mask), body = Z.hex(v.body), bar = Z.hex(v.bar), cheek = Z.hex(v.cheek);
    for (let i = 0; i < n; i++) {
      const nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
      let c = mask.clone();
      const back = sstep(0.3, -0.2, nz) + (ny > 0.25 ? 0.4 : 0), stripe = sstep(0.1, 0.5, Math.sin(ny * 17 + nz * 7 - 1.0));
      if (nz < 0.45 && ny > -0.1) c = B.Color3.Lerp(c, bar, stripe * 0.9 * Z.clamp(back, 0, 1));
      if (ny < -0.2) c = B.Color3.Lerp(c, body, sstep(-0.2, -0.7, ny));
      if (nz < -0.3) c = B.Color3.Lerp(c, body, sstep(-0.3, -0.8, nz));
      const d = Math.hypot(Math.abs(nx) - 0.78, ny + 0.2, nz - 0.55);
      c = B.Color3.Lerp(c, cheek, sstep(0.38, 0.2, d));
      out.set([c.r, c.g, c.b, 1], i * 4);
    }
    m.setVerticesData(B.VertexBuffer.ColorKind, out);
  }

  Bd.buildBudgie = function (scene, sp, scale, seed, opts) {
    const vname = (opts && opts.variant) || Bd.variantFor(seed), V = Bd.VARIANTS[vname], L = sp.len * scale;
    const M = D.materials(scene, sp, 'bud'), skin = M.skin, fea = M.feather;
    const root = tn(scene, null);
    const body = tn(scene, root, 0, L * 0.5, 0), core = tn(scene, body, 0, 0, 0);
    const bsp = Object.assign({}, sp, { colors: { base: V.body, accent: V.bar, belly: V.belly, crest: V.mask }, pattern: 'plain' });
    const rx = L * 0.14, ry = L * 0.17, rz = L * 0.21;
    D.ell(scene, core, rx, ry, rz, skin, bsp, { seg: 20 });
    const mk = (name, x, y, z, w, h, d, hex) => { const e = B.MeshBuilder.CreateSphere(name, { diameter: 1, segments: 8 }, scene); e.parent = core; e.position.set(x, y, z); e.scaling.set(w, h, d); e.material = D.flatMat(scene, hex); return e; };

    // head
    const head = tn(scene, core, 0, ry * 0.8, rz * 0.65), hr = L * 0.125;
    const hm = B.MeshBuilder.CreateSphere('head', { diameter: hr * 2, segments: 22 }, scene); hm.parent = head; hm.material = skin; hm.scaling.set(1, 0.97, 1.02);
    paintHead(hm, V);
    D.eye(scene, head, -hr * 0.82, hr * 0.18, hr * 0.5, hr * 0.2, '#14101a'); D.eye(scene, head, hr * 0.82, hr * 0.18, hr * 0.5, hr * 0.2, '#14101a');
    [-1, 1].forEach((s) => { const ring = B.MeshBuilder.CreateTorus('er', { diameter: hr * 0.62, thickness: hr * 0.09, tessellation: 12 }, scene); ring.parent = head; ring.rotation.z = Math.PI / 2; ring.position.set(s * hr * 0.8, hr * 0.18, hr * 0.5); ring.material = D.flatMat(scene, '#f5f2ea'); });
    const cere = B.MeshBuilder.CreateSphere('cere', { diameter: hr * 0.62, segments: 8 }, scene); cere.parent = head; cere.position.set(0, hr * 0.14, hr * 0.95); cere.scaling.set(1.3, 0.8, 0.8); cere.material = D.flatMat(scene, V.cere);
    const beakU = B.MeshBuilder.CreateSphere('bu', { diameter: hr * 0.5, segments: 8 }, scene); beakU.parent = head; beakU.position.set(0, -hr * 0.05, hr * 1.0); beakU.scaling.set(1.05, 0.9, 1.1); beakU.material = D.flatMat(scene, '#e9b85a');
    const jaw = B.MeshBuilder.CreateSphere('bj', { diameter: hr * 0.35, segments: 6 }, scene); jaw.parent = head; jaw.position.set(0, -hr * 0.32, hr * 0.92); jaw.scaling.set(1, 0.7, 1.1); jaw.material = D.flatMat(scene, '#d9a24a');
    // throat spots
    [-1, 1].forEach((s) => { for (let i = 0; i < 3; i++) { const p = mk('spot', s * (hr * (0.5 + i * 0.12)), ry * 0.5 + hr * 0.18 - i * hr * 0.17, rz * 0.65 + hr * (0.82 - i * 0.04), hr * 0.2, hr * 0.2, hr * 0.12, '#101014'); p.parent = body; p.position.set(s * hr * (0.52 + i * 0.1), ry * 0.8 - hr * 0.62 + i * 0, rz * 0.65 + hr * (0.8 - i * 0.07)); p.position.y += -hr * 0.1 * i - hr * 0.1; p.position.x = s * hr * (0.45 + i * 0.12); } });
    // plumage
    const fcommon = { mat: fea, base: V.body, accent: V.bar, belly: V.belly, seed: seed };
    D.featherPatch(scene, core, Object.assign({ rx: rx * 0.97, ry: ry * 0.97, rz: rz * 0.97, count: 150, lenMin: L * 0.05, lenMax: L * 0.085, width: 0.4, upBias: 0.3,
      colorFn: (u, cy, sx, rng) => { const top = cy > 0.1; if (top && u < 0.5 && u > -0.7) { return B.Color3.Lerp(Z.hex(V.mask), Z.hex(V.bar), sstep(0.2, 0.7, Math.sin(u * 40 + rng() * 2)) * 0.8 * (vname === 'yellow' ? 0 : 1)); } return B.Color3.Lerp(Z.hex(V.belly), Z.hex(V.body), sstep(-0.2, 0.7, cy)); } }, fcommon));

    // wings
    const wings = [];
    [-1, 1].forEach((s) => {
      const w = tn(scene, core, s * rx * 0.95, ry * 0.45, rz * 0.35);
      const fold = B.MeshBuilder.CreateSphere('wf', { diameter: 1, segments: 10 }, scene); fold.parent = w; fold.scaling.set(L * 0.035, L * 0.09, L * 0.32); fold.position.set(s * L * 0.005, -L * 0.02, -L * 0.14); fold.material = skin;
      D.paint(fold, bsp, { kind: 'sphere', base: V.wing, accent: V.bar, belly: V.wing, pattern: 'bands', L: L * 0.5, sz: L * 0.32, patternAmt: vname === 'yellow' ? 0.2 : 0.8 });
      D.featherPatch(scene, w, { mat: fea, rx: L * 0.05, ry: L * 0.04, rz: L * 0.15, center: [s * L * 0.01, -L * 0.02, -L * 0.15], count: 18, lenMin: L * 0.2, lenMax: L * 0.3, back: 1, flare: 0.1, width: 0.22, upBias: 0.5,
        base: V.wing, accent: V.bar, belly: V.wing, seed: seed + s, colorFn: (u, cy, sx, rng) => B.Color3.Lerp(Z.hex(V.wing), Z.hex(V.bar), 0.55 + rng() * 0.3) });
      wings.push({ n: w, s });
    });
    // tail
    const tail = tn(scene, core, 0, 0, -rz * 0.85); tail.rotation.x = -0.08;
    D.featherPatch(scene, tail, { mat: fea, rx: L * 0.025, ry: L * 0.012, rz: L * 0.04, center: [0, 0, 0], count: 7, lenMin: L * 0.3, lenMax: L * 0.42, back: 1, flare: 0, width: 0.1, upBias: 1,
      base: V.tail, accent: V.tail, belly: V.tail, seed: seed + 9, colorFn: (u, cy, sx, rng) => B.Color3.Lerp(Z.hex(V.tail), Z.hex(V.wing), rng() * 0.5) });
    // legs
    const legs = [-1, 1].map((s) => {
      const hip = tn(scene, core, s * rx * 0.4, -ry * 0.75, 0.0);
      const l = D.seg(scene, hip, L * 0.16, L * 0.018, L * 0.014, D.flatMat(scene, '#c9a89a'), bsp, { ball: false }); hip.rotation.x = Math.PI / 2;
      for (let t = -1; t <= 1; t += 2) { const toe = B.MeshBuilder.CreateCylinder('toe', { height: L * 0.08, diameter: L * 0.016, tessellation: 5 }, scene); toe.parent = l.tip; toe.rotation.x = Math.PI / 2; toe.position.set(t * L * 0.012, 0, L * 0.035); toe.material = D.flatMat(scene, '#c9a89a'); }
      return hip;
    });
    D.shadow(scene, root, L * 0.7, L * 0.4);
    const api = { root, body, wings, head, jaw, legs, tail, L, variant: vname, height: L, radius: L };
    api.update = (t, st) => {
      const fly = st.fly || 0, perch = 1 - fly;
      body.rotation.x = -0.75 * perch + 0.08 * fly + (st.feed || 0) * 0.45;
      body.position.y = (st.perchY !== undefined ? st.perchY : 0) + L * (0.47 + 0.14 * perch * 0) + Math.sin(t * 2 + seed) * L * 0.004 * perch;
      const flap = Math.sin(t * 34 + seed) * 0.9;
      wings.forEach((w) => {
        w.n.rotation.y = -w.s * (1.35 * fly + 0.05 * perch);
        w.n.rotation.x = fly * flap * 0.9 + 0.05;
      });
      legs.forEach((l) => { l.rotation.x = Math.PI / 2 + 0.9 * fly; });
      tail.rotation.x = -0.08 + 0.5 * perch + Math.sin(t * 3 + seed) * 0.04 * perch;
      const chat = st.chat ? Math.max(0, Math.sin(t * 22 + seed)) * 0.35 : 0;
      jaw.rotation.x = chat + (st.chirp || 0) * 0.35;
      head.rotation.y = (st.look || 0) * 0.9 + Math.sin(t * 1.3 + seed * 3) * 0.15 * perch;
      head.rotation.x = (st.preen || 0) * 0.6 + Math.sin(t * 2.1 + seed) * 0.05;
      head.rotation.z = (st.preen || 0) * 0.5;
    };
    api.dispose = () => root.dispose(false, false);
    return api;
  };

  // ---------- pterosaur ----------
  function membrane(scene, mat, pts, c0, c1) {
    const pos = [], col = [], idx = [];
    pts.forEach((p, i) => { pos.push(p[0], p[1], p[2]); const c = B.Color3.Lerp(Z.hex(c0), Z.hex(c1), p[3]); col.push(c.r, c.g, c.b, 1); });
    for (let i = 0; i + 2 < pts.length; i += 1) idx.push(i, i + 1, i + 2);
    const m = new B.Mesh('mem', scene), vd = new B.VertexData(); vd.positions = pos; vd.indices = idx; vd.colors = col; vd.normals = [];
    B.VertexData.ComputeNormals(pos, idx, vd.normals); vd.applyToMesh(m); m.material = mat; return m;
  }

  Bd.buildPtero = function (scene, sp, scale, seed) {
    const L = sp.len * scale, M = D.materials(scene, sp), skin = M.skin;
    const root = tn(scene, null), body = tn(scene, root, 0, L * 0.3, 0), core = tn(scene, body, 0, 0, 0);
    D.ell(scene, core, L * 0.06, L * 0.065, L * 0.14, skin, sp, { paint: { L, pattern: 'plain' } });
    const neck = D.seg(scene, core, L * 0.14, L * 0.04, L * 0.028, skin, sp, { z: L * 0.12, y: L * 0.02 }); neck.joint.rotation.x = -0.5;
    const head = tn(scene, neck.tip, 0, 0, 0); head.rotation.x = 0.45;
    D.ell(scene, head, L * 0.035, L * 0.04, L * 0.07, skin, sp, { paint: { base: sp.colors.base } }).position.z = L * 0.03;
    const beak = D.seg(scene, head, L * 0.26, L * 0.022, L * 0.004, D.flatMat(scene, '#f0c070'), sp, { z: L * 0.08, y: -L * 0.003, ball: false }); beak.joint.rotation.x = 0.1;
    const crest = D.cone(scene, head, L * 0.2, L * 0.018, sp.colors.crest, 0, L * 0.02, -L * 0.1, -1.55 - 0.2, 0, 0);
    D.eye(scene, head, -L * 0.032, L * 0.018, L * 0.04, L * 0.012, '#17121c'); D.eye(scene, head, L * 0.032, L * 0.018, L * 0.04, L * 0.012, '#17121c');
    const wm = new B.StandardMaterial('wing_' + sp.id, scene); wm.backFaceCulling = false; wm.specularColor = new B.Color3(0.05, 0.05, 0.05); wm.emissiveColor = new B.Color3(0.12, 0.08, 0.14); wm.diffuseColor = new B.Color3(1, 1, 1);
    const wings = [];
    [-1, 1].forEach((s) => {
      const sh = tn(scene, core, s * L * 0.05, L * 0.02, L * 0.04), sw = s;
      const half = L * 0.5;
      const inner = membrane(scene, wm, [[0, 0, L * 0.05, 0], [0, 0, -L * 0.18, 0.2], [half * 0.5 * sw, 0, L * 0.06, 0.4], [half * 0.55 * sw, 0, -L * 0.17, 0.6], [half * 0.5 * sw, 0, L * 0.06, 0.4]], sp.colors.base, sp.colors.accent);
      inner.parent = sh;
      const el = tn(scene, sh, half * 0.5 * sw, 0, L * 0.06);
      const outer = membrane(scene, wm, [[0, 0, 0, 0.5], [0.05 * sw, 0, -L * 0.23, 0.7], [half * 0.5 * sw, L * 0.03, -L * 0.06, 0.9], [half * 0.5 * sw, L * 0.03, -L * 0.06, 1], [0.05 * sw, 0, -L * 0.23, 0.7]], sp.colors.base, sp.colors.accent);
      outer.parent = el;
      const bone = B.MeshBuilder.CreateCylinder('bone', { height: half, diameter: L * 0.014, tessellation: 5 }, scene); bone.parent = sh; bone.rotation.z = Math.PI / 2; bone.position.set(half * 0.5 * sw, 0, L * 0.055); bone.material = D.flatMat(scene, '#5a3d6a');
      wings.push({ sh, el, s });
    });
    const tail = D.seg(scene, core, L * 0.1, L * 0.015, L * 0.006, skin, sp, { z: -L * 0.13, ball: false }); tail.joint.rotation.y = Math.PI;
    const legsG = [-1, 1].map((s) => D.seg(scene, core, L * 0.1, L * 0.012, L * 0.008, skin, sp, { x: s * L * 0.035, y: -L * 0.04, z: -L * 0.06, ball: false }).joint);
    legsG.forEach((j) => { j.rotation.x = 2.2; });
    D.shadow(scene, root, L * 0.6, L * 0.9);
    const api = { root, body, wings, head, L, height: L * 0.6, radius: L * 0.6 };
    api.update = (t, st) => {
      const fly = st.fly === undefined ? 1 : st.fly, flap = Math.sin(t * 5.5 + seed) * 0.7 * (st.flap === undefined ? 1 : st.flap);
      wings.forEach((w) => { w.sh.rotation.z = w.s * (flap * fly + (1 - fly) * -0.3); w.el.rotation.z = w.s * (-flap * 0.55 * fly + 0.1); });
      body.position.y = L * 0.3 + (1 - fly) * 0 + Math.sin(t * 5.5 + seed) * L * 0.02 * fly;
      head.rotation.x = 0.45 + Math.sin(t * 0.8) * 0.05; neck.joint.rotation.y = Math.sin(t * 0.5 + seed) * 0.15;
    };
    api.dispose = () => root.dispose(false, false);
    return api;
  };
})(window.Z);
