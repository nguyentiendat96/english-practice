(function () {
  'use strict';

  const URL = window.CONFIG?.supabaseUrl || '';
  const ANON_KEY = window.CONFIG?.supabaseAnonKey || '';
  const READY = URL && ANON_KEY;
  if (!READY) return;

  const AUTH_URL = URL + '/auth/v1';
  const API_URL = URL + '/rest/v1';

  let _user = null;
  let _accessToken = null;
  let _refreshToken = null;
  let _listeners = [];

  // --- Token management ---
  function loadTokens() {
    try {
      const raw = localStorage.getItem('dbd_supabase_tokens');
      if (raw) { const t = JSON.parse(raw); _accessToken = t.at; _refreshToken = t.rt; }
    } catch {}
  }
  function saveTokens(at, rt) {
    _accessToken = at; _refreshToken = rt;
    try { localStorage.setItem('dbd_supabase_tokens', JSON.stringify({ at, rt })); } catch {}
  }
  function clearTokens() {
    _accessToken = null; _refreshToken = null;
    try { localStorage.removeItem('dbd_supabase_tokens'); } catch {}
  }

  function headers(extra = {}) {
    const h = { 'apikey': ANON_KEY, 'Content-Type': 'application/json', ...extra };
    if (_accessToken) h['Authorization'] = 'Bearer ' + _accessToken;
    return h;
  }

  // --- Auth ---
  function parseUser(data) {
    return data?.user || data || null;
  }

  async function signIn(email, password) {
    const res = await fetch(AUTH_URL + '/token?grant_type=password', {
      method: 'POST', headers: headers(), body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.msg || data.error_description || data.error || 'Đăng nhập thất bại');
    const user = data.user;
    saveTokens(data.access_token, data.refresh_token);
    _user = user;
    notify(user);
    return user;
  }

  async function signUp(email, password) {
    const res = await fetch(AUTH_URL + '/signup', {
      method: 'POST', headers: headers(), body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.msg || data.error_description || data.error || 'Đăng ký thất bại');
    if (data.access_token) saveTokens(data.access_token, data.refresh_token);
    if (data.user) { _user = data.user; notify(data.user); }
    return data;
  }

  async function signOut() {
    try { await fetch(AUTH_URL + '/logout', { method: 'POST', headers: headers() }); } catch {}
    clearTokens(); _user = null; notify(null);
  }

  async function refreshSession() {
    if (!_refreshToken) return null;
    try {
      const res = await fetch(AUTH_URL + '/token?grant_type=refresh_token', {
        method: 'POST', headers: headers(), body: JSON.stringify({ refresh_token: _refreshToken })
      });
      const data = await res.json();
      if (!res.ok || !data.access_token) { clearTokens(); _user = null; notify(null); return null; }
      saveTokens(data.access_token, data.refresh_token);
      _user = data.user;
      notify(data.user);
      return data.user;
    } catch { clearTokens(); _user = null; notify(null); return null; }
  }

  function notify(u) { _listeners.forEach(cb => { try { cb(u); } catch {} }); }

  // --- Data API ---
  async function getLessons() {
    if (!_user) return [];
    const res = await fetch(
      API_URL + '/lessons?select=id,type,command,title,level,topic,created_at&user_id=eq.' + _user.id + '&order=created_at.desc&limit=100',
      { headers: headers() }
    );
    if (!res.ok) return [];
    return res.json();
  }

  async function getLessonData(id) {
    if (!_user) return null;
    const res = await fetch(
      API_URL + '/lessons?select=data&id=eq.' + id + '&user_id=eq.' + _user.id,
      { headers: headers() }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0]?.data || null;
  }

  async function insertLesson(data) {
    if (!_user) return;
    await fetch(API_URL + '/lessons', {
      method: 'POST', headers: { ...headers(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ user_id: _user.id, ...data })
    });
  }

  async function deleteLesson(id) {
    if (!_user) return;
    await fetch(API_URL + '/lessons?id=eq.' + id + '&user_id=eq.' + _user.id, {
      method: 'DELETE', headers: headers()
    });
  }

  async function upsertSettings(data) {
    if (!_user) return;
    await fetch(API_URL + '/user_settings', {
      method: 'POST', headers: { ...headers(), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: _user.id, ...data })
    });
  }

  async function getSettings() {
    if (!_user) return null;
    const res = await fetch(
      API_URL + '/user_settings?select=*&user_id=eq.' + _user.id,
      { headers: headers() }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0] || null;
  }

  // --- Sync logic ---
  async function push() {
    if (!_user) return 0;
    let count = 0;
    try {
      const raw = localStorage.getItem('dbdHistoryMeta');
      if (!raw) return 0;
      const history = JSON.parse(raw);
      for (const item of history) {
        if (item.cloud) continue;
        const dataRaw = localStorage.getItem(item.dataKey);
        if (!dataRaw) continue;
        await insertLesson({
          type: item.type || 'dialogue', command: item.command || '',
          title: item.title || 'Untitled', level: item.level || '',
          topic: item.topic || '', data: JSON.parse(dataRaw),
        });
        item.cloud = true;
        count++;
      }
      if (count) localStorage.setItem('dbdHistoryMeta', JSON.stringify(history));
    } catch (e) { console.warn('[Sync] push:', e.message); }
    return count;
  }

  async function pull() {
    if (!_user) return 0;
    try {
      const cloud = await getLessons();
      if (!cloud?.length) return 0;
      const raw = localStorage.getItem('dbdHistoryMeta');
      let local = raw ? JSON.parse(raw) : [];
      const localKeys = new Set(local.filter(h => h.cloudId).map(h => h.cloudId));

      let added = 0;
      for (const c of cloud) {
        if (localKeys.has(c.id)) continue;
        const data = await getLessonData(c.id);
        if (!data) continue;
        const dataKey = 'dbdData_' + c.id;
        localStorage.setItem(dataKey, JSON.stringify(data));
        local.unshift({
          command: c.command || '', title: c.title || 'Untitled',
          level: c.level || '', topic: c.topic || '',
          timestamp: new Date(c.created_at).getTime(),
          dataKey: dataKey, type: c.type || 'dialogue',
          cloud: true, cloudId: c.id,
        });
        added++;
      }
      if (added) {
        local.sort((a, b) => b.timestamp - a.timestamp);
        if (local.length > 200) local.length = 200;
        localStorage.setItem('dbdHistoryMeta', JSON.stringify(local));
      }
      return added;
    } catch (e) { console.warn('[Sync] pull:', e.message); return 0; }
  }

  async function syncSettingsDown() {
    if (!_user) return;
    try {
      const s = await getSettings();
      if (!s) return;
      if (s.theme) localStorage.setItem('app_theme', s.theme);
      if (s.tts_engine) localStorage.setItem('ttsEngine', s.tts_engine);
      if (s.voice) localStorage.setItem('selectedVoice', s.voice);
      if (s.speech_rate != null) localStorage.setItem('speechRate', String(s.speech_rate));
      if (s.target_language) localStorage.setItem('targetLanguage', s.target_language);
      if (s.elevenlabs_voice) localStorage.setItem('elevenlabs_voice', s.elevenlabs_voice);
      // Apply theme
      const theme = localStorage.getItem('app_theme');
      if (theme) document.documentElement.setAttribute('data-theme', theme);
    } catch {}
  }

  async function syncSettingsUp() {
    if (!_user) return;
    await upsertSettings({
      theme: localStorage.getItem('app_theme'),
      tts_engine: localStorage.getItem('ttsEngine'),
      voice: localStorage.getItem('selectedVoice'),
      speech_rate: parseFloat(localStorage.getItem('speechRate') || '0.85'),
      target_language: localStorage.getItem('targetLanguage'),
      elevenlabs_voice: localStorage.getItem('elevenlabs_voice'),
      updated_at: new Date().toISOString(),
    });
  }

  // --- Init ---
  async function init() {
    loadTokens();
    if (_refreshToken) {
      await refreshSession();
    }
    if (_user) {
      await syncSettingsDown();
      await pull();
      push();
    }
    return _user;
  }

  // --- Exports ---
  window.sync = {
    auth: {
      getUser: () => _user,
      ready: () => READY,
      signIn, signUp, signOut,
      onAuth(cb) {
        _listeners.push(cb);
        if (_user) setTimeout(() => cb(_user), 0);
        return () => { _listeners = _listeners.filter(c => c !== cb); };
      },
    },
    push, pull,
    pushSettings: syncSettingsUp,
    pullSettings: syncSettingsDown,
    async delete(id) {
      if (!_user || !id) return;
      await deleteLesson(id);
    },
    init,
  };
})();
