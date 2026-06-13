/**
 * US City CAD — real dispatched 911 incidents from city open-data portals.
 * Coverage: cities with public Socrata feeds. Auto-selected by bounding box.
 * Add a city = one entry in CITIES.
 */
const { haversine, getJSON, categorize, sevFor } = require('./_util');

const CITIES = [
  {
    name: 'Seattle Fire 911', lat: 47.61, lon: -122.33, radiusKm: 30,
    url: 'https://data.seattle.gov/resource/kzjm-xkqj.json?$order=datetime%20DESC&$limit=80',
    map: r => ({ type: r.type, lat: +r.latitude, lon: +r.longitude, address: r.address, time: Date.parse(r.datetime), id: r.incident_number })
  },
  {
    name: 'San Francisco Fire', lat: 37.77, lon: -122.42, radiusKm: 25,
    url: 'https://data.sfgov.org/resource/nuek-vuh3.json?$order=received_dttm%20DESC&$limit=80',
    map: r => ({ type: r.call_type, lat: r.case_location ? +r.case_location.coordinates[1] : null, lon: r.case_location ? +r.case_location.coordinates[0] : null, address: r.address, time: Date.parse(r.received_dttm), id: r.id })
  }
];

function covers(lat, lon) {
  return CITIES.some(c => haversine(lat, lon, c.lat, c.lon) <= c.radiusKm);
}

async function fetchSource(lat, lon, radius) {
  const city = CITIES.find(c => haversine(lat, lon, c.lat, c.lon) <= c.radiusKm);
  if (!city) return [];
  const rows = await getJSON(city.url);
  const events = [];
  for (const r of (Array.isArray(rows) ? rows : []).slice(0, 80)) {
    const m = city.map(r);
    if (m.lat == null || !isFinite(m.lat)) continue;
    if (Date.now() - (m.time || 0) > 24 * 3600 * 1000) continue;
    const cat = categorize(m.type);
    events.push({
      id: city.name.slice(0, 3).toLowerCase() + '-' + (m.id || m.lat + '' + m.time),
      category: cat, severity: sevFor(cat),
      title: (m.type || 'Dispatch') + (m.address ? ' — ' + m.address : ''),
      lat: m.lat, lon: m.lon, time: m.time || Date.now(),
      address: m.address || '', url: '#', verified: true
    });
  }
  return events;
}

module.exports = { id: 'uscad', name: 'US City 911 CAD', coverage: 'select US cities', covers, fetch: fetchSource };
