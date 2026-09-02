// Pure helpers for the verify agent — no I/O, no model, so they can be unit
// tested (test/verifica.test.mjs) without running the script.

// The CLI's output carries banner/progress noise — including TRUNCATED json
// fragments from tool results whose braces never close (which would poison
// a brace-matcher). The model's actual answer always sits on its own
// line(s), so: try to parse every line that starts with { or [, joining up
// to 6 following lines for pretty-printed output.
export const extractJson = (text, expectedKey) => {
  if (!text) throw new Error('no model output')
  const parsed = []
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1])
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t.startsWith('{') && !t.startsWith('[')) continue
    for (let j = i; j < Math.min(i + 6, lines.length); j++) {
      const chunk = lines.slice(i, j + 1).join('\n').trim()
      if (!/^[[{]/.test(chunk)) break
      try { parsed.push(JSON.parse(chunk)); break } catch { /* keep joining */ }
    }
  }
  for (const raw of fenced) {
    try { parsed.push(JSON.parse(raw.trim())) } catch { /* skip */ }
  }
  if (!parsed.length) throw new Error('no JSON in model output')
  if (expectedKey) {
    const hit = parsed.reverse().find((p) => p && typeof p === 'object' && !Array.isArray(p) && expectedKey in p)
    if (hit) return hit
  }
  const obj = parsed.find((p) => p && typeof p === 'object' && !Array.isArray(p))
  return obj || parsed[0]
}

export const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)

// Same business, different wording: "Coffee Shop & Sandwich Bar (Recently
// Renovated)" vs "Coffee Shop and Sandwich Bar". Strip parentheticals and
// the "and/&" difference before comparing.
export const nameKey = (s) =>
  String(s).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '')

// Not what we are shopping for, whatever the portal's category says.
export const OFF_CATEGORY = /fish\s*(and|&|n)?\s*chip|chippy|kebab|takeaway|hot food|pizza delivery|chinese|indian restaurant/i

// Tags that duplicate (and outlive) the status badge.
export const STATUS_TAG = /^(under offer|for sale|sold|withdrawn|gone|on the market)$/i

// A link is only worth storing if it points at a specific listing page:
// https, a real path, and not a search engine's results page — the model
// sometimes hands back the query it ran instead of the page it found.
export const okUrl = (u) => {
  try {
    const { protocol, hostname, pathname } = new URL(String(u))
    return protocol === 'https:'
      && !/(^|\.)(google|bing|duckduckgo|yandex|search)\./.test(hostname)
      && pathname.length > 1
  } catch {
    return false
  }
}

// A failed verdict (no model, quota, transient auth) — never lets it
// overwrite a real verification.
export const isFailedVerdict = (res) =>
  res.outcome === 'unclear' && /verdict unavailable|no model|quota exhausted/i.test(res.note || '')

// How many consecutive genuine "unclear" verdicts before a listing is parked
// as stale (the portal is unreachable and nothing else mentions it).
export const STALE_AFTER = 4

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)

// Verification cadence — the cost control. Every run still costs a model
// call per listing checked, so check what can change: active listings
// often, parked ones rarely, anything never checked at once. `force`
// (a manual run or the app's Verify button) bypasses it.
export function needsCheck(l, today, force = false) {
  if (force) return true
  if (!l.lastChecked) return true
  const age = daysBetween(l.lastChecked, today)
  if (l.status === 'gone' || l.status === 'stale') return age >= 7
  return age >= 2
}

