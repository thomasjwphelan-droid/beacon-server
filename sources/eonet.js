/**
 * NASA EONET — natural events (wildfires, severe storms, volcanoes) worldwide.
 */
const { haversine, categorize, sevFor } = require('./_util');

async function fetchSource(lat, lon, radius) {
  const r = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=10');
  if (!r.ok) throw new Error('eonet ' + r.status);
  const j = await r.json();
  const events = [];
  for (const ev of (j.events || [])) {
    const g = ev.geometry && ev.geometry[ev.geometry.length - 1]; if (!g) continue;
    let elon, elat;
    if (g.type === 'Point') [elon, elat] = g.coordinates;
    else if (g.type === 'Polygon') [elon, elat] = g.coordinates[0][0];
    else continue;
    const catId = ev.categories[0]?.id || '';
    if (catId === 'earthquakes') continue;
    // EONET tracks open natural events worldwide (~100-200 active at once) —
    // a global situational-awareness app should show all of them, not just
    // ones within a tight radius. Distance is attached for sorting only.
    const d = haversine(lat, lon, elat, elon);
    const cat = categorize(ev.title) === 'other'
      ? (catId === 'wildfires' ? 'fire' : catId === 'volcanoes' ? 'other' : catId === 'severeStorms' ? 'storm' : 'other')
      : categorize(ev.title);
    events.push({
      id: 'eo-' + ev.id, category: cat, severity: sevFor(cat),
      title: ev.title, lat: elat, lon: elon,
      time: new Date(g.date).getTime(), address: '', url: ev.sources[0]?.url || '#', verified: true
    });
  }
  return events;
}

module.exports = { id: 'eonet', name: 'NASA EONET', coverage: 'global', covers: null, fetch: fetchSource };
