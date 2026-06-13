// shared helpers for source modules
const R = 6371;
function haversine(aLat, aLon, bLat, bLon) {
  const p = Math.PI / 180, x = (bLat - aLat) * p, y = (bLon - aLon) * p;
  const h = Math.sin(x / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
async function getJSON(url, opts = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': 'BEACON/1.0 (safety aggregator)' }, ...opts });
  if (!r.ok) throw new Error(url.split('?')[0] + ' -> ' + r.status);
  return r.json();
}
// categorize a free-text incident/call type into BEACON categories
function categorize(t) {
  const s = (t || '').toLowerCase();
  if (/tsunami/.test(s)) return 'tsunami';
  if (/quake|earthquake|seismic/.test(s)) return 'quake';
  if (/fire|smoke|burn|flame/.test(s)) return 'fire';
  if (/flood|water rescue|swift|river/.test(s)) return 'flood';
  if (/hazmat|gas|chemical|spill|co alarm|carbon monoxide/.test(s)) return 'hazmat';
  if (/storm|tornado|wind|hurricane|thunder/.test(s)) return 'storm';
  if (/medical|cardiac|breathing|injury|fall|overdose|unconscious/.test(s)) return 'medical';
  if (/collision|mvc|mva|crash|vehicle|traffic/.test(s)) return 'traffic';
  if (/assault|weapon|shoot|stab|robbery|gun/.test(s)) return 'police';
  return 'other';
}
const sevFor = c => ['tsunami', 'fire', 'hazmat', 'quake'].includes(c) ? 'warning'
  : ['flood', 'storm', 'police'].includes(c) ? 'warning' : 'watch';

module.exports = { haversine, getJSON, categorize, sevFor };
