/* Family Gym: offline-first workout logger.
 * Plans come from plans/*.json (edit them on GitHub, no app update needed).
 * Set logs live on the phone first and sync to Supabase (set_log table) when online. */
const APP_VERSION = '0.1.0';
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
      let since = LS.get('pullSince', '1970-01-01T00:00:00Z');
      for (;;) {
        const r = await this.api(`set_log?select=cid,profile,day,session,ex,set_no,kg,reps,deleted,updated_at,srv_at&srv_at=gt.${encodeURIComponent(since)}&order=srv_at.asc&limit=1000`);
        const rows = await r.json();
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
      LS.set('lastSync', Date.now());
      this.err = '';
      if (location.hash.includes('/history') || location.hash.includes('/s/')) route();
    } catch (e) { this.err = e.message; }
    finally { this.busy = false; paintSync(); }
  },
};

function paintSync() {
  const el = $('#sync');
  if (!el) return;
  let t, c;
  if (!CLOUD) { t = 'Demo: saved on this phone'; c = 'warn'; }
  else if (!Sync.authed()) { t = 'Not signed in: tap to sign in'; c = 'warn'; }
  else if (Sync.busy) { t = 'Syncing…'; c = ''; }
  else if (!navigator.onLine) { t = `Offline · ${Sync.pending()} to sync`; c = 'warn'; }
  else if (Sync.err) { t = 'Sync problem: tap for details'; c = 'bad'; }
  else if (Sync.pending()) { t = `${Sync.pending()} waiting to sync`; c = 'warn'; }
  else { t = '✓ Saved to cloud'; c = 'ok'; }
  el.textContent = t; el.className = 'sync ' + c;
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
      $('#timer-t').textContent = 'Go! 💪';
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
  const tabs = [['today', 'Today', '🏋️'], ['history', 'History', '📈'], ['plan', 'Plan', '📋'], ['settings', 'Settings', '⚙️']];
  $('#nav').innerHTML = pid ? tabs.map(([k, l, i]) =>
    `<a href="#/p/${pid}${k === 'today' ? '' : '/' + k}" class="${k === active ? 'on' : ''}"><span>${i}</span>${l}</a>`).join('') : '';
  $('#nav').hidden = !pid;
}
const avatar = (p, big) => `<span class="av ${big ? 'big' : ''}" style="background:${esc(p.color)}">${esc(p.emoji || p.name[0])}</span>`;

