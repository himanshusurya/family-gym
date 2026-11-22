/* Family Gym: offline-first workout logger.
 * Plans come from plans/*.json (edit them on GitHub, no app update needed).
 * Set logs live on the phone first and sync to Supabase (set_log table) when online. */
const APP_VERSION = '0.3.0';
const CFG = window.FG_CONFIG || {};
const CLOUD = !!(CFG.supabaseUrl && CFG.anonKey);

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('fg.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { localStorage.setItem('fg.' + k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem('fg.' + k); },
};
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const JS_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAME = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const pad = (n) => String(n).padStart(2, '0');
const dayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => JS_DAY[new Date().getDay()];
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const fmtDay = (s) => new Date(s + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtKg = (kg) => (kg == null || kg === '' ? '' : `${+kg} kg`);

/* ---------------- icons (inline line icons, no emoji chrome) ---------------- */
const ICONS = {
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/>',
  trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 6h3v1a3 3 0 0 1-3 3M7 6H4v1a3 3 0 0 0 3 3"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2.5h6v3H9zM9 11h6M9 15h4"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 13.3 7.6 4.4M15.8 6.3 8.2 10.7"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  flame: '<path d="M12 22c3.9 0 7-2.9 7-6.8 0-3.6-2.4-5.6-3.6-8.7-.9 1.8-2 2.9-3.4 3.5.2-2.6-.8-5.3-3-7.5.1 3.9-4 6.6-4 11.4C5 18.9 8.1 22 12 22z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.5 4.3 4.3 0 0 0 7 18z"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  warn: '<path d="M12 3 2 20h20zM12 10v4M12 17h.01"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  note: '<path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h3"/>',
  steps: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/>',
};
const I = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ---------------- Android shell, sharing ---------------- */
const SITE_URL = 'https://himanshusurya.github.io/family-gym/';
const APK_URL = 'https://github.com/himanshusurya/family-gym/releases/latest/download/family-gym.apk';
const LATEST_APK = '1.1.0';
const SHELL = (navigator.userAgent.match(/FamilyGymAndroid\/([\d.]+)/) || [])[1] || null;
const verLt = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false; };
const shellOld = !!SHELL && verLt(SHELL, LATEST_APK);

async function share(text, title = 'Family Gym') {
  if (window.FamilyGymAndroid?.share) { window.FamilyGymAndroid.share(title, text); return; }
  if (navigator.share) { try { await navigator.share({ title, text }); } catch { /* cancelled */ } return; }
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it in WhatsApp'); } catch { prompt('Copy this message:', text); }
}
const inviteText = () => `Join our Family Gym 💪\n\nAndroid app: ${APK_URL}\nOr open in the browser: ${SITE_URL}\n\nFamily code: ask Himanshu.`;
const updateBanner = () => (shellOld ? `<a class="banner" href="${APK_URL}">${I('download')}<div><b>App update ${LATEST_APK} available</b><small>Adds profile photos and sharing. Tap to download, then install.</small></div>${I('chev')}</a>` : '');

/* ---------------- profile photos (synced via the small "avatar" table) ---------------- */
const Avatars = {
  map: LS.get('avatars', {}),
  get(pid) { return this.map[pid]?.img || ''; },
  set(pid, img) { this.map[pid] = { img, updated_at: new Date().toISOString(), synced: false }; this.save(); Sync.soon(); },
  save() { LS.set('avatars', this.map); },
};
async function squareJpeg(file, size) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas'); c.width = c.height = size;
    c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}
function pickPhoto(pid) {
  if (shellOld) { toast('Update the app first (banner on the home screen) to add photos'); return; }
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.hidden = true;
  document.body.appendChild(inp);
  inp.onchange = async () => {
    const f = inp.files[0]; inp.remove();
    if (!f) return;
    try { Avatars.set(pid, await squareJpeg(f, 256)); toast('Photo updated'); route(); }
    catch { toast('Could not read that photo'); }
  };
  inp.click();
}

/* ---------------- data: plans + catalog ---------------- */
const S = { index: null, plans: {}, ex: new Map(), loadedAt: 0 };

async function getJSON(path) {
  const key = 'cache.' + path;
  try {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    const j = await r.json();
    LS.set(key, j);
    return j;
  } catch (e) {
    const c = LS.get(key, null);
    if (c) return c;
    throw e;
  }
}

async function loadData() {
  const [index, catalog] = await Promise.all([getJSON('plans/index.json'), getJSON('exercises/catalog.json')]);
  S.index = index;
  S.ex = new Map(catalog.exercises.map((e) => [e.id, e]));
  const plans = await Promise.all(index.profiles.map((p) => getJSON('plans/' + p.plan).catch(() => null)));
  index.profiles.forEach((p, i) => { if (plans[i]) S.plans[p.id] = plans[i]; });
  S.loadedAt = Date.now();
}
const profile = (id) => S.index?.profiles.find((p) => p.id === id);
const exInfo = (id) => S.ex.get(id) || { id, name: id, muscles: '', img: [], steps: [], mistakes: [] };

/* ---------------- logs (local first) ---------------- */
let LOGS = LS.get('logs', []);
const saveLogs = () => LS.set('logs', LOGS);
const live = (l) => !l.deleted;

function putLog(entry) {
  entry.updated_at = new Date().toISOString();
  entry.synced = false;
  const i = LOGS.findIndex((l) => l.cid === entry.cid);
  if (i >= 0) LOGS[i] = entry; else LOGS.push(entry);
  saveLogs();
  Sync.soon();
}
const setsToday = (pid, skey, ex) => LOGS.filter((l) => live(l) && l.profile === pid && l.day === dayStr() && l.session === skey && l.ex === ex)
  .sort((a, b) => a.set_no - b.set_no);

function lastTime(pid, ex) {
  const today = dayStr();
  const prev = LOGS.filter((l) => live(l) && l.profile === pid && l.ex === ex && l.day < today);
  if (!prev.length) return null;
  const day = prev.reduce((m, l) => (l.day > m ? l.day : m), '');
  return { day, sets: prev.filter((l) => l.day === day).sort((a, b) => a.set_no - b.set_no) };
}
const topOf = (reps) => +String(reps).split('-').pop();

