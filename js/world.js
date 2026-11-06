/* World builder: terrain, paths, art deco buildings, exhibits, stands, cable car, trees, sky. Everything static is baked
   into a few vertex-coloured meshes (90s low-poly look, cheap to render); layout comes from data/world.json. */
(function (Z) {
  const B = BABYLON;
  const W = Z.World = { cableT: 0 };
  let scene, hemi, sun, parts, glass, lit, signs;

  const tint = (m, hex, a) => {
    const c = Z.hex(hex), n = m.getTotalVertices(), cols = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { cols[i * 4] = c.r; cols[i * 4 + 1] = c.g; cols[i * 4 + 2] = c.b; cols[i * 4 + 3] = a === undefined ? 1 : a; }
    m.setVerticesData(B.VertexBuffer.ColorKind, cols); return m;
  };
  const put = (list, m, hex, a) => { tint(m, hex, a); m.isPickable = false; list.push(m); return m; };
  const box = (x, y0, z, w, h, d, hex, ry, list) => { const m = B.MeshBuilder.CreateBox('b', { width: w, height: h, depth: d }, scene); m.position.set(x, y0 + h / 2, z); if (ry) m.rotation.y = ry; return put(list || parts, m, hex); };
  const cyl = (x, y0, z, r, h, hex, tess, list, rTop) => { const m = B.MeshBuilder.CreateCylinder('c', { height: h, diameterBottom: r * 2, diameterTop: (rTop === undefined ? r : rTop) * 2, tessellation: tess || 8 }, scene); m.position.set(x, y0 + h / 2, z); return put(list || parts, m, hex); };
  const ico = (x, y, z, r, hex, sy, rng) => { const m = B.MeshBuilder.CreateIcoSphere('i', { radius: r, subdivisions: 1, flat: true }, scene); m.position.set(x, y, z); m.scaling.y = sy || 1; if (rng) m.rotation.y = rng() * 6; return put(parts, m, hex); };
  const merge = (list, mat, name) => {
    if (!list.length) return null;
    const m = B.Mesh.MergeMeshes(list, true, true); m.name = name; m.material = mat; m.isPickable = false; m.freezeWorldMatrix(); list.length = 0; return m;
  };
  const stdMat = (name, o) => { const m = new B.StandardMaterial(name, scene); m.specularColor = new B.Color3(0, 0, 0); Object.assign(m, o || {}); return m; };

  W.sign = function (text, w, h, x, y, z, face, bg, fg, font) {
    const dt = new B.DynamicTexture('sign', { width: 512, height: Math.round(512 * h / w) }, scene, true), c = dt.getContext();
    c.fillStyle = bg; c.fillRect(0, 0, 512, dt.getSize().height);
    c.strokeStyle = fg; c.lineWidth = 8; c.strokeRect(8, 8, 496, dt.getSize().height - 16);
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    const lines = text.split('\n'), height = dt.getSize().height, padding = 20;
    let fs = Math.min((font || 78) / lines.length * (lines.length > 1 ? 1.15 : 1), (height - padding * 2) / lines.length);
    const setFont = () => { c.font = '700 ' + fs + 'px Copperplate, "Gill Sans", "Trebuchet MS", sans-serif'; };
    setFont();
    const widest = Math.max(...lines.map((ln) => c.measureText(ln).width));
    if (widest > 512 - padding * 2) { fs *= (512 - padding * 2) / widest; setFont(); }
    lines.forEach((ln, i) => c.fillText(ln, 256, height / 2 + (i - (lines.length - 1) / 2) * fs));
    dt.update();
    const m = B.MeshBuilder.CreatePlane('sign', { width: w, height: h }, scene), mat = stdMat('signM', { disableLighting: true });
    mat.emissiveTexture = dt; mat.diffuseColor = new B.Color3(0, 0, 0); m.material = mat; m.position.set(x, y, z);
    m.rotation.y = Math.atan2(-face[0], -face[1]); m.isPickable = false; signs.push(m); return m;
  };

  // ---------- collision ----------
  W.solids = [];
  const solid = (x0, z0, x1, z1) => W.solids.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  W.collide = function (x, z, r, skip) {
    for (let pass = 0; pass < 2; pass++) {
      for (const s of W.solids) {
        if (s === skip) continue;
        const cx = Z.clamp(x, s[0], s[2]), cz = Z.clamp(z, s[1], s[3]);
        const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; x += dx * k; z += dz * k; }
          else { const l = x - s[0], rr = s[2] - x, t = z - s[1], b = s[3] - z, m = Math.min(l, rr, t, b); if (m === l) x = s[0] - r; else if (m === rr) x = s[2] + r; else if (m === t) z = s[1] - r; else z = s[3] + r; }
        }
      }
    }
    return [x, z];
  };

  // ---------- graph ----------
  W.nearestNode = function (x, z) {
    let best = null, bd = 1e9;
    for (const k in W.nodes) { const d = Z.dist(x, z, W.nodes[k][0], W.nodes[k][1]); if (d < bd) { bd = d; best = k; } }
    return best;
  };
  W.path = function (a, b) {
    if (a === b) return [a];
    const prev = { [a]: null }, q = [a];
    while (q.length) { const n = q.shift(); if (n === b) break; (W.adj[n] || []).forEach((m) => { if (!(m in prev)) { prev[m] = n; q.push(m); } }); }
    if (!(b in prev)) return [a, b];
    const out = []; for (let n = b; n; n = prev[n]) out.unshift(n); return out;
  };

  // ---------- cable car ----------
  W.cablePos = function (f) {
    const pts = W.cablePts, seg = W.cableLen; let d = f * seg.total, i = 0;
    while (i < seg.s.length - 1 && d > seg.s[i]) { d -= seg.s[i]; i++; }
    const a = pts[i], b = pts[i + 1], t = Z.clamp(d / seg.s[i], 0, 1);
    return { x: Z.lerp(a.x, b.x, t), y: Z.lerp(a.y, b.y, t), z: Z.lerp(a.z, b.z, t), heading: Math.atan2(b.x - a.x, b.z - a.z) };
  };
  // Returns fractions for both cars plus which car (if any) is docked at each station right now.
  W.cableState = function () {
    const dwell = 9, travel = 30, T = (dwell + travel) * 2, t = ((W.cableT % T) + T) % T;
    let f; let dockA = -1, dockB = -1, nextDepart = 0;
    if (t < dwell) { f = 0; dockA = 0; nextDepart = dwell - t; }
    else if (t < dwell + travel) f = Z.smooth(0, 1, (t - dwell) / travel);
    else if (t < 2 * dwell + travel) { f = 1; dockB = 0; nextDepart = 2 * dwell + travel - t; }
    else f = 1 - Z.smooth(0, 1, (t - 2 * dwell - travel) / travel);
    // Car 0 starts at A, car 1 at B; they mirror each other.
    return { f: [f, 1 - f], dockA: dockA >= 0 ? 0 : (dockB >= 0 ? 1 : -1), dockB: dockB >= 0 ? 0 : (dockA >= 0 ? 1 : -1), nextDepart, atA: t < dwell || t >= 2 * dwell + 2 * travel - 0.01, atB: t >= dwell + travel && t < 2 * dwell + travel, travel, dwell, t };
  };

  function buildCable(c) {
    const h = c.height, a = c.a, b = c.b, dir = new B.Vector3(c.pylons[0][0] - a.x, 0, c.pylons[0][1] - a.z).normalize(), dir2 = new B.Vector3(c.pylons[c.pylons.length - 1][0] - b.x, 0, c.pylons[c.pylons.length - 1][1] - b.z).normalize();
    const pts = [{ x: a.x, y: 5.2, z: a.z }, { x: a.x + dir.x * 6, y: h, z: a.z + dir.z * 6 }].concat(c.pylons.map((p) => ({ x: p[0], y: h, z: p[1] })), [{ x: b.x + dir2.x * 6, y: h, z: b.z + dir2.z * 6 }, { x: b.x, y: 5.2, z: b.z }]);
    W.cablePts = pts; const s = []; let total = 0;
    for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y, pts[i + 1].z - pts[i].z); s.push(d); total += d; }
    W.cableLen = { s, total };
    const rope = B.MeshBuilder.CreateTube('cable', { path: pts.map((p) => new B.Vector3(p.x, p.y + 0.4, p.z)), radius: 0.07, tessellation: 5 }, scene);
    rope.material = stdMat('ropeM', { diffuseColor: new B.Color3(0.15, 0.1, 0.2) }); rope.isPickable = false;
    c.pylons.forEach((p) => { cyl(p[0], 0, p[1], 0.45, h, '#cdbde8', 6); box(p[0], h - 0.6, p[1], 2.6, 0.4, 0.5, '#ff8a2b'); });
    [a, b].forEach((s2, i) => {
      const d = i ? dir2 : dir, x = s2.x, z = s2.z;
      for (const [ox, oz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) cyl(x + ox, 0, z + oz, 0.35, 4.6, '#8c4bd6', 6);
      box(x, 4.6, z, 8, 0.6, 8, '#fff3e0'); box(x, 8.6, z, 9, 0.5, 9, '#ff8a2b'); box(x, 9.1, z, 6, 0.7, 6, '#ffc247');
      for (const [ox, oz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) cyl(x + ox, 5.2, z + oz, 0.2, 3.4, '#5c2aa0', 5);
      const stairZ = i ? -1 : 1; // stairs lead toward the boarding point
      for (let k = 0; k < 6; k++) box(x, k * 0.78, z + stairZ * (4.6 + (5 - k) * 1.1) * 1, 3.4, 0.78, 1.1, '#e8d6b0');
      solid(x - 4, z - 4, x + 4, z + 4);
    });
    // gondolas
    W.cars = [0, 1].map((k) => {
      const root = new B.TransformNode('car' + k, scene), L = [];
      const prev = parts; parts = L;
      box(0, -3.4, 0, 3.4, 2, 2.2, k ? '#ff8a2b' : '#8c4bd6'); box(0, -1.4, 0, 3.8, 0.35, 2.6, '#fff3e0'); box(0, -3.4, 1.12, 2.4, 1.1, 0.08, '#bfe8ff'); box(0, -3.4, -1.12, 2.4, 1.1, 0.08, '#bfe8ff'); cyl(0, -1.2, 0, 0.12, 1.4, '#2b1646', 5);
      parts = prev;
      const m = B.Mesh.MergeMeshes(L, true, true); m.material = Z.World.sharedMat; m.parent = root; m.isPickable = false;
      return { root, mesh: m };
    });
  }

  // ---------- fences ----------
  function fence(rect, o) {
    const [x0, z0, x1, z1] = rect, h = o.h || 2, post = o.post || '#8a5a2a', rail = o.rail || '#b07a3a', gaps = o.gaps || [];
    const sides = { s: [x0, z0, x1, z0, 1, 0], n: [x0, z1, x1, z1, 1, 0], w: [x0, z0, x0, z1, 0, 1], e: [x1, z0, x1, z1, 0, 1] };
    for (const key in sides) {
      const [ax, az, bx, bz, ux, uz] = sides[key], len = Math.abs(bx - ax) + Math.abs(bz - az), g = gaps.filter((q) => q.side === key);
      const segs = []; let cur = 0; g.sort((p, q) => p.c - q.c).forEach((q) => { segs.push([cur, q.c - q.w / 2]); cur = q.c + q.w / 2; }); segs.push([cur, len]);
      segs.forEach(([s0, s1]) => {
        if (s1 - s0 < 0.2) return;
        const mx = ax + ux * (s0 + s1) / 2, mz = az + uz * (s0 + s1) / 2, l = s1 - s0;
        const w = ux ? l : 0.35, d = uz ? l : 0.35;
        if (o.net) { const m = B.MeshBuilder.CreateBox('net', { width: ux ? l : 0.1, height: h, depth: uz ? l : 0.1 }, scene); m.position.set(mx, h / 2, mz); put(glass, m, '#d8f0ff', 0.14); }
        else if (o.bars) { for (let t = 0; t <= l; t += 1.4) box(ux ? ax + (s0 + t) : ax, 0, uz ? az + (s0 + t) : az, 0.16, h, 0.16, rail); box(mx, h - 0.2, mz, w, 0.3, d, post); box(mx, 0.3, mz, w, 0.5, d, post); }
        else { box(mx, h * 0.45, mz, w, 0.16, d, rail); box(mx, h * 0.85, mz, w, 0.16, d, rail); }
        for (let t = s0; t <= s1 + 0.01; t += o.step || 4) box(ax + ux * t, 0, az + uz * t, 0.4, h, 0.4, post);
        solid(mx - w / 2 - 0.15, mz - d / 2 - 0.15, mx + w / 2 + 0.15, mz + d / 2 + 0.15);
      });
    }
  }

  function tree(x, z, rng, kind) {
    const s = 0.8 + rng() * 0.8;
    if (kind === 0) { // conifer
      cyl(x, 0, z, 0.35 * s, 3 * s, '#6b4a2b', 5);
      for (let i = 0; i < 3; i++) cyl(x, 2 * s + i * 1.7 * s, z, (2.2 - i * 0.6) * s, 2.6 * s, i % 2 ? '#2f7a4a' : '#27694a', 7, null, 0.05);
    } else if (kind === 1) { // broadleaf
      cyl(x, 0, z, 0.4 * s, 3.5 * s, '#7a5233', 5);
      ico(x, 4.6 * s, z, 2.4 * s, rng() < 0.5 ? '#4a9a3c' : '#5aa845', 0.85, rng); ico(x + s, 3.8 * s, z + 0.5 * s, 1.6 * s, '#3f8a38', 0.9, rng);
    } else if (kind === 2) { // cycad
      cyl(x, 0, z, 0.45 * s, 2.2 * s, '#6e5a3a', 6);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, m = B.MeshBuilder.CreateBox('f', { width: 0.5 * s, height: 0.08, depth: 3.2 * s }, scene); m.position.set(x + Math.sin(a) * 1.3 * s, 2.6 * s, z + Math.cos(a) * 1.3 * s); m.rotation.y = a; m.rotation.x = -0.45; put(parts, m, i % 2 ? '#3f9a4e' : '#52ad4f'); }
    } else { // ginkgo (orange accents)
      cyl(x, 0, z, 0.35 * s, 3 * s, '#6b4a2b', 5); ico(x, 4.2 * s, z, 2 * s, rng() < 0.6 ? '#f2b032' : '#e8731c', 0.9, rng);
    }
  }

  function safariTruck(x, z) {
    box(x, 0.7, z, 7, 1.25, 3.2, '#c6ad72');
    box(x - 1.2, 1.9, z, 3.8, 0.3, 3.4, '#466b49');
    box(x + 2, 1.9, z, 2.4, 1.1, 3.2, '#c6ad72');
    box(x + 2.15, 2.35, z, 2.5, 0.16, 3.3, '#466b49');
    box(x + 2.2, 2.05, z - 1.62, 1.5, 0.65, 0.08, '#93c9c4');
    box(x + 2.2, 2.05, z + 1.62, 1.5, 0.65, 0.08, '#93c9c4');
    box(x + 3.25, 2.05, z, 0.08, 0.65, 2.4, '#93c9c4');
    for (const ox of [-2.4, 2.3]) for (const side of [-1, 1]) {
      const wheel = B.MeshBuilder.CreateCylinder('truckWheel', { height: 0.55, diameter: 1.5, tessellation: 12 }, scene);
      wheel.rotation.x = Math.PI / 2; wheel.position.set(x + ox, 0.75, z + side * 1.65); put(parts, wheel, '#282331');
      const hub = B.MeshBuilder.CreateCylinder('truckHub', { height: 0.57, diameter: 0.55, tessellation: 10 }, scene);
      hub.rotation.x = Math.PI / 2; hub.position.set(x + ox, 0.75, z + side * 1.65); put(parts, hub, '#d7c8aa');
    }
    for (const ox of [-2.7, -0.5]) for (const side of [-1, 1]) box(x + ox, 2.05, z + side * 1.3, 0.12, 1.2, 0.12, '#466b49');
    box(x - 1.6, 3.25, z, 4, 0.15, 2.9, '#e8d8ae');
    box(x + 3.55, 0.65, z, 0.22, 0.35, 3.4, '#403b38');
    W.sign('ZOO SAFARI', 2.7, 0.45, x - 1.3, 1.35, z - 1.64, [0, -1], '#466b49', '#fff3e0', 40);
    solid(x - 3.8, z - 2, x + 3.8, z + 2);
  }

  // ---------- build ----------
  W.build = function (sc, data) {
    scene = sc; parts = []; glass = []; lit = []; signs = [];
    W.data = data; W.nodes = data.nodes; W.adj = {};
    data.edges.forEach(([a, b]) => { (W.adj[a] = W.adj[a] || []).push(b); (W.adj[b] = W.adj[b] || []).push(a); });
    const rng = Z.makeRng(77), P = data.park;
    W.exhibits = data.exhibits.map((e) => Object.assign({ cx: (e.rect[0] + e.rect[2]) / 2, cz: (e.rect[1] + e.rect[3]) / 2 }, e));
    W.exhibitById = {}; W.exhibits.forEach((e) => { W.exhibitById[e.id] = e; });
    Z.world = W;

    // lights + sky
    hemi = new B.HemisphericLight('hemi', new B.Vector3(0.1, 1, 0.2), scene); hemi.diffuse = new B.Color3(1, 0.97, 0.92); hemi.groundColor = new B.Color3(0.55, 0.45, 0.65); hemi.specular = new B.Color3(0, 0, 0);
    sun = new B.DirectionalLight('sun', new B.Vector3(-0.5, -1, 0.4), scene); sun.position = new B.Vector3(60, 100, -40);
    scene.fogMode = B.Scene.FOGMODE_EXP2; scene.fogDensity = 0.0042;
    W.hemi = hemi; W.sun = sun;

    // shared vertex-colour materials
    const mat = W.sharedMat = stdMat('world', { diffuseColor: new B.Color3(1, 1, 1) });
    const glassMat = stdMat('glass', { diffuseColor: new B.Color3(1, 1, 1), alpha: 0.4, backFaceCulling: false }); glassMat.useAlphaFromDiffuseTexture = false;
    const litMat = stdMat('lit', { diffuseColor: new B.Color3(0.2, 0.2, 0.2), emissiveColor: new B.Color3(0.05, 0.05, 0.05) }); W.litMat = litMat;

    // ground
    box(0, -0.6, 40, 560, 0.6, 560, '#79b85a');
    box(0, 0, 40, 2 * 80 + 2, 0.05, 142, '#6aa84e');
    box(0, 0, -62, 150, 0.05, 56, '#8dd06a');
    const pathCol = '#e8cf9c';
    data.edges.forEach(([a, b]) => {
      const A = data.nodes[a], C = data.nodes[b], len = Math.hypot(C[0] - A[0], C[1] - A[1]);
      const m = B.MeshBuilder.CreateBox('p', { width: 4.2, height: 0.08, depth: len + 4.2 }, scene); m.position.set((A[0] + C[0]) / 2, 0.04, (A[1] + C[1]) / 2); m.rotation.y = Math.atan2(C[0] - A[0], C[1] - A[1]); put(parts, m, pathCol);
    });
    box(0, 0, -40, 7, 0.09, 26, pathCol); box(0, 0, -53, 12, 0.09, 6, pathCol);
    const plaza = B.MeshBuilder.CreateCylinder('plaza', { diameter: 20, height: 0.1, tessellation: 28 }, scene); plaza.position.set(0, 0.06, 30); put(parts, plaza, '#d9b88a');
    const ring = B.MeshBuilder.CreateCylinder('ring', { diameter: 12, height: 0.12, tessellation: 28 }, scene); ring.position.set(0, 0.07, 30); put(parts, ring, '#b784e6');
    const ring2 = B.MeshBuilder.CreateCylinder('ring2', { diameter: 7, height: 0.14, tessellation: 28 }, scene); ring2.position.set(0, 0.08, 30); put(parts, ring2, '#ffc247');
    // plaza fountain
    cyl(0, 0, 30, 2.4, 0.8, '#cdbde8', 12); cyl(0, 0.8, 30, 0.5, 2.4, '#ffc247', 8); ico(0, 3.5, 30, 0.9, '#1fb5a8');

    // exhibit floors, ponds, fences, decor
    const floors = { steg: '#5e9a4a', rex: '#6b8f3c', trike: '#8fa84e', petting: '#c4b878', aviary: '#7ab0a8', parakeets: '#d9a98a', lagoon: '#4e8a62', yardE: '#a5b36a', yardW: '#9bb7c9' };
    W.exhibits.forEach((e) => {
      const [x0, z0, x1, z1] = e.rect;
      if (!e.inside) box(e.cx, 0.02, e.cz, x1 - x0, 0.08, z1 - z0, floors[e.id] || '#6aa84e');
      if (e.pond) { const [px0, pz0, px1, pz1] = e.pond, m = B.MeshBuilder.CreateDisc('pond', { radius: 0.5, tessellation: 24 }, scene); m.rotation.x = Math.PI / 2; m.scaling.set(px1 - px0, pz1 - pz0, 1); m.position.set((px0 + px1) / 2, 0.14, (pz0 + pz1) / 2); put(glass, m, '#3aa6d4', 0.78); e.pondC = [(px0 + px1) / 2, (pz0 + pz1) / 2]; e.pondR = [(px1 - px0) / 2, (pz1 - pz0) / 2];
        const rim = B.MeshBuilder.CreateDisc('rim', { radius: 0.5, tessellation: 24 }, scene); rim.rotation.x = Math.PI / 2; rim.scaling.set(px1 - px0 + 1.6, pz1 - pz0 + 1.6, 1); rim.position.set(e.pondC[0], 0.11, e.pondC[1]); put(parts, rim, '#b99a6a'); }
      const gaps = [];
      if (e.window) { const f = e.window.face; const side = f[0] === 1 ? 'e' : f[0] === -1 ? 'w' : f[1] === -1 ? 's' : 'n'; const c = side === 'w' || side === 'e' ? e.window.z - z0 : e.window.x - x0; gaps.push({ side, c, w: 8 }); e.glassSide = side; }
      // window faces: the rect edge that the viewer stands outside of
      if (e.gate) gaps.push({ side: 'w', c: e.gate.z - z0, w: e.gate.w });
      if (e.inside) return;
      const style = e.id === 'rex' ? { h: 4.8, bars: true, post: '#40304f', rail: '#6d5a86', step: 3 } : e.id === 'aviary' ? { h: 16, net: true, post: '#5c2aa0', step: 8 } : e.id === 'lagoon' ? { h: 1.6, post: '#6d4a8c', rail: '#d8c2ff' } : e.id === 'petting' ? { h: 1.4, post: '#b07a3a', rail: '#e8c27a', step: 3 } : e.dynamic ? { h: 2.4, bars: true, post: '#3a6b6b', rail: '#7fd1c8' } : { h: 2.2, post: '#8a5a2a', rail: '#c08a48' };
      fence(e.rect, Object.assign({ gaps }, style));
      if (e.window) { const f = e.window.face; const m = B.MeshBuilder.CreateBox('wg', { width: f[0] ? 0.2 : 8, height: 3.6, depth: f[0] ? 8 : 0.2 }, scene); m.position.set(e.window.x, 1.8, e.window.z); put(glass, m, '#bfe8ff', 0.3);
        box(e.window.x - f[0] * 0.5, 0, e.window.z - f[1] * 0.5, f[0] ? 0.6 : 8.4, 0.9, f[0] ? 8.4 : 0.6, '#5c2aa0'); box(e.window.x, 3.6, e.window.z, f[0] ? 0.6 : 8.4, 0.5, f[0] ? 8.4 : 0.6, '#ffc247');
        box(e.window.x + f[0] * 2.4, 0, e.window.z + f[1] * 2.4, f[0] ? 4 : 9, 0.25, f[0] ? 9 : 4, '#c9a46a'); // viewing deck
        if (f[0]) solid(e.window.x - 0.4, e.window.z - 4.1, e.window.x + 0.4, e.window.z + 4.1); else solid(e.window.x - 4.1, e.window.z - 0.4, e.window.x + 4.1, e.window.z + 0.4);
        W.sign(e.name.toUpperCase(), 7, 1.1, e.window.x + f[0] * 0.2, 4.8, e.window.z + f[1] * 0.2, f, '#2b1646', '#ffc247', 56); }
      // decor
      const n = Math.max(2, Math.round((x1 - x0) * (z1 - z0) / 160));
      for (let i = 0; i < n; i++) {
        const rx = Z.lerp(x0 + 3, x1 - 3, rng()), rz = Z.lerp(z0 + 3, z1 - 3, rng());
        if (e.pondC && Math.abs(rx - e.pondC[0]) < e.pondR[0] + 2 && Math.abs(rz - e.pondC[1]) < e.pondR[1] + 2) continue;
        if (e.id === 'petting' && rx < x0 + 8) continue;
        const r = rng();
        if (r < 0.45) tree(rx, rz, rng, e.id === 'aviary' ? 1 : e.id === 'rex' ? 0 : 2);
        else if (r < 0.8) { const rk = ico(rx, 0.5, rz, 0.9 + rng() * 1.1, '#9a8aa8', 0.7, rng); rk.rotation.x = rng(); }
        else box(rx, 0, rz, 3.2, 0.7, 0.8, '#7a5233', rng() * 3);
      }
      e.feed = [Z.lerp(x0 + 5, x1 - 5, 0.3 + rng() * 0.4), Z.lerp(z0 + 5, z1 - 5, 0.3 + rng() * 0.4)];
      if (e.id !== 'aviary') box(e.feed[0], 0, e.feed[1], 2.4, 0.5, 1.2, '#7a5233');
    });

    // petting zoo extras
    const pet = W.exhibitById.petting; box(pet.rect[0] + 1.6, 0, pet.gate.z, 3, 0.15, pet.gate.w, '#c9a46a');
    cyl(pet.rect[0] - 0.3, 0, pet.gate.z - 3.3, 0.35, 3.2, '#ffc247', 6); cyl(pet.rect[0] - 0.3, 0, pet.gate.z + 3.3, 0.35, 3.2, '#ffc247', 6);

    // aviary roof net + frame
    const av = W.exhibitById.aviary; const roof = B.MeshBuilder.CreateBox('net', { width: av.rect[2] - av.rect[0], height: 0.1, depth: av.rect[3] - av.rect[1] }, scene); roof.position.set(av.cx, 16, av.cz); put(glass, roof, '#d8f0ff', 0.14);
    for (let k = 0; k < 4; k++) cyl(av.rect[k % 2 ? 2 : 0], 0, av.rect[k < 2 ? 1 : 3], 0.5, 16.4, '#5c2aa0', 6);

    // outer park wall + gate
    const wallC = '#d9c2a0';
    const wall = (x0, z0, x1, z1) => { box((x0 + x1) / 2, 0, (z0 + z1) / 2, Math.max(1.2, Math.abs(x1 - x0)), 2.6, Math.max(1.2, Math.abs(z1 - z0)), wallC); solid(x0 - 0.6, z0 - 0.6, x1 + 0.6, z1 + 0.6); };
    const gx = P.gate.w / 2 + 0.6;
    wall(P.x0, P.z0, -gx, P.z0); wall(gx, P.z0, P.x1, P.z0); wall(P.x0, P.z1, P.x1, P.z1); wall(P.x0, P.z0, P.x0, P.z1); wall(P.x1, P.z0, P.x1, P.z1);
    [-1, 1].forEach((s) => { cyl(s * (gx + 0.4), 0, P.z0, 1.1, 9, '#fff3e0', 6); cyl(s * (gx + 0.4), 9, P.z0, 1.4, 0.7, '#ffc247', 6); cyl(s * (gx + 0.4), 9.7, P.z0, 0.6, 1.8, '#1fb5a8', 6, null, 0.05); });
    box(0, 8.2, P.z0, gx * 2 + 1, 1.8, 1.2, '#2b1646'); box(0, 10, P.z0, gx * 2 + 2, 0.5, 1.6, '#ff8a2b');
    W.sign('DINOSAURS & FRIENDS ZOO', 11.6, 1.5, 0, 8.2, P.z0 - 0.65, [0, -1], '#2b1646', '#ffc247', 50);
    W.sign('DINOSAURS & FRIENDS ZOO', 11.6, 1.5, 0, 8.2, P.z0 + 0.65, [0, 1], '#2b1646', '#ffc247', 50);
    // turnstile / closed gate
    W.gateRect = [-gx + 0.2, P.z0 - 0.5, gx - 0.2, P.z0 + 0.5];
    W.gateBars = []; for (let i = -3; i <= 3; i++) { const m = B.MeshBuilder.CreateBox('gb', { width: 0.18, height: 2.4, depth: 0.18 }, scene); m.position.set(i * 1.0, 1.2, P.z0); m.material = stdMat('gbM', { diffuseColor: Z.hex('#ffc247') }); m.isPickable = false; W.gateBars.push(m); }

    // buildings
    data.buildings.forEach((b) => {
      const { x, z, w, d, h } = b;
      if (b.type === 'boxoffice') {
        box(x, 0, z, w, h, d, '#f3e3c0'); box(x, h, z, w - 2, 1.6, d - 1.5, '#e9d4a4'); box(x, h + 1.6, z, w - 5, 1.4, d - 3, '#f3e3c0'); box(x, h + 3, z, 2.2, 3, 2.2, '#ffc247');
        for (let i = -3; i <= 3; i++) box(x + i * 1.9, 0, z - d / 2 - 0.15, 0.55, h + 1.2, 0.3, '#1fb5a8');
        box(x, 0, z - d / 2 - 0.1, w, 0.8, 0.4, '#8c4bd6'); box(x, h - 0.4, z - d / 2 - 0.4, w + 0.6, 0.5, 1.2, '#ff8a2b');
        for (let i = -2; i <= 2; i++) { const m = B.MeshBuilder.CreateBox('wn', { width: 1.5, height: 2.2, depth: 0.2 }, scene); m.position.set(x + i * 2.6, 2.6, z - d / 2 - 0.35); put(lit, m, '#ffd98a'); }
        W.sign(b.id === 'box' ? 'BOX OFFICE' : 'KEEPERS\' WING', 8, 1.3, x, h + 0.1 - 0.9, z - d / 2 - 1.05, [0, -1], '#2b1646', '#ffc247', 60);
        solid(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
      } else if (b.type === 'hotel') {
        box(x, 0, z, w, h, d, '#f1dfc2'); box(x, h, z, w - 4, 3, d - 3, '#d8c2ff'); box(x, h + 3, z, w - 9, 2.5, d - 6, '#f1dfc2'); cyl(x, h + 5.5, z, 0.3, 4, '#ffc247', 5);
        for (let yy = 3; yy < h; yy += 3.2) for (let xx = -w / 2 + 2.5; xx < w / 2 - 1; xx += 3.4) { const m = B.MeshBuilder.CreateBox('wn', { width: 1.6, height: 1.7, depth: 0.2 }, scene); m.position.set(x + xx, yy + 0.8, z + d / 2 + 0.1); put(lit, m, '#ffd98a'); }
        for (let i = 0; i < 6; i++) box(x - w / 2 + 2 + i * (w - 4) / 5, 0, z + d / 2 + 0.2, 0.7, h, 0.5, '#b784e6');
        box(x, 0, z + d / 2 + 2, 9, 3.6, 4, '#8c4bd6'); box(x, 3.6, z + d / 2 + 2, 10, 0.5, 4.6, '#ffc247');
        W.sign('HOTEL CRETACEOUS', 12, 1.6, x, h - 1.6, z + d / 2 + 0.75, [0, 1], '#2b1646', '#ffc247', 54);
        solid(x - w / 2, z - d / 2, x + w / 2, z + d / 2 + 4);
      } else if (b.type === 'atm') {
        box(x, 0, z, w, h, d, '#2b1646'); box(x, 0.35, z - d / 2 - 0.04, w - 0.3, h - 0.8, 0.08, '#1fb5a8');
        box(x - 0.2, 1.35, z - d / 2 - 0.1, 0.85, 0.55, 0.08, '#32204f'); box(x + 0.48, 0.95, z - d / 2 - 0.11, 0.22, 0.28, 0.07, '#ffc247');
        box(x - 0.2, 0.7, z - d / 2 - 0.11, 0.42, 0.08, 0.07, '#ffc247');
        W.sign('ATM', 1.8, 0.55, x, h + 0.35, z - d / 2 - 0.08, [0, -1], '#2b1646', '#ffc247', 76);
        solid(x - w / 2 - 0.1, z - d / 2 - 0.1, x + w / 2 + 0.1, z + d / 2 + 0.1);
      } else if (b.type === 'lab') {
        box(x, 0, z, w, h, d, '#e9e4f2'); box(x, h, z, w - 2, 1, d - 2, '#8c4bd6'); box(x, 0.5, z - d / 2 - 0.15, w - 4, h - 1.5, 0.3, '#7fd1e8');
        for (let i = -4; i <= 4; i++) box(x + i * 2.6, 0, z - d / 2 - 0.25, 0.3, h, 0.4, '#5c2aa0');
        const tk = B.MeshBuilder.CreateTorusKnot('dna', { radius: 1.4, tube: 0.3, radialSegments: 48, tubularSegments: 10, p: 2, q: 5 }, scene); tk.position.set(x, h + 3.8, z); tk.material = stdMat('dnaM', { diffuseColor: Z.hex('#1fb5a8'), emissiveColor: Z.hex('#0b4a46') }); W.dna = tk;
        W.sign('GENOME LAB', 7, 1.2, x, h + 0.7, z - d / 2 - 1.05, [0, -1], '#2b1646', '#7de8d9', 60);
        solid(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
      } else if (b.type === 'budgiehouse') {
        // shell open to the east (glass wall) so the case is visible from the viewing window
        const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
        box(x, 0, z, w, 0.2, d, '#d9a98a'); box(x0 + 0.4, 0, z, 0.8, h, d, '#ffd9b0'); box(x, 0, z0 + 0.4, w, h, 0.8, '#ffd9b0'); box(x, 0, z1 - 0.4, w, h, 0.8, '#ffd9b0');
        box(x, h, z, w + 1.4, 0.8, d + 1.4, '#8c4bd6'); box(x, h + 0.8, z, w - 2, 1.4, d - 2, '#ff8a2b');
        box(x1 - 0.1, h - 0.7, z, 0.4, 0.7, d, '#ffc247'); box(x1 - 0.1, 0, z0 + 0.8, 0.4, h, 0.8, '#ffc247'); box(x1 - 0.1, 0, z1 - 0.8, 0.4, h, 0.8, '#ffc247'); const gl = B.MeshBuilder.CreateBox('g', { width: 0.12, height: h - 0.6, depth: d - 1 }, scene); gl.position.set(x1 - 0.1, h / 2 + 0.2, z); put(glass, gl, '#bfe8ff', 0.18);
        W.sign('PARAKEET HOUSE', 7.6, 1.2, x1 + 0.8, h + 0.7, z, [1, 0], '#2b1646', '#ffc247', 52);
        solid(x0, z0, x1, z1);
      }
    });
    if (data.safariTruck) safariTruck(data.safariTruck.x, data.safariTruck.z);

    // exhibit case interior (parakeet house)
    const pk = W.exhibitById.parakeets; pk.interior = true;
    { const [x0, z0, x1, z1] = pk.rect; box(pk.cx, 0.2, pk.cz, x1 - x0, 0.1, z1 - z0, '#6aa84e'); box(x0 - 0.1, 0.2, pk.cz, 0.3, 3.4, z1 - z0, '#8ad0a0');
      const cg = B.MeshBuilder.CreateBox('cg', { width: 0.1, height: pk.height, depth: z1 - z0 }, scene); cg.position.set(x1, pk.height / 2 + 0.2, pk.cz); put(glass, cg, '#d8f0ff', 0.16);
      box(x1 + 0.2, 0.2, pk.cz, 0.3, 0.7, z1 - z0 + 0.4, '#5c2aa0');
      pk.perches = []; for (let i = 0; i < 6; i++) {
        const px = Z.lerp(x0 + 0.8, x1 - 0.8, rng()), pz = Z.lerp(z0 + 0.8, z1 - 0.8, (i + 0.5) / 6), py = 0.9 + rng() * 2;
        const br = B.MeshBuilder.CreateCylinder('br', { height: 3, diameter: 0.14, tessellation: 5 }, scene);
        br.rotation.x = Math.PI / 2; br.rotation.y = (rng() - 0.5) * 0.8; br.position.set(px, py, pz); put(parts, br, '#7a5233');
        br.computeWorldMatrix(true); const axis = br.getDirection(B.Axis.Y);
        [-1.2, -0.6, 0, 0.6, 1.2].forEach((offset) => pk.perches.push([px + axis.x * offset, py + 0.07, pz + axis.z * offset]));
      }
      box(x0 + 1.2, 0.2, z0 + 1, 1.2, 1.1, 1, '#ff8a2b'); box(x1 - 1.4, 0.2, z1 - 1, 1, 0.9, 1.4, '#8c4bd6'); cyl(pk.cx, 0.2, pk.cz, 0.8, 0.5, '#3aa6d4', 10); }

    // stands
    data.stands.forEach((s) => {
      box(s.x, 0, s.z, 4, 2.6, 3, '#fff3e0'); box(s.x, 2.6, s.z, 5.2, 0.3, 4.2, s.color); box(s.x, 0, s.z + 1.7, 4, 1.05, 0.4, s.color);
      for (let i = -2; i <= 2; i++) box(s.x + i * 0.9, 2.2, s.z + 2.25, 0.5, 0.5, 0.15, i % 2 ? '#fff3e0' : s.color);
      solid(s.x - 2.1, s.z - 1.6, s.x + 2.1, s.z + 2.2);
      W.sign(s.name.toUpperCase(), 4.6, 0.8, s.x, 3.4, s.z + 0.2, [0, 1], '#2b1646', '#ffc247', 34);
    });
    // benches, lamps
    data.benches.forEach(([x, z, r]) => { box(x, 0.45, z, 2.2, 0.15, 0.7, '#8a5a2a', r); box(x, 0.8, z + Math.cos(r) * 0.3, 2.2, 0.5, 0.12, '#8a5a2a', r); });
    for (let i = 0; i < 24; i++) { const e = data.edges[i % data.edges.length], A = data.nodes[e[0]], C = data.nodes[e[1]], t = ((i * 0.37) % 1), lx = Z.lerp(A[0], C[0], t) + 2.6, lz = Z.lerp(A[1], C[1], t); cyl(lx, 0, lz, 0.12, 3.4, '#2b1646', 5); const lamp = B.MeshBuilder.CreateSphere('lamp', { diameter: 0.7, segments: 5 }, scene); lamp.position.set(lx, 3.6, lz); put(lit, lamp, '#fff1b0'); }
    // outside: lawn trees, hotel garden, mountains
    for (let i = 0; i < data.trees; i++) {
      const x = Z.lerp(-150, 150, rng()), z = Z.lerp(-120, 150, rng());
      if (Math.abs(x) < P.x1 + 6 && z > P.z0 - 6 && z < P.z1 + 6) continue;
      if (Z.dist(x, z, 0, -50) < 14 || (Math.abs(x + 50) < 18 && Math.abs(z + 66) < 14)) continue;
      if (data.buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + 5 && Math.abs(z - b.z) < b.d / 2 + 5) ||
          (data.safariTruck && Math.abs(x - data.safariTruck.x) < 9 && Math.abs(z - data.safariTruck.z) < 7)) continue;
      tree(x, z, rng, Math.floor(rng() * 4));
    }
    for (let i = 0; i < 70; i++) { // trees inside the park, off paths and exhibits
      const x = Z.lerp(P.x0 + 4, P.x1 - 4, rng()), z = Z.lerp(P.z0 + 5, P.z1 - 4, rng());
      if (W.exhibits.some((e) => Z.inRect(x, z, e.rect, 5)) || data.buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + 6 && Math.abs(z - b.z) < b.d / 2 + 6)) continue;
      if (Object.values(data.nodes).some((n) => Z.dist(x, z, n[0], n[1]) < 7) || data.stands.some((s) => Z.dist(x, z, s.x, s.z) < 7)) continue;
      if (data.edges.some(([a, b]) => { const A = data.nodes[a], C = data.nodes[b]; const t = Z.clamp(((x - A[0]) * (C[0] - A[0]) + (z - A[1]) * (C[1] - A[1])) / (Math.pow(C[0] - A[0], 2) + Math.pow(C[1] - A[1], 2)), 0, 1); return Z.dist(x, z, A[0] + (C[0] - A[0]) * t, A[1] + (C[1] - A[1]) * t) < 4.5; })) continue;
      tree(x, z, rng, Math.floor(rng() * 4)); W.solids.push([x - 0.5, z - 0.5, x + 0.5, z + 0.5]);
    }
    const groveRng = Z.makeRng(836), groveTrees = [];
    (data.treeGroves || []).forEach((grove) => {
      for (let attempts = 0, placed = 0; attempts < grove.count * 100 && placed < grove.count; attempts++) {
        const [x0, z0, x1, z1] = grove.rect, x = Z.lerp(x0, x1, groveRng()), z = Z.lerp(z0, z1, groveRng());
        if (groveTrees.some((p) => Z.dist(x, z, p[0], p[1]) < 3.3) ||
            W.solids.some((s) => Z.inRect(x, z, s, 2.5)) ||
            W.exhibits.some((e) => Z.inRect(x, z, e.rect, 3)) ||
            data.stands.some((s) => Z.dist(x, z, s.x, s.z) < 7) ||
            data.edges.some(([a, b]) => {
              const A = data.nodes[a], C = data.nodes[b], dx = C[0] - A[0], dz = C[1] - A[1];
              const t = Z.clamp(((x - A[0]) * dx + (z - A[1]) * dz) / (dx * dx + dz * dz), 0, 1);
              return Z.dist(x, z, A[0] + dx * t, A[1] + dz * t) < 5;
            })) continue;
        tree(x, z, groveRng, Math.floor(groveRng() * 4));
        solid(x - 0.5, z - 0.5, x + 0.5, z + 0.5); groveTrees.push([x, z]); placed++;
      }
    });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rng() * 0.2, r = 230 + rng() * 40, hgt = 40 + rng() * 60;
      const m = B.MeshBuilder.CreateCylinder('mt', { height: hgt, diameterBottom: hgt * 2.4, diameterTop: hgt * 0.1, tessellation: 5 + Math.floor(rng() * 3) }, scene);
      m.position.set(Math.sin(a) * r, hgt / 2 - 2, 40 + Math.cos(a) * r); put(parts, m, i % 3 ? '#7a68a8' : '#9a7fc0');
      const cap = B.MeshBuilder.CreateCylinder('cap', { height: hgt * 0.28, diameterBottom: hgt * 0.62, diameterTop: hgt * 0.05, tessellation: 5 }, scene); cap.position.set(m.position.x, hgt * 0.88 - 2, m.position.z); put(parts, cap, '#f6efff');
    }

    // finalise
    W.staticMesh = merge(parts, mat, 'worldStatic'); W.glassMesh = merge(glass, glassMat, 'worldGlass'); W.litMesh = merge(lit, litMat, 'worldLit');
    if (W.glassMesh) W.glassMesh.alphaIndex = 5;
    buildCable(data.cable);
    // clouds
    W.clouds = []; const cm = stdMat('cloudM', { diffuseColor: new B.Color3(1, 1, 1), emissiveColor: new B.Color3(0.6, 0.6, 0.65), alpha: 0.92 });
    for (let i = 0; i < 9; i++) { const root = new B.TransformNode('cl', scene); for (let k = 0; k < 4; k++) { const s = B.MeshBuilder.CreateIcoSphere('c', { radius: 7 + rng() * 6, subdivisions: 1, flat: true }, scene); s.scaling.y = 0.4; s.position.set(k * 9 - 14, rng() * 2, rng() * 6); s.material = cm; s.parent = root; s.isPickable = false; } root.position.set(Z.lerp(-200, 200, rng()), 70 + rng() * 25, Z.lerp(-100, 180, rng())); W.clouds.push(root); }
    return W;
  };

  // ---------- per-frame ----------
  const SKY = [[0, '#1a1236'], [300, '#1a1236'], [380, '#f0906a'], [450, '#ffcf94'], [560, '#9fd4f5'], [1020, '#9fd4f5'], [1100, '#ff9a6a'], [1160, '#a35a9a'], [1230, '#2a1a4a'], [1440, '#1a1236']];
  W.skyAt = function (min) {
    for (let i = 0; i < SKY.length - 1; i++) if (min >= SKY[i][0] && min <= SKY[i + 1][0]) return B.Color3.Lerp(Z.hex(SKY[i][1]), Z.hex(SKY[i + 1][1]), (min - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]));
    return Z.hex('#1a1236');
  };
  W.daylight = (min) => Z.smooth(330, 480, min) * (1 - Z.smooth(1050, 1200, min));
  W.setTime = function (min) {
    const dl = W.daylight(min), sky = W.skyAt(min);
    scene.clearColor = new B.Color4(sky.r, sky.g, sky.b, 1); scene.fogColor = sky;
    hemi.intensity = 0.35 + 0.45 * dl; hemi.diffuse = B.Color3.Lerp(new B.Color3(0.55, 0.6, 1), new B.Color3(1, 0.97, 0.92), dl);
    const a = Z.clamp((min - 360) / 720, -0.2, 1.2) * Math.PI; // sun arc east -> west
    sun.direction = new B.Vector3(-Math.cos(a) * 0.8, -Math.max(0.25, Math.sin(a)), 0.45).normalize();
    sun.intensity = 0.15 + 0.95 * dl; sun.diffuse = B.Color3.Lerp(new B.Color3(1, 0.55, 0.35), new B.Color3(1, 0.96, 0.88), Z.smooth(0.2, 0.8, dl));
    if (W.litMat) { const n = 1 - dl; W.litMat.emissiveColor = new B.Color3(0.08 + 0.92 * n, 0.07 + 0.82 * n, 0.04 + 0.5 * n); }
    W.dayFactor = dl;
  };
  W.update = function (dt, running) {
    W.clouds.forEach((c) => { c.position.x += dt * 0.8; if (c.position.x > 240) c.position.x = -240; });
    if (W.dna) W.dna.rotation.y += dt * 0.7;
    if (running) W.cableT += dt;
    const cs = W.cableState();
    W.cars.forEach((car, i) => { const p = W.cablePos(cs.f[i]); const off = i ? 1.2 : -1.2; car.root.position.set(p.x + Math.cos(p.heading) * off, p.y, p.z - Math.sin(p.heading) * off); car.root.rotation.y = p.heading + Math.PI / 2; car.root.rotation.z = Math.sin(W.cableT * 1.3 + i) * 0.025; });
    return cs;
  };
  W.setGate = (open) => { W.gateBars.forEach((m) => { m.setEnabled(!open); }); };
})(window.Z);
