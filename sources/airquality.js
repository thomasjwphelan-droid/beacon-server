/**
 * OpenAQ — Global Air Quality (open-source, no key for basic use)
 * Supplements Environment Canada AQHI with global coverage.
 * Falls back gracefully — air quality is informational, not critical-path.
 */
const { haversine } = require('./_util');

async function fetchSource(lat, lon, radius) {
  const events = [];
  try {
    // OpenAQ v3 — measurements near location
    const url = `https://api.openaq.org/v3/locations?coordinates=${lat},${lon}&radius=${Math.min(radius * 1000, 100000)}&limit=20&order_by=distance`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) return [];
    const j = await r.json();
    for (const loc of (j.results || []).slice(0, 8)) {
      // find PM2.5 or AQI reading
      const sensors = loc.sensors || [];
      const pm25 = sensors.find(s => s.parameter?.name?.toLowerCase().includes('pm25') || s.parameter?.displayName?.includes('PM2.5'));
      const aqi = sensors.find(s => s.parameter?.name?.toLowerCase().includes('aqi'));
      const reading = pm25 || aqi;
      if (!reading) continue;
      const val = reading.summary?.median || reading.summary?.mean;
      if (!val) continue;
      // classify
      const sev = val > 150 ? 'critical' : val > 55 ? 'warning' : val > 12 ? 'watch' : null;
      if (!sev) continue; // only surface elevated readings
      const d = haversine(lat, lon, loc.coordinates?.latitude || lat, loc.coordinates?.longitude || lon);
      events.push({
        id: 'aq-' + loc.id,
        category: 'air', severity: sev,
        title: `🫁 Air quality elevated: ${reading.parameter?.displayName || 'PM2.5'} ${val.toFixed(0)} μg/m³ — ${loc.name}`.slice(0, 120),
        lat: loc.coordinates?.latitude || lat,
        lon: loc.coordinates?.longitude || lon,
        time: Date.now(),
        address: [loc.city, loc.country?.code].filter(Boolean).join(', '),
        url: `https://openaq.org/locations/${loc.id}`,
        verified: true, major: sev === 'critical'
      });
    }
  } catch (e) { /* non-fatal */ }
  return events;
}

module.exports = {
  id: 'airquality', name: 'OpenAQ Air Quality', coverage: 'global',
  covers: null, fetch: fetchSource
};
