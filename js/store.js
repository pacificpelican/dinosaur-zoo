/* Persistence + backend detection. Without PHP everything still works: saves go to localStorage and dialogue uses the rule-based engine. */
(function (Z) {
  const KEY = 'dfz.save.v1';
  const N = Z.Net = { php: false, info: null, user: null, aiTier: 'fallback', ollamaModel: null, lastError: '', backendError: '' };

  N.api = async function (action, body) {
    const opt = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const r = await fetch('api/index.php?action=' + encodeURIComponent(action), opt);
    const text = await r.text();
    try { return JSON.parse(text); } catch (e) { throw new Error('No PHP backend'); }
  };

  N.detect = async function () {
    N.backendError = '';
    try {
      const s = await N.api('status');
      if (!s || s.ok !== true) {
        if (s && typeof s.error === 'string') N.backendError = s.error;
        throw new Error('bad status');
      }
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

  let saveQueue = Promise.resolve();
  N.save = async function (state) {
    const local = N.saveLocal(state);
    if (N.php && N.user) {
      const user = N.user;
      const request = saveQueue.then(async () => {
        if (!N.php || N.user !== user) return { ok: false, error: 'The signed-in account changed before the server save.' };
        try {
          const r = await N.api('save', { state });
          return r && r.ok === true ? { ok: true } : { ok: false, error: (r && r.error) || 'Server save failed.' };
        } catch (e) { return { ok: false, error: 'Could not reach the server to save.' }; }
      });
      saveQueue = request.then(() => {});
      const server = await request;
      if (!server.ok) {
        N.lastError = server.error;
        return { where: 'browser', ok: local, warning: server.error + (local ? ' Progress was saved in this browser only.' : ' Browser save also failed.') };
      }
      return { where: 'server', ok: true, warning: local ? '' : 'Server save succeeded, but the browser backup failed.' };
    }
    return { where: 'browser', ok: local, warning: local ? '' : 'Could not save in this browser.' };
  };
  N.load = async function (source) {
    if (source === 'browser') {
      const state = N.loadLocal();
      return { where: 'browser', state, error: state ? '' : (N.hasLocal() ? 'The browser save could not be read.' : 'No browser save found.') };
    }
    if (source === 'server') {
      const user = N.user;
      await saveQueue;
      if (!N.php || !user) return { where: 'server', state: null, error: 'Sign in to load a server save.' };
      if (N.user !== user) return { where: 'server', state: null, error: 'The signed-in account changed before the server load.' };
      try {
        const r = await N.api('load');
        if (N.user !== user) return { where: 'server', state: null, error: 'The signed-in account changed during the server load.' };
        if (!r || r.ok !== true) { N.lastError = (r && r.error) || 'Could not load the server save.'; return { where: 'server', state: null, error: N.lastError }; }
        return r.state ? { where: 'server', state: r.state } : { where: 'server', state: null, error: 'No server save found.' };
      } catch (e) {
        N.lastError = String(e.message || e);
        return { where: 'server', state: null, error: 'Could not load the server save.' };
      }
    }
    if (N.php && N.user) {
      const r = await N.load('server');
      if (r.state) return r;
      const local = await N.load('browser');
      return { where: 'browser', state: local.state, error: local.state ? '' : r.error + ' ' + local.error, warning: local.state ? r.error + ' Loaded the browser save instead.' : '' };
    }
    const local = await N.load('browser');
    if (!local.state) local.error += ' Sign in in Settings to access a server save.';
    return local;
  };
})(window.Z);
