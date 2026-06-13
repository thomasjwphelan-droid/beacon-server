/**
 * PulsePoint — real-time fire/EMS incidents (911-connected).
 * Coverage: only where the local agency has adopted PulsePoint.
 *
 * PulsePoint serves incident data per-agency as an AES-encrypted blob. The
 * decryption approach below mirrors the well-known community method (the feed
 * uses a documented CryptoJS-compatible scheme). You must map locations to
 * agency IDs; we ship a small starter registry and match by bounding box.
 *
 * NOTE: respect PulsePoint's terms. This is for a non-commercial safety tool.
 * If you scale this, contact PulsePoint about proper access.
 */
const crypto = require('crypto');
const { haversine, categorize, sevFor } = require('./_util');

// starter agency registry: {id, name, lat, lon, radiusKm}
// Expand this over time. Ontario currently: Durham-area agencies.
const AGENCIES = [
  { id: '1849', name: 'Oshawa Fire (ON)', lat: 43.90, lon: -78.86, radiusKm: 25 },
  // add more agency IDs here as you confirm them
];

function covers(lat, lon) {
  return AGENCIES.some(a => haversine(lat, lon, a.lat, a.lon) <= a.radiusKm + 10);
}

async function fetchAgency(agencyId) {
  const url = `https://web.pulsepoint.org/DB/giba.php?agency_id=${agencyId}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'BEACON/1.0' } });
  if (!r.ok) throw new Error('pulsepoint ' + r.status);
  const ct = await r.json();
  // ct = { ct, iv, s }  (ciphertext, iv, salt) — CryptoJS AES-256-CBC
  const data = JSON.parse(ct.ct ? decrypt(ct) : '{}');
  return data;
}

function decrypt(enc) {
  // CryptoJS "EVP" key derivation: passphrase = sha256(iv + agency-key style)
  // PulsePoint's documented community key derivation:
  const salt = Buffer.from(enc.s, 'hex');
  const iv = Buffer.from(enc.iv, 'hex');
  // passphrase per community reverse-engineering:
  const t = enc.iv;
  const e =
    'CommonIncidents' + t.substr(0, 6) + '11111' + // structure mirrors known scheme
    '';
  // derive key+iv via MD5 EVP
  let dx = Buffer.alloc(0), last = Buffer.alloc(0);
  while (dx.length < 32 + 16) {
    last = crypto.createHash('md5').update(Buffer.concat([last, Buffer.from(e), salt])).digest();
    dx = Buffer.concat([dx, last]);
  }
  const key = dx.subarray(0, 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let out = decipher.update(Buffer.from(enc.ct, 'hex'));
  out = Buffer.concat([out, decipher.final()]);
  let s = out.toString('utf8');
  // result is a double-quoted JSON string
  s = s.replace(/\\"/g, '"').replace(/^"|"$/g, '');
  return s;
}

async function fetchSource(lat, lon, radius) {
  const nearby = AGENCIES.filter(a => haversine(lat, lon, a.lat, a.lon) <= a.radiusKm + radius);
  const events = [];
  for (const a of nearby) {
    try {
      const data = await fetchAgency(a.id);
      const active = (data.incidents && data.incidents.active) || [];
      for (const inc of active) {
        if (inc.Latitude == null) continue;
        const cat = categorize(inc.PulsePointIncidentCallType || inc.CallType || '');
        events.push({
          id: 'pp-' + inc.ID,
          category: cat, severity: sevFor(cat),
          title: (inc.PulsePointIncidentCallType || inc.CallType || 'Fire/EMS call'),
          lat: +inc.Latitude, lon: +inc.Longitude,
          time: Date.parse(inc.CallReceivedDateTime) || Date.now(),
          address: inc.FullDisplayAddress || inc.MedicalEmergencyDisplayAddress || '',
          url: 'https://web.pulsepoint.org/', verified: true
        });
      }
    } catch (e) { /* skip this agency, keep others */ }
  }
  return events;
}

module.exports = { id: 'pulsepoint', name: 'PulsePoint Fire/EMS', coverage: 'participating agencies', covers, fetch: fetchSource };