function viewHome() {
  setTitle('Family Gym'); nav(null);
  const ps = S.index.profiles;
  app().innerHTML = `
    <p class="muted center">Who is working out?</p>
    <div class="profiles">${ps.map((p) => {
      const plan = S.plans[p.id]; const sk = plan?.weekly?.[todayKey()];
      const sess = sk ? plan.sessions[sk] : null;
      return `<a class="pcard" href="#/p/${p.id}" style="--c:${esc(p.color)}">${avatar(p, true)}
        <div><b>${esc(p.name)}</b><small>${plan ? (sess ? 'Today: ' + esc(sess.title) : 'Rest day 😌') : 'Plan not loaded'}</small></div></a>`;
    }).join('')}</div>`;
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
  app().innerHTML = `${weekStrip(pid, plan, d)}` + (sk ? sessionBody(pid, plan, sk, d) : `
    <div class="card center rest-card"><div class="big">😌</div><h2>Rest day</h2>
    <p class="muted">${pid === 'himanshu' ? 'Recover. Hit your steps.' : 'Easy walk after lunch and dinner.'}</p></div>`);
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
      <div class="thumb">${e.img[0] ? `<img loading="lazy" src="${esc(e.img[0])}" alt="">` : '<span>🧘</span>'}</div>
      <div class="exm"><b>${esc(e.name)}</b>
        <small>${it.sets} × ${esc(it.reps)} ${esc(unitLabel(it))}${it.note ? ' · ' + esc(it.note) : ''}</small></div>
      <div class="cnt">${full ? '✅' : `${done}/${it.sets}`}</div></a>`;
  }).join('');
  const totalSets = s.items.reduce((a, it) => a + it.sets, 0);
  const doneSets = s.items.reduce((a, it, i) => a + Math.min(it.sets, setsToday(pid, sk, chosenEx(pid, sk, i, it)).length), 0);
  return `
    <div class="sess-h"><h2>${esc(s.title)}${s.optional ? ' <span class="tag">optional</span>' : ''}</h2>
      ${isToday ? `<div class="bar"><i style="width:${Math.round(100 * doneSets / totalSets)}%"></i></div><small class="muted">${doneSets}/${totalSets} sets today</small>`
        : `<small class="muted">${DAY_NAME[d]}'s session. Logging still counts for today.</small>`}</div>
    ${plan.warmup ? `<details class="card"><summary>🔥 Warm-up · ${plan.warmup.min} min</summary><ul>${plan.warmup.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
    <div class="exlist">${items}</div>
    ${(plan.finish || []).map((f) => `<details class="card"><summary>${f.title.startsWith('Cardio') ? '🚶' : '🧘'} ${esc(f.title)} · ${f.min} min</summary><p>${esc(f.text)}</p></details>`).join('')}`;
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
      : '<div class="noimg">🧘<small>No photo: follow the steps below</small></div>'}</div>
    <h2 class="exname">${esc(e.name)}</h2>
    <p class="muted">${esc(e.muscles)}${e.equipment ? ' · ' + esc(e.equipment) : ''}</p>
    ${choices.length > 1 ? `<div class="chips">${choices.map((c) => `<button class="chip ${c === exId ? 'on' : ''}" data-swap="${esc(c)}">${esc(exInfo(c).name)}</button>`).join('')}</div>` : ''}
    <div class="target"><b>${it.sets} × ${esc(it.reps)}</b> ${esc(unitLabel(it))}${it.rest ?? 90 ? ` · rest ${it.rest ?? 90}s` : ''}${it.note ? `<div>📝 ${esc(it.note)}</div>` : ''}</div>
    ${last ? `<div class="last">Last time (${fmtDay(last.day)}): ${last.sets.map((x) => `${x.kg ? +x.kg + '×' : ''}${x.reps}`).join(', ')}</div>` : ''}
    ${suggestion(it, last) ? `<div class="hint">${suggestion(it, last)}</div>` : ''}
    <div class="sets"><div class="set head"><span>Set</span><span>${bw ? '' : 'kg'}</span><span>${esc(unitLabel(it).split('/')[0])}</span><span></span><span></span></div>${rows.join('')}</div>
    <button class="ghost" id="addset">+ Add a set</button>
    <details class="card" open><summary>✅ How to do it</summary><ol>${e.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details>
    <details class="card"><summary>⚠️ Common mistakes</summary><ul class="bad">${e.mistakes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>
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
  setTitle(`${p.name} · History`, `#/p/${pid}`); nav(pid, 'history');
  const mine = LOGS.filter((l) => live(l) && l.profile === pid);
  const days = [...new Set(mine.map((l) => l.day))].sort().reverse();
  const exs = [...new Set(mine.map((l) => l.ex))];
  const lastDay = (ex) => mine.filter((l) => l.ex === ex).reduce((m, l) => (l.day > m ? l.day : m), '');
  exs.sort((a, b) => lastDay(b).localeCompare(lastDay(a)));
  const weekAgo = dayStr(new Date(Date.now() - 6 * 864e5));
  app().innerHTML = !mine.length ? `<div class="card center"><div class="big">📈</div><p>No sets logged yet. Your progress shows up here.</p></div>` : `
    <div class="stats"><div><b>${days.filter((d) => d >= weekAgo).length}</b><small>days this week</small></div>
      <div><b>${days.length}</b><small>total days</small></div><div><b>${mine.length}</b><small>sets logged</small></div></div>
    <h3>By exercise</h3>
    <div class="hist">${exs.map((ex) => {
      const best = bestPerDay(mine.filter((l) => l.ex === ex)); const b = best[best.length - 1];
      const vals = best.map((x) => (+x.kg || 0) || x.reps);
      return `<a class="hrow" href="#/p/${pid}/history/${encodeURIComponent(ex)}"><div><b>${esc(exInfo(ex).name)}</b>
        <small>${fmtDay(b.day)} · best ${b.kg ? +b.kg + ' kg × ' : ''}${b.reps}</small></div>${spark(vals.slice(-12))}</a>`;
    }).join('')}</div>`;
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
    <details class="card" open><summary>🛡️ Rules</summary><ul>${(plan.rules || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>
    <details class="card"><summary>📈 How to progress</summary><ul>${(plan.progression || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>
    ${WEEK.map((d) => { const sk = plan.weekly[d]; const s = sk && plan.sessions[sk];
      return `<details class="card"><summary><b>${DAY_NAME[d]}</b> · ${s ? esc(s.title) : 'Rest'}</summary>${s ? `<table class="pt">${s.items.map((it) =>
        `<tr><td>${esc(exInfo(it.ex).name)}${it.alt ? `<br><small class="muted">or ${it.alt.map((a) => esc(exInfo(a).name)).join(', ')}</small>` : ''}</td><td>${it.sets}×${esc(it.reps)}</td></tr>`).join('')}</table>` : ''}</details>`;
    }).join('')}`;
}

function viewSettings(pid) {
  setTitle('Settings', pid ? `#/p/${pid}` : '#/'); nav(pid, 'settings');
  const last = LS.get('lastSync', 0);
  app().innerHTML = `
    <div class="card"><h3>☁️ Sync</h3>
      ${!CLOUD ? '<p>This is the <b>demo</b>: logs are saved on this phone only. Cloud sync turns on when the family server is connected.</p>'
        : Sync.authed() ? `<p>Signed in as the family. ${Sync.pending()} set(s) waiting.<br><small class="muted">Last sync: ${last ? new Date(last).toLocaleString() : 'never'}</small></p>
            ${Sync.err ? `<p class="badtxt">${esc(Sync.err)}</p>` : ''}
            <button class="primary" id="syncnow">Sync now</button> <button class="ghost" id="logout">Sign out</button>`
        : `<p>Enter the family code to save workouts to the cloud (once per phone).</p>
            <input id="code" type="password" inputmode="numeric" placeholder="Family code" autocomplete="current-password">
            <button class="primary" id="login">Sign in</button>`}
    </div>
    <div class="card"><h3>📋 Plans</h3><p class="muted">Plans load from the internet each time the app opens, so changes show up without an app update.</p>
      <ul>${S.index.profiles.map((p) => `<li>${esc(p.name)}: v${esc(S.plans[p.id]?.version || '?')}</li>`).join('')}</ul>
      <button class="ghost" id="reload">Reload plans now</button></div>
    <div class="card"><h3>💾 Backup</h3><p class="muted">Download every logged set as a spreadsheet (CSV).</p><button class="ghost" id="csv">Export CSV</button></div>
    <p class="muted small center">Family Gym v${APP_VERSION}<br>Exercise photos & base instructions: free-exercise-db (public domain).</p>`;
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
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `family-gym-${dayStr()}.csv`; a.click();
  };
}

function notFound() { setTitle('Not found', '#/'); nav(null); app().innerHTML = '<div class="card center"><p>That page does not exist.</p><a class="btn primary" href="#/">Home</a></div>'; }

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
    if (h[2] === 'settings') return viewSettings(pid);
  }
  if (h[0] === 'settings') return viewSettings(LS.get('profile', null));
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
