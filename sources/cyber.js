/**
 * CISA — Cybersecurity & Infrastructure Security Agency
 * Two feeds:
 *   1. Known Exploited Vulnerabilities (KEV) — CVEs actively exploited right now
 *   2. Cybersecurity Alerts & Advisories RSS — high-impact threat bulletins
 * Free JSON + RSS. No key required.
 */
const { getJSON } = require('./_util');

const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

async function fetchSource(lat, lon, radius) {
  const events = [];
  try {
    const j = await getJSON(KEV_URL);
    const vulns = (j.vulnerabilities || [])
      .filter(v => v.dateAdded && Date.now() - Date.parse(v.dateAdded) < 14 * 86400000) // last 14 days
      .sort((a, b) => Date.parse(b.dateAdded) - Date.parse(a.dateAdded))
      .slice(0, 15);

    for (const v of vulns) {
      const ransomware = v.knownRansomwareCampaignUse === 'Known';
      events.push({
        id: 'cisa-' + v.cveID,
        category: 'cyber', severity: ransomware ? 'critical' : 'warning',
        title: `🔐 ${v.cveID}: ${v.vulnerabilityName}`.slice(0, 120),
        lat: lat, lon: lon, // cyber threats are location-agnostic
        time: Date.parse(v.dateAdded) || Date.now(),
        address: `${v.vendorProject} — ${v.product}`.slice(0, 80),
        url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
        verified: true, major: ransomware,
        meta: {
          cve: v.cveID,
          ransomware,
          dueDate: v.dueDate,
          action: v.requiredAction
        }
      });
    }
  } catch (e) { /* non-fatal — cyber feed is best-effort */ }
  return events;
}

module.exports = {
  id: 'cisa', name: 'CISA Cyber Threats', coverage: 'global',
  covers: null, fetch: fetchSource
};