export function mergeVerification(db, id, res, today) {
  const l = db.listings.find((x) => x.id === id)
  if (!l) return null
  if (isFailedVerdict(res)) return l
  l.lastChecked = today
  // Take the canonical URL the verifier actually landed on, even over one we
  // already had: a stored link that points at the wrong page is exactly what
  // a re-verify should repair. Only a confirmed sighting may overwrite.
  if (okUrl(res.url) && (!l.url || res.outcome === 'live' || res.outcome === 'changed'))
    l.url = res.url
  if (res.image && /^https:\/\//.test(res.image) && !l.image) l.image = res.image
  if (res.address && !l.address) l.address = String(res.address).slice(0, 120)
  // Coordinates: geocoded-from-address ones are exact and win; the model's
  // own guesses only fill in when we hold nothing exact.
  if (Number.isFinite(res.lat) && Number.isFinite(res.lng) && Math.abs(res.lat) < 58 && Math.abs(res.lng) < 5) {
    if (res.coordsExact) { l.lat = +res.lat; l.lng = +res.lng; l.coordsExact = true }
    else if (!l.coordsExact) { l.lat = +res.lat; l.lng = +res.lng }
  }
  let changed = false
  if (res.price != null && l.price != null && res.price !== l.price) {
    l.history = [...(l.history || []), { date: today, price: l.price }]
    l.price = res.price
    res.outcome = res.outcome === 'live' ? 'changed' : res.outcome
    changed = true
  } else if (res.price != null && l.price == null) {
    l.price = res.price
    changed = true
  }
  if (res.outcome === 'gone' && l.status !== 'gone') { l.status = 'gone'; changed = true }
  if (res.outcome === 'live' && (l.status === 'gone' || l.status === 'stale')) { l.status = 'active'; changed = true }

  // Stale rule: a listing nobody can see any more (portal walled, no
  // snippets) is parked after STALE_AFTER genuine unclears in a row, so it
  // stops costing a daily check and stops looking "for sale".
  if (res.outcome === 'unclear') {
    l.unclearStreak = (l.unclearStreak || 0) + 1
    if (l.unclearStreak >= STALE_AFTER && l.status === 'active') { l.status = 'stale'; changed = true }
  } else {
    l.unclearStreak = 0
    l.lastVerified = today
  }
  if (changed) l.lastChanged = today

  // Tags are editorial, but a few of them assert a market state the badge
  // already shows — and go stale the moment the verdict moves. Drop those.
  if (Array.isArray(l.tags)) l.tags = l.tags.filter((t) => !STATUS_TAG.test(String(t).trim()))
  l.verification = { outcome: res.outcome, note: res.note || '', date: today }
  return l
}

export function mergeDiscovery(db, found, today) {
  const ids = new Set(db.listings.map((l) => l.id))
  const names = new Set(db.listings.map((l) => nameKey(l.name)))
  let added = 0
  for (const f of found) {
    if (!f || !f.name || !f.area) continue
    if (names.has(nameKey(f.name))) continue // same business, different portal/wording
    // Out of scope no matter what the model says: freeholds, takeaway
    // categories, and anything priced beyond a small going-concern.
    if (/freehold/i.test(String(f.tenure || '') + ' ' + String(f.name || ''))) continue
    if (OFF_CATEGORY.test(String(f.name || ''))) continue
    if (f.price != null && Number.isFinite(+f.price) && +f.price > 90000) continue
    let id = slug(f.id || f.name)
    while (ids.has(id)) id = id + '-2'
    if (!/^[a-z0-9-]{2,60}$/.test(id)) continue
    ids.add(id)
    names.add(nameKey(f.name))
    const num = (v) => (f[v] != null && Number.isFinite(+f[v]) ? +f[v] : null)
    db.listings.push({
      id,
      name: String(f.name).slice(0, 90),
      area: String(f.area).slice(0, 40),
      price: num('price'),
      tenure: String(f.tenure || 'Leasehold').slice(0, 40),
      rent: num('rent'),
      turnover: num('turnover'),
      profit: num('profit'),
      status: 'active',
      tags: ['agent find'],
      notes: String(f.notes || '').slice(0, 240),
      source: `agent discovery (${today})`,
      url: okUrl(f.url) ? f.url : null,
      image: /^https:\/\//.test(f.image || '') ? f.image : null,
      address: f.address ? String(f.address).slice(0, 120) : null,
      lat: Number.isFinite(+f.lat) ? +f.lat : null,
      lng: Number.isFinite(+f.lng) ? +f.lng : null,
      lastChecked: today,
      lastVerified: today,
      lastChanged: today,
      verification: { outcome: 'live', note: 'found by discovery scan', date: today },
    })
    added++
  }
  while (db.listings.length > 24) {
    const i = db.listings.findIndex((l) => l.status === 'gone' || l.status === 'stale')
    db.listings.splice(i === -1 ? 0 : i, 1)
  }
  return added
}
