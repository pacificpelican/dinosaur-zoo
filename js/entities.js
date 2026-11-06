/* Living things: exhibit animals (wander / eat / bathe / sleep / escape), visitor NPCs (roles, lumpy popularity, groups, panic) and the player avatar. */
(function (Z) {
  const B = BABYLON;
  const E = Z.Ent = { animals: [], npcs: [], groups: [], escape: null, scene: null };
  const pop = Z.pop = {};
  Z.popularityBoost = (id, f) => { pop[id] = Math.max(pop[id] || 1, f); };
  const popOf = (id) => pop[id] || 1;
  const mats = {};
  const mat = (hex) => mats[hex] || (mats[hex] = (() => { const m = new B.StandardMaterial('p' + hex, E.scene); m.diffuseColor = Z.hex(hex); m.specularColor = new B.Color3(0.05, 0.05, 0.05); return m; })());
  const turn = (cur, want, rate, dt) => { const d = Z.angleDiff(cur, want), s = Math.sign(d) * Math.min(Math.abs(d), rate * dt); return cur + s; };
  const SKIN = ['#f2c9a0', '#e0b088', '#c98d62', '#a5714a', '#7a4d30', '#5a3722'], HAIR = ['#2a1a10', '#4a2c18', '#8a5a2a', '#d9a84a', '#9a9a9a', '#b03a6a', '#3a6fb0'];
  const SHIRT = ['#8c4bd6', '#ff8a2b', '#1fb5a8', '#d8c2ff', '#f2b032', '#5c8fd6', '#e86a9a', '#f3e3c0'];

  // ---------- humanoid ----------
  E.person = function (o) {
    const s = E.scene, root = new B.TransformNode('person', s), rng = Z.makeRng(o.seed || 1);
    const mk = (type, opt, hex, parent, x, y, z) => { const m = B.MeshBuilder['Create' + type]('pp', opt, s); m.material = mat(hex); m.parent = parent; m.position.set(x, y, z); m.isPickable = false; return m; };
    const pivot = (x, y, z) => { const n = new B.TransformNode('pv', s); n.parent = root; n.position.set(x, y, z); return n; };
    const hipL = pivot(-0.16, 0.85, 0), hipR = pivot(0.16, 0.85, 0), shL = pivot(-0.4, 1.5, 0), shR = pivot(0.4, 1.5, 0);
    [hipL, hipR].forEach((h) => mk('Box', { width: 0.26, height: 0.85, depth: 0.28 }, o.pants, h, 0, -0.42, 0));
    [hipL, hipR].forEach((h) => mk('Box', { width: 0.28, height: 0.12, depth: 0.38 }, o.shoes || '#2b1646', h, 0, -0.82, 0.05));
    mk('Box', { width: 0.7, height: 0.78, depth: 0.38 }, o.shirt, root, 0, 1.2, 0);
    [shL, shR].forEach((h) => { mk('Box', { width: 0.2, height: 0.7, depth: 0.22 }, o.sleeve || o.shirt, h, 0, -0.32, 0); mk('Sphere', { diameter: 0.2, segments: 5 }, o.skin, h, 0, -0.72, 0); });
    const head = mk('Sphere', { diameter: 0.46, segments: 8 }, o.skin, root, 0, 1.86, 0);
    mk('Sphere', { diameter: 0.5, segments: 7 }, o.hair, head, 0, 0.05, -0.04).scaling.set(1, 0.7, 1);
    mk('Box', { width: 0.05, height: 0.05, depth: 0.04 }, '#1a1020', head, -0.1, 0.02, 0.22); mk('Box', { width: 0.05, height: 0.05, depth: 0.04 }, '#1a1020', head, 0.1, 0.02, 0.22);
    if (o.hat === 'ranger') { mk('Cylinder', { diameter: 0.7, height: 0.04, tessellation: 12 }, o.hatColor, head, 0, 0.2, 0.02); mk('Cylinder', { diameter: 0.42, height: 0.2, tessellation: 10 }, o.hatColor, head, 0, 0.3, 0); mk('Box', { width: 0.14, height: 0.12, depth: 0.03 }, '#ffc247', root, 0.17, 1.4, 0.2); }
    else if (o.hat === 'cap') { mk('Sphere', { diameter: 0.5, segments: 7 }, o.hatColor, head, 0, 0.1, 0).scaling.set(1, 0.6, 1); mk('Box', { width: 0.3, height: 0.04, depth: 0.28 }, o.hatColor, head, 0, 0.08, 0.3); }
    else if (o.hat === 'dino') { mk('Sphere', { diameter: 0.5, segments: 7 }, '#ff8a2b', head, 0, 0.1, 0).scaling.set(1, 0.6, 1); for (let i = 0; i < 4; i++) mk('Cylinder', { diameterTop: 0, diameterBottom: 0.2, height: 0.28, tessellation: 4 }, '#1fb5a8', head, 0, 0.3, -0.18 + i * 0.12); }
    if (o.backpack) mk('Box', { width: 0.46, height: 0.55, depth: 0.22 }, o.backpack, root, 0, 1.25, -0.3);
    if (o.shirtLogo) mk('Cylinder', { diameterTop: 0, diameterBottom: 0.3, height: 0.3, tessellation: 3 }, o.shirtLogo, root, 0, 1.28, 0.2).rotation.x = Math.PI / 2;
    root.scaling.setAll(o.scale || 0.92);
    const api = { root, topY: 2.3 * (o.scale || 0.92), phase: 0 };
    api.pose = (dt, walk, speed, extra) => {
      api.phase += dt * (2 + speed * 1.6) * (walk > 0.05 ? 1 : 0); const sw = Math.sin(api.phase * 2) * 0.75 * walk;
      hipL.rotation.x = sw; hipR.rotation.x = -sw; shL.rotation.x = -sw * 0.8 + (extra && extra.wave ? -2.6 : 0); shR.rotation.x = sw * 0.8;
      api.bob = Math.abs(Math.cos(api.phase * 2)) * 0.05 * walk;
    };
    return api;
  };

  // ---------- exhibit animals ----------
  const BUDGIE_PERCH_SPACING = 0.45;
  const BUDGIE_FOOT_OFFSET = 0.234;
  function chooseBudgiePerch(ex, current, rng, allowCrowded) {
    const occupied = [];
    E.animals.forEach((bird) => {
      if (bird === current || bird.kind !== 'budgie' || bird.ex !== ex) return;
      if (bird.perch !== undefined) occupied.push(ex.perches[bird.perch]);
      if (bird.fly) occupied.push(bird.fly.b);
    });
    const candidates = ex.perches.map((p, index) => ({
      index, distance: occupied.reduce((min, q) => Math.min(min, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])), Infinity)
    })).filter((p) => !current || p.index !== current.perch);
    const available = candidates.filter((p) => p.distance >= BUDGIE_PERCH_SPACING);
    if (available.length) return available[Math.floor(rng() * available.length)].index;
    if (!allowCrowded || !candidates.length) return null;
    return candidates.reduce((best, p) => p.distance > best.distance ? p : best).index;
  }

  function newAnimalActor(a, ex) {
    const sp = Z.Species.byId(a.sp); if (!sp) return null;
    const scale = Z.Species.scaleOf(a), seed = a.uid * 13 + 7;
    const api = Z.Dino.build(E.scene, sp, scale, seed, {});
    const r = ex.rect, rng = Z.makeRng(seed);
    const act = { a, sp, ex, api, kind: sp.form === 'budgie' ? 'budgie' : sp.form === 'pterosaur' ? 'ptero' : 'land', x: Z.lerp(r[0] + 5, r[2] - 5, rng()), z: Z.lerp(r[1] + 5, r[3] - 5, rng()), h: rng() * 6, mode: 'idle', timer: Z.rr(1, 5), st: { walk: 0, eat: 0, sleep: 0, bathe: 0, look: 0, roar: 0, speed: 1, fly: 0, perchY: 0 }, want: {}, seed, vis: true, scale };
    if (act.kind === 'budgie') { act.perch = chooseBudgiePerch(ex, null, rng, true); const p = ex.perches[act.perch]; act.x = p[0]; act.y = p[1]; act.z = p[2]; act.h = rng() * 6.28; act.fly = null; }
    if (act.kind === 'ptero') { act.ang = rng() * 6.28; act.rad = 6 + rng() * 8; act.alt = 7 + rng() * 6; act.dir = rng() < 0.5 ? 1 : -1; }
    if (sp.id === 'bronto') { act.x = ex.cx + (rng() - 0.5) * 12; act.z = ex.cz; }
    api.root.position.set(act.x, act.kind === 'budgie' ? act.y - api.L * BUDGIE_FOOT_OFFSET : (act.y || 0), act.z); return act;
  }

  E.rebuildAnimals = function () {
    E.animals.forEach((x) => x.api.dispose()); E.animals = [];
    Z.state.animals.forEach((a) => {
      const exId = a.ex || Z.Species.exhibitOf(a.sp), ex = Z.world.exhibitById[exId]; if (!ex) return;
      const act = newAnimalActor(a, ex); if (act) E.animals.push(act);
    });
  };
  E.animalsOf = (exId) => E.animals.filter((x) => x.ex.id === exId);

  function pickLandGoal(act, night) {
    const ex = act.ex, r = ex.rect, m = 3 + act.api.radius * 0.4;
    const roll = Math.random(), canBathe = !!ex.pondC && act.sp.form !== 'tinybird' || (act.sp.form === 'tinybird' && ex.pondC);
    if (night && roll < 0.85) { act.mode = 'sleep'; act.timer = Z.rr(10, 25); return; }
    if (roll < 0.42) { act.mode = 'walk'; act.tx = Z.lerp(r[0] + m, r[2] - m, Math.random()); act.tz = Z.lerp(r[1] + m, r[3] - m, Math.random()); if (ex.pondC && act.sp.id !== 'bronto' && Math.abs(act.tx - ex.pondC[0]) < ex.pondR[0] && Math.abs(act.tz - ex.pondC[1]) < ex.pondR[1] && Math.random() < 0.7) { act.tx += ex.pondR[0] * 1.4; } }
    else if (roll < 0.58) { act.mode = 'walk'; act.after = 'eat'; act.tx = ex.feed[0] + Z.rr(-2.5, 2.5); act.tz = ex.feed[1] + Z.rr(-2, 2); }
    else if (roll < 0.74 && canBathe && ex.pondC) { act.mode = 'walk'; act.after = 'bathe'; act.tx = ex.pondC[0] + Z.rr(-0.4, 0.4) * ex.pondR[0]; act.tz = ex.pondC[1] + Z.rr(-0.3, 0.3) * ex.pondR[1]; }
    else if (roll < 0.84) { act.mode = 'sleep'; act.timer = Z.rr(8, 18); }
    else { act.mode = 'idle'; act.timer = Z.rr(3, 9); act.look = Math.random() < 0.5; }
    if (act.sp.id === 'bronto') { act.mode = roll < 0.35 ? 'walk' : roll < 0.7 ? 'bathe' : 'idle'; act.after = null; act.tx = ex.pondC[0] + Z.rr(-0.6, 0.6) * ex.pondR[0]; act.tz = ex.pondC[1] + Z.rr(-0.4, 0.4) * ex.pondR[1]; act.timer = Z.rr(8, 16); }
  }

  function moveToward(act, dt, spd, ignoreSolids) {
    const dx = act.tx - act.x, dz = act.tz - act.z, d = Math.hypot(dx, dz);
    if (d < 0.6) return true;
    act.h = turn(act.h, Math.atan2(dx, dz), 1.6 + spd * 0.3, dt);
    const step = Math.min(d, spd * dt * Math.max(0.2, 1 - Math.abs(Z.angleDiff(act.h, Math.atan2(dx, dz))) * 0.6));
    act.x += Math.sin(act.h) * step; act.z += Math.cos(act.h) * step;
    return false;
  }

  function updateLand(act, dt, t, ctx) {
    const st = act.st, sp = act.sp, speed = sp.speed * (sp.form === 'tinybird' ? 0.9 : 0.75) * (sp.len > 8 ? 0.6 : 1);
    let walkT = 0, eatT = 0, sleepT = 0, batheT = 0;
    if (act.escape) { const ch = act.escape.target(); act.tx = ch.x; act.tz = ch.z; const fast = Math.min(5.2, sp.speed * 2.2 + 1.2); moveToward(act, dt, fast, true); walkT = 1; st.speed = 1.6; st.roar = Math.sin(t * 0.9) > 0.8 ? 1 : 0; if (act.escape.onStep) act.escape.onStep(act); }
    else {
      act.timer -= dt; st.speed = 1;
      if (act.mode === 'walk') { const arrived = moveToward(act, dt, speed); walkT = 1; if (arrived) { if (act.after) { act.mode = act.after; act.after = null; act.timer = Z.rr(5, 11); } else { act.mode = 'idle'; act.timer = Z.rr(2, 6); } } }
      else if (act.mode === 'seek') { act.tx = act.seekX; act.tz = act.seekZ; if (moveToward(act, dt, speed * 1.6)) { act.mode = 'eat'; act.timer = 3; } walkT = 1; st.speed = 1.4; }
      else if (act.mode === 'eat') eatT = 1; else if (act.mode === 'sleep') sleepT = 1; else if (act.mode === 'bathe') batheT = 1;
      if (act.timer <= 0 && act.mode !== 'walk' && act.mode !== 'seek') pickLandGoal(act, ctx.night);
      if (act.mode !== 'walk' && act.mode !== 'seek' && act.mode !== 'idle' && act.timer <= 0) act.mode = 'idle';
      st.roar = (act.mode === 'idle' && sp.id === 'trex' && Math.random() < 0.0008) ? 2.5 : (st.roar > 0 ? Math.max(0, st.roar - dt) : 0);
      if (st.roar > 0 && st.roar < 2.5 && st.roar > 2.45) Z.Audio.sfx('roar');
      st.look = act.mode === 'idle' && act.look ? Math.sin(t * 0.7 + act.seed) : 0;
    }
    const k = Math.min(1, dt * 3);
    st.walk += (walkT - st.walk) * k; st.eat += (eatT - st.eat) * k; st.sleep += (sleepT - st.sleep) * Math.min(1, dt * 1.2); st.bathe += (batheT - st.bathe) * k;
    // keep inside the exhibit unless escaping
    if (!act.escape) { const r = act.ex.rect; act.x = Z.clamp(act.x, r[0] + 1.5, r[2] - 1.5); act.z = Z.clamp(act.z, r[1] + 1.5, r[3] - 1.5); }
    act.api.root.position.set(act.x, 0, act.z); act.api.root.rotation.y = act.h;
    act.api.update(t, { walk: st.walk, eat: st.eat, sleep: st.sleep, bathe: st.bathe, look: st.look, roar: st.roar > 0 ? 1 : 0, speed: st.speed });
  }

  function updateBudgie(act, dt, t) {
    const ex = act.ex, st = act.st;
    if (act.fly) {
      act.fly.t += dt / act.fly.dur; const f = Math.min(1, act.fly.t), p0 = act.fly.a, p1 = act.fly.b;
      act.x = Z.lerp(p0[0], p1[0], f); act.z = Z.lerp(p0[2], p1[2], f); act.y = Z.lerp(p0[1], p1[1], f) + Math.sin(f * Math.PI) * 0.7;
      act.h = turn(act.h, Math.atan2(p1[0] - p0[0], p1[2] - p0[2]), 9, dt); st.fly += (1 - st.fly) * Math.min(1, dt * 12);
      if (f >= 1) { act.fly = null; act.timer = Z.rr(2, 9); act.perch = act.fly2; }
    } else {
      st.fly += (0 - st.fly) * Math.min(1, dt * 10); act.timer -= dt;
      st.chat = Math.sin(t * 0.8 + act.seed) > 0.82; st.look = Math.sin(t * 0.5 + act.seed * 2); st.preen = Math.sin(t * 0.23 + act.seed) > 0.85 ? 1 : 0;
      if (act.timer <= 0) {
        const pi = chooseBudgiePerch(ex, act, Math.random, false);
        if (pi !== null && Math.random() < 0.85) { const a = [act.x, act.y, act.z], b = ex.perches[pi]; act.fly = { a, b, t: 0, dur: 0.7 + Math.hypot(b[0] - a[0], b[2] - a[2]) * 0.18 }; act.fly2 = pi; Z.Audio && Math.random() < 0.15 && E.chirpNear && E.chirpNear(act); }
        else act.timer = Z.rr(1.5, 6);
      }
    }
    // Perch positions describe the branch surface; the model's feet sit above its root.
    act.api.root.position.set(act.x, act.y - act.api.L * BUDGIE_FOOT_OFFSET, act.z); act.api.root.rotation.y = act.h;
    act.api.update(t, { fly: st.fly, chat: st.chat, look: st.look, preen: st.preen, perchY: 0 });
  }

  function updatePtero(act, dt, t) {
    const ex = act.ex; act.ang += dt * 0.28 * act.dir * (10 / act.rad);
    const rx = Math.min(act.rad, (ex.rect[2] - ex.rect[0]) / 2 - 4), rz = Math.min(act.rad, (ex.rect[3] - ex.rect[1]) / 2 - 4);
    const nx = ex.cx + Math.cos(act.ang) * rx * 1.6, nz = ex.cz + Math.sin(act.ang) * rz * 1.3, ny = act.alt + Math.sin(t * 0.4 + act.seed) * 1.5;
    act.h = Math.atan2(nx - act.x, nz - act.z) || act.h; act.x = nx; act.z = nz;
    act.api.root.position.set(nx, ny, nz); act.api.root.rotation.y = act.h; act.api.root.rotation.z = -0.25 * act.dir;
    act.api.update(t, { fly: 1, flap: 0.25 + 0.75 * Math.max(0, Math.sin(t * 0.3 + act.seed)) });
  }

  // ---------- NPCs ----------
  const spots = () => {
    const W = Z.world, out = [];
    W.exhibits.forEach((e) => {
      if (e.window) { const f = e.window.face; out.push({ id: e.id, kind: 'exhibit', w: () => e.popularity * popOf(e.id), pt: () => [e.window.x + f[0] * Z.rr(2.6, 6) + f[1] * Z.rr(-3, 3), e.window.z + f[1] * Z.rr(2.6, 6) + f[0] * Z.rr(-3, 3)], look: [e.window.x, e.window.z], node: W.nearestNode(e.window.x + f[0] * 5, e.window.z + f[1] * 5) }); }
      else out.push({ id: e.id, kind: 'exhibit', w: () => e.popularity * popOf(e.id), pt: () => [e.gate ? e.gate.x - Z.rr(2, 5) : e.cx, (e.gate ? e.gate.z : e.cz) + Z.rr(-3, 3)], look: [e.cx, e.cz], node: W.nearestNode(e.gate ? e.gate.x - 4 : e.cx, e.gate ? e.gate.z : e.cz) });
    });
    W.data.stands.forEach((s) => out.push({ id: s.id, kind: 'stand', w: () => 0.7, pt: () => [s.x + Z.rr(-2.5, 2.5), s.z + Z.rr(3, 5)], look: [s.x, s.z], node: W.nearestNode(s.x, s.z + 4) }));
    out.push({ id: 'lab', kind: 'lab', w: () => 0.5 * popOf('lab'), pt: () => [Z.rr(-5, 5), 36 + Z.rr(-1, 2)], look: [0, 50], node: 'lab' });
    out.push({ id: 'cable', kind: 'cable', w: () => 0.35, pt: () => [W.data.cable.a.board.x + Z.rr(-2, 2), W.data.cable.a.board.z + Z.rr(-1, 1)], look: [W.data.cable.a.x, W.data.cable.a.z], node: 'stA' });
    out.push({ id: 'plaza', kind: 'plaza', w: () => 0.6, pt: () => { const a = Math.random() * 6.28, r = Z.rr(2, 8); return [Math.sin(a) * r, 30 + Math.cos(a) * r]; }, look: [0, 30], node: 'plaza' });
    return out;
  };

  function chooseDest(n) {
    E.spots = E.spots || spots();
    const sp = Z.weighted(E.spots, (s) => s.w() * (n.last === s.id ? 0.05 : 1));
    n.last = sp.id; n.dest = sp; return sp;
  }
  function routeTo(n, sp) {
    const W = Z.world, from = W.nearestNode(n.x, n.z), nodes = W.path(from, sp.node), pt = sp.pt();
    n.route = nodes.map((k) => [W.nodes[k][0] + Z.rr(-1.4, 1.4), W.nodes[k][1] + Z.rr(-1.4, 1.4)]); n.route.push(pt); n.ri = 0; n.mode = 'walk'; n.finalLook = sp.look;
  }

  E.spawnNpcs = function (count, atGate) {
    E.clearNpcs(); E.spots = null; const W = Z.world, keys = Object.keys(W.nodes).filter((k) => !/^st[AB]$/.test(k));
    const roles = []; for (let i = 0; i < count; i++) roles.push(i < 7 ? 'employee' : i < 7 + Math.round(count * 0.2) ? 'fan' : 'normie');
    const posts = ['steg', 'rex', 'petting', 'lab', 'lagoon', 'parakeets', 'aviary', 'trike'];
    roles.forEach((role, i) => {
      const rng = Z.makeRng(1000 + i * 17 + Math.floor(Math.random() * 1e6));
      const o = role === 'employee' ? { shirt: '#c9a66b', pants: '#7a5a38', hat: 'ranger', hatColor: '#b08a4a', skin: Z.pick(SKIN), hair: Z.pick(HAIR), shoes: '#4a3520' }
        : role === 'fan' ? { shirt: Z.pick(['#ff8a2b', '#1fb5a8', '#8c4bd6']), pants: '#2b3a6a', hat: 'dino', skin: Z.pick(SKIN), hair: Z.pick(HAIR), shirtLogo: '#fff3e0', backpack: '#8c4bd6' }
          : { shirt: Z.pick(SHIRT), pants: Z.pick(['#3a3a5a', '#5a4a3a', '#2a4a6a', '#6a3a5a', '#4a4a4a']), hat: Math.random() < 0.3 ? 'cap' : '', hatColor: Z.pick(SHIRT), skin: Z.pick(SKIN), hair: Z.pick(HAIR), backpack: Math.random() < 0.25 ? '#5a4a3a' : null };
      o.seed = i + 3; o.scale = 0.86 + Math.random() * 0.12;
      const api = E.person(o), npc = { id: i, role, name: Z.Talk.name(), api, x: 0, z: 0, h: Math.random() * 6, speed: Z.rr(1.5, 2.2), mode: 'idle', timer: Z.rr(1, 6), route: null, ri: 0, group: null, panic: 0, log: [], stuck: 0, pose: 0 };
      if (role === 'employee') { npc.speed = 1.5; npc.post = i < posts.length + 1 && i < 6 ? posts[i] : null; npc.name = Z.Talk.name(); }
      if (atGate) { npc.x = Z.rr(-3, 3); npc.z = Z.world.data.park.z0 + 2 + Math.random() * 6; npc.delay = Math.random() * 25; api.root.setEnabled(false); }
      else { const n = Z.pick(keys); npc.x = W.nodes[n][0] + Z.rr(-2, 2); npc.z = W.nodes[n][1] + Z.rr(-2, 2); }
      if (npc.post) { const e = W.exhibitById[npc.post] || {}; if (e.window) { const f = e.window.face; npc.x = e.window.x + f[0] * 3.2 + f[1] * 2; npc.z = e.window.z + f[1] * 3.2 + f[0] * 2; npc.h = Math.atan2(-f[0], -f[1]); } else if (e.gate) { npc.x = e.gate.x - 3; npc.z = e.gate.z + 2.6; npc.h = 1.57; } else { npc.x = 0; npc.z = 38; npc.h = 0; } npc.mode = 'post'; }
      api.root.position.set(npc.x, 0, npc.z); E.npcs.push(npc);
    });
  };
  E.clearNpcs = function () { E.npcs.forEach((n) => n.api.root.dispose()); E.npcs = []; E.groups = []; };
  E.nearestNpc = function (x, z, r) { let best = null, bd = r; E.npcs.forEach((n) => { if (!n.api.root.isEnabled()) return; const d = Z.dist(x, z, n.x, n.z); if (d < bd) { bd = d; best = n; } }); return best; };

  function updateNpc(n, dt, t, ctx) {
    const root = n.api.root;
    if (n.delay > 0) { n.delay -= dt; if (n.delay <= 0) { root.setEnabled(true); n.delay = 0; n.mode = 'idle'; n.timer = 0; } return; }
    let walk = 0, spd = n.speed;
    if (n.panic > 0) {
      n.panic -= dt; const a = ctx.chaser; if (a) { const dx = n.x - a.x, dz = n.z - a.z, d = Math.hypot(dx, dz) || 1; n.tx = n.x + dx / d * 10; n.tz = n.z + dz / d * 10; spd = 4.6 + (n.role === 'employee' ? -1 : 0); step(n, dt, spd); walk = 1; if (!n.said || t - n.said > 6) { n.said = t; if (Math.random() < 0.6) Z.UI.bubble(n, Z.Talk.panic(), 2400, true); } }
      if (n.panic <= 0) { n.mode = 'idle'; n.timer = 1; n.route = null; }
    } else if (n.mode === 'post') { walk = 0; n.h = turn(n.h, n.h, 1, dt); }
    else {
      const g = n.group, leader = g && g.members[0];
      if (g && leader !== n) { // follow the group leader
        const lx = leader.x - Math.sin(leader.h) * (1.6 + g.members.indexOf(n) * 0.9) + Math.cos(leader.h) * ((g.members.indexOf(n) % 2 ? 1 : -1) * 1.1), lz = leader.z - Math.cos(leader.h) * (1.6 + g.members.indexOf(n) * 0.9) - Math.sin(leader.h) * ((g.members.indexOf(n) % 2 ? 1 : -1) * 1.1);
        const d = Z.dist(n.x, n.z, lx, lz);
        if (d > 0.7) { n.tx = lx; n.tz = lz; step(n, dt, Math.min(3.2, leader.speed * (0.9 + d * 0.35))); walk = 1; } else n.h = turn(n.h, leader.h, 2, dt);
      } else if (n.mode === 'walk' && n.route) {
        const p = n.route[n.ri]; n.tx = p[0]; n.tz = p[1];
        if (Z.dist(n.x, n.z, p[0], p[1]) < 1.0) { n.ri++; if (n.ri >= n.route.length) { n.mode = 'dwell'; n.timer = Z.rr(6, 24); n.route = null; } }
        else { const moved = step(n, dt, spd); walk = 1; n.stuck = moved < spd * dt * 0.2 ? n.stuck + dt : 0; if (n.stuck > 2.5) { n.ri = Math.min(n.route.length, n.ri + 1); n.stuck = 0; if (n.ri >= n.route.length) { n.mode = 'idle'; n.timer = 1; n.route = null; } } }
      } else if (n.mode === 'dwell') {
        n.timer -= dt; if (n.finalLook) n.h = turn(n.h, Math.atan2(n.finalLook[0] - n.x, n.finalLook[1] - n.z), 2.5, dt);
        if (n.timer <= 0) n.mode = 'idle';
        if (Math.random() < dt * 0.04 && n.role !== 'employee') Z.UI.ambientBubble && Z.UI.ambientBubble(n);
      } else { n.timer -= dt; if (n.timer <= 0 && (!g || leader === n)) routeTo(n, chooseDest(n)); }
      if (n.mode === 'dwell' && g && leader === n && n.timer < 1 && !n.route) { /* leader leaves, group follows */ }
    }
    n.pose += (walk - n.pose) * Math.min(1, dt * 8);
    n.api.pose(dt, n.pose, spd);
    root.position.set(n.x, n.api.bob || 0, n.z); root.rotation.y = n.h;
  }

  function step(n, dt, spd) {
    const dx = n.tx - n.x, dz = n.tz - n.z, d = Math.hypot(dx, dz); if (d < 0.01) return 0;
    n.h = turn(n.h, Math.atan2(dx, dz), 7, dt);
    const s = Math.min(d, spd * dt), ox = n.x, oz = n.z;
    let nx = n.x + Math.sin(n.h) * s, nz = n.z + Math.cos(n.h) * s;
    const c = Z.world.collide(nx, nz, 0.45); n.x = c[0]; n.z = c[1];
    return Math.hypot(n.x - ox, n.z - oz);
  }

  // ---------- groups ----------
  E.formGroup = function (seedNpc, extra) {
    if (seedNpc.group || seedNpc.role === 'employee') return seedNpc.group;
    const near = E.npcs.filter((o) => o !== seedNpc && !o.group && o.role !== 'employee' && o.api.root.isEnabled() && o.mode !== 'post' && Z.dist(o.x, o.z, seedNpc.x, seedNpc.z) < 14).sort((a, b) => Z.dist(a.x, a.z, seedNpc.x, seedNpc.z) - Z.dist(b.x, b.z, seedNpc.x, seedNpc.z));
    const members = [seedNpc].concat(near.slice(0, extra === undefined ? Z.pick([1, 1, 2, 3]) : extra));
    if (members.length < 2 && extra === undefined) return null;
    const now = Z.Game.t * 1000;
    const g = { id: Math.random(), members, until: now + Z.rr(50, 100) * 1000, nextLine: now + 4000, player: false };
    members.forEach((m) => { m.group = g; }); E.groups.push(g); if (members[0].mode === 'idle' || members[0].mode === 'walk') members[0].timer = Math.min(members[0].timer, 1);
    return g;
  };
  E.dissolve = function (g) { g.members.forEach((m) => { if (m.group === g) m.group = null; }); E.groups = E.groups.filter((x) => x !== g); };

  // ---------- escape ----------
  E.startEscape = function (target) {
    if (E.escape) return null;
    const cand = E.animals.filter((a) => a.kind === 'land' && a.sp.len > 2 && a.sp.id !== 'bronto' && !a.escape);
    if (!cand.length) return null;
    const act = Z.pick(cand), W = Z.world;
    // pop out through the fence on the side nearest the main path
    const side = act.ex.cx < 0 ? act.ex.rect[2] + 2 : act.ex.rect[0] - 2; act.x = side; act.h = act.ex.cx < 0 ? 1.57 : -1.57;
    const now = Z.Game.t * 1000;
    const info = { act, started: now, until: now + 32000, hit: 0, tcur: null };
    act.escape = { target: () => { const p = target(); info.tcur = p; return p; } };
    E.escape = info; return info;
  };
  E.endEscape = function () {
    const e = E.escape; if (!e) return; e.act.escape = null; e.act.mode = 'walk'; e.act.tx = e.act.ex.cx; e.act.tz = e.act.ex.cz; e.act.x = e.act.ex.cx + 4; e.act.z = e.act.ex.cz; E.escape = null;
    E.npcs.forEach((n) => { n.panic = 0; });
  };

  E.feedPet = function (x, z) {
    const list = E.animals.filter((a) => a.ex.id === 'petting').sort((a, b) => Z.dist(a.x, a.z, x, z) - Z.dist(b.x, b.z, x, z)).slice(0, 3);
    list.forEach((a) => { a.mode = 'seek'; a.seekX = x + Z.rr(-1.2, 1.2); a.seekZ = z + Z.rr(-1.2, 1.2); a.timer = 99; });
    return list.length;
  };

  // ---------- per-frame ----------
  E.update = function (dt, t, ctx) {
    Object.keys(pop).forEach((k) => { pop[k] = 1 + (pop[k] - 1) * Math.exp(-dt / 70); if (pop[k] < 1.02) delete pop[k]; });
    E.animals.forEach((a) => { if (a.kind === 'land') updateLand(a, dt, t, ctx); else if (a.kind === 'budgie') updateBudgie(a, dt, t); else updatePtero(a, dt, t); });
    const chaser = E.escape ? E.escape.act : null;
    ctx.chaser = chaser && { x: chaser.x, z: chaser.z };
    if (chaser) E.npcs.forEach((n) => { if (n.api.root.isEnabled() && Z.dist(n.x, n.z, chaser.x, chaser.z) < 26 && !n.panic && n.mode !== 'post') { n.panic = 8; if (n.group) E.dissolve(n.group); } });
    E.npcs.forEach((n) => updateNpc(n, dt, t, ctx));
    const now = t * 1000;
    // groups: form, chatter, expire
    if (!E.nextGroup || now > E.nextGroup) { E.nextGroup = now + Z.rr(5, 11) * 1000; if (E.groups.length < 5) { const s = Z.pick(E.npcs.filter((n) => !n.group && n.role !== 'employee' && n.mode !== 'post')); if (s) E.formGroup(s); } }
    E.groups.slice().forEach((g) => {
      if (now > g.nextLine) { g.nextLine = now + Z.rr(6, 11) * 1000; const m = Z.pick(g.members), line = Z.Talk.groupLine(); Z.UI.bubble(m, line, 3400); if (g.player) Z.UI.groupLog(m.name, line); }
      if (now > g.until && !g.player) E.dissolve(g);
      if (g.members.length < 2 && !g.player) E.dissolve(g);
    });
    // lumpy buzz: sometimes one exhibit becomes the talk of the park
    if (!E.nextBuzz || now > E.nextBuzz) { E.nextBuzz = now + Z.rr(40, 75) * 1000; const ex = Z.weighted(Z.world.exhibits.filter((e) => !e.inside), () => Math.random() + 0.2); Z.popularityBoost(ex.id, Z.rr(2.5, 4.5)); if (ctx.announce && Math.random() < 0.6) ctx.announce('A crowd is gathering at the ' + ex.name + '.'); }
  };
})(window.Z);
