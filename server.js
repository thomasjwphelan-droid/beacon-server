/**
 * BEACON backend — location-aware incident aggregator v2
 * ======================================================
 * GET /events?lat=43.45&lon=-80.49&radius=40
 *   -> { location, meta, sources, events, summary }
 *
 * GET /health
 *   -> detailed health check with per-source status
 *
 * GET /sources
 *   -> list all sources and their coverage areas
 *
 * Normalized event shape:
 *   { id, source, sourceName, category, severity, title,
 *     lat, lon, time, address, url, verified, distance? }
 *
 * ENV:
 *   PORT          default 8080
 *   CACHE_SECS    default 60  — how long to cache per location bucket
 *   MAX_RADIUS    default 500 — hard cap on radius (km)
 *   LOG_REQUESTS  default 1   — set to 0 to silence request logs
 */

'use strict';
const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');

/* ─── config ─────────────────────────────────────────────────────────── */
const PORT        = parseInt(process.env.PORT)       || 8080;
const CACHE_MS    = (parseInt(process.env.CACHE_SECS) || 60) * 1000;
const MAX_RADIUS  = parseInt(process.env.MAX_RADIUS) || 500;
const LOG_REQ     = process.env.LOG_REQUESTS !== '0';

/* ─── load source modules (skip _util and other helpers) ─────────────── */
const SOURCES_DIR = path.join(__dirname, 'sources');
const sources = fs.readdirSync(SOURCES_DIR)
  .filter(f => f.endsWith('.js') && !f.startsWith('_'))
  .map(f => {
    try {
      const mod = require(path.join(SOURCES_DIR, f));
      // validate shape
      if (!mod.id || !mod.name || typeof mod.fetch !== 'function') {
        console.warn(`[BEACON] skipping ${f} — missing id, name, or fetch()`);
        return null;
      }
      return mod;
    } catch (e) {
      console.error(`[BEACON] failed to load ${f}:`, e.message);
      return null;
    }
  })
  .filter(Boolean);

console.log(`[BEACON] loaded ${sources.length} sources: ${sources.map(s => s.id).join(', ')}`);

/* ─── per-source health tracking ─────────────────────────────────────── */
const health = {};
sources.forEach(s => { health[s.id] = { ok: null, lastOk: null, lastErr: null, errors: 0, calls: 0 }; });

function recordOk(id)  { const h = health[id]; h.ok = true;  h.lastOk  = Date.now(); h.calls++; }
function recordErr(id, msg) { const h = health[id]; h.ok = false; h.lastErr = Date.now(); h.errors++; h.calls++; h.lastMsg = msg; }

/* ─── in-memory cache ─────────────────────────────────────────────────── */
const cache = new Map();
const keyFor = (lat, lon, r) => `${lat.toFixed(2)},${lon.toFixed(2)},${r}`;

// auto-clean old cache entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.t > CACHE_MS * 5) cache.delete(k);
}, 5 * 60 * 1000);

/* ─── haversine (for distance enrichment) ────────────────────────────── */
function haversine(aLat, aLon, bLat, bLon) {
  const R = 6371, p = Math.PI / 180;
  const x = (bLat - aLat) * p, y = (bLon - aLon) * p;
  const h = Math.sin(x / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(y / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/* ─── timeout wrapper ────────────────────────────────────────────────── */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms))
  ]);
}

/* ─── express setup ──────────────────────────────────────────────────── */
const app = express();
app.use(cors());
app.use(express.json());

