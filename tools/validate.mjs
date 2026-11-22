// Validates plans/*.json against exercises/catalog.json.
// Runs in CI before every deploy so a typo in a plan never reaches the phones.
//   node tools/validate.mjs
import { readFileSync } from 'node:fs';

const errors = [];
const read = (p) => {
  try { return JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8')); }
  catch (e) { errors.push(`${p}: invalid JSON (${e.message})`); return null; }
};

const catalog = read('exercises/catalog.json');
const ids = new Set((catalog?.exercises || []).map((e) => e.id));
const index = read('plans/index.json');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const LOADS = ['kg', 'bw'];
const seen = new Set();

// version.json drives the in-app "App updates" card, so it must match the shipped app.js.
const ver = read('version.json');
const appVer = (readFileSync(new URL('../app.js', import.meta.url), 'utf8').match(/APP_VERSION = '([\d.]+)'/) || [])[1];
if (ver && ver.web !== appVer) errors.push(`version.json: web "${ver.web}" must equal APP_VERSION "${appVer}" in app.js`);
if (ver && !/^\d+\.\d+\.\d+$/.test(ver.apk || '')) errors.push('version.json: apk must be x.y.z');

for (const prof of index?.profiles || []) {
  const where = `plans/index.json [${prof.id}]`;
  if (!/^[a-z0-9-]{1,32}$/.test(prof.id || '')) errors.push(`${where}: id must be lowercase letters/digits/-`);
  if (seen.has(prof.id)) errors.push(`${where}: duplicate profile id`);
  seen.add(prof.id);
  if (!prof.name) errors.push(`${where}: missing name`);
  const plan = read('plans/' + prof.plan);
  if (!plan) continue;
  const p = 'plans/' + prof.plan;
  if (plan.id !== prof.id) errors.push(`${p}: "id" must be "${prof.id}"`);
  if (!plan.version) errors.push(`${p}: missing "version"`);
  const sessions = plan.sessions || {};
  for (const d of DAYS) {
    const s = plan.weekly?.[d];
    if (s === undefined) errors.push(`${p}: weekly.${d} missing (use null for a rest day)`);
    else if (s !== null && !sessions[s]) errors.push(`${p}: weekly.${d} = "${s}" but there is no session "${s}"`);
  }
  for (const [key, s] of Object.entries(sessions)) {
    if (!s.title) errors.push(`${p}: session ${key} missing title`);
    if (!Array.isArray(s.items) || !s.items.length) { errors.push(`${p}: session ${key} has no items`); continue; }
    s.items.forEach((it, i) => {
      const w = `${p}: ${key} item ${i + 1}`;
      if (!ids.has(it.ex)) errors.push(`${w}: unknown exercise "${it.ex}" (see exercises/catalog.json)`);
      for (const a of it.alt || []) if (!ids.has(a)) errors.push(`${w}: unknown alt exercise "${a}"`);
      if (!Number.isInteger(it.sets) || it.sets < 1 || it.sets > 10) errors.push(`${w}: sets must be 1-10`);
      if (!/^\d+(-\d+)?$/.test(String(it.reps ?? ''))) errors.push(`${w}: reps must look like "12" or "10-15"`);
      if (it.load && !LOADS.includes(it.load)) errors.push(`${w}: load must be "kg" or "bw"`);
      if (it.rest !== undefined && !(it.rest >= 0 && it.rest <= 600)) errors.push(`${w}: rest must be 0-600 seconds`);
    });
  }
}

if (errors.length) { console.error('❌ Plan check failed:\n - ' + errors.join('\n - ')); process.exit(1); }
console.log(`✅ ${seen.size} profiles, ${ids.size} exercises: all plans valid`);
