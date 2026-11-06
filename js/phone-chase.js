/* A self-contained, monochrome phone game. */
(function (Z) {
  const C = Z.PhoneChase = {};
  let cleanup = null;
  C.dispose = function () { if (cleanup) { cleanup(); cleanup = null; } };

  C.mount = function () {
    C.dispose();
    const canvas = document.getElementById('chaseCanvas'), ctx = canvas.getContext('2d');
    const status = document.getElementById('chaseStatus'), start = document.getElementById('chaseStart'), run = document.getElementById('chaseRun');
    const listeners = new AbortController(), signal = listeners.signal;
    let frame = 0, last = 0, distance = 0, gap = 22, stamina = 100, phase = 'ready', heldKey = null, pointerHeld = false, statusSecond = -1;
    const target = 300;
    const running = () => heldKey !== null || pointerHeld;
    const release = () => { heldKey = null; pointerHeld = false; run.classList.remove('running'); };
    const dinosaur = [
      '....................########',
      '...................#########',
      '...................##.######',
      '...................#########',
      '#..................#########',
      '##.................######...',
      '###...............########..',
      '.####...........#########...',
      '..######################....',
      '...###################......',
      '....#################.......',
      '.....###############........',
      '......##############........',
      '.......###.....####.........',
      '.......###......###.........',
      '.......###......###.........',
      '......####......####........'
    ];
    const person = [
      '...####...',
      '..######..',
      '..######..',
      '...####...',
      '....##....',
      '..######..',
      '.########.',
      '##.####.##',
      '...####...',
      '...####...',
      '...####...',
      '...##.##..',
      '..##...##.',
      '..##...##.',
      '.##.....##',
      '.###....##'
    ];
    function sprite(rows, x, y, scale) {
      rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(x + i * scale, y + j * scale, scale, scale); });
    }
    function draw() {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 400, 160); ctx.fillStyle = '#000';
      ctx.font = 'bold 10px monospace'; ctx.fillText('DINO DASH', 8, 14);
      ctx.fillText(Math.floor(distance) + ' / ' + target + ' M', 235, 14);
      ctx.fillText('STAMINA', 8, 29); ctx.strokeRect(56.5, 21.5, 101, 9); ctx.fillRect(58, 23, Math.floor(stamina * 0.98), 6);
      ctx.fillRect(0, 128, 400, 2);
      const offset = Math.floor(distance * 2) % 46;
      for (let x = -offset; x < 400; x += 46) {
        ctx.fillRect(x, 138, 12, 1); ctx.fillRect(x + 21, 148, 4, 1);
        ctx.fillRect(x + 31, 123, 1, 5); ctx.fillRect(x + 28, 125, 6, 1);
      }
      const bob = phase === 'playing' && Math.floor(distance * 0.7) % 2 ? 2 : 0;
      sprite(dinosaur, Math.round(Math.max(4, 250 - gap * 4)) - 45, 93 + bob, 2);
      sprite(person, 272, 96 - bob, 2);
      ctx.fillText('ESCAPE ' + Math.max(0, Math.ceil(target - distance)) + ' M', 235, 153);
    }
    function describe(text) { status.textContent = text; }
    function pause() {
      if (phase !== 'playing') return;
      phase = 'paused'; cancelAnimationFrame(frame); frame = 0; last = 0; release();
      start.textContent = 'Resume'; describe('Paused at ' + Math.floor(distance) + ' m. Press Resume to continue.'); draw();
    }
    function tick(now) {
      if (phase !== 'playing') return;
      if (!last) last = now;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const sprinting = running() && stamina > 0;
      const speed = sprinting ? 13 : 4;
      stamina = Math.max(0, Math.min(100, stamina + (running() ? -8 : 18) * dt));
      distance += speed * dt; gap = Math.min(32, gap + (speed - 8) * dt);
      if (gap <= 0 || distance >= target) {
        phase = gap <= 0 ? 'caught' : 'won'; release(); frame = 0;
        start.textContent = 'Play again';
        describe(phase === 'won' ? 'You escaped! You reached 300 m.' : 'Caught! You ran ' + Math.floor(distance) + ' m. Try again.');
      } else {
        const second = Math.floor(distance / 10);
        if (second !== statusSecond) { statusSecond = second; describe(Math.floor(distance) + ' m of 300 m. Stamina ' + Math.round(stamina) + '%.'); }
        frame = requestAnimationFrame(tick);
      }
      draw();
    }
    start.addEventListener('click', () => {
      if (phase === 'playing') { pause(); return; }
      if (phase !== 'paused') { distance = 0; gap = 22; stamina = 100; statusSecond = -1; }
      release(); phase = 'playing'; last = 0; start.textContent = 'Pause';
      describe('Run started. Hold right arrow or the run button to sprint.'); draw(); frame = requestAnimationFrame(tick);
    }, { signal });
    function runKey(e) {
      return e.key === 'ArrowRight' || (document.activeElement === run && (e.key === ' ' || e.key === 'Enter'));
    }
    window.addEventListener('keydown', (e) => {
      if (phase !== 'playing' || !runKey(e)) return;
      e.preventDefault(); e.stopImmediatePropagation(); heldKey = e.key; run.classList.add('running');
    }, { signal, capture: true });
    window.addEventListener('keyup', (e) => {
      if (e.key !== heldKey) return;
      e.preventDefault(); e.stopImmediatePropagation(); heldKey = null; run.classList.toggle('running', pointerHeld);
    }, { signal, capture: true });
    run.addEventListener('pointerdown', (e) => {
      if (phase !== 'playing' || e.button !== 0) return;
      e.preventDefault(); run.setPointerCapture(e.pointerId); pointerHeld = true; run.classList.add('running');
    }, { signal });
    const pointerRelease = () => { pointerHeld = false; run.classList.toggle('running', heldKey !== null); };
    run.addEventListener('pointerup', pointerRelease, { signal });
    run.addEventListener('pointercancel', pointerRelease, { signal });
    run.addEventListener('lostpointercapture', pointerRelease, { signal });
    window.addEventListener('blur', pause, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); }, { signal });
    cleanup = () => { cancelAnimationFrame(frame); release(); listeners.abort(); };
    draw();
  };
})(window.Z);
