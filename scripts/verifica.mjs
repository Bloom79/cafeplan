// CafePlan verify agent — keeps public/listings.json honest.
//
// The whole agent is the GitHub Copilot CLI (`copilot -p ...`) on the
// owner's Copilot subscription: it searches the live web itself (built-in
// web search), which also gets past Rightbiz's anti-bot wall via search
// snippets and indexed pages.
//
// Cost: verification runs on gpt-5-mini — measured at ~0.3 credits per
// listing with search, versus ~6 on the default model — so a daily sweep of
// the whole watchlist is ~80 credits/month. Due diligence (Analyse) keeps
// the default model: it is on demand and the judgement matters more.
// VERIFY_MODEL / ANALYSE_MODEL override either. Optional ANTHROPIC_API_KEY
// falls back to the Anthropic API (server-side web_search) if Copilot is
// unavailable.
//
// Modes (first match wins):
//   env ISSUE_BODY set   → single request from the app: "Verifica:" re-checks
//                          one listing, "Analizza:" runs due diligence. Posts
//                          the report as the issue comment the app polls,
//                          closes the issue.
//   --all                → daily run: verify what is due (cadence in
//                          lib.mjs: active every 2 days, parked weekly;
//                          --force checks everything) + --discover scans
//                          for new Edinburgh going-concerns.
//   --test <id>          → one local verification, no GitHub plumbing.
//   --dry                → no model, no network: prints the plan (testing).
//
// Never exits non-zero: workflows branch on the `status` GITHUB_OUTPUT.

import { appendFileSync, readFileSync, writeFileSync } from 'fs'
import { spawnSync as run } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { districtOf, extractJson, listingLinks, mergeDiscovery, mergeVerification, metres, nameKey, needsCheck, normaliseArea } from './lib.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'public', 'listings.json')
const TODAY = new Date().toISOString().slice(0, 10)

const VERIFY_MODEL = process.env.VERIFY_MODEL || 'gpt-5-mini'
const ANALYSE_MODEL = process.env.ANALYSE_MODEL || '' // '' = subscription default

const out = (k, v) => {
  console.log(`${k}=${v}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`)
}

const readDb = () => JSON.parse(readFileSync(DATA, 'utf8'))
const writeDb = (db) => writeFileSync(DATA, JSON.stringify(db, null, 2) + '\n')

// ————— the model ——————————————————————————————————

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Set when Copilot reports the monthly premium-request quota is spent —
// retrying is pointless until it resets on the 1st, so every caller can
// stop early and say so plainly instead of leaving cryptic "unverified"s.
export let quotaExhausted = false
export const QUOTA_NOTE = 'Copilot monthly quota exhausted — checks resume automatically when it resets on the 1st'

async function copilot(prompt, model) {
  if (quotaExhausted) return null
  const args = ['-p', prompt]
  if (model) args.push('--model', model)
  // The token check hits api.github.com and can fail transiently; retry a
  // couple of times before giving up.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = run('copilot', args, {
      encoding: 'utf8',
      timeout: 300000,
      maxBuffer: 20e6,
      env: process.env,
    })
    // The answer goes to stdout; banner/status/credits go to stderr. A
    // non-zero exit can coexist with a fine answer (e.g. a web fetch was
    // permission-denied mid-run) — trust stdout when it carries JSON.
    const stdout = (res.stdout || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim()
    const stderr = (res.stderr || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim()
    if (stdout && /[[{]/.test(stdout)) {
      if (process.env.VERIFY_DEBUG) console.log('—— copilot raw ——\n' + stdout.slice(0, 1500) + '\n——————')
      return stdout
    }
    if (/exceeded your monthly quota/i.test(stderr)) {
      quotaExhausted = true
      console.log('—— copilot: monthly quota exhausted; skipping further model calls')
      return null
    }
    if (process.env.VERIFY_DEBUG)
      console.log(`—— copilot attempt ${attempt} failed: status=${res.status} error=${res.error ? res.error.code : 'none'} stderr=${stderr.slice(0, 200)}`)
    if (/not authorized|unauthorized|invalid token/i.test(stderr) && attempt >= 2) return null
    if (attempt < 3) await sleep(15000)
  }
  return null
}

async function anthropic(prompt) {
  if (!process.env.ANTHROPIC_API_KEY) return null
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic()
    const resp = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4000,
      system: 'You verify UK businesses-for-sale listings. Search the web for current evidence. Reply with ONLY the requested JSON or Markdown.',
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
      messages: [{ role: 'user', content: prompt }],
    })
    if (resp.stop_reason === 'refusal') return null
    return resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
  } catch (e) {
    console.log('  anthropic fallback failed: ' + e.message)
    return null
  }
}

