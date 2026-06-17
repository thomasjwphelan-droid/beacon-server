/**
 * GDACS — UN Global Disaster Awareness & Coordination System
 * Covers: earthquakes, floods, cyclones, volcanoes, droughts, wildfires
 * Free, no key. Updated continuously. Alert levels: Red/Orange/Green.
 */
const { haversine, getJSON, categorize, sevFor } = require('./_util');

async function fetchSource(lat, lon, radius) {
  // GeoJSON event list — last 30 days, all hazard types
  const j = await getJSON(
    'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?' +
    'alertlevel=Green,Orange,Red&eventlist=EQ,FL,TC,VO,WF,DR&limit=100',
    { headers: { 'Accept': 'application/json' } }
  );
  const events = [];
  for (const f of (j.features || [])) {
    const p = f.properties || {};
    const g = f.geometry;
    if (!g) continue;
    let elat, elon;
    if (g.type === 'Point') { elon = g.coordinates[0]; elat = g.coordinates[1]; }
    else continue;
    if (!isFinite(elat) || !isFinite(elon)) continue;
    // GDACS is inherently a curated "significant events only" feed (~100 records,
    // already filtered to real disasters) — no need to cut by distance at all.
    // Distance is computed for display/sorting only.

    const alert = (p.alertlevel || '').toLowerCase(); // red / orange / green
    const sev = alert === 'red' ? 'critical' : alert === 'orange' ? 'warning' : 'watch';
    const typCode = p.eventtype || '';
    const cat = typCode === 'EQ' ? 'quake' : typCode === 'FL' ? 'flood'
      : typCode === 'TC' ? 'storm' : typCode === 'VO' ? 'other'
      : typCode === 'WF' ? 'fire' : 'other';

    events.push({
      id: 'gdacs-' + (p.eventid || p.episodeid || elat),
      category: cat, severity: sev,
      title: (p.htmldescription || p.name || p.eventname || 'GDACS event')
        .replace(/<[^>]*>/g, '').slice(0, 120),
      lat: elat, lon: elon,
      time: Date.parse(p.todate || p.fromdate) || Date.now(),
      address: p.iso3 || p.country || '',
      url: p.url?.report || 'https://gdacs.org',
      verified: true, major: sev === 'critical'
    });
  }
  return events;
}

module.exports = {
  id: 'gdacs', name: 'GDACS (UN)', coverage: 'global',
  covers: null, fetch: fetchSource
};
