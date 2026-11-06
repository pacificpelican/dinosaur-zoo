/* Persistence + backend detection. Without PHP everything still works: saves go to localStorage and dialogue uses the rule-based engine. */
(function (Z) {
  const KEY = 'dfz.save.v1';
  const N = Z.Net = { php: false, info: null, user: null, aiTier: 'fallback', ollamaModel: null, lastError: '' };

  N.api = async function (action, body) {
    const opt = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const r = await fetch('api/index.php?action=' + encodeURIComponent(action), opt);
    const text = await r.text();
    try { return JSON.parse(text); } catch (e) { throw new Error('No PHP backend'); }
  };

  N.detect = async function () {
    try {
      const s = await N.api('status');
      if (!s || s.ok !== true) throw new Error('bad status');
      N.php = true; N.info = s; N.user = s.loggedIn ? s.user : null; N.aiTier = s.aiTier;
      N.ollamaModel = s.aiTier === 'ollama' && typeof s.ollamaModel === 'string' ? s.ollamaModel : null;
    } catch (e) { N.php = false; N.info = null; N.user = null; N.aiTier = 'fallback'; N.ollamaModel = null; }
    return N.php;
  };

  N.storageLabel = () => (N.php ? N.info.storage : 'Browser (localStorage) - no PHP backend');
  N.aiLabel = () => (N.php ? N.info.ai : 'Fallback Mode');

  N.saveLocal = function (state) { try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; } };
  N.loadLocal = function () { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  N.hasLocal = () => { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } };
  N.clearLocal = () => { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } };

  // Returns {where: 'server'|'browser', ok}
  N.save = async function (state) {
    const local = N.saveLocal(state);
    if (N.php && N.user) {
      try { const r = await N.api('save', { state }); if (r.ok) return { where: 'server', ok: true }; N.lastError = r.error || ''; } catch (e) { N.lastError = String(e.message || e); }
    }
    return { where: 'browser', ok: local };
  };
  N.load = async function (source) {
    if (source === 'browser') return { where: 'browser', state: N.loadLocal() };
    if (source === 'server') {
      if (!N.php || !N.user) return { where: 'server', state: null, error: 'Sign in to load a server save.' };
      try {
        const r = await N.api('load');
        return r.ok && r.state ? { where: 'server', state: r.state } : { where: 'server', state: null, error: r.error || 'No server save found.' };
      } catch (e) {
        N.lastError = String(e.message || e);
        return { where: 'server', state: null, error: 'Could not load the server save.' };
      }
    }
    if (N.php && N.user) {
      try { const r = await N.api('load'); if (r.ok && r.state) return { where: 'server', state: r.state }; } catch (e) { /* fall back */ }
    }
    const s = N.loadLocal(); return { where: 'browser', state: s };
  };
})(window.Z);
