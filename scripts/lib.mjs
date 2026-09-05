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

// What kind of business a listing is. Stored on the record when the agent
// says so; inferred from the name otherwise (older records, seed data).
export const CATEGORIES = ['cafe', 'restaurant', 'dessert', 'bar', 'premises']

export const categoryOf = (l) => {
  if (l.category && CATEGORIES.includes(l.category)) return l.category
  const s = `${l.name || ''} ${l.tenure || ''}`.toLowerCase()
  if (/to let|lease only|premises|vacant unit|fitted unit/.test(s)) return 'premises'
  // "sandwich bar" / "coffee bar" / "snack bar" are cafés, not bars.
  if (/pub|tavern|wine bar|cocktail|\bbar\b(?!.*(sandwich|coffee|snack|salad|juice))/.test(s)
    && !/(sandwich|coffee|snack|salad|juice)\s+bar/.test(s)) return 'bar'
  if (/restaurant|bistro|brasserie|trattoria|pizzeria|diner|eatery|grill/.test(s)) return 'restaurant'
  if (/caf[eé]|coffee|tea ?room|sandwich|deli/.test(s)) return 'cafe'
  if (/dessert|ice cream|gelat|bubble tea|matcha|cake|bakery|patisserie|chocolate/.test(s)) return 'dessert'
  return 'cafe'
}

// Asking-price ceiling per category for discovery: a restaurant carries
// more kit and covers than a café, so its band sits higher.
export const PRICE_CAP = { cafe: 90000, dessert: 90000, bar: 120000, restaurant: 150000, premises: 60000 }

// ————— places ——————————————————————————————————

// Edinburgh districts with a centre point — the fixed vocabulary the area
// filter uses, so discovery's "Central Edinburgh" / "Morningside/Bruntsfi…"
// collapse onto one chip each. Nearest centre within 1.4 km wins.
export const DISTRICTS = [
  ['Shandon', 55.9312, -3.2210], ['Polwarth', 55.9345, -3.2160], ['Merchiston', 55.9330, -3.2100],
  ['Bruntsfield', 55.9382, -3.2095], ['Morningside', 55.9269, -3.2090], ['Marchmont', 55.9363, -3.1878],
  ['Fountainbridge', 55.9420, -3.2115], ['Slateford', 55.9295, -3.2380], ['Gorgie', 55.9375, -3.2330],
  ['Dalry', 55.9420, -3.2230], ['Haymarket', 55.9455, -3.2185], ['West End', 55.9490, -3.2090],
  ['Old Town', 55.9490, -3.1900], ['New Town', 55.9545, -3.1985], ['Stockbridge', 55.9585, -3.2085],
  ['Tollcross', 55.9435, -3.2035], ['Southside', 55.9430, -3.1830], ['Newington', 55.9375, -3.1780],
  ['Leith', 55.9720, -3.1720], ['Leith Walk', 55.9620, -3.1780], ['Corstorphine', 55.9440, -3.2870],
  ['Comely Bank', 55.9575, -3.2200], ['Portobello', 55.9530, -3.1140], ['Broughton', 55.9590, -3.1880],
]

