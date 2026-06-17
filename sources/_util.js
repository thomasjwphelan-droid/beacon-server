'use strict';
const R = 6371;

function haversine(aLat, aLon, bLat, bLon) {
  const p = Math.PI / 180, x = (bLat - aLat) * p, y = (bLon - aLon) * p;
  const h = Math.sin(x/2)**2 + Math.cos(aLat*p)*Math.cos(bLat*p)*Math.sin(y/2)**2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

async function getJSON(url, opts = {}) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'BEACON/2.0 (public-safety-aggregator)' },
    ...opts
  });
  if (!r.ok) throw new Error(url.split('?')[0] + ' → ' + r.status);
  return r.json();
}

function categorize(t) {
  const s = (t || '').toLowerCase();
  if (/tsunami/.test(s))                                          return 'tsunami';
  if (/quake|earthquake|seismic/.test(s))                        return 'quake';
  if (/fire|smoke|burn|flame|wildfire/.test(s))                  return 'fire';
  if (/flood|water rescue|swift water|river|surge/.test(s))      return 'flood';
  if (/hazmat|gas|chemical|spill|co alarm|carbon monoxide/.test(s)) return 'hazmat';
  if (/storm|tornado|wind|hurricane|thunder|cyclone/.test(s))    return 'storm';
  if (/medical|cardiac|breathing|injury|fall|overdose|uncons/.test(s)) return 'medical';
  if (/collision|mvc|mva|crash|vehicle|traffic/.test(s))         return 'traffic';
  if (/assault|weapon|shoot|stab|robbery|gun|suspect/.test(s))   return 'police';
  if (/cyber|malware|ransomware|exploit|cve|breach|hack/.test(s)) return 'cyber';
  if (/air quality|pm2\.5|aqi|smog|smoke/.test(s))               return 'air';
  if (/geomagnetic|solar|aurora|radiation|space weather/.test(s)) return 'space';
  return 'other';
}

const SEV_ORDER = { critical: 0, warning: 1, watch: 2, other: 3 };
function sevFor(c) {
  if (['tsunami', 'fire', 'hazmat', 'quake', 'cyber'].includes(c)) return 'warning';
  if (['flood', 'storm', 'police', 'space'].includes(c))           return 'warning';
  return 'watch';
}

module.exports = { haversine, getJSON, categorize, sevFor, SEV_ORDER };
