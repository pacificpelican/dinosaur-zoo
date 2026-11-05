/* Species registry, life cycle (hatchling -> juvenile -> adult -> elder), and the genome research program. */
(function (Z) {
  const S = Z.Species = { data: null, onChange: null, onNews: null };
  let uidCounter = 1;

  S.init = function (data) { S.data = data; };
  S.byId = function (id) {
    return S.data.base.find((s) => s.id === id) || S.data.rediscovered.find((s) => s.id === id) || (Z.state.custom || []).find((s) => s.id === id);
  };
  S.exhibitOf = function (id) {
    const b = S.data.base.find((s) => s.id === id); if (b) return b.exhibit;
    const c = (Z.state.custom || []).find((s) => s.id === id); if (c) return c.exhibit;
    return S.data.rediscovered.find((s) => s.id === id) ? 'yardE' : null;
  };
  S.allKnown = function () {
    const ids = new Set(Z.state.animals.map((a) => a.sp));
    return Array.from(ids).map(S.byId).filter(Boolean);
  };
  S.animalsIn = (ex) => Z.state.animals.filter((a) => (a.ex || S.exhibitOf(a.sp)) === ex);

  S.stageOf = function (a) {
    const sp = S.byId(a.sp); if (sp.lifespan > 500) return 'adult';
    const f = a.age / sp.lifespan;
    return f < 0.12 ? 'hatchling' : f < 0.3 ? 'juvenile' : f < 0.85 ? 'adult' : 'elder';
  };
  S.scaleOf = (a) => ({ hatchling: 0.38, juvenile: 0.68, adult: 1, elder: 0.97 }[S.stageOf(a)]);

  S.newAnimal = function (spId, ageFrac, exhibit) {
    const sp = S.byId(spId);
    return { uid: uidCounter++, sp: spId, age: sp.lifespan > 500 ? 5 : sp.lifespan * ageFrac, ex: exhibit || undefined };
  };

  S.freshAnimals = function () {
    const list = [];
    S.data.base.forEach((sp) => {
      for (let i = 0; i < sp.count; i++) list.push(S.newAnimal(sp.id, Z.rr(0.3, 0.65)));
    });
    return list;
  };
  S.syncUid = () => { uidCounter = Z.state.animals.reduce((m, a) => Math.max(m, a.uid), 0) + 1; };

  const news = (msg) => { if (S.onNews) S.onNews(msg); };

  // Called once per in-game midnight.
  S.dayTick = function () {
    const st = Z.state; let changed = false;
    st.animals.forEach((a) => { a.age += 1; });
    const retire = st.animals.filter((a) => { const sp = S.byId(a.sp); return sp.lifespan < 500 && a.age > sp.lifespan; });
    retire.forEach((a) => {
      const sp = S.byId(a.sp);
      if (st.animals.filter((x) => x.sp === a.sp).length > 1) {
        st.animals.splice(st.animals.indexOf(a), 1); changed = true;
        news('An elder ' + sp.common + ' has retired to the sanctuary after a long life.');
      } else a.age = sp.lifespan * 0.9; // never retire the last of a species
    });
    S.allKnown().forEach((sp) => {
      if (sp.lifespan > 500) return;
      const adults = st.animals.filter((a) => a.sp === sp.id && S.stageOf(a) === 'adult').length;
      const total = st.animals.filter((a) => a.sp === sp.id).length;
      const cap = Math.max(3, sp.count + 2);
      if (adults >= 2 && total < cap && Math.random() < 0.3) {
        st.animals.push(S.newAnimal(sp.id, 0.02, S.exhibitOf(sp.id)));
        news('A baby ' + sp.common + ' hatched this morning! Visit the ' + (Z.world.exhibitById[S.exhibitOf(sp.id)] || {}).name + '.');
        st.hatched = (st.hatched || 0) + 1; changed = true;
        Z.popularityBoost(S.exhibitOf(sp.id), 2.2);
      }
    });
    if (changed && S.onChange) S.onChange();
  };

  // ---- research ----
  S.addResearch = function (pts) {
    Z.state.research += pts;
    while (Z.state.research >= 100) { Z.state.research -= 100; S.discover(); }
  };

  S.discover = function () {
    const st = Z.state;
    const left = S.data.rediscovered.filter((s) => !st.discovered.includes(s.id));
    const useReal = left.length && (st.discovered.length + (st.custom || []).length) % 2 === 0;
    if (useReal) {
      const sp = left[0]; st.discovered.push(sp.id);
      placeNew(sp, 'yardE');
      news('Genome Lab: ' + sp.name + ' has been rediscovered and hatched in the Rediscovery Yard!');
    } else {
      const sp = S.synthesize();
      st.custom.push(sp);
      placeNew(sp, 'yardW');
      news('Genome Lab: a new synthesized species, ' + sp.name + ', has hatched in the Synthesis Yard!');
      S.aiName(sp);
    }
    st.discoveries = (st.discoveries || 0) + 1;
  };

  function placeNew(sp, yard) {
    const st = Z.state; sp.exhibit = yard;
    const n = sp.len < 3 ? 2 : 1;
    for (let i = 0; i < n; i++) st.animals.push(S.newAnimal(sp.id, i ? 0.1 : 0.35, yard));
    // Each yard holds four species; the oldest resident moves to the sanctuary.
    const inYard = []; st.animals.forEach((a) => { if ((a.ex || S.exhibitOf(a.sp)) === yard && !inYard.includes(a.sp)) inYard.push(a.sp); });
    while (inYard.length > 4) {
      const old = inYard.shift();
      st.animals = st.animals.filter((a) => a.sp !== old);
      const o = S.byId(old); news(o.common + ' moved to the sanctuary to make room for new arrivals.');
    }
    Z.popularityBoost(yard, 4);
    if (S.onChange) S.onChange();
  }

  S.synthesize = function () {
    const parents = S.allKnown().filter((s) => !['budgie', 'tinybird', 'pterosaur'].includes(s.form));
    const a = Z.pick(parents); let b = Z.pick(parents); if (b === a && parents.length > 1) b = parents.find((p) => p !== a);
    const P = S.data;
    const genus = Z.pick(P.synthPrefix) + Z.pick(P.synthSuffix);
    const epithet = Z.pick(P.synthEpithet);
    const id = 'syn' + (Z.state.custom.length + 1) + '_' + Math.floor(Math.random() * 1e4);
    const mix = (x, y, t) => '#' + Z.mixHex(x, y, t).toHexString().slice(1, 7);
    const col = (k, k2) => mix(a.colors[k], b.colors[k2], Z.rr(0.25, 0.75));
    return {
      id, name: genus.charAt(0).toUpperCase() + genus.slice(1).toLowerCase() + ' ' + epithet, common: genus.charAt(0).toUpperCase() + genus.slice(1).toLowerCase(),
      form: a.form, diet: a.diet, era: 'Synthesized (Day ' + Z.state.day + ')', len: (a.len + b.len) / 2 * Z.rr(0.8, 1.15), height: (a.height + b.height) / 2,
      speed: (a.speed + b.speed) / 2, lifespan: Math.round((a.lifespan + b.lifespan) / 2), pattern: Z.pick([a.pattern, b.pattern]), feathers: Math.min(1, (a.feathers + b.feathers) / 2 + 0.3),
      colors: { base: col('base', 'accent'), accent: col('accent', 'base'), belly: col('belly', 'belly'), crest: col('crest', 'accent') },
      parents: a.common + ' x ' + b.common, synthesized: true,
      facts: ['A synthesized species engineered from ' + a.common + ' and ' + b.common + ' genomes. It does not exist in the fossil record.', 'Its coloration was predicted from the pigment genes of both parent species.']
    };
  };

  S.aiName = async function (sp) {
    if (!Z.Net.php || Z.Net.aiTier === 'fallback') return;
    try {
      const r = await Z.Net.api('species', { parents: sp.parents });
      if (r.ok && r.name) { sp.name = r.name; sp.common = r.name.split(' ')[0]; if (r.blurb) sp.facts.unshift(r.blurb); if (S.onChange) S.onChange(true); }
    } catch (e) { /* procedural name stays */ }
  };
})(window.Z);
