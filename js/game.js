/* Boot, main loop, clock, economy, input, interactions, cable ride, escapes, saves, screenshots. */
(function (Z) {
  const B = BABYLON, U = Z.UI, E = Z.Ent, $ = (id) => document.getElementById(id);
  const G = Z.Game = { name: 'Player 1', player: { x: 0, z: -52, h: 0 }, group: null, painterly: true, showPad: true, phonePaused: true, t: 0, started: false, riding: null, win: null };
  const PREFS_KEY = 'dfz.settings.v2';
  const LEGACY_PREFS_KEY = 'dfz.settings.v1';
  const musicChannels = ['auto', 'world', 'house', 'off'];
  let prefs = { gameSpeed: 'default', simAwayNight: true };
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    const legacy = JSON.parse(localStorage.getItem(LEGACY_PREFS_KEY) || '{}');
    prefs = {
      gameSpeed: (stored.gameSpeed || legacy.gameSpeed) === 'relaxed' ? 'relaxed' : 'default',
      simAwayNight: typeof stored.simAwayNight === 'boolean' ? stored.simAwayNight : true
    };
  } catch (e) { /* default preferences */ }
  G.gameSpeed = prefs.gameSpeed;
  G.simAwayNight = prefs.simAwayNight;
  let engine, scene, cam, winCam, W, avatar, data, post, painterlyOn = true;
  const keys = {}, pad = { x: 0, y: 0 }, chatMove = { left: false, right: false, up: false, down: false };
  G.clearChatMovement = () => { Object.keys(chatMove).forEach((k) => { chatMove[k] = false; }); ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].forEach((k) => { keys[k] = false; }); };
  let knock = 0, nextEscape = 0, shotQueued = false, fastForward = false, lastOpen = null, lastSave = 0;
  const prices = () => W.data.prices;

  const freshState = (name) => ({
    name: name || 'Player 1', money: 300, day: 1, minutes: 540, animals: Z.Species.freshAnimals(), custom: [], discovered: [], research: 30,
    ticketDay: 0, inv: { soda: 0, funnel: 0, nuts: 0 }, discoveries: 0, hatched: 0, ate: 0, photos: 0, atmWithdrawnDay: 0, atmWithdrawn: 0,
    simAwayNight: G.simAwayNight, musicChannel: Z.Audio.channel
  });
  const isOpen = () => Z.state.minutes >= data.hours.open * 60 && Z.state.minutes < data.hours.close * 60;
  const inPark = (p) => p.x > W.data.park.x0 && p.x < W.data.park.x1 && p.z > W.data.park.z0 && p.z < W.data.park.z1;
  G.isOpen = isOpen;

  // ---------- state ----------
  G.snapshot = () => Object.assign({}, Z.state, {
    name: G.name, simAwayNight: G.simAwayNight, musicChannel: Z.Audio.channel,
    playerPosition: savedPlayerPosition(), savedAt: Date.now()
  });
  G.applyState = function (s) {
    const f = freshState(s.name); Z.state = Object.assign(f, s); Z.state.inv = Object.assign({ soda: 0, funnel: 0, nuts: 0 }, s.inv);
    G.simAwayNight = typeof s.simAwayNight === 'boolean' ? s.simAwayNight : prefs.simAwayNight;
    Z.state.simAwayNight = G.simAwayNight;
    const musicChannel = musicChannels.includes(s.musicChannel) ? s.musicChannel : Z.Audio.channel;
    Z.Audio.setChannel(musicChannel); Z.state.musicChannel = musicChannel;
    G.savePreferences();
    Z.state.custom = Z.state.custom || []; G.name = Z.state.name || 'Player 1'; $('badge').textContent = G.name;
    Z.Species.syncUid(); E.rebuildAnimals(); G.leaveGroup(true); G.riding = null; if (G.win) G.closeWindow();
    W.setTime(Z.state.minutes); syncGate();
    const p = s.playerPosition;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.h) &&
        p.x >= -170 && p.x <= 170 && p.z >= -140 && p.z <= 170) {
      if (!isOpen() && inPark(p)) placePlayer(0, -36, Math.PI);
      else { const pos = W.collide(p.x, p.z, 0.5); placePlayer(Z.clamp(pos[0], -170, 170), Z.clamp(pos[1], -140, 170), p.h); }
    } else placePlayer(0, -52, 0);
    syncCrowd(true); hud();
  };
  G.save = async function () {
    const r = await Z.Net.save(G.snapshot());
    if (r.warning) U.toast(r.warning, !r.ok);
    return r;
  };
  G.loadSaved = async function () { const r = await Z.Net.load(); if (r.state) G.applyState(r.state); return r; };
  G.newGame = function () {
    if (!G.started) Z.Audio.init();
    G.applyState(freshState(G.name));
    if (G.started) G.save(); else enterGame();
    U.toast('A new day begins at the Dinosaurs & Friends Zoo!');
  };
  G.fundResearch = function () {
    const c = prices().research; if (Z.state.money < c) { U.toast('Not enough cash for research.'); return; }
    Z.state.money -= c; Z.Audio.sfx('coin'); Z.Species.addResearch(50); Z.popularityBoost('lab', 3); U.toast('Research funded: +50 genome points'); hud();
  };
  G.setPainterly = (v) => { G.painterly = v; if (post) post.setEnabled ? 0 : 0; painterlyOn = v; };
  G.setPad = (v) => { G.showPad = v; $('pads').style.display = v ? '' : 'none'; };
  G.savePreferences = function () {
    prefs.simAwayNight = G.simAwayNight;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ gameSpeed: G.gameSpeed, simAwayNight: G.simAwayNight })); return true; }
    catch (e) { U.toast('Could not save settings in this browser.'); return false; }
  };
  G.setGameSpeed = function (speed) {
    G.gameSpeed = speed === 'relaxed' ? 'relaxed' : 'default';
    G.savePreferences();
  };
  G.setSimAwayNight = function (enabled) {
    G.simAwayNight = !!enabled;
    Z.state.simAwayNight = G.simAwayNight;
    G.savePreferences();
    if (G.started) G.save();
  };
  G.setMusicChannel = function (channel) {
    if (!musicChannels.includes(channel)) return;
    Z.Audio.setChannel(channel);
    Z.state.musicChannel = channel;
    if (G.started) G.save();
  };

  function placePlayer(x, z, h) { G.player.x = x; G.player.z = z; G.player.h = h || 0; }
  function savedPlayerPosition() {
    let p = G.player;
    if (G.riding) { const board = W.data.cable[G.riding.dest.toLowerCase()].board; p = { x: board.x, z: board.z, h: 0 }; }
    if (!isOpen() && inPark(p)) return { x: 0, z: -36, h: Math.PI };
    return { x: p.x, z: p.z, h: p.h };
  }
  function money(d, msg) { Z.state.money += d; if (msg) U.toast(msg); hud(); }
  function hud() {
    const s = Z.state, open = isOpen();
    $('clock').textContent = 'Day ' + s.day + ' \u00b7 ' + Z.fmtClock(s.minutes) + ' \u00b7 ' + (open ? 'OPEN' : 'CLOSED') + (fastForward ? ' \u00bb\u00bb' : '');
    $('money').textContent = '$' + s.money + (s.inv.nuts ? ' \u00b7 nuts ' + s.inv.nuts : '') + (s.inv.soda ? ' \u00b7 soda ' + s.inv.soda : '') + (s.inv.funnel ? ' \u00b7 cake ' + s.inv.funnel : '');
    if (!$('mPhone').classList.contains('hidden')) $('phTime').textContent = 'Day ' + s.day + ' ' + Z.fmtClock(s.minutes);
  }

  // ---------- clock ----------
  function advance(dmin, allowNightSkip) {
    const s = Z.state, wasDay = s.day; s.minutes += dmin;
    if (allowNightSkip !== false && G.simAwayNight && s.minutes >= 1320 && s.minutes < 1980) s.minutes = 1980;
    while (s.minutes >= 1440) { s.minutes -= 1440; s.day++; Z.Species.dayTick(); Z.Species.addResearch(20); Z.popularityBoost(Z.pick(W.exhibits).id, 2.5); G.save(); }
    if (s.day !== wasDay) U.toast('Day ' + s.day + ' begins.');
  }
  function syncGate() { const open = isOpen() && Z.state.ticketDay === Z.state.day; W.setGate(open); const i = W.solids.indexOf(W.gateRect); if (open && i >= 0) W.solids.splice(i, 1); if (!open && i < 0) W.solids.push(W.gateRect); }
  function syncCrowd(force) {
    const open = isOpen();
    if (force || open !== lastOpen) {
      lastOpen = open;
      if (open) { E.spawnNpcs(30, !force); nextEscape = G.t + Z.rr(80, 130); } else { if (E.escape) E.endEscape(); E.clearNpcs(); G.leaveGroup(true); }
    }
  }
  function closePark() {
    if (G.win) G.closeWindow(); if (G.riding) G.riding = null; G.leaveGroup(true);
    if (inPark(G.player)) { fade(() => { placePlayer(0, -36, Math.PI); U.toast('The park has closed for the evening. Thanks for visiting!'); }); }
  }
  function fade(fn, ms) { $('fade').classList.add('on'); setTimeout(() => { fn(); setTimeout(() => $('fade').classList.remove('on'), 250); }, ms || 450); }
  G.sleep = function () {
    const c = prices().hotel; if (Z.state.money < c) { U.toast('A room costs $' + c + '.'); return; }
    money(-c); Z.Audio.sfx('coin');
    fade(() => { const s = Z.state; advance(s.minutes >= 540 ? 1440 - s.minutes + 540 : 540 - s.minutes, false); s.ticketDay = 0; W.setTime(s.minutes); closePark(); syncGate(); syncCrowd(); placePlayer(-50, -54, 0); U.toast('Good morning! Day ' + s.day + '. The park opens at 9 am.'); G.save(); hud(); }, 900);
  };

  // ---------- interactables ----------
  let acts = [];
  function buildActs() {
    acts = [];
    const cs = () => W.cableState();
    acts.push({ x: 0, z: -34, r: 5, label: () => Z.state.ticketDay === Z.state.day ? (isOpen() ? 'Gate: you have a ticket. Walk on in!' : 'The park is closed until 9 am') : (isOpen() ? 'Buy admission ($' + prices().admission + ')' : 'The box office opens at 9 am'),
      act: () => { const s = Z.state; if (s.ticketDay === s.day) return U.toast('You already have a ticket for today.'); if (!isOpen()) return U.toast('The park is closed.'); if (s.money < prices().admission) return U.toast('Not enough money.'); money(-prices().admission, 'Admission paid. Enjoy the zoo!'); s.ticketDay = s.day; Z.Audio.sfx('coin'); syncGate(); } });
    acts.push({ x: -50, z: -56.5, r: 4, label: () => 'Hotel Cretaceous: sleep until morning ($' + prices().hotel + ')', act: () => U.info('Hotel Cretaceous', 'Rest until 9 am the next day for $' + prices().hotel + '?', [{ label: 'Not yet', alt: true }, { label: 'Sleep', fn: G.sleep }]) });
    const atm = W.data.buildings.find((b) => b.id === 'atm');
    if (atm) acts.push({ x: atm.x, z: atm.z - atm.d / 2 - 1.6, r: 3.2,
      label: () => 'Box Office ATM: withdraw cash (daily limit $' + W.data.atmDailyLimit + ')',
      act: () => {
        const s = Z.state, limit = W.data.atmDailyLimit, withdrawn = s.atmWithdrawnDay === s.day ? (s.atmWithdrawn || 0) : 0;
        const remaining = Math.max(0, limit - withdrawn), amount = Math.min(100, remaining);
        U.info(atm.name, amount
          ? 'Withdraw $' + amount + ' from your card? You can take out up to $' + limit + ' per day. Remaining today: $' + remaining + '.'
          : 'You have reached today\'s $' + limit + ' withdrawal limit. Come back tomorrow.',
        amount ? [{ label: 'Cancel', alt: true }, { label: 'Withdraw $' + amount, fn: () => {
          s.atmWithdrawnDay = s.day; s.atmWithdrawn = withdrawn + amount; money(amount, 'Withdrew $' + amount + '. Daily ATM limit remaining: $' + (remaining - amount) + '.'); Z.Audio.sfx('coin');
        } }] : [{ label: 'OK' }]);
      }
    });
    W.data.stands.forEach((s) => acts.push({ x: s.x, z: s.z + 1, r: 5.5, label: () => s.name + ': ' + s.item + ' $' + prices()[s.item], act: () => { const p = prices()[s.item]; if (Z.state.money < p) return U.toast('Not enough money.'); Z.state.inv[s.item]++; money(-p, 'Bought ' + s.item + (s.item === 'nuts' ? '. Feed the little dinosaurs in the petting pen!' : '. Press , to enjoy it.')); Z.Audio.sfx('coin'); } }));
    W.exhibits.forEach((e) => { if (e.window) acts.push({ x: e.window.x + e.window.face[0] * 2.6, z: e.window.z + e.window.face[1] * 2.6, r: 3.6, label: () => 'Look through the window: ' + e.name, act: () => G.openWindow(e) }); });
    const pet = W.exhibitById.petting; acts.push({ x: pet.cx, z: pet.cz, r: Math.max(pet.rect[2] - pet.rect[0], pet.rect[3] - pet.rect[1]) / 2 - 2, label: () => Z.state.inv.nuts ? 'Feed Brazil nuts to the little dinosaurs' : 'Buy Brazil nuts at the kiosk to feed them', act: () => { if (!Z.state.inv.nuts) return U.toast('You need Brazil nuts. Try the kiosk by the pen.'); Z.state.inv.nuts--; const n = E.feedPet(G.player.x, G.player.z); Z.Audio.sfx('chirp'); Z.popularityBoost('petting', 1.6); U.toast(n ? 'The little dinosaurs scamper over for nuts!' : 'Nobody is hungry.'); hud(); } });
    acts.push({ x: 0, z: 36, r: 5.5, label: () => 'Genome Research Lab: fund research ($' + prices().research + ')', act: G.fundResearch });
    [['a', 'A'], ['b', 'B']].forEach(([k, K], i) => {
      const c = W.data.cable[k];
      acts.push({ x: c.board.x, z: c.board.z, r: 4, label: () => { const s = cs(), car = i ? s.dockB : s.dockA; return car >= 0 ? 'Ride the cable car ($' + prices().cable + ')' : 'Cable car departs in about ' + Math.max(1, Math.round(s.nextDepart ? s.nextDepart : s.dwell)) + 's'; }, act: () => { const s = cs(), car = i ? s.dockB : s.dockA; if (car < 0) return U.toast('Wait for the next car to dock.'); if (Z.state.money < prices().cable) return U.toast('Not enough money.'); money(-prices().cable); Z.Audio.sfx('coin'); G.riding = { car, dest: i ? 'A' : 'B', t: 0 }; G.leaveGroup(true); U.toast('Enjoy the view!'); } });
    });
  }
  function nearestAct() {
    let best = null, bd = 1e9; const p = G.player;
    acts.forEach((a) => { const d = Z.dist(p.x, p.z, a.x, a.z); if (d < a.r && d / a.r < bd) { bd = d / a.r; best = a; } }); return best;
  }

  G.openWindow = function (e) { G.win = e; Z.Audio.sfx('click'); U.openWindow(e); setWinCam(e); scene.activeCamera = winCam; W.glassMesh.setEnabled(false); avatar.root.setEnabled(false); $('viewfinder').classList.add('hidden'); $('hud').classList.add('hidden'); $('pads').classList.add('hidden'); };
  G.closeWindow = function () { G.win = null; U.closeWindow(); scene.activeCamera = cam; W.glassMesh.setEnabled(true); avatar.root.setEnabled(true); $('hud').classList.remove('hidden'); $('pads').classList.remove('hidden'); };
  function setWinCam(e) {
    const f = e.window.face, y = e.id === 'parakeets' ? 1.9 : e.id === 'aviary' ? 5 : 2.2, d = e.id === 'parakeets' ? 3 : 7;
    const off = e.id === 'parakeets' ? 3.2 : 0.3;
    winCam.position.set(e.window.x + f[0] * off, y, e.window.z + f[1] * off); winCam.look = null;
    winCam.base = new B.Vector3(e.window.x - f[0] * d * 1.6, e.id === 'aviary' ? 8 : e.id === 'parakeets' ? 1.7 : 2.2, e.window.z - f[1] * d * 1.6);
    winCam.setTarget(winCam.base.clone()); winCam.fov = e.id === 'parakeets' ? 0.6 : 0.95;
  }

  // ---------- groups ----------
  G.joinGroup = function (npc) {
    if (G.group) return;
    const g = npc.group || E.formGroup(npc, Z.pick([1, 2]));
    if (!g) { U.toast(npc.name + ' prefers to explore solo.'); return; }
    g.player = true; g.until = Infinity; g.replyTiers = new Set(); g.chatHistory = []; g.messages = []; g.chatBusy = false; G.group = g; $('groupLog').innerHTML = ''; $('groupTier').textContent = ''; $('groupPanel').classList.remove('hidden');
    const m = g.members[0]; const l = Z.Talk.joinReply(); U.groupLog(m.name, l); U.bubble(m, l, 3000); U.toast('You joined a group of ' + (g.members.length) + '. Press / to chat.');
  };
  G.leaveGroup = function (quiet) {
    const g = G.group; if (!g) return; g.player = false; g.until = G.t * 1000 + 5000; G.group = null; $('groupPanel').classList.add('hidden');
    if (U.dlg && U.dlg.group === g) closeDialog();
    if (!quiet) { U.bubble(g.members[0], Z.Talk.leaveReply(), 2500); U.toast('You left the group.'); }
  };

  // ---------- input ----------
  function typing() { const t = document.activeElement; return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'); }
  function anyBlocking() { return ['mTitle', 'mPause', 'mPhone', 'mInfo', 'mShot'].some((id) => !$(id).classList.contains('hidden')); }
  const dialogOpen = () => !$('mDialog').classList.contains('hidden');
  function closeDialog() { U.hide('mDialog'); U.dlg = null; }
  function press(k) {
    if (!G.started || anyBlocking() || dialogOpen()) return;
    if (G.win) { if (k === 'x' || k === '.' || k === ',' || k === 'Enter') G.closeWindow(); else if (k === "'") shoot(); return; }
    if (k === '/') { if (G.group) U.groupDialog(); else { const n = E.nearestNpc(G.player.x, G.player.z, 4); if (n) { n.mode = n.mode === 'walk' ? 'idle' : n.mode; n.timer = Math.max(n.timer || 0, 8); U.dialog(n); } else U.toast('No one is close enough to talk to.'); } }
    else if (k === '.' || k === 'x' || k === 'Enter') {
      const a = nearestAct(); if (a) a.act(); else { const n = E.nearestNpc(G.player.x, G.player.z, 3.5); if (n) U.dialog(n); }
    } else if (k === ',') { const i = Z.state.inv; if (i.soda) { i.soda--; Z.Audio.sfx('click'); U.toast('Glug glug. Purple Pop is delicious!'); Z.state.ate++; } else if (i.funnel) { i.funnel--; Z.Audio.sfx('click'); U.toast('Funnel cake! Powdered sugar everywhere.'); Z.state.ate++; } else U.toast('Nothing to eat or drink yet.'); hud(); }
    else if (k === "'") {
      if (!$('viewfinder').classList.contains('hidden')) return shoot();
      if (G.group) return G.leaveGroup(); const n = E.nearestNpc(G.player.x, G.player.z, 6); if (n && n.role !== 'employee') G.joinGroup(n);
    } else if (k === 'c') $('viewfinder').classList.toggle('hidden');
  }
  function bindInput() {
    let dotPointer = null;
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (!$('mDialog').classList.contains('hidden')) return closeDialog(); if (G.win) return G.closeWindow(); if (!$('mPhone').classList.contains('hidden')) return U.hide('mPhone'); if (!$('mShot').classList.contains('hidden')) return U.hide('mShot'); if (!$('mInfo').classList.contains('hidden')) return U.hide('mInfo'); if (G.started && $('mTitle').classList.contains('hidden')) return U.show($('mPause').classList.contains('hidden') ? 'mPause' : 'mPause'); return; }
      if (anyBlocking()) return;
      const arrowInChat = dialogOpen() && document.activeElement === $('dlgInput') && e.key.startsWith('Arrow') && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
      if (typing() && !arrowInChat) return;
      const k = e.key.toLowerCase(); keys[k] = true; if (e.key === 'Shift') keys.shift = true;
      if (['/', "'", 'enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (!e.repeat && ['/', '.', ',', "'", 'x', 'c', 'enter'].includes(k)) press(k);
    });
    addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); keys[k] = false; if (e.key === 'Shift') keys.shift = false; });
    addEventListener('blur', () => { Object.keys(keys).forEach((k) => { keys[k] = false; }); G.clearChatMovement(); dotPointer = null; });
    $('dlgInput').addEventListener('focus', () => { ['w', 'a', 's', 'd', 'q', 'e', 'shift'].forEach((k) => { keys[k] = false; }); });
    document.querySelectorAll('[data-move]').forEach((button) => {
      const direction = button.dataset.move;
      button.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); button.setPointerCapture(e.pointerId); chatMove[direction] = true;
      });
      const release = () => { chatMove[direction] = false; };
      button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
    });
    $('abtns').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-k]');
      if (b) { e.preventDefault(); if (b.dataset.k === '.') { keys['.'] = true; dotPointer = e.pointerId; } press(b.dataset.k); }
    });
    const releaseButton = (e) => { if (dotPointer !== null && (!e || e.pointerId === dotPointer)) { keys['.'] = false; dotPointer = null; } };
    addEventListener('pointerup', releaseButton);
    addEventListener('pointercancel', releaseButton);
    const dp = $('dpad'), upd = (e) => { const r = dp.getBoundingClientRect(), dx = (e.clientX - r.left) / r.width * 2 - 1, dy = (e.clientY - r.top) / r.height * 2 - 1, m = Math.hypot(dx, dy); if (m < 0.22) { pad.x = pad.y = 0; } else { pad.x = dx / Math.max(1, m); pad.y = dy / Math.max(1, m); } const nub = dp.querySelector('.nub'); if (nub) nub.style.transform = 'translate(' + pad.x * 22 + 'px,' + pad.y * 22 + 'px)'; };
    let dpActive = false; dp.addEventListener('pointerdown', (e) => { dpActive = true; dp.setPointerCapture(e.pointerId); upd(e); e.preventDefault(); });
    dp.addEventListener('pointermove', (e) => { if (dpActive) upd(e); });
    const end = () => { dpActive = false; pad.x = pad.y = 0; const nub = dp.querySelector('.nub'); if (nub) nub.style.transform = ''; };
    dp.addEventListener('pointerup', end); dp.addEventListener('pointercancel', end);
    $('btnCam').onclick = () => { if (G.started && !anyBlocking()) press('c'); };
    $('btnPhone').onclick = () => { if (G.started && !anyBlocking() && !dialogOpen() && !G.win) U.openPhone(); };
    $('btnTV').onclick = () => { if (G.started && !anyBlocking()) U.openPhone('tv'); };
    $('btnPause').onclick = () => { if (G.started) U.show('mPause'); };
    $('btnMute').onclick = () => { Z.Audio.setMuted(!Z.Audio.muted); };
    $('btnLeave').onclick = () => G.leaveGroup();
    $('pResume').onclick = () => U.hide('mPause'); $('pShot').onclick = () => { U.hide('mPause'); shoot(true); };
    $('pSettings').onclick = () => { U.hide('mPause'); U.openPhone('ctl'); };
    $('pExit').onclick = () => { U.hide('mPause'); G.save(); G.started = false; $('hud').classList.add('hidden'); showTitle(); };
    $('phClose').onclick = () => U.hide('mPhone'); $('shotClose').onclick = () => U.hide('mShot');
    $('phWorldPause').onclick = () => {
      G.phonePaused = !G.phonePaused;
      $('phWorldPause').setAttribute('aria-pressed', String(G.phonePaused));
      $('phWorldPause').textContent = G.phonePaused ? 'Zoo paused' : 'Zoo running';
    };
    $('dlgClose').onclick = closeDialog;
    $('dlgForm').onsubmit = (e) => { e.preventDefault(); if (U.dlg && (U.dlg.busy || (U.dlg.group && U.dlg.group.chatBusy))) return; const v = $('dlgInput').value; $('dlgInput').value = ''; U.say(v); };
    $('dlgJoin').onclick = () => { const d = U.dlg; if (G.group) { G.leaveGroup(); closeDialog(); } else if (d && d.npc) { closeDialog(); G.joinGroup(d.npc); } };
    $('dlgPrint').onclick = U.printChat;
    $('winClose').onclick = () => G.closeWindow(); $('winFact').onclick = U.nextFact; $('winShot').onclick = () => shoot();
    $('btnTitleSettings').onclick = () => U.openPhone('ctl');
    $('btnNew').onclick = () => startGame(true); $('btnContinue').onclick = () => startGame(false);
    $('badge').onclick = () => { if (G.started) U.openPhone('acct'); };
    $('c').addEventListener('wheel', (e) => { if (!G.started || G.win) return; cam.radius = Z.clamp(cam.radius + e.deltaY * 0.02, 8, 42); e.preventDefault(); }, { passive: false });
    addEventListener('keydown', (e) => { if (e.key === 'p' || e.key === 'P') { if (!typing() && G.started && !anyBlocking() && !dialogOpen()) U.openPhone(); } });
  }

  // ---------- screenshots ----------
  function shoot(auto) {
    if (shotQueued) return; shotQueued = true; Z.Audio.sfx('shutter');
    const vf = $('viewfinder'), was = vf.classList.contains('hidden'); vf.classList.add('hidden');
    engine.onEndFrameObservable.addOnce(() => {
      const src = engine.getRenderingCanvas(), c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d');
      x.drawImage(src, 0, 0); const fs = Math.max(12, Math.round(c.width / 70)); x.font = 'bold ' + fs + 'px sans-serif';
      const txt = 'Dinosaurs & Friends Zoo https://altaredwood.work -- ' + Z.stamp();
      x.fillStyle = 'rgba(20,8,36,.65)'; x.fillRect(0, c.height - fs * 2, c.width, fs * 2); x.fillStyle = '#ffc247'; x.fillText(txt, fs * 0.7, c.height - fs * 0.7, c.width - fs * 1.4);
      const url = c.toDataURL('image/png'); U.photos.unshift(url); if (U.photos.length > 12) U.photos.pop(); Z.state.photos++;
      $('flash').classList.add('on'); setTimeout(() => $('flash').classList.remove('on'), 90);
      if (!was) vf.classList.remove('hidden'); shotQueued = false; setTimeout(() => U.shotPreview(url), 120);
    });
  }

  // ---------- painterly post-process ----------
  function makePost() {
    B.Effect.ShadersStore.painterlyFragmentShader = 'precision highp float; varying vec2 vUV; uniform sampler2D textureSampler; uniform float on; uniform vec2 px;' +
      'float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}' +
      'void main(){ vec3 c=texture2D(textureSampler,vUV).rgb; if(on<0.5){gl_FragColor=vec4(c,1.);return;}' +
      'vec2 d=px*1.5; vec3 b=(texture2D(textureSampler,vUV+vec2(d.x,0.)).rgb+texture2D(textureSampler,vUV-vec2(d.x,0.)).rgb+texture2D(textureSampler,vUV+vec2(0.,d.y)).rgb+texture2D(textureSampler,vUV-vec2(0.,d.y)).rgb)*0.25;' +
      'float tilt=smoothstep(0.28,0.5,abs(vUV.y-0.55)); c=mix(c,b,0.35+0.4*tilt);' +
      'float l=dot(c,vec3(.3,.59,.11)); c=mix(vec3(l),c,1.18); c=floor(c*14.+0.5)/14.*0.55+c*0.45;' +
      'c+=(h(floor(vUV/px/2.))-0.5)*0.035; c*=vec3(1.03,1.0,0.96); vec2 q=vUV-0.5; c*=1.-dot(q,q)*0.7; gl_FragColor=vec4(c,1.);}';
    [cam, winCam].forEach((c) => { const p = new B.PostProcess('painterly', 'painterly', ['on', 'px'], null, 1.0, c);
      p.onApply = (ef) => { ef.setFloat('on', painterlyOn ? 1 : 0); ef.setFloat2('px', 1 / engine.getRenderWidth(), 1 / engine.getRenderHeight()); }; post = p; });
  }

  // ---------- escapes ----------
  function updateEscape() {
    const e = E.escape, now = G.t * 1000;
    if (e) {
      const a = e.act, d = Z.dist(a.x, a.z, G.player.x, G.player.z);
      if (d < 2.6 && knock <= 0 && !G.riding && !G.win && G.t > (e.cool || 0)) { knock = 2.2; e.cool = G.t + 9; const lost = Math.min(15, Z.state.money); money(-lost, 'The ' + a.sp.common + ' knocked you over! You dropped $' + lost + '.'); Z.Audio.sfx('roar'); }
      if (now > e.until) { E.endEscape(); U.toast('Rangers have calmed the ' + a.sp.common + ' and led it home.'); }
    } else if (isOpen() && G.t > nextEscape && Z.state.ticketDay === Z.state.day) {
      nextEscape = G.t + Z.rr(90, 150);
      const info = E.startEscape(() => { const p = G.player; if (inPark(p) && !G.riding && !G.win && Z.dist(p.x, p.z, E.escape.act.x, E.escape.act.z) < 40) return { x: p.x, z: p.z }; const n = E.nearestNpc(E.escape.act.x, E.escape.act.z, 60); return n ? { x: n.x, z: n.z } : { x: 0, z: 30 }; });
      if (info) { Z.Audio.sfx('alarm'); U.toast('ALERT: A ' + info.act.sp.common + ' has escaped its habitat! Stay clear!', true); Z.popularityBoost(info.act.ex.id, 1.5); }
    }
  }

  // ---------- player & camera ----------
  function updatePlayer(dt, ctrl) {
    const p = G.player;
    if (G.riding) {
      const s = W.cableState(), r = G.riding, car = W.cars[r.car], f = s.f[r.car], pos = W.cablePos(f); r.t += dt;
      p.x = pos.x; p.z = pos.z; avatar.root.setEnabled(false);
      if (r.t > 4 && ((r.dest === 'B' && f > 0.999) || (r.dest === 'A' && f < 0.001))) { const c = W.data.cable[r.dest.toLowerCase()]; placePlayer(c.board.x, c.board.z, 0); G.riding = null; avatar.root.setEnabled(true); U.toast('Welcome to ' + c.name + '.'); }
      return;
    }
    if (!G.win) avatar.root.setEnabled(true);
    let ix = 0, iy = 0;
    if (ctrl) { ix = (keys.d || keys.arrowright || chatMove.right ? 1 : 0) - (keys.a || keys.arrowleft || chatMove.left ? 1 : 0) + pad.x; iy = (keys.w || keys.arrowup || chatMove.up ? 1 : 0) - (keys.s || keys.arrowdown || chatMove.down ? 1 : 0) - pad.y; }
    const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    if (keys.q && ctrl) cam.alpha -= dt * 1.8; if (keys.e && ctrl) cam.alpha += dt * 1.8;
    let walk = 0;
    if (knock > 0) { knock -= dt; avatar.root.rotation.z = Math.min(1.4, (2.2 - knock) * 6); avatar.root.rotation.z = knock > 0.4 ? 1.45 : 1.45 * knock / 0.4; }
    else { avatar.root.rotation.z = 0; }
    if (m > 0.05 && knock <= 0) {
      const fx = -Math.cos(cam.alpha), fz = -Math.sin(cam.alpha), rx = fz, rz = -fx;
      const dx = fx * iy + rx * ix, dz = fz * iy + rz * ix;
      const dotRun = keys['.'] && !nearestAct() && !dialogOpen() && !G.win;
      const run = keys.shift || dotRun || m > 0.95 && pad.x * pad.x + pad.y * pad.y > 0.9, spd = run ? 7 : 4.2 * Math.min(1, m + 0.3);
      p.h += Z.angleDiff(p.h, Math.atan2(dx, dz)) * Math.min(1, dt * 12);
      const c = W.collide(p.x + dx / Math.hypot(dx, dz) * spd * dt, p.z + dz / Math.hypot(dx, dz) * spd * dt, 0.5); p.x = Z.clamp(c[0], -170, 170); p.z = Z.clamp(c[1], -140, 170); walk = 1;
    }
    avatar.pose(dt, walk, walk ? 3 : 1);
    avatar.root.position.set(p.x, avatar.bob || 0, p.z); avatar.root.rotation.y = p.h;
    if (G.group) { const l = G.group.members[0]; if (!l || Z.dist(p.x, p.z, l.x, l.z) > 26) { G.leaveGroup(); } }
  }

  function updateCamera(dt) {
    const p = G.player, ty = G.riding ? W.cablePos(W.cableState().f[G.riding.car]).y : 1.4;
    const t = cam.target; t.x += (p.x - t.x) * Math.min(1, dt * 8); t.z += (p.z - t.z) * Math.min(1, dt * 8); t.y += (ty - t.y) * Math.min(1, dt * 4);
    if (G.riding && cam.radius < 22) cam.radius += dt * 6;
    if (G.win && winCam.base) {
      const w = G.win, f = w.window.face, list = E.animalsOf(w.id), sw = Math.sin(G.t * 0.12) * 4;
      let tx = winCam.base.x + f[1] * sw, ty = winCam.base.y, tz = winCam.base.z + f[0] * sw;
      if (list.length) { const a = list[Math.floor(G.t / 7) % list.length]; tx = a.x; tz = a.z; ty = a.kind === 'budgie' ? a.y - 0.25 : (a.y || 0) + 1 + a.sp.height * 0.4 * a.scale; if (a.kind === 'ptero') ty = a.api.root.position.y; }
      const k = Math.min(1, dt * 1.5); winCam.look = winCam.look || new B.Vector3(tx, ty, tz); winCam.look.x += (tx - winCam.look.x) * k; winCam.look.y += (ty - winCam.look.y) * k; winCam.look.z += (tz - winCam.look.z) * k;
      winCam.setTarget(winCam.look);
    }
  }

  // ---------- main loop ----------
  function frame() {
    let dt = Math.min(0.1, engine.getDeltaTime() / 1000), t = G.t;
    const paused = ['mTitle', 'mPause', 'mInfo', 'mShot'].some((id) => !$(id).classList.contains('hidden')) ||
      (!$('mPhone').classList.contains('hidden') && G.phonePaused);
    const sim = G.started && !paused;
    if (sim) {
      G.t += dt; t = G.t;
      const s = Z.state, open = isOpen();
      if (G.started) {
        const closedBefore = open;
        advance(dt * (open ? (G.gameSpeed === 'relaxed' ? 0.8 : 2.4) : 24));
        fastForward = !isOpen();
        if (!isOpen() && closedBefore) closePark();
        if (isOpen() !== lastOpen) { syncGate(); syncCrowd(); }
        if (Math.floor(s.minutes) !== G.lastMin) { G.lastMin = Math.floor(s.minutes); W.setTime(s.minutes); hud(); }
        syncGate();
        if (G.t - lastSave > 60) { lastSave = G.t; G.save(); }
        updateEscape();
        updatePlayer(dt, !anyBlocking() && !G.win);
      }
      const cs = W.update(dt, true);
      const night = W.daylight(Z.state.minutes) < 0.25;
      E.update(dt, t, { night, announce: (m) => U.toast(m) });
      if (G.started) { const a = nearestAct(), n = !G.group && E.nearestNpc(G.player.x, G.player.z, 4), pr = $('prompt'); let h = ''; if (!G.riding && !G.win && !dialogOpen()) { if (a) h += '<b>[.]</b> ' + Z.esc(a.label()); if (G.group) h += (h ? '<br>' : '') + "<b>[/]</b> Group chat &nbsp; <b>[']</b> Leave group"; else if (n) h += (h ? '<br>' : '') + '<b>[/]</b> Talk to ' + Z.esc(n.name) + (n.role === 'employee' ? ' (staff)' : '') + (n.role !== 'employee' ? " &nbsp; <b>[']</b> Join group" : ''); } if (G.riding) h = 'Riding the cable car...'; pr.innerHTML = h; pr.classList.toggle('hidden', !h); }
    }
    if (G.started) updateCamera(dt);
    U.updateBubbles(scene, engine, scene.activeCamera);
    scene.render();
  }

  // ---------- boot ----------
  function showTitle() {
    G.started = false;
    if (scene.activeCamera !== cam) scene.activeCamera = cam;
    cam.detachControl();
    cam.alpha = -Math.PI / 2; cam.beta = 1.1; cam.radius = 70; cam.target.set(0, 4, 30);
    G.refreshContinue();
    $('titleNote').textContent = Z.Net.php ? 'Backend: ' + Z.Net.storageLabel() + ' \u00b7 AI: ' + Z.Net.aiLabel() : (Z.Net.backendError ? Z.Net.backendError + ' Playing offline; saves stay in this browser.' : 'No PHP backend found: playing offline. Saves stay in this browser.');
    U.show('mTitle');
  }
  G.refreshContinue = function () { $('btnContinue').style.display = Z.Net.hasLocal() || Z.Net.user ? '' : 'none'; };
  function enterGame() {
    U.hide('mTitle'); $('hud').classList.remove('hidden'); G.started = true; cam.upperRadiusLimit = 42; cam.beta = 1.1; cam.radius = 20; cam.alpha = -Math.PI / 2; cam.target.set(G.player.x, 1.4, G.player.z); cam.attachControl($('c'), true); lastSave = G.t;
  }
  G.enterLoadedState = function (state) { if (!G.started) Z.Audio.init(); G.applyState(state); if (!G.started) enterGame(); };
  async function startGame(isNew) {
    Z.Audio.init(); G.name = ($('tName').value || 'Player 1').slice(0, 18); $('badge').textContent = G.name;
    if (isNew) { G.applyState(freshState(G.name)); } else {
      $('btnContinue').disabled = true;
      try {
        const r = await G.loadSaved();
        if (!r.state) { $('titleNote').textContent = r.error || 'Could not load the save.'; return; }
        if (r.warning) U.toast(r.warning);
      } catch (e) {
        console.error('Could not load saved game:', e);
        $('titleNote').textContent = 'Could not load the saved game. Try Settings > Save/Load or start a new game.';
        return;
      } finally { $('btnContinue').disabled = false; }
    }
    enterGame();
    U.toast('Welcome! Buy admission at the gate, then explore. Press P for your phone.');
  }

  async function boot() {
    const [sp, wd, dl] = await Promise.all([Z.fetchJson('data/species.json'), Z.fetchJson('data/world.json'), Z.fetchJson('data/dialogue.json')]);
    data = wd; Z.Species.init(sp); Z.Talk.data = dl; Z.state = { animals: [], custom: [], discovered: [], research: 0, day: 1, minutes: 540, inv: {}, money: 300 };
    await Z.Net.detect();
    const canvas = $('c'); engine = new B.Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false }); G.engine = engine;
    scene = new B.Scene(engine); G.scene = scene; E.scene = scene; scene.skipPointerMovePicking = true;
    cam = new B.ArcRotateCamera('cam', -Math.PI / 2, 1.1, 20, new B.Vector3(0, 1.4, -52), scene);
    cam.lowerRadiusLimit = 8; cam.upperRadiusLimit = 80; cam.lowerBetaLimit = 0.45; cam.upperBetaLimit = 1.45; cam.minZ = 0.3; cam.maxZ = 600; cam.panningSensibility = 0; cam.angularSensibilityX = 700; cam.angularSensibilityY = 900;
    cam.inputs.removeByType('ArcRotateCameraKeyboardMoveInput'); cam.inputs.removeByType('ArcRotateCameraMouseWheelInput'); cam.attachControl(canvas, true);
    winCam = new B.FreeCamera('win', new B.Vector3(0, 2, 0), scene); winCam.minZ = 0.2; winCam.maxZ = 400; scene.activeCamera = cam;
    W = Z.world = Z.World; W.build(scene, wd);
    Z.state = freshState(); Z.Species.syncUid();
    Z.Species.onChange = () => { if (G.started || true) E.rebuildAnimals(); };
    Z.Species.onNews = (m) => U.toast(m);
    avatar = E.person({ shirt: '#8c4bd6', sleeve: '#d8c2ff', pants: '#2b3a6a', hat: 'cap', hatColor: '#ff8a2b', skin: '#e0b088', hair: '#2a1a10', backpack: '#ffc247', seed: 1, scale: 0.95 });
    makePost(); buildActs(); bindInput(); E.rebuildAnimals(); W.setTime(Z.state.minutes); syncGate(); lastOpen = null; syncCrowd(true); hud();
    $('c').addEventListener('pointerdown', () => $('c').focus());
    addEventListener('resize', () => engine.resize());
    showTitle(); $('loading') && $('loading').remove();
    engine.runRenderLoop(frame);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', '<pre style="position:fixed;top:0;left:0;color:#fff;background:#900;padding:8px;z-index:99">Boot error: ' + Z.esc(e.message || e) + '</pre>'); }));
})(window.Z);
