/* NPC conversation: Tier 1/2 via PHP (Ollama or cloud) when available, Tier 3 deterministic rules from data/dialogue.json. */
(function (Z) {
  const T = Z.Talk = { data: null, lastTier: null };
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? v[k] : m));

  T.vars = function () {
    const s = Z.pick(Z.Species.allKnown());
    const ex = Z.pick(Z.world.exhibits.filter((e) => !e.inside));
    return { species: s.common, fact: Z.pick(s.facts), exhibit: ex.name };
  };

  T.greeting = function (npc) {
    return fill(Z.pick(T.data.greetings[npc.role]), Object.assign({ name: npc.name }, T.vars()));
  };

  T.context = function (npc) {
    const known = Z.Species.allKnown().map((s) => s.common).join(', ');
    const persona = { employee: 'a friendly zoo keeper in a tan uniform who knows the zoo and dinosaur science well', fan: 'an enthusiastic dinosaur super-fan visitor who loves sharing trivia', normie: 'a casual zoo visitor who knows little about dinosaurs and likes snacks' }[npc.role];
    const hrs = 'The park is open 9 am to 9 pm; the cable car costs $5; the hotel is outside the gate.';
    return 'You are ' + npc.name + ', ' + persona + ' at Dinosaurs & Friends Zoo. Species at the zoo now: ' + known + '. ' + hrs + ' Day ' + Z.state.day + ', time ' + Z.fmtClock(Z.state.minutes) + '.';
  };

  T.rule = function (npc, text) {
    const t = ' ' + text.toLowerCase() + ' ';
    const sp = Z.Species.allKnown().find((s) => t.includes(s.common.toLowerCase()) || t.includes(s.name.split(' ')[0].toLowerCase()));
    if (sp) {
      const f = Z.pick(sp.facts);
      const ex = Z.world.exhibitById[Z.Species.exhibitOf(sp.id)];
      if (npc.role === 'employee') return sp.common + ': ' + f + (ex ? ' You can find them at the ' + ex.name + '.' : '');
      if (npc.role === 'fan') return 'Oh, ' + sp.common + '! ' + f;
      return 'The ' + sp.common + '? I like it. Someone told me: ' + f;
    }
    const hits = T.data.topics.filter((tp) => tp.keys.some((k) => t.includes(k)));
    const hit = hits.find((tp) => tp.roles && tp.roles.includes(npc.role)) || hits.find((tp) => !tp.roles);
    if (hit) return fill(Z.pick(hit.a), T.vars());
    return fill(Z.pick(T.data.fallback[npc.role]), T.vars());
  };

  T.replyWithTier = async function (npc, text, history) {
    let error = '';
    if (Z.Net.php && Z.Net.aiTier !== 'fallback') {
      try {
        const r = await Z.Net.api('chat', { context: T.context(npc), message: text, history: history || [] });
        if (r.ok && r.reply) { T.lastTier = r.tier; return { text: r.reply, tier: r.tier }; }
        error = r.error || 'The AI service returned an invalid response.';
      } catch (e) { error = 'Could not reach the AI service: ' + (e.message || e); }
      Z.Net.lastError = error;
      console.warn('AI chat unavailable; using rule-based reply:', error);
    }
    T.lastTier = 'fallback';
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 350));
    return { text: T.rule(npc, text), tier: 'fallback', error };
  };
  T.reply = async function (npc, text, history) { return (await T.replyWithTier(npc, text, history)).text; };

  T.groupLine = function () { return fill(Z.pick(T.data.groupLines), T.vars()); };
  T.panic = () => Z.pick(T.data.panic);
  T.joinReply = () => fill(Z.pick(T.data.joinReplies), T.vars());
  T.leaveReply = () => Z.pick(T.data.leaveReplies);
  T.name = () => Z.pick(T.data.names.first) + ' ' + Z.pick(T.data.names.last);
})(window.Z);