const R = 6371000
export const metres = (aLat, aLng, bLat, bLng) => {
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function districtOf(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  let best = null
  for (const [name, dlat, dlng] of DISTRICTS) {
    const d = metres(lat, lng, dlat, dlng)
    if (d <= 1400 && (!best || d < best.d)) best = { name, d }
  }
  return best ? best.name : null
}

// Free-text area from a portal → one of our districts, by keyword. Used
// until exact coordinates settle it properly. Order matters: first hit wins,
// so streets come before the generic "city centre".
const AREA_WORDS = [
  ['shandon', 'Shandon'], ['polwarth', 'Polwarth'], ['merchiston', 'Merchiston'], ['bruntsfield', 'Bruntsfield'],
  ['morningside', 'Morningside'], ['comiston', 'Morningside'], ['marchmont', 'Marchmont'], ['fountainbridge', 'Fountainbridge'],
  ['slateford', 'Slateford'], ['gorgie', 'Gorgie'], ['dalry', 'Dalry'], ['haymarket', 'Haymarket'],
  ['shandwick', 'West End'], ['palmerston', 'West End'], ['west end', 'West End'], ['royal mile', 'Old Town'],
  ['old town', 'Old Town'], ['grassmarket', 'Old Town'], ['new town', 'New Town'], ['george street', 'New Town'],
  ['castle street', 'New Town'], ['stockbridge', 'Stockbridge'], ['tollcross', 'Tollcross'], ['southside', 'Southside'],
  ['newington', 'Newington'], ['leith walk', 'Leith Walk'], ['elm row', 'Leith Walk'], ['leith', 'Leith'],
  ['corstorphine', 'Corstorphine'], ['comely bank', 'Comely Bank'], ['portobello', 'Portobello'], ['broughton', 'Broughton'],
  ['city centre', 'City Centre'], ['central', 'City Centre'],
]

export function normaliseArea(text) {
  const s = String(text || '').toLowerCase()
  // Earliest mention in the text wins ("Morningside/Bruntsfield" → Morningside).
  let best = null
  for (const [word, district] of AREA_WORDS) {
    const i = s.indexOf(word)
    if (i !== -1 && (best === null || i < best.i)) best = { i, district }
  }
  if (best) return best.district
  return String(text || '').replace(/,?\s*edinburgh.*$/i, '').trim() || 'Edinburgh'
}

// Days since a listing was first seen by us (or, for seeds, first recorded).
export const daysListed = (l, today) => {
  const from = l.firstSeen || (l.history && l.history[0] && l.history[0].date) || l.lastVerified
  if (!from) return null
  const d = Math.round((new Date(today) - new Date(from)) / 86400000)
  return Number.isFinite(d) && d >= 0 ? d : null
}

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

// Listing anchors on a portal's category page, per portal. Each pattern is
// the path shape of ONE listing (never a search, a contact form, a
// franchise pitch or a saved-search alert), so the model gets handed the
// real listing URL instead of inventing one.
export const LISTING_PATHS = [
  /\/listing\//, // Daltons
  /\/properties\/property\//, // The Restaurant Agency
  /\/commercial-property-for-sale\/property-\d+/, // Rightmove Commercial
  /^https?:\/\/uk\.businessesforsale\.com\/uk\/[^/?#]+\.aspx$/, // BusinessesForSale
  /\/p\/business-for-sale\/[^/]+\/\d+/, // Gumtree
  /^https?:\/\/altiusgroup\.co\.uk\/business\/[^/]+\/?$/, // Altius Group (Bruce & Co)
  /^https?:\/\/scottishbusinessagency\.co\.uk\/[^/]+-for-sale\/?$/, // Scottish Business Agency
  /^https?:\/\/www\.cornerstoneba\.co\.uk\/business-search\/[^/]+\/?$/, // Cornerstone Business Agents
]
const NOT_LISTING = /\/contact|\/franchises\/|[?&](save|alert)=|\/search\//i

export function listingLinks(html, origin, max = 40) {
  const links = []
  const seen = new Set()
  for (const m of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].startsWith('http') ? m[1] : origin + (m[1].startsWith('/') ? '' : '/') + m[1]
    if (NOT_LISTING.test(href) || !LISTING_PATHS.some((re) => re.test(href))) continue
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text || seen.has(href) || text.length < 6) continue
    seen.add(href)
    links.push({ text: text.slice(0, 80), href })
    if (links.length >= max) break
  }
  return links
}