function suggestion(item, last) {
  if (!last || item.load === 'bw') return '';
  const s = last.sets;
  const kgs = new Set(s.map((x) => +x.kg || 0));
  if (s.length >= item.sets && kgs.size === 1 && s.every((x) => +x.reps >= topOf(item.reps)) && [...kgs][0] > 0)
    return `💪 Last time every set hit ${topOf(item.reps)}. Try a little more weight today.`;
  return '';
}

/* ---------------- cloud sync (Supabase REST) ---------------- */
const Sync = {
  busy: false, err: '', timer: 0,
  soon() { clearTimeout(this.timer); this.timer = setTimeout(() => this.run(), 1500); },
  authed() { return !!LS.get('auth', null); },
  pending() { return LOGS.filter((l) => !l.synced).length; },
  saveAuth(j) { LS.set('auth', { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + j.expires_in * 1000 }); },
  async authCall(grant, body) {
    const r = await fetch(`${CFG.supabaseUrl}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST', headers: { apikey: CFG.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error_description || j.msg || j.message || `HTTP ${r.status}`); e.status = r.status; throw e; }
    this.saveAuth(j);
  },
  login(code) { return this.authCall('password', { email: CFG.familyEmail, password: code.trim() }); },
  logout() { LS.del('auth'); },
  async token() {
    const a = LS.get('auth', null);
    if (!a) return null;
    if (Date.now() < a.expires_at - 60000) return a.access_token;
    try { await this.authCall('refresh_token', { refresh_token: a.refresh_token }); }
    catch (e) { if (e.status === 400 || e.status === 401) this.logout(); throw e; }
    return LS.get('auth').access_token;
  },
  async api(path, opts = {}) {
    const t = await this.token();
    if (!t) throw new Error('Not signed in');
    const r = await fetch(`${CFG.supabaseUrl}/rest/v1/${path}`, {
      ...opts, headers: { apikey: CFG.anonKey, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    if (!r.ok) throw new Error(`Sync HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
    return r;
  },
  async run() {
    if (!CLOUD || !navigator.onLine || this.busy || !this.authed()) { paintSync(); return; }
    this.busy = true; paintSync();
    try {
      // push
      const out = LOGS.filter((l) => !l.synced);
      for (let i = 0; i < out.length; i += 200) {
        const batch = out.slice(i, i + 200);
        const body = batch.map(({ synced, srv_at, ...r }) => r);
        await this.api('set_log?on_conflict=cid', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
        const sent = new Map(batch.map((b) => [b.cid, b.updated_at]));
        LOGS.forEach((l) => { if (sent.get(l.cid) === l.updated_at) l.synced = true; });
        saveLogs();
      }
      // pull (other phones)
      let since = LS.get('pullSince', '1970-01-01T00:00:00Z'); let pulled = 0;
      for (;;) {
        const r = await this.api(`set_log?select=cid,profile,day,session,ex,set_no,kg,reps,deleted,updated_at,srv_at&srv_at=gt.${encodeURIComponent(since)}&order=srv_at.asc&limit=1000`);
        const rows = await r.json(); pulled += rows.length;
        const byCid = new Map(LOGS.map((l, i) => [l.cid, i]));
        for (const row of rows) {
          const i = byCid.get(row.cid);
          const rec = { ...row, synced: true }; delete rec.srv_at;
          if (i === undefined) { LOGS.push(rec); byCid.set(row.cid, LOGS.length - 1); }
          else if (LOGS[i].synced && LOGS[i].updated_at <= row.updated_at) LOGS[i] = rec;
          since = row.srv_at;
        }
        saveLogs(); LS.set('pullSince', since);
        if (rows.length < 1000) break;
      }
      if (await this.syncAvatars()) pulled++;
      LS.set('lastSync', Date.now());
      this.err = '';
      if (pulled && /\/history|\/s\/|board|^#?\/?$|\/p\/[^/]+$/.test(location.hash)) route();
    } catch (e) { this.err = e.message; }
    finally { this.busy = false; paintSync(); }
  },
  // Photos ride along with set sync; a failure here never blocks set logging.
  async syncAvatars() {
    let changed = false;
    try {
      const out = Object.entries(Avatars.map).filter(([, a]) => !a.synced);
      if (out.length) {
        await this.api('avatar?on_conflict=profile', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(out.map(([profile, a]) => ({ profile, img: a.img, updated_at: a.updated_at }))) });
        out.forEach(([pid, a]) => { if (Avatars.map[pid] === a) a.synced = true; });
        Avatars.save();
      }
      const since = LS.get('avSince', '1970-01-01T00:00:00Z');
      const rows = await (await this.api(`avatar?select=profile,img,updated_at,srv_at&srv_at=gt.${encodeURIComponent(since)}&order=srv_at.asc`)).json();
      for (const r of rows) {
        const mine = Avatars.map[r.profile];
        if (!mine || mine.synced || mine.updated_at <= r.updated_at) { Avatars.map[r.profile] = { img: r.img, updated_at: r.updated_at, synced: true }; changed = true; }
        LS.set('avSince', r.srv_at);
      }
      Avatars.save();
    } catch (e) { console.warn('avatar sync', e.message); }
    return changed;
  },
};

function paintSync() {
  const el = $('#sync');
  if (!el) return;
  let t, c;
  if (!CLOUD) { t = 'Demo mode'; c = 'warn'; }
  else if (!Sync.authed()) { t = 'Sign in to sync'; c = 'warn'; }
  else if (Sync.busy) { t = 'Syncing…'; c = ''; }
  else if (!navigator.onLine) { t = `Offline · ${Sync.pending()}`; c = 'warn'; }
  else if (Sync.err) { t = 'Sync problem'; c = 'bad'; }
  else if (Sync.pending()) { t = `${Sync.pending()} to sync`; c = 'warn'; }
  else { t = 'Synced'; c = 'ok'; }
  el.innerHTML = `<i class="dot"></i>${t}`; el.className = 'sync ' + c; el.title = t;
}

/* ---------------- rest timer ---------------- */
const Timer = {
  end: 0, iv: 0,
  start(sec) {
    if (!sec) return;
    this.end = Date.now() + sec * 1000;
    clearInterval(this.iv);
    $('#timer').hidden = false;
    this.tick();
    this.iv = setInterval(() => this.tick(), 250);
  },
  tick() {
    const left = Math.max(0, Math.ceil((this.end - Date.now()) / 1000));
    $('#timer-t').textContent = `${Math.floor(left / 60)}:${pad(left % 60)}`;
    if (left === 0) {
      clearInterval(this.iv);
      $('#timer-t').textContent = 'Go!';
      navigator.vibrate?.([300, 150, 300]);
      beep();
      setTimeout(() => this.stop(), 4000);
    }
  },
  add(s) { this.end += s * 1000; this.tick(); },
  stop() { clearInterval(this.iv); $('#timer').hidden = true; },
};
function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    const o = a.createOscillator(); const g = a.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(a.destination);
    g.gain.setValueAtTime(0.25, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.6);
    o.start(); o.stop(a.currentTime + 0.6);
  } catch { /* no audio */ }
}

