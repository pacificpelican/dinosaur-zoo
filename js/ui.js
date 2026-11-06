/* DOM layer: toasts, speech bubbles, modals, dialogue, viewing-window overlay and the Zoo Phone (settings). */
(function (Z) {
  const $ = (id) => document.getElementById(id);
  const U = Z.UI = { bubbles: [], phoneTab: 'stats', dlg: null, photos: [] };
  const show = (id) => $(id).classList.remove('hidden'), hide = (id) => $(id).classList.add('hidden');
  U.show = show; U.hide = hide;
  U.anyModal = () => ['mTitle', 'mPause', 'mPhone', 'mDialog', 'mShot', 'mInfo', 'winBar'].some((id) => !$(id).classList.contains('hidden'));

  U.toast = function (msg, alert) {
    const t = document.createElement('div'); t.className = 'toast' + (alert ? ' alert' : ''); t.textContent = msg; $('toasts').appendChild(t);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => t.remove(), alert ? 6000 : 4200);
  };

  // ---- speech bubbles projected from world positions ----
  U.bubble = function (npc, text, ms, alert) {
    if (!npc || !npc.api || !npc.api.root.isEnabled()) return;
    if (U.bubbles.length > 9) return;
    const old = U.bubbles.find((b) => b.npc === npc); if (old) { old.el.remove(); U.bubbles.splice(U.bubbles.indexOf(old), 1); }
    const el = document.createElement('div'); el.className = 'bubble' + (alert ? ' alert' : ''); el.textContent = text; document.body.appendChild(el);
    U.bubbles.push({ npc, el, until: performance.now() + (ms || 3000) });
  };
  U.ambientBubble = (n) => U.bubble(n, Z.Talk.groupLine(), 2800);
  U.updateBubbles = function (scene, engine, cam) {
    const now = performance.now(), w = engine.getRenderWidth(), h = engine.getRenderHeight(), cv = engine.getRenderingCanvas().getBoundingClientRect();
    const tm = BABYLON.Matrix.Identity(), vp = cam.viewport.toGlobal(w, h);
    U.bubbles = U.bubbles.filter((b) => {
      if (now > b.until || !b.npc.api.root.isEnabled()) { b.el.remove(); return false; }
      const p = BABYLON.Vector3.Project(new BABYLON.Vector3(b.npc.x, (b.npc.topY || b.npc.api.topY) + 0.3, b.npc.z), tm, scene.getTransformMatrix(), vp);
      const vis = p.z > 0 && p.z < 1 && p.x > 0 && p.x < w && p.y > 0 && p.y < h;
      b.el.style.display = vis && Z.UI.camDist(b.npc) < 45 ? 'block' : 'none';
      b.el.style.left = (cv.left + p.x * cv.width / w) + 'px'; b.el.style.top = (cv.top + p.y * cv.height / h) + 'px';
      return true;
    });
  };
  U.camDist = (n) => Math.hypot(n.x - Z.Game.player.x, n.z - Z.Game.player.z);

  U.groupLog = function (name, line) {
    const l = $('groupLog'), p = document.createElement('p'); p.innerHTML = '<b>' + Z.esc(name) + ':</b> ' + Z.esc(line); l.appendChild(p);
    while (l.children.length > 40) l.firstChild.remove(); l.scrollTop = l.scrollHeight;
  };

  U.info = function (title, html, buttons) {
    $('infoTitle').textContent = title; $('infoBody').innerHTML = html; const b = $('infoBtns'); b.innerHTML = '';
    (buttons || [{ label: 'OK' }]).forEach((d) => { const x = document.createElement('button'); x.className = 'btn' + (d.alt ? ' alt' : ''); x.textContent = d.label; x.onclick = () => { hide('mInfo'); if (d.fn) d.fn(); }; b.appendChild(x); });
    show('mInfo');
  };

  // ---- dialogue ----
  const logLine = (cls, who, text) => { const p = document.createElement('p'); p.className = cls; p.innerHTML = (who ? '<b>' + Z.esc(who) + ':</b> ' : '') + Z.esc(text); $('dlgLog').appendChild(p); $('dlgLog').scrollTop = $('dlgLog').scrollHeight; };
  U.dialog = function (npc) {
    const d = U.dlg = { npc, history: [], busy: false, lines: [] };
    $('dlgTitle').innerHTML = Z.esc(npc.name) + '<span class="role ' + npc.role + '">' + ({ employee: 'Zoo staff', fan: 'Dino fan', normie: 'Visitor' }[npc.role]) + '</span>';
    $('dlgLog').innerHTML = '';
    const g = Z.Talk.greeting(npc); logLine('them', npc.name, g); d.lines.push([npc.name, g]);
    const topics = npc.role === 'employee' ? ['Opening hours', 'Escapes', 'Genome lab', 'Baby dinosaurs', 'Cable car', 'Parakeets'] : npc.role === 'fan' ? ['Favourite dinosaur', 'Feathers', 'Parakeets', 'Where to find T. rex'] : ['Food', 'Cable car', 'Parakeets', 'Camera'];
    $('dlgChips').innerHTML = ''; topics.forEach((t) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => U.say(t); $('dlgChips').appendChild(b); });
    $('dlgTier').textContent = ''; $('dlgJoin').style.display = npc.role === 'employee' ? 'none' : ''; $('dlgJoin').textContent = npc.group && npc.group.player ? 'Leave group' : 'Join group';
    $('dlgForm').style.display = ''; show('mDialog'); setTimeout(() => $('dlgInput').focus(), 50);
  };
  U.groupDialog = function () {
    const g = Z.Game.group; if (!g) return;
    U.dlg = { npc: null, group: g, history: [], lines: [] };
    $('dlgTitle').textContent = 'Group chat (' + g.members.length + ' friends)'; $('dlgLog').innerHTML = ''; $('dlgChips').innerHTML = '';
    Array.from($('groupLog').children).forEach((p) => { const q = document.createElement('p'); q.className = 'them'; q.innerHTML = p.innerHTML; $('dlgLog').appendChild(q); });
    $('dlgJoin').style.display = ''; $('dlgJoin').textContent = 'Leave group'; $('dlgTier').textContent = ''; show('mDialog'); setTimeout(() => $('dlgInput').focus(), 50);
  };
  U.say = async function (text) {
    const d = U.dlg; if (!d || d.busy || !text.trim()) return; text = text.trim().slice(0, 200);
    logLine('me', Z.Game.name, text); d.lines.push([Z.Game.name, text]);
    if (d.group) { // group members answer in turn
      Z.Game.group.members.slice(0, 2).forEach((m, i) => setTimeout(async () => { const r = await Z.Talk.reply(m, text, []); logLine('them', m.name, r); U.groupLog(Z.Game.name, text); U.groupLog(m.name, r); U.bubble(m, r.slice(0, 80), 3000); }, 500 + i * 900));
      return;
    }
    d.busy = true; d.history.push({ role: 'user', content: text });
    const r = await Z.Talk.reply(d.npc, text, d.history); d.history.push({ role: 'assistant', content: r }); d.busy = false;
    logLine('them', d.npc.name, r); d.lines.push([d.npc.name, r]); $('dlgTier').textContent = 'Reply engine: ' + ({ ollama: 'Local Ollama', cloud: 'Cloud LLM', fallback: 'Rule-based fallback' }[Z.Talk.lastTier] || Z.Talk.lastTier);
  };
  U.printChat = function () {
    const d = U.dlg; if (!d) return; const w = window.open('', '_blank'); if (!w) { U.toast('Pop-up blocked: allow pop-ups to print.'); return; }
    w.document.write('<title>Chat</title><body style="font-family:Georgia,serif;max-width:640px;margin:30px auto"><h2>Dinosaurs &amp; Friends Zoo &mdash; conversation</h2>' + d.lines.map((l) => '<p><b>' + Z.esc(l[0]) + ':</b> ' + Z.esc(l[1]) + '</p>').join('') + '<hr><small>Created by Daniel McKeown <a href="https://altaredwood.work">https://altaredwood.work</a></small></body>');
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  // ---- viewing window ----
  const PHOTOS = ['Ava-3293561590_3cbda89e76.1e41789a.jpg', 'Bogeys_11th_Gotcha_Day__artwork_2025.jpg', 'Dodger-4887734382_6a6efc744a_z.053d0110.jpg', 'Striker--close-up-2010-by-DanielJMcKeown.jpg', 'Sparty-by-Jessica--April2010-byDanielJMcKeown.jpg', 'Belle-the-parakeet-by-JessicaMcKeown-9-10-2010.jpg'];
  U.openWindow = function (ex) {
    const list = Z.Species.animalsIn(ex.id), names = {}; list.forEach((a) => { const sp = Z.Species.byId(a.sp); (names[sp.id] = names[sp.id] || { sp, n: 0 }).n++; });
    const entries = Object.values(names); U.win = { ex, entries, fi: 0, facts: [] };
    entries.forEach((e) => e.sp.facts.forEach((f) => U.win.facts.push(e.sp.common + ': ' + f)));
    $('winInfo').innerHTML = '<b>' + Z.esc(ex.name) + '</b><br>' + (entries.map((e) => Z.esc(e.sp.name) + ' &times;' + e.n + ' <span class="pill">' + Z.esc(e.sp.era || '') + '</span>').join(' &middot; ') || 'Empty for now.') + '<br><span id="winFactText"></span>';
    U.nextFact();
    $('winPhotos').innerHTML = ex.id === 'parakeets' ? PHOTOS.map((p) => '<img src="art/' + encodeURI(p) + '" alt="Parakeet photo from the McKeown flock" loading="lazy">').join('') : '';
    $('winPhotos').onclick = (e) => { if (e.target.tagName === 'IMG') U.info('Photo from the flock', '<img src="' + e.target.src + '" style="width:100%;border-radius:8px">'); };
    show('winFrame'); show('winBar');
  };
  U.nextFact = function () { const w = U.win; if (!w || !w.facts.length) return; w.fi = (w.fi + 1) % w.facts.length; $('winFactText').textContent = w.facts[w.fi]; };
  U.closeWindow = function () { U.win = null; hide('winFrame'); hide('winBar'); };

  U.shotPreview = function (url) { $('shotImg').src = url; $('shotDl').href = url; $('shotDl').download = 'dinosaurs-friends-zoo-' + Z.stamp().replace(/[^0-9a-z]+/gi, '-') + '.png'; show('mShot'); };

  // ---- Zoo Phone ----
  const TABS = [['acct', 'Account'], ['stats', 'Stats & Bank'], ['save', 'Save/Load'], ['ctl', 'Controls'], ['debug', 'Debug'], ['credits', 'Credits'], ['terms', 'Terms'], ['privacy', 'Privacy']];
  U.openPhone = function (tab) { U.phoneTab = tab || U.phoneTab; U.renderPhone(); show('mPhone'); };
  U.renderPhone = function () {
    const G = Z.Game, st = Z.state; $('phTime').textContent = 'Day ' + st.day + ' ' + Z.fmtClock(st.minutes);
    $('phTabs').innerHTML = TABS.map((t) => '<button data-t="' + t[0] + '" class="' + (t[0] === U.phoneTab ? 'on' : '') + '">' + t[1] + '</button>').join('');
    $('phTabs').onclick = (e) => { if (e.target.dataset.t) { U.phoneTab = e.target.dataset.t; U.renderPhone(); } };
    const s = $('phScreen'), kv = (a) => '<div class="kv">' + a.map((r) => '<span>' + r[0] + '</span><span>' + r[1] + '</span>').join('') + '</div>';
    const btn = (id, label, cls) => '<button class="btn ' + (cls || '') + '" id="' + id + '">' + label + '</button>';
    const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
    let h = '';
    if (U.phoneTab === 'acct') {
      h = '<h3>Account</h3>' + kv([['Playing as', Z.esc(G.name)], ['Signed in', Z.Net.user ? Z.esc(Z.Net.user) : (Z.Net.php ? 'No (guest)' : 'Guest (no PHP backend)')]]) +
        '<p><label class="row">Display name <input id="acName" maxlength="18" value="' + Z.esc(G.name) + '"></label></p><p>' + btn('acSet', 'Save name') + '</p>';
      if (Z.Net.php) h += '<h3>Server account</h3><p class="note">Optional: sign in to keep saves on the server.</p><div class="col" style="gap:4px"><input id="acU" placeholder="username" maxlength="24"><input id="acP" type="password" placeholder="password"></div><p class="row">' + btn('acLogin', 'Log in') + btn('acReg', 'Register', 'alt') + (Z.Net.user ? btn('acOut', 'Log out', 'ghost') : '') + '</p><p class="note" id="acMsg"></p>';
      else h += '<p class="note">No PHP backend detected, so accounts are unavailable. Your progress is saved in this browser.</p>';
    } else if (U.phoneTab === 'stats') {
      const known = Z.Species.allKnown(), shots = U.photos;
      h = '<h3>Bank</h3>' + kv([['Cash', '$' + st.money], ['Research progress', Math.floor(st.research) + ' / 100'], ['Discoveries', st.discoveries || 0], ['Babies hatched', st.hatched || 0], ['Photos taken', shots.length]]) +
        '<p>' + btn('stFund', 'Fund genome research ($' + Z.world.data.prices.research + ')') + '</p><h3>Zoopedia</h3><p>' + known.map((sp) => '<span class="pill ' + (sp.synthesized ? 'warn' : 'ok') + '">' + Z.esc(sp.common) + '</span>').join('') + '</p><h3>Camera roll</h3>' + (shots.length ? '<div class="gallery" id="stGal">' + shots.map((u, i) => '<img data-i="' + i + '" src="' + u + '" alt="Photo ' + (i + 1) + '">').join('') + '</div>' : '<p class="note">No photos yet. Press C to open the camera.</p>');
    } else if (U.phoneTab === 'save') {
      h = '<h3>Save / Load</h3>' + kv([['Storage', Z.esc(Z.Net.storageLabel())], ['Browser save', Z.Net.hasLocal() ? 'Yes' : 'None']]) + '<p class="row">' + btn('svSave', 'Save now') + btn('svLoad', 'Load', 'alt') + btn('svDel', 'Delete browser save', 'ghost') + '</p><p class="row">' + btn('svExp', 'Export JSON', 'alt') + '<input type="file" id="svImp" accept="application/json"></p><p>' + btn('svNew', 'Start new game', 'ghost') + '</p><p class="note" id="svMsg"></p>';
    } else if (U.phoneTab === 'ctl') {
      h = '<h3>Controls</h3>' + kv([['Move', 'WASD / arrows / D-pad'], ['Run', 'Shift or hold . when not near an interaction'], ['Rotate camera', 'Q / E or drag'], ['Talk', '/ or the top button'], ['Interact / enter', 'Tap . or press X / Enter'], ['Eat / drink', ','], ['Select (join group, shutter)', "'"], ['Camera', 'C'], ['Pause', 'Esc']]) +
        '<h3>Settings</h3><p class="row">Music <select id="ctCh"><option value="auto">Auto mix</option><option value="world">World music</option><option value="house">House (122 BPM)</option><option value="off">Off</option></select></p><p class="row">Volume <input type="range" id="ctVol" min="0" max="1" step="0.05" value="' + Z.Audio.volume + '"></p><p class="row"><label><input type="checkbox" id="ctPaint" ' + (G.painterly ? 'checked' : '') + '> Painterly filter</label> <label><input type="checkbox" id="ctPad" ' + (G.showPad ? 'checked' : '') + '> On-screen controller</label></p>';
    } else if (U.phoneTab === 'debug') {
      const n = Z.Net;
      h = '<h3>Debug</h3>' + kv([['PHP backend', n.php ? '<span class="pill ok">detected</span>' : '<span class="pill warn">not available</span>'], ['Save driver', Z.esc(n.storageLabel())], ['AI mode', Z.esc(n.aiLabel())], ['Dialogue tier', Z.esc(Z.Talk.lastTier)], ['Signed in', n.user ? 'yes' : 'no'], ['Last error', Z.esc(n.lastError || 'none')], ['FPS', G.engine ? Math.round(G.engine.getFps()) : '-'], ['Animals', Z.Ent.animals.length], ['Visitors', Z.Ent.npcs.length], ['Groups', Z.Ent.groups.length], ['Painterly', G.painterly ? 'on' : 'off']]) +
        '<p class="note">Without PHP the game runs entirely in the browser: saves use localStorage and dialogue uses the rule-based engine.</p>';
    } else if (U.phoneTab === 'credits') {
      h = '<h3>Credits</h3><p><b>Dinosaurs &amp; Friends Zoo</b> by Daniel McKeown<br><a href="https://altaredwood.work" target="_blank" rel="noopener" style="color:#ffc247">https://altaredwood.work</a></p><p class="note">Built on the Alta Redwood game design standards. 3D by Babylon.js. Parakeet photographs and artwork by the McKeown family.</p>';
    } else if (U.phoneTab === 'terms') {
      h = '<h3>Terms of Use</h3>' +
        '<p><b>Provided as-is.</b> Dinosaurs &amp; Friends Zoo is offered for entertainment and educational interest, without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, availability, or non-infringement, to the extent permitted by law.</p>' +
        '<p>The game is fictional. Animal behavior, species information, and any AI-generated conversations are simplified, may be inaccurate, and are not professional advice. Use the game at your own discretion. To the extent permitted by law, the game author is not liable for loss arising from use of the game.</p>' +
        '<p><b>Local and hosted use.</b> The game is designed primarily for play on a local machine. You may run it from local files or a local web server. If you access a hosted copy, the site operator is responsible for that site\'s operation, hosting, security, privacy notices, legal compliance, and any services or analytics it enables.</p>' +
        '<p>Optional accounts and server saves may be available on some hosted deployments; they are not required for local play. Availability and terms for those services are determined by the site operator. Keep backups of exported saves if your progress matters.</p>' +
        '<p>These notes do not limit rights or remedies that cannot legally be excluded. &copy; Daniel McKeown.</p>' +
        '<p class="note"><b>Last updated:</b> November 5, 2026.</p>';
    } else if (U.phoneTab === 'privacy') {
      h = '<h3>Privacy Policy</h3>' +
        '<p><b>Local play.</b> The game is designed primarily for your local machine. Game progress and camera-roll images are stored in this browser\'s local storage unless you export them. They are ordinarily available only to this browser profile and site origin; clearing browser data or changing browsers/devices may remove or make them unavailable.</p>' +
        '<p>The game itself does not include built-in analytics or telemetry. When you visit a hosted site, its web host may receive standard connection and request data (such as IP address, time, and requested files) in server logs. A site operator may also add analytics or other services; check that site\'s own privacy notice for what it collects and how to contact the operator.</p>' +
        '<p><b>Optional services.</b> Some hosted versions may offer accounts and server-side saves. If you choose to register or sign in, account information and saved game data are sent to and stored by that site\'s server under the operator\'s practices. If AI dialogue is enabled, messages you send may be processed by the configured AI service. Local/offline fallback dialogue does not require sending messages to an AI service.</p>' +
        '<p>Services, retention, access, and deletion options vary by deployment. For questions or requests about data on a hosted site, contact that site\'s operator, who is responsible for the site and its integrations. For a local-only game, you can delete the browser save in Settings &gt; Save/Load or clear this site\'s browser storage.</p>' +
        '<p class="note"><b>Last updated:</b> November 5, 2026.</p>';
    }
    s.innerHTML = h;
    on('acSet', () => { G.name = ($('acName').value || 'Player 1').slice(0, 18); st.name = G.name; $('badge').textContent = G.name; U.toast('Name saved'); });
    const auth = async (a) => { try { const r = await Z.Net.api(a, { username: $('acU').value, password: $('acP').value }); $('acMsg').textContent = r.ok ? 'Done.' : (r.error || 'Failed'); if (r.ok) { await Z.Net.detect(); U.renderPhone(); } } catch (e) { $('acMsg').textContent = 'Backend error'; } };
    on('acLogin', () => auth('login')); on('acReg', () => auth('register')); on('acOut', async () => { try { await Z.Net.api('logout', {}); } catch (e) { /* ignore */ } await Z.Net.detect(); U.renderPhone(); });
    on('stFund', () => { G.fundResearch(); U.renderPhone(); });
    if ($('stGal')) $('stGal').onclick = (e) => { if (e.target.dataset.i) U.shotPreview(U.photos[+e.target.dataset.i]); };
    on('svSave', async () => { const r = await G.save(); $('svMsg').textContent = r.ok ? 'Saved to ' + r.where + '.' : 'Save failed.'; });
    on('svLoad', async () => { const ok = await G.loadSaved(); $('svMsg').textContent = ok ? 'Loaded.' : 'No save found.'; if (ok) hide('mPhone'); });
    on('svDel', () => { Z.Net.clearLocal(); $('svMsg').textContent = 'Browser save deleted.'; });
    on('svExp', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(G.snapshot())], { type: 'application/json' })); a.download = 'dfz-save.json'; a.click(); });
    if ($('svImp')) $('svImp').onchange = (e) => { const f = e.target.files[0]; if (!f) return; f.text().then((t) => { try { G.applyState(JSON.parse(t)); hide('mPhone'); U.toast('Save imported'); } catch (x) { $('svMsg').textContent = 'Invalid file.'; } }); };
    on('svNew', () => U.info('Start a new game?', 'Your current progress will be replaced.', [{ label: 'Cancel', alt: true }, { label: 'New game', fn: () => { hide('mPhone'); G.newGame(); } }]));
    if ($('ctCh')) { $('ctCh').value = Z.Audio.channel; $('ctCh').onchange = (e) => Z.Audio.setChannel(e.target.value); $('ctVol').oninput = (e) => Z.Audio.setVolume(+e.target.value); $('ctPaint').onchange = (e) => G.setPainterly(e.target.checked); $('ctPad').onchange = (e) => G.setPad(e.target.checked); }
  };
})(window.Z);
