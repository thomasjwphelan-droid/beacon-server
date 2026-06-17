/**
 * NOAA/NWS — US National Weather Service active alerts
 * Covers: tornadoes, hurricanes, floods, winter storms, extreme heat
 * Real 911-connected official warnings. Free GeoJSON, no key.
 */
const { haversine, categorize, sevFor } = require('./_util');

async function fetchSource(lat, lon, radius) {
  // only query within rough US bounding box (saves pointless requests elsewhere)
  if (lat < 18 || lat > 72 || lon < -180 || lon > -60) return [];
  const events = [];
  try {
    const r = await fetch(
      'https://api.weather.gov/alerts/active?status=actual&message_type=alert&severity=Severe,Extreme&limit=150',
      { headers: { 'Accept': 'application/geo+json', 'User-Agent': 'BEACON/2.0' } }
    );
    if (!r.ok) return [];
    const j = await r.json();
    for (const f of (j.features || [])) {
      const p = f.properties || {};
      const g = f.geometry;
      if (!g || g.type !== 'Polygon') continue;
      const cs = g.coordinates[0] || [];
      const elon = cs.reduce((s, x) => s + x[0], 0) / cs.length;
      const elat = cs.reduce((s, x) => s + x[1], 0) / cs.length;
      if (haversine(lat, lon, elat, elon) > radius + 150) continue;
      const evName = p.event || 'Weather alert';
      const sev = p.severity === 'Extreme' ? 'critical' : 'warning';
      const cat = categorize(evName);
      events.push({
        id: 'nws-' + (f.id || evName + elat.toFixed(2)),
        category: cat === 'other' ? 'storm' : cat, severity: sev,
        title: `🌪 NWS: ${evName} — ${(p.areaDesc || '').split(';')[0]}`.slice(0, 120),
        lat: elat, lon: elon,
        time: Date.parse(p.sent) || Date.now(),
        address: p.areaDesc || '', url: 'https://alerts.weather.gov/',
        verified: true, major: sev === 'critical'
      });
    }
  } catch (e) { /* non-fatal */ }
  return events;
}

module.exports = {
  id: 'nwsalerts', name: 'NWS Severe Weather', coverage: 'United States',
  covers: (lat, lon) => lat >= 18 && lat <= 72 && lon >= -180 && lon <= -60,
  fetch: fetchSource
};