/* ---------------- views ---------------- */
const app = () => $('#app');
const setTitle = (t, back) => {
  $('#title').textContent = t;
  $('#back').hidden = !back;
  $('#back').onclick = () => (back === true ? history.back() : (location.hash = back));
};
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2500);
}
function nav(pid, active) {
  const tabs = [['today', 'Today', 'dumbbell'], ['history', 'Progress', 'chart'], ['board', 'Board', 'trophy'], ['plan', 'Plan', 'clipboard'], ['settings', 'Settings', 'sliders']];
  $('#nav').innerHTML = pid ? tabs.map(([k, l, i]) =>
    `<a href="#/p/${pid}${k === 'today' ? '' : '/' + k}" class="${k === active ? 'on' : ''}"><span>${I(i)}</span>${l}</a>`).join('') : '';
  $('#nav').hidden = !pid;
}
const avatar = (p, size = '') => {
  const img = Avatars.get(p.id);
  return `<span class="av ${size}" style="--c:${esc(p.color)}">${img ? `<img src="${img}" alt="">` : esc(p.name[0])}</span>`;
};
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

function viewHome() {
  setTitle('Family Gym'); nav(null);
  const ps = S.index.profiles;
  app().innerHTML = `${updateBanner()}
    <section class="hello"><small>${greeting()} · ${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</small>
      <h2>Who's training today?</h2></section>
    <div class="profiles">${ps.map((p) => {
      const plan = S.plans[p.id]; const sk = plan?.weekly?.[todayKey()];
      const sess = sk ? plan.sessions[sk] : null; const st = plan ? stats(p.id) : null;
      return `<a class="pcard" href="#/p/${p.id}" style="--c:${esc(p.color)}">${avatar(p, 'big')}
        <div class="pinfo"><b>${esc(p.name)}</b><small>${plan ? (sess ? esc(sess.title) : 'Rest day') : 'Plan not loaded'}</small></div>
        ${st ? `<span class="pill ${st.cur ? 'hot' : ''}">${I('flame')}${st.cur}</span>` : ''}${I('chev', 'go')}</a>`;
    }).join('')}</div>
    <a class="card boardteaser" href="#/board"><div class="card-h">${I('trophy')}<h3>Leaderboard</h3><small>This week</small>${I('chev', 'go')}</div>
      ${ranking('week').map((r) => `<div class="tline">${rankBadge(r.rank)}${avatar(r.p)}<b>${esc(r.p.name)}</b><span>${r.st.week.pct}%<em>${I('flame')}${r.st.cur}</em></span></div>`).join('')}</a>
    <button class="ghost wide" id="invite">${I('share')} Share the app with family</button>`;
  $('#invite').onclick = () => share(inviteText(), 'Family Gym');
}

