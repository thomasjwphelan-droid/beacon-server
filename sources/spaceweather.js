/**
 * NOAA SWPC — Space Weather Prediction Center
 * Covers: geomagnetic storms (G-scale), solar radiation (S-scale), radio blackouts (R-scale)
 * Real aurora warnings, satellite/power grid/GPS disruption alerts. Free JSON, no key.
 */
const { getJSON } = require('./_util');

// SWPC JSON endpoints (no key, CORS-open)
const SCALES_URL   = 'https://services.swpc.noaa.gov/products/noaa-scales.json';
const ALERTS_URL   = 'https://services.swpc.noaa.gov/products/alerts.json';
const KP_URL       = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';

async function fetchSource(lat, lon, radius) {
  const events = [];
  // G/S/R scale current levels
  try {
    const scales = await getJSON(SCALES_URL);
    // format: { "0": { "G": {"Scale":"1","Text":"..."}, "S": ..., "R": ... }, "-1": {...}, ... }
    const cur = scales['0'] || {};
    const checks = [
      ['G', 'Geomagnetic storm', 'storm', { '1': 'watch', '2': 'watch', '3': 'warning', '4': 'warning', '5': 'critical' }],
      ['S', 'Solar radiation storm', 'other', { '1': 'watch', '2': 'watch', '3': 'warning', '4': 'critical', '5': 'critical' }],
      ['R', 'Radio blackout', 'other', { '1': 'watch', '2': 'watch', '3': 'warning', '4': 'warning', '5': 'critical' }]
    ];
    for (const [key, label, cat, sevMap] of checks) {
      const level = parseInt(cur[key]?.Scale);
      if (!level || level < 1) continue;
      events.push({
        id: `swpc-${key}-${Date.now()}`,
        category: cat, severity: sevMap[level] || 'watch',
        title: `☀️ Space weather: ${label} (${key}${level}) — ${cur[key]?.Text || ''}`.slice(0, 120),
        lat: lat, lon: lon, // space weather affects location
        time: Date.now(),
        address: 'Global / your location',
        url: 'https://www.swpc.noaa.gov/noaa-scales-education',
        verified: true, major: level >= 4
      });
    }
  } catch (e) { /* non-fatal */ }

  // active alerts from SWPC
  try {
    const alerts = await getJSON(ALERTS_URL);
    for (const a of (Array.isArray(alerts) ? alerts : []).slice(0, 5)) {
      const msg = a.message || '';
      if (!msg.includes('WARNING') && !msg.includes('ALERT') && !msg.includes('WATCH')) continue;
      const isMajor = msg.includes('WARNING') || msg.includes('ALERT');
      events.push({
        id: 'swpc-alert-' + (a.issue_datetime || '').replace(/\s/g, ''),
        category: 'other', severity: isMajor ? 'warning' : 'watch',
        title: '☀️ SWPC: ' + msg.split('\n')[0].slice(0, 110),
        lat: lat, lon: lon,
        time: Date.parse(a.issue_datetime) || Date.now(),
        address: 'Space weather — global impact',
        url: 'https://www.swpc.noaa.gov',
        verified: true, major: false
      });
    }
  } catch (e) { /* non-fatal */ }

  return events;
}

module.exports = {
  id: 'spaceweather', name: 'NOAA Space Weather', coverage: 'global',
  covers: null, fetch: fetchSource
};
