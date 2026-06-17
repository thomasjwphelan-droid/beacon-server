/**
 * USGS — earthquakes, global. No key. Always-on baseline source.
 * Shows everything nearby, plus significant quakes anywhere on Earth —
 * "around the world" awareness was being silently cut by an over-tight
 * radius filter; fixed to: all M2.5+ within 1000km, or M4.5+ anywhere.
 */
const { haversine } = require('./_util');

async function fetchSource(lat, lon, radius) {
  const r = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
  if (!r.ok) throw new Error('usgs ' + r.status);
  const j = await r.json();
  const events = [];
  for (const f of (j.features || [])) {
    const m = f.properties.mag; if (m == null) continue;
    const elat = f.geometry.coordinates[1], elon = f.geometry.coordinates[0];
    const d = haversine(lat, lon, elat, elon);
    // near you: show everything. far away: only if it's actually significant.
    const isNear = d <= Math.max(radius, 1000);
    const isSignificant = m >= 4.5;
    if (!isNear && !isSignificant) continue;
    const tsu = f.properties.tsunami === 1;
    events.push({
      id: 'us-' + f.id,
      category: tsu ? 'tsunami' : 'quake',
      severity: tsu || m >= 6 ? 'critical' : m >= 4.5 ? 'warning' : 'watch',
      title: (tsu ? 'TSUNAMI flag · ' : '') + 'M' + m.toFixed(1) + ' — ' + (f.properties.place || ''),
      lat: elat, lon: elon, time: f.properties.time,
      address: f.properties.place || '', url: f.properties.url, verified: true
    });
  }
  return events;
}

module.exports = { id: 'usgs', name: 'USGS Earthquakes', coverage: 'global', covers: null, fetch: fetchSource };
