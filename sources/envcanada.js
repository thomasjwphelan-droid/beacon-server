/**
 * Environment Canada (MSC GeoMet) — official weather alerts + river levels.
 * Coverage: all of Canada. No key. This is the authoritative Canadian source.
 */
const { haversine, getJSON, categorize, sevFor } = require('./_util');

function covers(lat, lon) {
  // rough Canada bounding box
  return lat >= 41 && lat <= 84 && lon >= -141 && lon <= -52;
}

async function fetchSource(lat, lon, radius) {
  const events = [];
  // weather alerts
  try {
    const j = await getJSON('https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=500');
    for (const f of (j.features || [])) {
      const p = f.properties || {}, g = f.geometry; if (!g) continue;
      let elat, elon;
      if (g.type === 'Point') [elon, elat] = g.coordinates;
      else {
        const cs = (g.coordinates || []).flat(g.type === 'MultiPolygon' ? 2 : 1);
        if (!cs.length) continue;
        elon = cs.reduce((s, x) => s + x[0], 0) / cs.length;
        elat = cs.reduce((s, x) => s + x[1], 0) / cs.length;
      }
      if (haversine(lat, lon, elat, elon) > radius + 80) continue;
      const name = p.alert_name || p.headline || p.alert_type || 'Weather alert';
      const cat = categorize(name);
      events.push({
        id: 'ec-' + (f.id || name + elat.toFixed(2)),
        category: cat === 'other' ? 'storm' : cat,
        severity: /warning/i.test(p.alert_type || name) ? 'warning' : 'watch',
        title: name, lat: elat, lon: elon,
        time: Date.parse(p.effective || p.sent) || Date.now(),
        address: p.area || '', url: 'https://weather.gc.ca/warnings/index_e.html', verified: true
      });
    }
  } catch (e) { /* keep going */ }
  // river gauges (flood signal)
  try {
    const d = 0.6, bb = [lon - d, lat - d, lon + d, lat + d].join(',');
    const j = await getJSON(`https://api.weather.gc.ca/collections/hydrometric-realtime/items?bbox=${bb}&f=json&limit=200`);
    const seen = {};
    for (const f of (j.features || [])) {
      const p = f.properties || {}, s = p.STATION_NUMBER; if (!s) continue;
      const t = Date.parse(p.DATETIME) || 0;
      if (!seen[s] || t > seen[s].t) seen[s] = { t, f, lvl: p.LEVEL, name: p.STATION_NAME };
    }
    for (const k in seen) {
      const o = seen[k];
      events.push({
        id: 'hy-' + k, category: 'flood', severity: 'watch',
        title: 'River gauge: ' + (o.name || k) + (o.lvl != null ? ` (${(+o.lvl).toFixed(2)} m)` : ''),
        lat: o.f.geometry.coordinates[1], lon: o.f.geometry.coordinates[0],
        time: o.t || Date.now(), address: '', url: 'https://wateroffice.ec.gc.ca', verified: true
      });
    }
  } catch (e) { /* keep going */ }
  return events;
}

module.exports = { id: 'envcanada', name: 'Environment Canada', coverage: 'Canada', covers, fetch: fetchSource };