async function judge(prompt, model = VERIFY_MODEL) {
  return (await copilot(prompt, model)) || (await anthropic(prompt))
}

// Free geocoding for the listing's street address (Nominatim, 1 req/s
// policy). Only runs when the model surfaced an address and we do not yet
// hold exact coordinates — area centroids get replaced, exact ones kept.
async function geocode(address) {
  try {
    const q = encodeURIComponent(`${address}, Edinburgh, UK`)
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`, {
      headers: { 'User-Agent': 'cafeplan-verify-agent (github.com/Bloom79/cafeplan)' },
    })
    if (!res.ok) return null
    const [hit] = await res.json()
    if (!hit) return null
    const lat = +hit.lat, lng = +hit.lon
    // Sanity: inside greater Edinburgh.
    if (lat < 55.85 || lat > 56.02 || lng < -3.45 || lng > -3.05) return null
    return { lat, lng }
  } catch {
    return null
  }
}

// ————— place facts from OpenStreetMap —————————————————
//
// What the fit score used to guess from the area name, measured: cafés and
// restaurants within 300 m (competition), metres to the Union Canal, and
// to the nearest bus/tram stop. Overpass is free and rate-limited: one
// query per listing, mirrors tried in turn, ~1 s between calls.

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

async function overpass(q) {
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        // Overpass wants a plain, identifying UA — browser strings get 406.
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'cafeplan-verify-agent/1.0 (github.com/Bloom79/cafeplan)' },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(25000),
      })
      if (res.ok) return (await res.json()).elements || []
    } catch { /* try the next mirror */ }
  }
  return null
}

async function placeFacts(lat, lng) {
  const q = `[out:json][timeout:20];
(
  nwr(around:300,${lat},${lng})["amenity"~"^(cafe|restaurant)$"];
  nwr(around:2500,${lat},${lng})["waterway"="canal"];
  nwr(around:600,${lat},${lng})["highway"="bus_stop"];
  nwr(around:600,${lat},${lng})["railway"="tram_stop"];
);
out geom;`
  const els = await overpass(q)
  if (!els) return null
  // Nodes carry lat/lon; ways carry their geometry — the canal is one long
  // way, so its nearest vertex is the honest distance, not its midpoint.
  const dist = (e) => {
    if (Array.isArray(e.geometry) && e.geometry.length)
      return Math.min(...e.geometry.map((g) => metres(lat, lng, g.lat, g.lon)))
    const c = e.center || e
    return Number.isFinite(c.lat) ? metres(lat, lng, c.lat, c.lon) : Infinity
  }
  const point = (e) => {
    if (Number.isFinite(e.lat)) return [e.lat, e.lon]
    if (e.center) return [e.center.lat, e.center.lon]
    if (Array.isArray(e.geometry) && e.geometry.length) return [e.geometry[0].lat, e.geometry[0].lon]
    return null
  }
  const cafes = els.filter((e) => /^(cafe|restaurant)$/.test(e.tags?.amenity || ''))
  const canal = els.filter((e) => e.tags?.waterway === 'canal')
  const stops = els.filter((e) => e.tags?.highway === 'bus_stop' || e.tags?.railway === 'tram_stop')
  const near = (arr) => (arr.length ? Math.round(Math.min(...arr.map(dist))) : null)
  return {
    cafes300: cafes.length,
    // A handful of competitor points for the map (position + name).
    cafes: cafes.slice(0, 12).map((e) => {
      const p = point(e)
      return p && [+p[0].toFixed(5), +p[1].toFixed(5), (e.tags?.name || '').slice(0, 40)]
    }).filter(Boolean),
    canalM: near(canal),
    stopM: near(stops),
  }
}

// og:image from a listing page that answers a plain fetch (Rightmove
// Commercial, Daltons, agents). Rightbiz never does; nothing lost there.
async function ogImage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const html = (await res.text()).slice(0, 200000)
    const m = /property="og:image"\s+content="([^"]+)"/.exec(html) || /content="([^"]+)"\s+property="og:image"/.exec(html)
    return m && /^https:\/\//.test(m[1]) && !/logo|placeholder|default/i.test(m[1]) ? m[1] : null
  } catch {
    return null
  }
}

// ————— verify one listing ————————————————————————

const OUTCOME_IT = { live: 'ancora in vendita', changed: 'cambiato', gone: 'non più in vendita', unclear: 'incerto' }

async function verifyListing(l) {
  const snap = {
    name: l.name, area: l.area + ', Edinburgh', price: l.price,
    rent: l.rent, url: l.url, recordedStatus: l.status,
  }
  const prompt = `Today is ${TODAY}. Search the LIVE web and decide whether this businesses-for-sale listing is still on the market.

Our snapshot: ${JSON.stringify(snap)}

Search angles that work: the business name + area + "for sale"; site:rightbiz.co.uk <name>; site:daltonsbusiness.com <name>; the selling agent's site; local news (Edinburgh Evening News etc. often covers café sales); the business's own social pages (a "permanently closed" page means gone). Rightbiz blocks direct fetches — rely on search snippets and indexed copies. Never invent prices or URLs; if you cannot confirm, say unclear.

Judgement rules: still listed / clearly for sale = live; listed but price or terms differ from our snapshot = changed; sold / under offer / withdrawn / business closed = gone; evidence insufficient = unclear. Prefer the freshest asking price you actually saw.

Also capture, if any source shows them: the street address of the premises (street + number, or at least the street/parade name), and a photo URL of the business — from the listing OR from news coverage / the business's own pages (og:image is fine).

Reply with ONLY this JSON object:
{"outcome":"live|changed|gone|unclear","price":<current asking price as number, or null>,"url":<best canonical listing url you saw, or null>,"image":<direct photo url, or null>,"address":<street address string, or null>,"lat":<latitude number if a source states coordinates, else null>,"lng":<longitude number, else null>,"note":"<=160 chars English","sources":[<=3 urls you actually used]}`
  try {
    const res = extractJson(await judge(prompt), 'outcome')
    if (!['live', 'changed', 'gone', 'unclear'].includes(res.outcome)) res.outcome = 'unclear'
    // Exact coordinates come from the address, not the model's guess.
    const address = res.address || l.address
    if (address && !l.coordsExact) {
      const g = await geocode(address)
      if (g) { res.lat = g.lat; res.lng = g.lng; res.coordsExact = true }
    }
    // Place facts: once we know where it is (exactly), measure the street.
    // Refreshed monthly — cafés open and close, the canal does not move.
    const lat = res.coordsExact ? res.lat : l.coordsExact ? l.lat : null
    const lng = res.coordsExact ? res.lng : l.coordsExact ? l.lng : null
    const stale = !l.place || !l.place.at || (new Date(TODAY) - new Date(l.place.at)) / 86400000 > 30
    if (lat != null && stale) {
      const p = await placeFacts(lat, lng)
      if (p) res.place = p
      await sleep(1000)
    }
    // A photo, if the listing page will give us one.
    const imgUrl = res.url || l.url
    if (!l.image && !res.image && imgUrl && !/rightbiz\.co\.uk/.test(imgUrl)) {
      const img = await ogImage(imgUrl)
      if (img) res.image = img
    }
    return res
  } catch (e) {
    const note = quotaExhausted ? QUOTA_NOTE : 'verdict unavailable: ' + e.message
    return { outcome: 'unclear', price: null, url: null, note, sources: [] }
  }
}

// ————— discover new listings ——————————————————————

const TARGET_AREAS = 'Shandon, Polwarth, Merchiston, Bruntsfield, Morningside, Marchmont, Fountainbridge, Slateford, Haymarket, Stockbridge, Corstorphine, Edinburgh'

const FIND_SHAPE = `Only include LEASEHOLD going concerns (or fitted café/restaurant premises offered on a lease) in Edinburgh: cafés and coffee shops up to £90,000, dessert/ice-cream/tea shops up to £90,000, restaurants and bistros up to £150,000, bars up to £120,000, premises-only leases with a premium up to £60,000 — or price on application. Skip freeholds, franchises, takeaways (fish & chips, kebab, hot-food units), anything outside Edinburgh, and anything marked sold / under offer.

Reply with ONLY a JSON array (empty if nothing new), max 8 items:
[{"id":"kebab-case-id","name":"","category":"cafe|restaurant|dessert|bar|premises","area":"<district or street, Edinburgh>","price":<number|null>,"tenure":"","rent":<number|null>,"turnover":<number|null>,"profit":<number|null>,"url":<the specific listing page url from the LINKS list or your sources, else null>,"image":<direct photo url|null>,"address":<street address|null>,"notes":"<=140 chars English — FACTS from the advert only (size, covers, lease length, why selling, what's included); no speculation about our concept"}]`

// Portals that answer a plain fetch: their category pages become evidence
// text the model reads instead of having to find them itself. Probed
// 2026-09-05 with a desktop UA: these return the listing cards; Rightbiz,
// Zoopla and the Scotsman titles sit behind Cloudflare and stay in the
// search passes below. The optional third field is a hint for that page.
const OPEN_SOURCES = [
  ['Daltons — Edinburgh cafés', 'https://www.daltonsbusiness.com/cafes-businesses-for-sale-in-edinburgh/'],
  ['Daltons — Edinburgh coffee shops', 'https://www.daltonsbusiness.com/coffee-shops-businesses-for-sale-in-edinburgh/'],
  ['Daltons — Edinburgh restaurants', 'https://www.daltonsbusiness.com/restaurants-businesses-for-sale-in-edinburgh/'],
  ['Daltons — Edinburgh bistros', 'https://www.daltonsbusiness.com/bistros-businesses-for-sale-in-edinburgh/'],
  // BusinessesForSale: the category pages answer, the listing pages do not
  // (403) — the cards carry name, area, asking price and a summary, which
  // is enough to add a listing; verification fills in the rest via search.
  ['BusinessesForSale — Edinburgh cafés', 'https://uk.businessesforsale.com/uk/search/cafes-for-sale-in-edinburgh', 'Skip the franchise pitches (Jamaica Blue, Muffin Break, ZenDöner…) and hot-food takeaways; the .aspx links are the listings.'],
  ['BusinessesForSale — Edinburgh coffee shops', 'https://uk.businessesforsale.com/uk/search/coffee-shops-for-sale-in-edinburgh', 'Skip the franchise pitches and hot-food takeaways; the .aspx links are the listings.'],
  ['BusinessesForSale — Edinburgh restaurants', 'https://uk.businessesforsale.com/uk/search/restaurants-for-sale-in-edinburgh', 'Skip the franchise pitches and hot-food takeaways; the .aspx links are the listings.'],
  ['The Restaurant Agency — Edinburgh', 'https://therestaurantagency.com/properties/?location=edinburgh'],
  // Cornerstone: Scotland's main business-transfer agent, Edinburgh office.
  // One page, all of Scotland, each row "<town> <price> <tenure> <blurb>".
  ['Cornerstone Business Agents — business search', 'https://www.cornerstoneba.co.uk/business-search/', 'Rows read "<town> <price> <Leasehold|Freehold> <description>"; keep only Edinburgh leaseholds. The /business-search/<slug>/ links are the listings (the slug is usually the street address — use it as the address).'],
  // Scottish Business Agency: small Scottish agent, listing pages end in -for-sale.
  ['Scottish Business Agency', 'https://scottishbusinessagency.co.uk/', 'Keep only Edinburgh; the …-for-sale/ links are the listings.'],
  // Rightmove Commercial: mostly premises with a lease premium, some going
  // concerns — the "premises" category is what this pair mainly feeds.
  ['Rightmove Commercial — Edinburgh & Lothian cafés', 'https://www.rightmove.co.uk/commercial-property-for-sale/Edinburgh-and-Lothian/cafes.html'],
  ['Rightmove Commercial — Edinburgh & Lothian restaurants', 'https://www.rightmove.co.uk/commercial-property-for-sale/Edinburgh-and-Lothian/restaurants.html'],
  // Gumtree: private sellers, so the cheapest cafés surface here first —
  // buried among dishwashers, domain names and kebab shops.
  ['Gumtree — business for sale, Edinburgh', 'https://www.gumtree.com/for-sale/office-furniture-equipment/business-for-sale/uk/edinburgh', 'This is a classifieds page: ignore equipment, domain names, "wanted" ads, vans and takeaways; only cafés, coffee shops, dessert shops and small restaurants actually in Edinburgh. The /p/business-for-sale/ links are the ads.'],
  // Altius Group carries Bruce & Co (Scottish business agents); national
  // list, so the Edinburgh filter is the model's job.
  ['Altius Group / Bruce & Co — find a business', 'https://altiusgroup.co.uk/find-a-business/', 'A UK-wide list: keep only businesses in Edinburgh; the /business/ links are the listings.'],
]

// Page → plain text plus a LINKS list (listing anchors with their text), so
// the model can hand back the real listing URL rather than none at all.
async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
        Accept: 'text/html,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const links = listingLinks(html, new URL(url).origin).map((l) => `- ${l.text} → ${l.href}`)
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#?\w+;/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 24000)
    return `${text}\n\nLINKS:\n${links.join('\n')}`
  } catch {
    return null
  }
}

// Discovery runs as several narrow passes rather than one sprawling prompt:
// a model given fifteen sources at once skims all of them; given one, it
// actually reads it. Each pass is ~0.3 credits on gpt-5-mini.
async function discoverListings(known) {
  const knownList = known.map((l) => l.name).join('; ')
  const found = []
  const seen = new Set()
  const take = (arr) => {
    for (const f of Array.isArray(arr) ? arr : []) {
      const key = nameKey(f?.name || '')
      if (!key || seen.has(key)) continue
      seen.add(key)
      found.push(f)
    }
  }

  // Pass 1: the open portals, fetched directly and handed over as text.
  for (const [label, url, hint] of OPEN_SOURCES) {
    const text = await fetchText(url)
    if (!text || text.length < 300) { console.log(`  discovery: ${label} — no page text`); continue }
    const prompt = `Today is ${TODAY}. Below is the text of a businesses-for-sale category page (${label}). Extract every café / coffee shop / dessert / small restaurant / deli in EDINBURGH that is currently for sale (skip franchises, skip anything outside Edinburgh, skip "sold"/"under offer").${hint ? ` ${hint}` : ''}
Already on our watchlist (do NOT repeat): ${knownList}

PAGE TEXT:
${text}

${FIND_SHAPE}`
    try { take(extractJson(await judge(prompt))) } catch (e) { console.log(`  discovery: ${label} — ${e.message}`) }
  }

  // Pass 2: the walled portals through search snippets.
  const passes = [
    ['Rightbiz + BusinessesForSale via search', `Search the web for café / coffee shop / dessert businesses for sale in Edinburgh listed on rightbiz.co.uk or uk.businessesforsale.com (use site: searches; these portals block direct fetches — snippets and indexed pages are fine). Areas that matter most: ${TARGET_AREAS}.`],
    ['Restaurants via search', `Search the web for small RESTAURANTS, bistros and brasseries for sale in Edinburgh as leasehold going concerns (rightbiz.co.uk, uk.businessesforsale.com, daltonsbusiness.com, zoopla commercial, Cornerstone, Christie & Co, The Restaurant Agency). Independent, 20–60 covers, asking up to £150,000. Areas that matter most: ${TARGET_AREAS}.`],
    ['Zoopla, PrimeLocation + agents', `Search zoopla.co.uk/for-sale/commercial and primelocation.com commercial listings in Edinburgh (restaurant / café), and the Edinburgh café/restaurant stock of Christie & Co (christie.com/cafe-for-sale/edinburgh/ and /restaurants-for-sale/edinburgh/), Central Business Sales (centralbusinesssales.co.uk/location/edinburgh/), Smith & Clough, Hilton Smythe and Intelligent Business Transfer. Going concerns only; respect the per-category price caps.`],
    ['Fitted premises to lease', `Search NovaLoca, Rightmove Commercial (cafés / restaurants, Edinburgh & Lothian), Shepherd Chartered Surveyors, DM Hall, Graham + Sibbald, Ryden, Allied Surveyors and EYCO for FITTED café or restaurant premises in Edinburgh offered to let or with a lease premium (no goodwill). Report them with category "premises", the premium as price (or null) and the annual rent.`],
    ['Local news', `Search Edinburgh Evening News, The Scotsman and Edinburgh Live for cafés, coffee shops and restaurants put up for sale in the last 60 days (they run "for sale" pieces). Extract the business, area and asking price when stated.`],
  ]
  for (const [label, brief] of passes) {
    const prompt = `Today is ${TODAY}. ${brief}
Already on our watchlist (do NOT repeat): ${knownList}

${FIND_SHAPE}`
    try { take(extractJson(await judge(prompt))) } catch (e) { console.log(`  discovery: ${label} — ${e.message}`) }
    if (quotaExhausted) break
  }
  console.log(`  discovery: ${found.length} candidate(s) across passes`)
  return found.slice(0, 8)
}

// ————— due diligence ————————————————————————————

const CASE_CONTEXT = `Our acquisition case (context for the report; do not restate it):
- Target: small leasehold café going-concern, canal-side residential catchment (Shandon/Polwarth/Merchiston), Edinburgh.
- Valuation anchors: small UK cafés sell at 1.5×–2.5× adjusted annual profit (SDE); comparable asks cluster £35k–£55k leasehold; Bennitos (Edinburgh) = £40k ask, £150k turnover, £25k profit (17%), £18k rent.
- Site economics anchor: Ashley Terrace comparable — £14k/yr rent, £5.6k rateable value (SBBS relief ⇒ rates ≈ £0 under £12k RV).
- Concept: daytime café + pasta of the day; aperitivo Thu–Sun 17:00–20:00 (needs Premises Licence + Personal Licence Holder).`

async function analyseListing(l) {
  const prompt = `Today is ${TODAY}. Search the LIVE web, then write a due-diligence report on this businesses-for-sale listing. Use only what you find; where evidence is silent, say what to ask the selling agent. Never invent figures.

Listing: ${JSON.stringify({ ...l, verification: undefined, lastVerified: undefined })}
${CASE_CONTEXT}

Search for: the listing itself (price, what's included — goodwill, fixtures, lease terms, stock at valuation); the business's reviews and reputation trend; the street/parade and its footfall; the actual premises' rent and rateable value if identifiable; competition within ~500m; anything that smells off (relisting history, closure rumours, licensing issues).

Write GitHub-flavoured Markdown, English, starting with "## Due diligence — ${l.name}", sections:
- **Verdict** — one paragraph: interesting / marginal / avoid for our concept, and why.
- **Price vs earnings** — the ask against 1.5×–2.5× SDE and the £35k–£55k band; if figures are undisclosed, what they'd need to be for the price to make sense.
- **Premises & running costs** — rent vs the £14k anchor, rateable value / SBBS relief, lease shape.
- **Fit with our concept** — catchment, daytime trade, evening aperitivo potential on that street.
- **Risks & questions for the agent** — bullets for the first call.
Cite the URLs you relied on inline. Direct, no padding, max ~400 words.`
  const report = await judge(prompt, ANALYSE_MODEL)
  if (!report) throw new Error('no model available (install Copilot CLI or set COPILOT_GITHUB_TOKEN / ANTHROPIC_API_KEY)')
  return report
}

// ————— GitHub issue plumbing (single-request mode) —————

const gh = (path, init = {}, token) =>
  fetch('https://api.github.com' + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'cafeplan-verify-agent',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })

async function commentAndClose(issue, body, token) {
  await gh(`/repos/Bloom79/cafeplan/issues/${issue}/comments`, {
    method: 'POST', body: JSON.stringify({ body }),
  }, token)
  await gh(`/repos/Bloom79/cafeplan/issues/${issue}`, {
    method: 'PATCH', body: JSON.stringify({ state: 'closed' }),
  }, token)
}

const parsePayload = () => {
  const m = /```json\s*([\s\S]*?)```/.exec(process.env.ISSUE_BODY || '')
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}

// ————— main ————————————————————————————————————

async function main() {
  const dry = process.argv.includes('--dry')
  const all = process.argv.includes('--all')
  const testIdx = process.argv.indexOf('--test')

  if (testIdx !== -1 && process.argv[testIdx + 1]) {
    // Local single verification, no GitHub plumbing: --test <listing-id>
    const db = readDb()
    const l = db.listings.find((x) => x.id === process.argv[testIdx + 1])
    if (!l) { console.log(`no listing with id "${process.argv[testIdx + 1]}"`); return }
    console.log(`verifying: ${l.name} …`)
    const res = await verifyListing(l)
    console.log(JSON.stringify(res, null, 2))
    mergeVerification(db, l.id, res, TODAY)
    writeDb(db)
    console.log('data updated.')
    return
  }

  if (process.env.ISSUE_BODY && !all) {
    const payload = parsePayload()
    if (!payload) { out('status', 'error'); out('summary', 'no json payload in issue body'); return }
    const mode = (process.env.ISSUE_TITLE || '').startsWith('Analizza') ? 'analizza' : 'verifica'
    if (dry) {
      console.log(`[dry] would ${mode} listing ${payload.id} (${payload.name})`)
      out('status', 'ok'); return
    }
    const db = readDb()
    const l = db.listings.find((x) => x.id === payload.id)
    if (!l) {
      await commentAndClose(process.env.ISSUE_NUMBER, `Listing \`${payload.id}\` not found in data — nothing to ${mode}.`, process.env.GITHUB_TOKEN)
      out('status', 'ok'); return
    }
    if (mode === 'analizza') {
      const report = await analyseListing(l)
      // Keep it: a due-diligence run costs credits, and the app used to
      // drop the report the moment the tab was closed.
      l.analysis = { date: TODAY, report }
      writeDb(db)
      await commentAndClose(process.env.ISSUE_NUMBER, report, process.env.GITHUB_TOKEN)
      out('status', 'ok'); out('summary', `due diligence posted for ${l.name}`)
      return
    }
    const res = await verifyListing(l)
    mergeVerification(db, payload.id, res, TODAY)
    writeDb(db)
    const lines = [
      `**Verifica — ${l.name}** (${TODAY})`,
      '',
      ...(quotaExhausted ? ['⚠️ **Quota mensile Copilot esaurita** — la verifica non è stata eseguita; riprova dopo il reset (il 1° del mese).', ''] : []),
      `**Esito:** ${OUTCOME_IT[res.outcome]}`,
      '',
      `- Prezzo attuale: ${res.price != null ? '£' + res.price.toLocaleString('en-GB') : 'non indicato'}`,
      `- URL: ${res.url || l.url || 'nessuno trovato'}`,
      `- Nota: ${res.note || '—'}`,
      res.sources?.length ? `- Fonti: ${res.sources.join(' · ')}` : '- Fonti: —',
      '',
      '_Dati aggiornati in `public/listings.json` — visibili nell\'app al prossimo deploy._',
    ].join('\n')
    await commentAndClose(process.env.ISSUE_NUMBER, lines, process.env.GITHUB_TOKEN)
    out('status', 'ok'); out('summary', `${l.name}: ${res.outcome}`)
    return
  }

  // --enrich: no model calls. Place facts (OSM), district from exact
  // coordinates, firstSeen backfill, and a photo where the page gives one.
  if (process.argv.includes('--enrich')) {
    const db = readDb()
    let placed = 0, photos = 0
    for (const l of db.listings) {
      if (!l.firstSeen) l.firstSeen = (l.history && l.history[0] && l.history[0].date) || l.lastVerified || TODAY
      l.area = normaliseArea(l.area)
      if (l.coordsExact) {
        const d = districtOf(l.lat, l.lng)
        if (d) l.area = d
        const stale = !l.place || !l.place.at || (new Date(TODAY) - new Date(l.place.at)) / 86400000 > 30
        if (stale) {
          const p = await placeFacts(l.lat, l.lng)
          if (p) { l.place = { ...p, at: TODAY }; placed++ }
          await sleep(1200)
        }
      }
      if (!l.image && l.url && !/rightbiz\.co\.uk/.test(l.url)) {
        const img = await ogImage(l.url)
        if (img) { l.image = img; photos++ }
      }
      console.log(`${l.name.slice(0, 40).padEnd(40)} ${l.area.padEnd(14)} ${l.place ? `cafés300=${l.place.cafes300} canal=${l.place.canalM ?? '—'}m stop=${l.place.stopM ?? '—'}m` : '(no exact coords)'}${l.image ? ' 📷' : ''}`)
    }
    writeDb(db)
    out('status', 'ok')
    out('summary', `${placed} luoghi misurati · ${photos} foto`)
    return
  }

  if (process.argv.includes('--discover-only')) {
    if (dry) { console.log('[dry] would run discovery only'); out('status', 'ok'); return }
    const db = readDb()
    let added = 0
    try {
      added = mergeDiscovery(db, await discoverListings(db.listings), TODAY)
    } catch (e) {
      console.log('discovery failed — ' + e.message)
    }
    if (added > 0) { db.updated = TODAY; writeDb(db) }
    out('status', 'ok')
    out('summary', `${added} nuove`)
    return
  }

  if (all) {
    const discover = process.argv.includes('--discover')
    const force = process.argv.includes('--force')
    const db = readDb()
    const due = db.listings.filter((l) => needsCheck(l, TODAY, force))
    if (dry) {
      console.log(`[dry] would verify ${due.length}/${db.listings.length} due listing(s)${discover ? ' + run discovery' : ''} (no model, no network)`)
      out('status', 'ok'); return
    }
    let ok = 0, unclear = 0, skipped = db.listings.length - due.length
    for (const l of due) {
      if (quotaExhausted) break // pointless until the quota resets on the 1st
      try {
        const res = await verifyListing(l)
        mergeVerification(db, l.id, res, TODAY)
        res.outcome === 'unclear' ? unclear++ : ok++
        console.log(`${l.name}: ${res.outcome}${res.note ? ' — ' + res.note : ''}`)
      } catch (e) {
        unclear++
        console.log(`${l.name}: verify failed — ${e.message}`)
      }
    }
    let added = 0
    if (discover && !quotaExhausted) {
      try {
        added = mergeDiscovery(db, await discoverListings(db.listings), TODAY)
      } catch (e) {
        console.log('discovery failed — ' + e.message)
      }
    }
    if (quotaExhausted) {
      // Leave db.updated alone: the data was NOT refreshed today, and the
      // app's "data updated" line should not claim it was.
      writeDb(db)
      out('status', 'ok')
      out('summary', `quota Copilot esaurita — ${ok} verificate prima dello stop; riparte col reset mensile`)
      return
    }
    db.updated = TODAY
    writeDb(db)
    out('status', 'ok')
    out('summary', `${ok} verificate · ${unclear} incerte · ${skipped} non dovute · ${added} nuove`)
    return
  }

  console.log('usage: node scripts/verifica.mjs [--all [--force] [--discover]] [--test <id>] [--dry]   (or run with ISSUE_BODY for single-request mode)')
}

main().catch((e) => {
  console.error('agent error:', e.message)
  out('status', 'error')
  out('summary', String(e.message).slice(0, 200))
})
