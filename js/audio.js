/* Generative soundtrack (WebAudio, no samples): a "world" channel (kalimba/marimba polyrhythms) and a house channel (~122 BPM). */
(function (Z) {
  const A = Z.Audio = { ctx: null, channel: 'auto', muted: false, volume: 0.6, current: 'world', _timer: null };
  let master, comp, noiseBuf, step = 0, nextTime = 0, lastSwitch = 0, melodyIdx = 3, chordIdx = 0;

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = A.ctx = new AC();
    master = c.createGain(); comp = c.createDynamicsCompressor();
    master.connect(comp); comp.connect(c.destination);
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    A.apply(); nextTime = c.currentTime + 0.1;
    A._timer = setInterval(tick, 30);
  };
  A.apply = function () { if (master) master.gain.value = A.muted || A.channel === 'off' ? 0 : A.volume * 0.5; };
  A.setMuted = function (m) { A.muted = m; A.apply(); };
  A.setChannel = function (ch) { A.channel = ch; if (ch === 'world' || ch === 'house') A.current = ch; step = 0; A.apply(); };
  A.setVolume = function (v) { A.volume = v; A.apply(); };

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function tone(type, f, t, a, d, peak, dest, detune) {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f; if (detune) o.detune.value = detune;
    env(g, t, a, d, peak); o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + a + d + 0.05);
  }
  function noise(t, d, peak, hp, dest) {
    const c = A.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp; env(g, t, 0.003, d, peak);
    s.connect(f); f.connect(g); g.connect(dest || master); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05);
  }
  function kick(t) {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(g, t, 0.002, 0.28, 0.9); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.35);
  }
  function lowpassed(type, f, t, dur, peak, cutoff) {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = type; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.setValueAtTime(cutoff, t); lp.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.3), t + dur);
    env(g, t, 0.01, dur, peak); o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  const WORLD_SCALE = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19]; // D dorian-ish
  const WORLD_ROOT = 50, HOUSE_ROOT = 38;
  const EUCLID = [1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0];
  const CHORDS = [[0, 3, 7, 10, 14], [5, 8, 12, 15], [3, 7, 10, 14], [7, 10, 14, 17]];

  function worldStep(s, t, bpm) {
    const spb = 60 / bpm / 4;
    if (EUCLID[s % 16]) tone('sine', 110, t, 0.005, 0.3, 0.5); // log drum
    if (s % 16 === 0) tone('sine', mtof(WORLD_ROOT - 12 + [0, 5, 3, 7][chordIdx]), t, 0.03, spb * 14, 0.22);
    if (s % 2 === 1) noise(t, 0.05, 0.12, 6000);
    if (Math.random() < 0.55) {
      melodyIdx = Z.clamp(melodyIdx + Z.pick([-2, -1, -1, 0, 1, 1, 2]), 0, WORLD_SCALE.length - 1);
      const f = mtof(WORLD_ROOT + 12 + WORLD_SCALE[melodyIdx]);
      tone('triangle', f, t, 0.004, 0.55, 0.22); tone('sine', f * 2.01, t, 0.002, 0.18, 0.06);
    }
    if (s % 16 === 8) tone('sine', mtof(WORLD_ROOT + [0, 5, 3, 7][chordIdx] + 7), t, 0.4, 2.2, 0.06); // pad swell
    if (s % 64 === 63) chordIdx = (chordIdx + 1) % 4;
  }
  function houseStep(s, t, bpm) {
    const spb = 60 / bpm / 4, b = s % 16, ch = CHORDS[Math.floor(s / 32) % 4];
    if (b % 4 === 0) kick(t);
    if (b === 4 || b === 12) { noise(t, 0.14, 0.35, 1500); }
    if (b % 4 === 2) noise(t, 0.09, 0.2, 7000);
    if (b % 2 === 1 && b % 4 !== 3) noise(t, 0.03, 0.1, 9000);
    if (b % 4 === 2) lowpassed('sawtooth', mtof(HOUSE_ROOT + ch[0]), t, spb * 1.6, 0.35, 700 + 500 * Math.sin(s / 24));
    if (b === 3 || b === 6 || b === 11 || b === 14) ch.forEach((n) => lowpassed('square', mtof(HOUSE_ROOT + 24 + n), t, spb * 1.2, 0.05, 2400));
    if (b === 0 && s % 32 === 0) ch.forEach((n) => tone('sine', mtof(HOUSE_ROOT + 36 + n), t, 0.2, spb * 20, 0.025));
  }

  function tick() {
    const c = A.ctx; if (!c || A.channel === 'off') return;
    const now = performance.now();
    if (A.channel === 'auto' && now - lastSwitch > 75000) { lastSwitch = now; A.current = A.current === 'world' ? 'house' : 'world'; step = 0; }
    if (A.muted) { nextTime = Math.max(nextTime, c.currentTime); return; }
    const bpm = A.current === 'house' ? 122 : 98, spb = 60 / bpm / 4;
    while (nextTime < c.currentTime + 0.15) {
      (A.current === 'house' ? houseStep : worldStep)(step, nextTime, bpm);
      nextTime += spb; step++;
    }
  };

  A.sfx = function (kind) {
    const c = A.ctx; if (!c || A.muted) return; const t = c.currentTime;
    if (kind === 'coin') { tone('square', 988, t, 0.002, 0.08, 0.15); tone('square', 1319, t + 0.07, 0.002, 0.2, 0.15); }
    else if (kind === 'click') tone('triangle', 660, t, 0.002, 0.06, 0.2);
    else if (kind === 'shutter') { noise(t, 0.05, 0.4, 2000); noise(t + 0.08, 0.07, 0.3, 1000); }
    else if (kind === 'roar') { lowpassed('sawtooth', 70, t, 1.1, 0.5, 600); lowpassed('sawtooth', 83, t, 1.1, 0.4, 600); }
    else if (kind === 'chirp') { tone('sine', 2400, t, 0.005, 0.07, 0.05); tone('sine', 3100, t + 0.08, 0.005, 0.06, 0.04); }
    else if (kind === 'alarm') { for (let i = 0; i < 4; i++) tone('square', i % 2 ? 660 : 880, t + i * 0.18, 0.005, 0.14, 0.12); }
  };
})(window.Z);
