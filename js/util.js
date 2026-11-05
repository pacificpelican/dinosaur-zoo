/* Shared helpers. All game modules hang off the global Z namespace (classic scripts: works from file:// or any static host). */
window.Z = window.Z || {};
(function (Z) {
  Z.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  Z.lerp = (a, b, t) => a + (b - a) * t;
  Z.smooth = (a, b, x) => { const t = Z.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  Z.angleDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  Z.dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

  // Seedable RNG so visual details (feather layout, tree placement) stay stable between runs.
  Z.makeRng = function (seed) {
    let s = seed >>> 0 || 1;
    return function () { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  Z.rr = (a, b) => a + Math.random() * (b - a);
  Z.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  Z.hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  Z.weighted = function (items, wfn) {
    let tot = 0; const ws = items.map((x) => { const w = Math.max(0, wfn(x)); tot += w; return w; });
    let r = Math.random() * tot;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  };
  Z.hex = (h) => BABYLON.Color3.FromHexString(h);
  Z.mixHex = (a, b, t) => BABYLON.Color3.Lerp(Z.hex(a), Z.hex(b), t);

  Z.fmtClock = function (minutes) {
    const m = Math.floor(minutes) % 1440, h = Math.floor(m / 60), mm = m % 60;
    const ap = h >= 12 ? 'PM' : 'AM';
    return ((h % 12) || 12) + ':' + String(mm).padStart(2, '0') + ' ' + ap;
  };
  Z.pad = (n) => String(n).padStart(2, '0');
  Z.stamp = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + Z.pad(d.getMonth() + 1) + '-' + Z.pad(d.getDate()) + ' ' + Z.pad(d.getHours()) + ':' + Z.pad(d.getMinutes()) + ':' + Z.pad(d.getSeconds());
  };
  Z.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  Z.$ = (sel, root) => (root || document).querySelector(sel);
  Z.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  Z.inRect = (x, z, r, m) => { m = m || 0; return x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m; };
  Z.fetchJson = (url) => fetch(url, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
})(window.Z);
