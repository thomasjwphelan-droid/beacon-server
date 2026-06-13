/**
 * BEACON backend — location-aware incident aggregator
 * ===================================================
 * The app sends a location (lat, lon). The backend figures out which real
 * incident sources cover that point, queries them, normalizes everything into
 * one event shape, and returns it. Add a new source = drop a file in sources/.
 *
 *   GET /events?lat=43.45&lon=-80.49&radius=40
 *     -> { location, sources: [{id,name,status,count}], events: [ ...normalized ] }
 *
 * Normalized event shape:
 *   { id, source, category, severity, title, lat, lon, time, address, url, verified }
 *
 * ENV: PORT (default 8080). Per-source keys documented in each source file.
 */
const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 8080;
const app = express();
app.use(cors());

// load every source module in sources/
const fs = require('fs');
const path = require('path');
const sources = fs.readdirSync(path.join(__dirname, 'sources'))
  .filter(f => f.endsWith('.js'))
  .map(f => require('./sources/' + f));
console.log('Loaded sources:', sources.map(s => s.id).join(', '));

// tiny in-memory cache so we don't hammer upstreams (60s per location bucket)
const cache = new Map();
const CACHE_MS = 60000;
const keyFor = (lat, lon, r) => `${lat.toFixed(2)},${lon.toFixed(2)},${r}`;

app.get('/', (_, res) => res.json({
  ok: true, service: 'beacon-aggregator',
  sources: sources.map(s => ({ id: s.id, name: s.name, coverage: s.coverage }))
}));

app.get('/events', async (req, res) => {
  const lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
  const radius = Math.min(parseFloat(req.query.radius) || 40, 500);
  if (!isFinite(lat) || !isFinite(lon)) return res.status(400).json({ error: 'lat and lon required' });

  const ck = keyFor(lat, lon, radius);
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < CACHE_MS) return res.json(hit.data);

  // ask only the sources whose coverage includes this point
  const applicable = sources.filter(s => !s.covers || s.covers(lat, lon));
  const results = await Promise.allSettled(applicable.map(s =>
    withTimeout(s.fetch(lat, lon, radius), 8000).then(events => ({ s, events }))
  ));

  const out = { location: { lat, lon, radius }, generated: Date.now(), sources: [], events: [] };
  for (let i = 0; i < results.length; i++) {
    const r = results[i], s = applicable[i];
    if (r.status === 'fulfilled') {
      const evs = (r.value.events || []).map(e => ({ ...e, source: s.id }));
      out.events.push(...evs);
      out.sources.push({ id: s.id, name: s.name, status: 'ok', count: evs.length });
    } else {
      out.sources.push({ id: s.id, name: s.name, status: 'error', error: String(r.reason).slice(0, 120) });
    }
  }
  // also report sources that DON'T cover this location, so the app can be honest about gaps
  for (const s of sources) {
    if (s.covers && !s.covers(lat, lon))
      out.sources.push({ id: s.id, name: s.name, status: 'no-coverage' });
  }
  out.events.sort((a, b) => (b.time || 0) - (a.time || 0));

  cache.set(ck, { t: Date.now(), data: out });
  res.json(out);
});

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

app.listen(PORT, () => console.log(`BEACON aggregator on :${PORT}`));