function weekStrip(pid, plan, selected) {
  return `<div class="week">${WEEK.map((d) => {
    const sk = plan.weekly[d]; const s = sk && plan.sessions[sk];
    return `<a class="wd ${d === todayKey() ? 'today' : ''} ${d === selected ? 'sel' : ''} ${s ? '' : 'rest'}" href="#/p/${pid}/d/${d}">
      <b>${DAY_NAME[d]}</b><small>${s ? esc(s.title.split(/[:(]/)[0].trim()) : 'Rest'}</small></a>`;
  }).join('')}</div>`;
}

function viewProfile(pid, day) {
  const p = profile(pid); const plan = S.plans[pid];
  if (!p || !plan) return notFound();
  LS.set('profile', pid);
  setTitle(p.name, '#/'); nav(pid, 'today');
  const d = day || todayKey();
  const sk = plan.weekly[d];
  const st = stats(pid);
  app().innerHTML = `${updateBanner()}
    <div class="hero" style="--c:${esc(p.color)}">
      <button class="av-edit" id="photo" aria-label="Change profile photo">${avatar(p, 'xl')}<span class="cam">${I('camera')}</span></button>
      <div class="hero-t"><h2>${esc(p.name)}</h2><small>${esc(plan.title.replace(/^[^:]*:\s*/, ''))} · v${esc(plan.version)}</small>
        <a class="hstats" href="#/p/${pid}/board"><span><b>${st.cur}</b>streak</span><span><b>${st.week.n}/${st.week.due || st.week.n}</b>this week</span><span><b>${st.total}</b>total days</span></a></div>
    </div>
    ${weekStrip(pid, plan, d)}` + (sk ? sessionBody(pid, plan, sk, d) : `
    <div class="card center rest-card"><div class="rest-ic">${I('moon')}</div><h2>Rest day</h2>
    <p class="muted">${pid === 'himanshu' ? 'Recovery is where you grow. Hit 8–10k steps, sleep 7–8 hours, eat your protein.' : 'Easy walk after lunch and dinner.'}</p></div>`);
  $('#photo').onclick = () => pickPhoto(pid);
  $('#sharewk') && ($('#sharewk').onclick = () => {
    const s = plan.sessions[sk]; const n = s.items.reduce((a, it, i) => a + Math.min(it.sets, setsToday(pid, sk, chosenEx(pid, sk, i, it)).length), 0);
    const total = s.items.reduce((a, it) => a + it.sets, 0); const st2 = stats(pid);
    share(`${p.name} ${n >= total ? "finished today's workout 💪" : `is ${Math.round(100 * n / total)}% through today's workout`}\n${s.title} · ${n}/${total} sets\n🔥 ${st2.cur}-day streak · ${st2.week.n} workout${st2.week.n === 1 ? '' : 's'} this week\n\nFamily Gym: ${SITE_URL}`);
  });
}

function sessionBody(pid, plan, sk, d) {
  const s = plan.sessions[sk];
  const isToday = d === todayKey();
  const items = s.items.map((it, i) => {
    const exId = chosenEx(pid, sk, i, it);
    const e = exInfo(exId);
    const done = setsToday(pid, sk, exId).length;
    const full = done >= it.sets;
    return `<a class="ex ${full ? 'done' : ''}" href="#/p/${pid}/s/${sk}/${i}">
      <div class="thumb">${e.img[0] ? `<img loading="lazy" src="${esc(e.img[0])}" alt="">` : I('dumbbell')}</div>
      <div class="exm"><b>${esc(e.name)}</b>
        <small>${it.sets} × ${esc(it.reps)} ${esc(unitLabel(it))}${it.note ? ' · ' + esc(it.note) : ''}</small></div>
      <div class="cnt">${full ? `<span class="okdot">${I('check')}</span>` : `${done}/${it.sets}`}</div></a>`;
  }).join('');
  const totalSets = s.items.reduce((a, it) => a + it.sets, 0);
  const doneSets = s.items.reduce((a, it, i) => a + Math.min(it.sets, setsToday(pid, sk, chosenEx(pid, sk, i, it)).length), 0);
  const pct = Math.round(100 * doneSets / totalSets);
  return `
    <div class="sess-h"><div><small class="eyebrow">${isToday ? "Today's session" : `${DAY_NAME[d]}'s session`}</small>
      <h2>${esc(s.title)}${s.optional ? ' <span class="tag">optional</span>' : ''}</h2></div>
      ${isToday ? `<span class="pct">${pct}%</span>` : ''}</div>
    ${isToday ? `<div class="bar"><i style="width:${pct}%"></i></div><small class="muted">${doneSets} of ${totalSets} sets · ${s.items.length} exercises</small>`
      : `<small class="muted">${s.items.length} exercises · logging still counts for today</small>`}
    ${isToday && doneSets > 0 && doneSets >= totalSets ? `<button class="primary wide" id="sharewk">${I('share')} Workout complete. Share it</button>` : ''}
    ${plan.warmup ? `<details class="card"><summary>${I('flame')} Warm-up · ${plan.warmup.min} min</summary><ul>${plan.warmup.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
    <div class="exlist">${items}</div>
    ${(plan.finish || []).map((f) => `<details class="card"><summary>${I('heart')} ${esc(f.title)} · ${f.min} min</summary><p>${esc(f.text)}</p></details>`).join('')}
    ${isToday && doneSets > 0 && doneSets < totalSets ? `<button class="ghost wide" id="sharewk">${I('share')} Share progress</button>` : ''}`;
}

const unitLabel = (it) => (it.unit && it.unit !== 'reps' ? it.unit : 'reps');
const swapKey = (pid, sk, i) => `swap.${pid}.${sk}.${i}`;
const chosenEx = (pid, sk, i, it) => { const c = LS.get(swapKey(pid, sk, i), null); return c && [it.ex, ...(it.alt || [])].includes(c) ? c : it.ex; };

function viewExercise(pid, sk, idx) {
  const p = profile(pid); const plan = S.plans[pid]; const s = plan?.sessions[sk]; const it = s?.items[idx];
  if (!it) return notFound();
  const exId = chosenEx(pid, sk, idx, it);
  const e = exInfo(exId);
  const last = lastTime(pid, exId);
  const today = setsToday(pid, sk, exId);
  const bw = it.load === 'bw';
  setTitle(`${p.name} · ${idx + 1}/${s.items.length}`, `#/p/${pid}/d/${dayOf(plan, sk)}`); nav(pid, 'today');
  const rows = [];
  const n = Math.max(it.sets, today.length ? today[today.length - 1].set_no : 0);
  for (let k = 1; k <= n; k++) {
    const got = today.find((x) => x.set_no === k);
    const prev = last?.sets.find((x) => x.set_no === k) || last?.sets[last.sets.length - 1];
    const prevToday = today.filter((x) => x.set_no < k).pop();
    const kg = got ? got.kg : (prevToday?.kg ?? prev?.kg ?? '');
    rows.push(`<div class="set ${got ? 'done' : ''}" data-k="${k}" data-cid="${got ? got.cid : ''}">
      <span class="n">${k}</span>
      ${bw ? '<span class="bw">body</span>' : `<input class="kg" type="number" inputmode="decimal" step="0.5" min="0" value="${esc(kg ?? '')}" placeholder="kg" aria-label="kg">`}
      <input class="reps" type="number" inputmode="numeric" min="0" value="${got ? esc(got.reps) : ''}" placeholder="${esc(topOf(it.reps))}" aria-label="${esc(unitLabel(it))}">
      <button class="tick" aria-label="Save set ${k}">${got ? '✓' : 'Done'}</button>
      ${got ? `<button class="del" aria-label="Delete set ${k}">✕</button>` : ''}
    </div>`);
  }
  const choices = [it.ex, ...(it.alt || [])];
  const prevI = idx > 0 ? idx - 1 : null; const nextI = idx < s.items.length - 1 ? idx + 1 : null;
  app().innerHTML = `
    <div class="demo">${e.img.length ? `<img src="${esc(e.img[0])}" alt="${esc(e.name)} start">${e.img[1] ? `<img class="b" src="${esc(e.img[1])}" alt="${esc(e.name)} end">` : ''}`
      : `<div class="noimg">${I('dumbbell')}<small>No photo: follow the steps below</small></div>`}</div>
    <h2 class="exname">${esc(e.name)}</h2>
    <p class="muted">${esc(e.muscles)}${e.equipment ? ' · ' + esc(e.equipment) : ''}</p>
    ${choices.length > 1 ? `<div class="chips">${choices.map((c) => `<button class="chip ${c === exId ? 'on' : ''}" data-swap="${esc(c)}">${esc(exInfo(c).name)}</button>`).join('')}</div>` : ''}
    <div class="target"><b>${it.sets} × ${esc(it.reps)}</b> ${esc(unitLabel(it))}${it.rest ?? 90 ? ` · rest ${it.rest ?? 90}s` : ''}${it.note ? `<div class="note">${I('note')} ${esc(it.note)}</div>` : ''}</div>
    ${last ? `<div class="last">Last time (${fmtDay(last.day)}): ${last.sets.map((x) => `${x.kg ? +x.kg + '×' : ''}${x.reps}`).join(', ')}</div>` : ''}
    ${suggestion(it, last) ? `<div class="hint">${suggestion(it, last)}</div>` : ''}
    <div class="sets"><div class="set head"><span>Set</span><span>${bw ? '' : 'kg'}</span><span>${esc(unitLabel(it).split('/')[0])}</span><span></span><span></span></div>${rows.join('')}</div>
    <button class="ghost" id="addset">${I('plus')} Add a set</button>
    <details class="card" open><summary>${I('steps')} How to do it</summary><ol>${e.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details>
    <details class="card"><summary>${I('warn')} Common mistakes</summary><ul class="bad">${e.mistakes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>
    <div class="pager">
      ${prevI !== null ? `<a class="btn ghost" href="#/p/${pid}/s/${sk}/${prevI}">← Prev</a>` : '<span></span>'}
      ${nextI !== null ? `<a class="btn ${today.length >= it.sets ? 'primary' : 'ghost'}" href="#/p/${pid}/s/${sk}/${nextI}">Next →</a>`
        : `<a class="btn ${today.length >= it.sets ? 'primary' : 'ghost'}" href="#/p/${pid}">Finish ✓</a>`}
    </div>`;

  app().querySelectorAll('[data-swap]').forEach((b) => b.onclick = () => { LS.set(swapKey(pid, sk, idx), b.dataset.swap); route(); });
  $('#addset').onclick = () => {
    const box = app().querySelector('.sets'); const k = box.querySelectorAll('.set:not(.head)').length + 1;
    const tmp = document.createElement('div'); tmp.innerHTML = rows[rows.length - 1] || '';
    const row = tmp.firstElementChild; row.dataset.k = k; row.dataset.cid = ''; row.classList.remove('done');
    row.querySelector('.n').textContent = k; row.querySelector('.reps').value = '';
    row.querySelector('.tick').textContent = 'Done'; row.querySelector('.del')?.remove();
    box.appendChild(row); wireRow(row);
  };
  const wireRow = (row) => {
    row.querySelector('.tick').onclick = () => {
      const reps = +row.querySelector('.reps').value;
      const kgEl = row.querySelector('.kg'); const kg = kgEl && kgEl.value !== '' ? +kgEl.value : null;
      if (!reps || reps < 0) { toast('Enter how many you did'); row.querySelector('.reps').focus(); return; }
      if (kg != null && (kg < 0 || kg > 500)) { toast('Check the weight'); return; }
      const cid = row.dataset.cid || uuid();
      const was = LOGS.find((l) => l.cid === cid);
      putLog({ cid, profile: pid, day: was?.day || dayStr(), session: sk, ex: exId, set_no: +row.dataset.k, kg, reps, deleted: false });
      const doneNow = setsToday(pid, sk, exId).length;
      if (!was) {
        if (doneNow >= it.sets) { Timer.stop(); toast(nextI !== null ? 'Exercise done 👏 Tap Next' : 'Workout done! 🎉'); }
        else Timer.start(it.rest ?? 90);
      } else toast('Updated');
      route();
    };
    const del = row.querySelector('.del');
    if (del) del.onclick = () => {
      if (!confirm(`Delete set ${row.dataset.k}?`)) return;
      const l = LOGS.find((x) => x.cid === row.dataset.cid);
      if (l) putLog({ ...l, deleted: true });
      route();
    };
  };
  app().querySelectorAll('.set:not(.head)').forEach(wireRow);
}
const dayOf = (plan, sk) => (plan.weekly[todayKey()] === sk ? todayKey() : WEEK.find((d) => plan.weekly[d] === sk) || todayKey());

function spark(vals) {
  if (vals.length < 2) return '';
  const w = 120, h = 32, mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const pts = vals.map((v, i) => `${(i * w / (vals.length - 1)).toFixed(1)},${(h - 3 - (v - mn) * (h - 6) / r).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}"><polyline points="${pts}"/></svg>`;
}
function bestPerDay(logs) {
  const by = {};
  for (const l of logs) { const b = by[l.day]; if (!b || (+l.kg || 0) > (+b.kg || 0) || ((+l.kg || 0) === (+b.kg || 0) && l.reps > b.reps)) by[l.day] = l; }
  return Object.keys(by).sort().map((d) => by[d]);
}

function viewHistory(pid) {
  const p = profile(pid); if (!p) return notFound();
  setTitle(`${p.name} · Progress`, `#/p/${pid}`); nav(pid, 'history');
  const mine = LOGS.filter((l) => live(l) && l.profile === pid);
  const days = [...new Set(mine.map((l) => l.day))].sort().reverse();
  const exs = [...new Set(mine.map((l) => l.ex))];
  const lastDay = (ex) => mine.filter((l) => l.ex === ex).reduce((m, l) => (l.day > m ? l.day : m), '');
  exs.sort((a, b) => lastDay(b).localeCompare(lastDay(a)));
  app().innerHTML = activityCard(pid, true) + (!mine.length ? `<div class="card center"><div class="rest-ic">${I('chart')}</div><p>No sets logged yet. Your progress shows up here.</p></div>` : `
    <p class="muted small center">${mine.length} sets logged in total</p>
    <h3 class="sect">By exercise</h3>
    <div class="hist">${exs.map((ex) => {
      const best = bestPerDay(mine.filter((l) => l.ex === ex)); const b = best[best.length - 1];
      const vals = best.map((x) => (+x.kg || 0) || x.reps);
      return `<a class="hrow" href="#/p/${pid}/history/${encodeURIComponent(ex)}"><div><b>${esc(exInfo(ex).name)}</b>
        <small>${fmtDay(b.day)} · best ${b.kg ? +b.kg + ' kg × ' : ''}${b.reps}</small></div>${spark(vals.slice(-12))}</a>`;
    }).join('')}</div>`);
  wireHeatmaps();
  $('#sharehist').onclick = () => { const st = stats(pid); share(`${p.name} on Family Gym\n🔥 ${st.cur}-day streak (best ${st.best})\n📅 ${st.month.n} workout days this month · ${st.total} total\n${mine.length} sets logged\n\n${SITE_URL}`); };
}

function viewHistoryEx(pid, ex) {
  const p = profile(pid); if (!p) return notFound();
  setTitle(exInfo(ex).name, `#/p/${pid}/history`); nav(pid, 'history');
  const mine = LOGS.filter((l) => live(l) && l.profile === pid && l.ex === ex);
  const days = [...new Set(mine.map((l) => l.day))].sort().reverse();
  const best = bestPerDay(mine);
  app().innerHTML = `${best.length > 1 ? `<div class="card big-spark">${spark(best.map((x) => (+x.kg || 0) || x.reps))}</div>` : ''}
    ${days.map((d) => `<div class="card"><b>${fmtDay(d)}</b><div class="setlist">${mine.filter((l) => l.day === d).sort((a, b) => a.set_no - b.set_no)
      .map((l) => `<span>${l.kg ? +l.kg + ' kg × ' : ''}${l.reps}</span>`).join('')}</div></div>`).join('')}`;
}

function viewPlan(pid) {
  const p = profile(pid); const plan = S.plans[pid]; if (!plan) return notFound();
  setTitle(`${p.name} · Plan`, `#/p/${pid}`); nav(pid, 'plan');
  app().innerHTML = `
    <div class="card"><b>${esc(plan.title)}</b><br><small class="muted">Plan v${esc(plan.version)} · updated ${esc(plan.updated || '')}</small></div>
    <details class="card" open><summary>${I('shield')} Rules</summary><ul>${(plan.rules || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>
    <details class="card"><summary>${I('trend')} How to progress</summary><ul>${(plan.progression || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>
    ${WEEK.map((d) => { const sk = plan.weekly[d]; const s = sk && plan.sessions[sk];
      return `<details class="card"><summary><b>${DAY_NAME[d]}</b> · ${s ? esc(s.title) : 'Rest'}</summary>${s ? `<table class="pt">${s.items.map((it) =>
        `<tr><td>${esc(exInfo(it.ex).name)}${it.alt ? `<br><small class="muted">or ${it.alt.map((a) => esc(exInfo(a).name)).join(', ')}</small>` : ''}</td><td>${it.sets}×${esc(it.reps)}</td></tr>`).join('')}</table>` : ''}</details>`;
    }).join('')}`;
}

function viewSettings(pid) {
  setTitle('Settings', pid ? `#/p/${pid}` : '#/'); nav(pid, 'settings');
  const last = LS.get('lastSync', 0);
  const me = pid && profile(pid);
  app().innerHTML = `${updateBanner()}
    ${me ? `<div class="card"><h3>${I('camera')} Profile photo</h3>
      <div class="row">${avatar(me, 'big')}<div><button class="primary" id="setphoto">${Avatars.get(pid) ? 'Change photo' : 'Add photo'}</button>
      ${Avatars.get(pid) ? '<button class="ghost" id="rmphoto">Remove</button>' : ''}</div></div>
      <small class="muted">Square crop, saved to the family cloud so every phone sees it.</small></div>` : ''}
    <div class="card"><h3>${I('share')} Share</h3><p class="muted">Send the app link to family or friends.</p>
      <button class="ghost" id="shareapp">${I('share')} Share Family Gym</button>
      ${SHELL ? '' : `<a class="btn ghost" href="${APK_URL}">${I('phone')} Get the Android app</a>`}</div>
    <div class="card"><h3>${I('cloud')} Sync</h3>
      ${!CLOUD ? '<p>This is the <b>demo</b>: logs are saved on this phone only. Cloud sync turns on when the family server is connected.</p>'
        : Sync.authed() ? `<p>Signed in as the family. ${Sync.pending()} set(s) waiting.<br><small class="muted">Last sync: ${last ? new Date(last).toLocaleString() : 'never'}</small></p>
            ${Sync.err ? `<p class="badtxt">${esc(Sync.err)}</p>` : ''}
            <button class="primary" id="syncnow">Sync now</button> <button class="ghost" id="logout">Sign out</button>`
        : `<p>Enter the family code to save workouts to the cloud (once per phone).</p>
            <input id="code" type="password" inputmode="numeric" placeholder="Family code" autocomplete="current-password">
            <button class="primary" id="login">Sign in</button>`}
    </div>
    <div class="card"><h3>${I('clipboard')} Plans</h3><p class="muted">Plans load from the internet each time the app opens, so changes show up without an app update.</p>
      <ul>${S.index.profiles.map((p) => `<li>${esc(p.name)}: v${esc(S.plans[p.id]?.version || '?')}</li>`).join('')}</ul>
      <button class="ghost" id="reload">Reload plans now</button></div>
    <div class="card"><h3>${I('download')} Backup</h3><p class="muted">Download every logged set as a spreadsheet (CSV).</p><button class="ghost" id="csv">Export CSV</button></div>
    <p class="muted small center">Family Gym v${APP_VERSION}<br>Exercise photos & base instructions: free-exercise-db (public domain).</p>`;
  $('#setphoto') && ($('#setphoto').onclick = () => pickPhoto(pid));
  $('#rmphoto') && ($('#rmphoto').onclick = () => { if (confirm('Remove profile photo?')) { Avatars.set(pid, ''); route(); } });
  $('#shareapp').onclick = () => share(inviteText(), 'Family Gym');
  $('#syncnow') && ($('#syncnow').onclick = () => Sync.run().then(() => route()));
  $('#logout') && ($('#logout').onclick = () => { if (confirm('Sign out? Unsynced sets stay on this phone.')) { Sync.logout(); route(); } });
  $('#login') && ($('#login').onclick = async () => {
    const b = $('#login'); b.disabled = true; b.textContent = 'Signing in…';
    try { await Sync.login($('#code').value); toast('Signed in ✓'); await Sync.run(); }
    catch (e) { toast('Wrong code or no internet'); }
    route();
  });
  $('#reload').onclick = async () => { await loadData().catch(() => toast('Offline: using saved plans')); toast('Plans reloaded'); route(); };
  $('#csv').onclick = () => {
    const rows = [['date', 'profile', 'session', 'exercise', 'set', 'kg', 'reps']]
      .concat(LOGS.filter(live).sort((a, b) => (a.day + a.profile + a.ex + a.set_no).localeCompare(b.day + b.profile + b.ex + b.set_no))
        .map((l) => [l.day, l.profile, l.session, exInfo(l.ex).name, l.set_no, l.kg ?? '', l.reps]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const name = `family-gym-${dayStr()}.csv`;
    if (window.FamilyGymAndroid) { window.FamilyGymAndroid.saveFile(name, 'text/csv', csv); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = name; a.click();
  };
}

function notFound() { setTitle('Not found', '#/'); nav(null); app().innerHTML = '<div class="card center"><p>That page does not exist.</p><a class="btn primary" href="#/">Home</a></div>'; }

/* ---------------- activity calendar, streaks & leaderboard ---------------- */
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const midnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
function activity(pid) {
  const m = new Map();
  for (const l of LOGS) if (live(l) && l.profile === pid) m.set(l.day, (m.get(l.day) || 0) + 1);
  return m;
}
const isPlanned = (plan, d) => !!plan?.weekly?.[JS_DAY[d.getDay()]];

// A streak counts workout days; planned rest days never break it, and today only counts once done.
function stats(pid) {
  const plan = S.plans[pid]; const act = activity(pid); const today = midnight();
  const done = (d) => act.has(dayStr(d));
  let cur = 0;
  for (let d = done(today) ? today : addDays(today, -1), i = 0; i < 1000; i++, d = addDays(d, -1)) {
    if (done(d)) cur++; else if (isPlanned(plan, d)) break;
  }
  let best = 0, run = 0;
  const first = [...act.keys()].sort()[0];
  if (first) {
    for (let d = new Date(first + 'T00:00:00'); d <= today; d = addDays(d, 1)) {
      if (done(d)) best = Math.max(best, ++run); else if (isPlanned(plan, d) && d < today) run = 0;
    }
  }
  const range = (start) => {
    let n = 0, due = 0;
    for (let d = new Date(start); d <= today; d = addDays(d, 1)) {
      if (done(d)) n++;
      if (isPlanned(plan, d) && (d < today || done(d))) due++;
    }
    return { n, due, pct: due ? Math.min(100, Math.round((n / due) * 100)) : (n ? 100 : 0) };
  };
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const year = [...act.keys()].filter((k) => k > dayStr(addDays(today, -365))).length;
  return { act, cur, best, total: act.size, year, week: range(monday), month: range(new Date(today.getFullYear(), today.getMonth(), 1)), monday };
}

// LeetCode-style heatmap: one column per week (Mon at top), colour by sets logged that day.
function heatmap(pid, weeks, color) {
  const { act } = stats(pid); const today = midnight();
  const start = addDays(today, -((today.getDay() + 6) % 7) - (weeks - 1) * 7);
  const lvl = (n) => (!n ? 0 : n <= 5 ? 1 : n <= 12 ? 2 : n <= 20 ? 3 : 4);
  let cells = '', months = '', lastM = -1;
  for (let w = 0; w < weeks; w++) {
    const wk = addDays(start, w * 7);
    const m = wk.getMonth();
    months += `<span>${m !== lastM && (w > 0 || wk.getDate() <= 7) ? wk.toLocaleDateString(undefined, { month: 'short' }) : ''}</span>`;
    lastM = m;
    for (let i = 0; i < 7; i++) {
      const d = addDays(wk, i); const k = dayStr(d); const n = act.get(k) || 0;
      cells += d > today ? '<i class="f"></i>'
        : `<i class="l${lvl(n)}${k === dayStr(today) ? ' t' : ''}" data-t="${esc(fmtDay(k))}: ${n ? n + ' set' + (n > 1 ? 's' : '') : 'no workout'}"></i>`;
    }
  }
  return `<div class="hm-wrap"><div class="hm-days"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div>
    <div class="hm-scroll"><div class="hm-months" style="grid-template-columns:repeat(${weeks},var(--hc))">${months}</div>
    <div class="hm" style="--hcol:${esc(color)}">${cells}</div></div></div>`;
}
function wireHeatmaps() {
  document.querySelectorAll('.hm-scroll').forEach((s) => { s.scrollLeft = s.scrollWidth; });
  document.querySelectorAll('.hm').forEach((h) => { h.onclick = (e) => e.target.dataset.t && toast(e.target.dataset.t); });
}
const hmLegend = (color) => `<div class="hm-legend" style="--hcol:${esc(color)}">Less <i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> More</div>`;

function activityCard(pid, shareBtn) {
  const p = profile(pid); const st = stats(pid);
  return `<div class="card"><div class="hm-head"><h3>${st.year} workout day${st.year === 1 ? '' : 's'} in the past year</h3>${shareBtn ? `<button class="iconbtn" id="sharehist" aria-label="Share">${I('share')}</button>` : ''}</div>
    ${heatmap(pid, 53, p.color)}${hmLegend(p.color)}
    <div class="stats4"><div><b>${I('flame', 'fl')}${st.cur}</b><small>Current streak</small></div><div><b>${st.best}</b><small>Best streak</small></div>
    <div><b>${st.month.n}</b><small>Days this month</small></div><div><b>${st.total}</b><small>Total days</small></div></div></div>`;
}

const BOARD_TABS = [['week', 'This week'], ['month', 'This month'], ['all', 'All time']];
function ranking(tab) {
  const rows = S.index.profiles.filter((p) => S.plans[p.id]).map((p) => ({ p, st: stats(p.id) }));
  const key = (r) => (tab === 'all' ? [r.st.total, r.st.best, r.st.cur] : [r.st[tab].pct, r.st[tab].n, r.st.cur]);
  rows.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; });
  let rank = 0, prev = null;
  rows.forEach((r, i) => { const k = key(r).join(); if (k !== prev) rank = i + 1; prev = k; r.rank = rank; });
  return rows;
}
const rankBadge = (r) => `<span class="rk r${Math.min(r, 4)}">${r}</span>`;
function weekDots(pid, st) {
  const plan = S.plans[pid]; const today = midnight();
  return `<div class="wdots">${WEEK.map((w, i) => {
    const d = addDays(st.monday, i); const did = st.act.has(dayStr(d));
    const c = did ? 'done' : d > today || dayStr(d) === dayStr(today) ? (isPlanned(plan, d) ? 'todo' : 'rest') : isPlanned(plan, d) ? 'miss' : 'rest';
    return `<span class="${c}" title="${DAY_NAME[w]}">${DAY_NAME[w][0]}</span>`;
  }).join('')}</div>`;
}

function viewBoard(pid) {
  setTitle('Leaderboard', pid ? `#/p/${pid}` : '#/'); nav(pid, 'board');
  const tab = LS.get('boardTab', 'week');
  const rows = ranking(tab);
  const note = !CLOUD || !Sync.authed() ? '<p class="muted small center">Only workouts saved on this phone are counted. Sign in with the family code in Settings to compete with everyone.</p>' : '';
  app().innerHTML = `<div class="seg">${BOARD_TABS.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="board">${rows.map((r) => {
      const st = r.st; const m = tab === 'all' ? null : st[tab];
      return `<a class="brow ${r.rank === 1 && (m ? m.n : st.total) ? 'lead' : ''}" href="#/p/${r.p.id}/history" style="--c:${esc(r.p.color)}">
        <span class="medal">${rankBadge(r.rank)}</span>${avatar(r.p)}
        <div class="bname"><b>${esc(r.p.name)}</b><small>${I('flame')} ${st.cur} day streak · best ${st.best}</small>${tab === 'week' ? weekDots(r.p.id, st) : ''}</div>
        <div class="bscore">${m ? `<b>${m.pct}%</b><small>${m.n}/${m.due} day${m.due === 1 ? '' : 's'}</small>` : `<b>${st.total}</b><small>days</small>`}</div></a>`;
    }).join('')}</div>
    <p class="muted small center">${tab === 'all' ? 'Ranked by total workout days.' : 'Ranked by planned workout days done, so 5-day and 6-day plans compete fairly. Rest days never break a streak.'}</p>
    ${note}
    <button class="ghost wide" id="shareboard">${I('share')} Share standings</button>
    <h3 class="sect">Last 4 months</h3>
    ${rows.map((r) => `<div class="card"><div class="hm-head">${avatar(r.p)} <b>${esc(r.p.name)}</b> <span class="muted small">${r.st.year} days in the past year</span></div>${heatmap(r.p.id, 17, r.p.color)}</div>`).join('')}`;
  document.querySelectorAll('.seg button').forEach((b) => { b.onclick = () => { LS.set('boardTab', b.dataset.tab); viewBoard(pid); }; });
  $('#shareboard').onclick = () => share(`Family Gym leaderboard · ${BOARD_TABS.find((t) => t[0] === tab)[1].toLowerCase()}\n\n${rows.map((r) => `${['🥇', '🥈', '🥉'][r.rank - 1] || r.rank + '.'} ${r.p.name}: ${tab === 'all' ? r.st.total + ' days' : r.st[tab].pct + '% (' + r.st[tab].n + '/' + r.st[tab].due + ' days)'} · 🔥 ${r.st.cur}`).join('\n')}\n\n${SITE_URL}`);
  wireHeatmaps();
}

/* ---------------- router ---------------- */
function route() {
  const h = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  window.scrollTo(0, 0);
  if (h[0] === 'p' && h[1]) {
    const pid = h[1];
    if (!h[2]) return viewProfile(pid);
    if (h[2] === 'd') return viewProfile(pid, h[3]);
    if (h[2] === 's') return viewExercise(pid, h[3], +h[4] || 0);
    if (h[2] === 'history') return h[3] ? viewHistoryEx(pid, h[3]) : viewHistory(pid);
    if (h[2] === 'plan') return viewPlan(pid);
    if (h[2] === 'board') return viewBoard(pid);
    if (h[2] === 'settings') return viewSettings(pid);
  }
  if (h[0] === 'settings') return viewSettings(LS.get('profile', null));
  if (h[0] === 'board') return viewBoard(null);
  return viewHome();
}

async function boot() {
  $('#sync').onclick = () => (location.hash = `#/p/${LS.get('profile', 'papa')}/settings`);
  $('#timer-skip').onclick = () => Timer.stop();
  $('#timer-add').onclick = () => Timer.add(30);
  try { await loadData(); }
  catch (e) { app().innerHTML = `<div class="card center"><p>Couldn't load the plans. Check the internet and try again.</p><button class="primary" onclick="location.reload()">Retry</button></div>`; return; }
  if (!location.hash && LS.get('profile', null) && profile(LS.get('profile'))) location.hash = `#/p/${LS.get('profile')}`;
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => Sync.run());
  window.addEventListener('offline', paintSync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    Sync.run();
    if (Date.now() - S.loadedAt > 10 * 60e3) loadData().then(route).catch(() => {});
  });
  setInterval(() => document.visibilityState === 'visible' && Sync.run(), 60e3);
  route(); paintSync(); Sync.run();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