// request logger
app.use((req, _, next) => {
  if (LOG_REQ) console.log(`[BEACON] ${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

/* ─── GET / — health check ───────────────────────────────────────────── */
app.get('/', (_, res) => res.json({
  ok: true,
  service: 'beacon-aggregator',
  version: '2.0.0',
  uptime: Math.round(process.uptime()) + 's',
  sources: sources.map(s => ({
    id: s.id, name: s.name, coverage: s.coverage || 'unspecified',
    health: health[s.id]
  })),
  cache: { entries: cache.size, ttlSeconds: CACHE_MS / 1000 }
}));

/* ─── GET /sources — list all sources ────────────────────────────────── */
app.get('/sources', (_, res) => res.json({
  count: sources.length,
  sources: sources.map(s => ({
    id: s.id, name: s.name,
    coverage: s.coverage || 'unspecified',
    hasCoverageCheck: typeof s.covers === 'function'
  }))
}));

/* ─── GET /health — per-source health ────────────────────────────────── */
app.get('/health', (_, res) => {
  const allOk = sources.every(s => health[s.id].ok !== false);
  res.status(allOk ? 200 : 207).json({
    ok: allOk, uptime: Math.round(process.uptime()) + 's',
    sources: sources.map(s => ({ id: s.id, name: s.name, ...health[s.id] }))
  });
});

/* ─── GET /events — main endpoint ────────────────────────────────────── */
app.get('/events', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const radius = Math.min(Math.abs(parseFloat(req.query.radius) || 40), MAX_RADIUS);

  if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Valid lat (-90–90) and lon (-180–180) are required.' });
  }

  // serve from cache if fresh
  const ck = keyFor(lat, lon, radius);
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < CACHE_MS) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(hit.data);
  }
  res.setHeader('X-Cache', 'MISS');

  // figure out which sources cover this point
  const applicable  = sources.filter(s => !s.covers || s.covers(lat, lon));
  const inapplicable = sources.filter(s =>  s.covers && !s.covers(lat, lon));

  // fetch from all applicable sources in parallel, with per-source timeout
  const results = await Promise.allSettled(
    applicable.map(s =>
      withTimeout(s.fetch(lat, lon, radius), 9000, s.name)
        .then(events => { recordOk(s.id); return { s, events: events || [] }; })
        .catch(e  => { recordErr(s.id, e.message); throw e; })
    )
  );

  const out = {
    location: { lat, lon, radius },
    generated: Date.now(),
    sources: [],
    events: []
  };

  // process results
  for (let i = 0; i < results.length; i++) {
    const r = results[i], s = applicable[i];
    if (r.status === 'fulfilled') {
      const evs = r.value.events.map(e => ({
        ...e,
        source: s.id,
        sourceName: s.name,
        // enrich with distance from request point if event has coords
        distance: (e.lat != null && e.lon != null)
          ? haversine(lat, lon, e.lat, e.lon)
          : null
      }));
      out.events.push(...evs);
      out.sources.push({ id: s.id, name: s.name, status: 'ok', count: evs.length });
    } else {
      out.sources.push({
        id: s.id, name: s.name, status: 'error',
        error: String(r.reason?.message || r.reason).slice(0, 160)
      });
    }
  }

  // report sources that don't cover this location honestly
  for (const s of inapplicable) {
    out.sources.push({ id: s.id, name: s.name, status: 'no-coverage' });
  }

  // sort events: severity first, then recency
  const sevOrder = { critical: 0, warning: 1, watch: 2 };
  out.events.sort((a, b) => {
    const sd = (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3);
    return sd !== 0 ? sd : (b.time || 0) - (a.time || 0);
  });

  // summary block — useful for the app's status line
  out.summary = {
    total: out.events.length,
    critical: out.events.filter(e => e.severity === 'critical').length,
    warning:  out.events.filter(e => e.severity === 'warning').length,
    watch:    out.events.filter(e => e.severity === 'watch').length,
    sourcesLive: out.sources.filter(s => s.status === 'ok').length,
    sourcesDown: out.sources.filter(s => s.status === 'error').length,
    sourcesNotCovering: out.sources.filter(s => s.status === 'no-coverage').length
  };

  cache.set(ck, { t: Date.now(), data: out });
  res.json(out);
});

/* ─── 404 handler ────────────────────────────────────────────────────── */
app.use((req, res) => res.status(404).json({
  error: 'Not found',
  available: ['GET /', 'GET /health', 'GET /sources', 'GET /events?lat=&lon=&radius=']
}));

/* ─── global error handler ───────────────────────────────────────────── */
app.use((err, req, res, _next) => {
  console.error('[BEACON] unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

/* ─── start ──────────────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`[BEACON] aggregator v2 running on :${PORT}`);
  console.log(`[BEACON] ${sources.length} sources ready | cache TTL: ${CACHE_MS / 1000}s`);
});