// ————— photos ——————————————————————————————————
//
// The listing's own gallery from its page. Portals mark the gallery one
// way or another — a swipebox/slider class on the <img>, a property id in
// the media path — and pad the page with thumbnails of other listings,
// logos, floor plans and agent portraits, which is what the filters are for.
const PHOTO_BAD = /logo|icon|sprite|avatar|placeholder|badge|flag|pixel|spacer|blank|loading|arrow|button|banner|advert|\/ads?\/|favicon|\.svg|\.gif|floor-?plan|epc|agent|profile|staff|team/i
const GALLERY_CLASS = /swipebox|gallery|slider|carousel|swiper|lightbox|property-image|listing-image|photo/i
const IMAGE_EXT = /\.(jpe?g|png|webp)(\?|#|$)/i
// WordPress-style size suffix: -300x200. Under 800 wide it is a thumbnail.
const SIZE_SUFFIX = /-(\d{2,4})x(\d{2,4})(?=\.(?:jpe?g|png|webp)(?:\?|#|$))/i

// The same photo at another size, in another format, or "-scaled": one key.
const photoKey = (u) => u.replace(/[?#].*$/, '').replace(SIZE_SUFFIX, '').replace(/-(scaled|original)(?=\.\w+$)/, '').replace(/\.(jpe?g|png|webp)$/i, '')
const dirOf = (u) => u.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '/')

export function extractPhotos(html, pageUrl, max = 8) {
  const found = []
  const seen = new Set()
  const add = (raw, rank) => {
    let u
    try { u = new URL(String(raw).trim().replace(/\\\//g, '/'), pageUrl).href } catch { return }
    // The Restaurant Agency serves the gallery as small tiles; the large
    // file sits at the same path under property_large.
    u = u.replace('/property_small/', '/property_large/')
    if (!/^https:\/\//.test(u) || !IMAGE_EXT.test(u) || PHOTO_BAD.test(u)) return
    const size = SIZE_SUFFIX.exec(u)
    if (size && +size[1] < 800) return // a thumbnail of something
    const k = photoKey(u)
    if (seen.has(k)) return
    seen.add(k)
    found.push({ u, rank })
  }
  const largest = (srcset) => {
    const cands = srcset.split(',').map((p) => p.trim().split(/\s+/)).filter((p) => p[0])
    cands.sort((a, b) => (parseInt(b[1]) || 0) - (parseInt(a[1]) || 0))
    return cands[0] && cands[0][0]
  }

  // 1. The page's own headline photo.
  for (const m of html.matchAll(/<meta[^>]+property="og:image(?::secure_url)?"[^>]+content="([^"]+)"/gi)) add(m[1], 0)
  for (const m of html.matchAll(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/gi)) add(m[1], 0)

  // 2. Images the page itself marks as the gallery, or that live under the
  //    listing's own media id (OnTheMarket: /properties/<id>/…/image-N).
  const idMatch = /\/(\d{6,})\/?/.exec(new URL(pageUrl).pathname)
  const ownId = idMatch && idMatch[1]
  for (const m of html.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = m[1]
    const cls = /class="([^"]*)"/i.exec(attrs)?.[1] || ''
    const src = /(?:data-src|data-lazy-src|data-original|src)="([^"]+)"/i.exec(attrs)?.[1]
    const set = /(?:data-srcset|srcset)="([^"]+)"/i.exec(attrs)?.[1]
    const best = (set && largest(set)) || src
    if (!best) continue
    const own = ownId && best.includes(`/${ownId}/`)
    if (GALLERY_CLASS.test(cls) || own) add(best, 1)
    else add(best, 2)
  }

  // Which of the candidates are THIS listing's: the ones under its own media
  // id; else the ones in the headline photo's folder (a portal uploads one
  // listing's photos together, and its "similar listings" carousel lives
  // elsewhere); else whatever the page marks as gallery; else the large
  // unmarked images.
  const own = ownId ? found.filter((f) => f.u.includes(`/${ownId}/`)) : []
  const head = found.find((f) => f.rank === 0)
  const sameDir = head ? found.filter((f) => dirOf(f.u) === dirOf(head.u)) : []
  const marked = found.filter((f) => f.rank <= 1)
  const large = found.filter((f) => f.rank <= 1 || !SIZE_SUFFIX.test(f.u) || +SIZE_SUFFIX.exec(f.u)[1] >= 1000)
  const pick = own.length >= 2 ? own : sameDir.length >= 2 ? sameDir : marked.length >= 2 ? marked : large
  return pick.sort((a, b) => a.rank - b.rank).map((f) => f.u).slice(0, max)
}

// The listing's gallery after a fetch: what we hold first, the new photos
// after, no repeats, never more than eight.
export function mergePhotos(l, photos) {
  const all = [...(l.images || []), ...(l.image ? [l.image] : []), ...(photos || [])]
  const seen = new Set()
  const out = []
  for (const u of all) {
    if (!u || !/^https:\/\//.test(u)) continue
    const k = photoKey(u)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(u)
    if (out.length >= 8) break
  }
  if (out.length) { l.images = out; if (!l.image) l.image = out[0] }
  return out.length
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

// Facts a verification may fill in, with a sanity ceiling each (a model
// that reads "£1.2m" for a café's rent has read the wrong line).
export const FACTS = [
  ['rent', 200000], ['turnover', 3000000], ['profit', 1000000],
  ['leaseYears', 99], ['rateableValue', 500000], ['covers', 300], ['sqft', 20000],
]

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
  if (Array.isArray(res.images) && res.images.length && (!l.images || l.images.length < 2)) mergePhotos(l, res.images.slice(0, 6))
  if (res.address && !l.address) l.address = String(res.address).slice(0, 120)
  // Coordinates: geocoded-from-address ones are exact and win; the model's
  // own guesses only fill in when we hold nothing exact.
  if (Number.isFinite(res.lat) && Number.isFinite(res.lng) && Math.abs(res.lat) < 58 && Math.abs(res.lng) < 5) {
    if (res.coordsExact) { l.lat = +res.lat; l.lng = +res.lng; l.coordsExact = true }
    else if (!l.coordsExact) { l.lat = +res.lat; l.lng = +res.lng }
  }
  // Exact coordinates settle the district; the portal's free-text area
  // ("Central Edinburgh", "Morningside/Bruntsfi…") only stands until then.
  if (l.coordsExact) { const d = districtOf(l.lat, l.lng); if (d) l.area = d }
  if (res.place && typeof res.place === 'object') l.place = { ...res.place, at: today }
  // Deal facts the advert states (rent, turnover, lease left, rateable
  // value…): they fill blanks and never overwrite — an earlier figure may
  // be the one you negotiated on, and a model reading a snippet is not a
  // better source than a stored one.
  for (const [k, max] of FACTS) {
    const v = Number(res[k])
    if (l[k] == null && Number.isFinite(v) && v > 0 && v <= max) l[k] = Math.round(v)
  }
  if (!l.firstSeen) l.firstSeen = (l.history && l.history[0] && l.history[0].date) || l.lastVerified || today
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

// Words that say nothing about WHICH café an advert is for.
const GENERIC = new Set(['cafe', 'café', 'coffee', 'shop', 'store', 'restaurant', 'bistro', 'edinburgh', 'business', 'opportunity',
  'leasehold', 'sale', 'fitted', 'fully', 'central', 'centre', 'city', 'established', 'superb', 'immaculate', 'popular', 'busy',
  'profitable', 'outstanding', 'beautifully', 'presented', 'prominent', 'unique', 'small', 'large', 'lease', 'rent', 'low', 'long'])
const distinctive = (name) => new Set(String(name || '').toLowerCase().match(/[a-zà-ÿ]{5,}/g)?.filter((w) => !GENERIC.has(w)) || [])

// The same business on two portals has the same asking price and either
// shares a word that actually identifies it ("matcha", "class") or sits in
// the same district in the same category — two £35k cafés in Morningside
// on the same day are one café with two headlines.
export const sameBusiness = (a, b) => {
  if (a.url && b.url && a.url === b.url) return true
  if (a.price == null || b.price == null || +a.price !== +b.price) return false
  const wa = distinctive(a.name)
  for (const w of distinctive(b.name)) if (wa.has(w)) return true
  return normaliseArea(a.area) === normaliseArea(b.area) && categoryOf(a) === categoryOf(b)
}

export function mergeDiscovery(db, found, today) {
  const ids = new Set(db.listings.map((l) => l.id))
  const names = new Set(db.listings.map((l) => nameKey(l.name)))
  let added = 0
  for (const f of found) {
    if (!f || !f.name || !f.area) continue
    if (names.has(nameKey(f.name))) continue // same business, different portal/wording
    if (db.listings.some((l) => sameBusiness(l, f))) continue // same business, different headline
    // Out of scope no matter what the model says: freeholds, takeaway
    // categories, and anything priced beyond a small going-concern.
    if (/freehold/i.test(String(f.tenure || '') + ' ' + String(f.name || ''))) continue
    if (OFF_CATEGORY.test(String(f.name || ''))) continue
    const category = categoryOf(f)
    if (f.price != null && Number.isFinite(+f.price) && +f.price > PRICE_CAP[category]) continue
    if (f.rent != null && Number.isFinite(+f.rent) && +f.rent > RENT_CAP[category]) continue
    let id = slug(f.id || f.name)
    while (ids.has(id)) id = id + '-2'
    if (!/^[a-z0-9-]{2,60}$/.test(id)) continue
    ids.add(id)
    names.add(nameKey(f.name))
    const num = (v) => (f[v] != null && Number.isFinite(+f[v]) ? +f[v] : null)
    db.listings.push({
      id,
      name: String(f.name).slice(0, 90),
      area: normaliseArea(f.area),
      category,
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
      firstSeen: today,
      lastChecked: today,
      lastVerified: today,
      lastChanged: today,
      verification: { outcome: 'live', note: 'found by discovery scan', date: today },
    })
    added++
  }
  // Keep the file bounded, but only ever by dropping listings that are
  // already off the market: an active listing is never evicted to make
  // room (the old cap of 24 threw out Bennitos and the Morningside café
  // the first time discovery found more than a handful).
  while (db.listings.length > MAX_LISTINGS) {
    const i = db.listings.findIndex((l) => l.status === 'gone' || l.status === 'stale')
    if (i === -1) break
    db.listings.splice(i, 1)
  }
  return added
}

export const MAX_LISTINGS = 60

// Annual rent beyond which a find is not this plan, whatever the price
// says: the concept is anchored on £14k, and even a restaurant at three
// times that is a different business.
export const RENT_CAP = { cafe: 30000, dessert: 30000, bar: 60000, restaurant: 60000, premises: 45000 }
