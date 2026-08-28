// CafePlan verify agent — keeps public/listings.json honest.
//
// Modes (first match wins):
//   env ISSUE_BODY set   → single request from the app (issue-triggered):
//                          "Verifica:" re-checks one listing, "Analizza:" runs
//                          a due-diligence report. Posts the report as an
//                          issue comment, closes the issue, commits nothing.
//   --all                → daily run: verify every listing, then discover new
//                          Edinburgh going-concerns. Rewrites listings.json;
//                          the workflow commits if anything changed.
//   --dry                → no API key needed: prints what would run (testing).
//
// The searching is done by the model via Anthropic's server-side web_search
// tool — Rightbiz blocks plain scraping, but search + snippets + fetched
// portals work (that is how the seed comparables were found). Never exits
// non-zero: the workflow branches on the `status` GITHUB_OUTPUT.

import { appendFileSync, readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'public', 'listings.json')
const TODAY = new Date().toISOString().slice(0, 10)

const MODEL = process.env.VERIFY_MODEL || 'claude-opus-5'

const out = (k, v) => {
  console.log(`${k}=${v}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`)
}

const readDb = () => JSON.parse(readFileSync(DATA, 'utf8'))
const writeDb = (db) => writeFileSync(DATA, JSON.stringify(db, null, 2) + '\n')

// ————— the agent —————

const SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search', max_uses: 8 }

const SYSTEM = `You verify UK businesses-for-sale listings for a café-acquisition watchlist covering Edinburgh (Scotland). Today is ${TODAY}.
You search the live web (Rightbiz, Daltons, BusinessesForSale, Dynamic Businesses, agent sites, news) to answer precisely.
Business portals often sit behind anti-bot walls: rely on search-result snippets, cached/indexed pages and any portal that does respond — and say so in your evidence.
Never invent URLs or prices. If you cannot confirm something, return the "unclear" outcome rather than guessing.`

async function askAnthropic({ client, user, maxTokens = 4000 }) {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: SYSTEM,
    tools: [SEARCH_TOOL],
    messages: [{ role: 'user', content: user }],
  })
  if (resp.stop_reason === 'refusal') throw new Error('model refused')
  const text = (resp.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  return text
}

// Defensively pull the first JSON value out of a model reply.
const extractJson = (text) => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const raw = fenced ? fenced[1] : text
  const start = Math.min(...['[', '{'].map((c) => { const i = raw.indexOf(c); return i === -1 ? Infinity : i }))
  const openChar = raw[start]
  const closeChar = openChar === '[' ? ']' : '}'
  const end = raw.lastIndexOf(closeChar)
  if (!openChar || end <= start) throw new Error('no JSON in reply')
  return JSON.parse(raw.slice(start, end + 1))
}

// ————— verify one listing —————

const OUTCOME_IT = { live: 'ancora in vendita', changed: 'cambiato', gone: 'non più in vendita', unclear: 'incerto' }

async function verifyListing(client, l) {
  const user = `Verify this businesses-for-sale listing RIGHT NOW (today is ${TODAY}).

Listing snapshot from ${l.source || 'our records'}:
- name: ${l.name}
- area: ${l.area}, Edinburgh
- asking price: ${l.price != null ? '£' + l.price.toLocaleString('en-GB') : 'not disclosed'}
- rent: ${l.rent != null ? '£' + l.rent.toLocaleString('en-GB') + '/yr' : 'unknown'}
- known url: ${l.url || 'none'}
- recorded status: ${l.status}

Search for it (e.g. the business name + area + "for sale", site-limited searches on rightbiz.co.uk and daltonsbusiness.com, the agent's own site, cached copies). Determine:
1. Is it still openly for sale? (live) / still listed but price or terms changed? (changed) / no longer listed, sold, or withdrawn? (gone) / cannot confirm? (unclear)
2. Current asking price if stated.
3. The best canonical listing URL (only one you have actually seen in results — null if none).
4. One line of evidence (where you saw it, what it said).

Reply with ONLY this JSON object:
{"outcome":"live|changed|gone|unclear","price":<number or null>,"url":<string or null>,"note":"<=180 chars, English","evidence":"<=200 chars, English"}`
  const text = await askAnthropic({ client, user })
  const res = extractJson(text)
  if (!['live', 'changed', 'gone', 'unclear'].includes(res.outcome)) res.outcome = 'unclear'
  return res
}

// ————— discover new listings —————

const TARGET_AREAS = 'Shandon, Polwarth, Merchiston, Bruntsfield, Morningside, Marchmont, Fountainbridge, Slateford, Haymarket, Leith, Stockbridge, Corstorphine, Edinburgh city centre'

async function discoverListings(client, known) {
  const user = `Find Edinburgh café / coffee-shop / restaurant businesses-for-sale that are OPENLY listed today (${TODAY}).

Already on our watchlist (do NOT repeat these): ${known.map((l) => l.name).join('; ')}

Look for going concerns (not franchises, not outside Edinburgh) in or near: ${TARGET_AREAS}.
Sources: Rightbiz, Daltons, BusinessesForSale.com, Dynamic Businesses, TikTok/Facebook market posts by business-transfer agents, agent sites. Anti-bot walls are common — search snippets and indexed pages are fine evidence.

For each find (max 6, only ones you are confident are current and real):
{"id":"kebab-case-id","name":"","area":"","price":<number or null>,"tenure":"","rent":<number or null>,"turnover":<number or null>,"profit":<number or null>,"url":<string or null>,"notes":"<=160 chars, English — why it matters for a canal-side café plan"}

Reply with ONLY a JSON array (empty array if nothing new found).`
  const text = await askAnthropic({ client, user, maxTokens: 6000 })
  const arr = extractJson(text)
  return Array.isArray(arr) ? arr.slice(0, 6) : []
}

// ————— due diligence —————

const CASE_CONTEXT = `Our acquisition case (for context in the report, do not restate it):
- Target: small leasehold café going-concern, canal-side residential catchment (Shandon/Polwarth/Merchiston), Edinburgh.
- Valuation anchors: small UK cafés sell at 1.5×–2.5× adjusted annual profit (SDE); comparable purchase prices cluster £35k–£55k leasehold; Bennitos (Edinburgh) = £40k asking, £150k turnover, £25k profit (17%), £18k rent.
- Site economics anchor: Ashley Terrace comparable — £14k/yr rent, £5.6k rateable value (SBBS relief ⇒ rates ≈ £0 under £12k RV).
- Concept: daytime café + pasta of the day; Italian aperitivo Thu–Sun 17:00–20:00 (needs Premises Licence + Personal Licence Holder).`

async function analyseListing(client, l) {
  const user = `Produce a due-diligence report for this businesses-for-sale listing. Today is ${TODAY}.

Listing: ${JSON.stringify({ ...l, verification: undefined, lastVerified: undefined })}

${CASE_CONTEXT}

First SEARCH the web for everything useful: the listing itself (price, what's included — goodwill, fixtures, lease terms, stock at valuation), the business's reviews/reputation, the street/parade and its footfall, the rent and rateable value of the actual premises if identifiable (Scottish Assessors portal), competition within 500m, and anything that smells off (relisting history, negative reviews trend, planning/licensing issues).

Then write the report in GitHub-flavoured Markdown, English, starting with a "## Due diligence — ${l.name}" heading, with these sections:
- **Verdict** — one paragraph: interesting / marginal / avoid for our concept, and why.
- **Price vs earnings** — check the ask against 1.5×–2.5× SDE and the £35k–£55k comparable band. If turnover/profit are undisclosed, say what figures to demand and what they'd need to be for the price to make sense.
- **Premises & running costs** — rent vs the £14k anchor, rateable value / SBBS relief, lease shape, fit-out state.
- **Fit with our concept** — canal-corridor catchment, daytime trade potential, whether evening aperitivo could work on that street.
- **Risks & questions for the agent** — bullet list, the questions a buyer should ask on the first call.
Cite the URLs you relied on inline. Be direct; do not pad. Max ~450 words.`
  const text = await askAnthropic({ client, user, maxTokens: 8000 })
  return text.trim()
}

// ————— data merge —————

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)

function mergeVerification(db, id, res) {
  const l = db.listings.find((x) => x.id === id)
  if (!l) return null
  if (res.url && !l.url) l.url = res.url
  if (res.price != null && l.price != null && res.price !== l.price) {
    l.history = [...(l.history || []), { date: TODAY, price: l.price }]
    l.price = res.price
    res.outcome = res.outcome === 'live' ? 'changed' : res.outcome
  } else if (res.price != null && l.price == null) {
    l.price = res.price
  }
  if (res.outcome === 'gone') l.status = 'gone'
  if (res.outcome === 'live' && l.status === 'gone') l.status = 'active'
  l.lastVerified = TODAY
  l.verification = { outcome: res.outcome, note: res.note || '', date: TODAY }
  return l
}

function mergeDiscovery(db, found) {
  const ids = new Set(db.listings.map((l) => l.id))
  let added = 0
  for (const f of found) {
    if (!f || !f.name || !f.area) continue
    let id = slug(f.id || f.name)
    while (ids.has(id)) id = id + '-2'
    if (!/^[a-z0-9-]{2,60}$/.test(id)) continue
    ids.add(id)
    db.listings.push({
      id,
      name: String(f.name).slice(0, 90),
      area: String(f.area).slice(0, 40),
      price: Number.isFinite(+f.price) && f.price != null ? +f.price : null,
      tenure: String(f.tenure || 'Leasehold').slice(0, 40),
      rent: Number.isFinite(+f.rent) && f.rent != null ? +f.rent : null,
      turnover: Number.isFinite(+f.turnover) && f.turnover != null ? +f.turnover : null,
      profit: Number.isFinite(+f.profit) && f.profit != null ? +f.profit : null,
      status: 'active',
      tags: ['agent find'],
      notes: String(f.notes || '').slice(0, 240),
      source: `agent discovery (${TODAY})`,
      url: f.url || null,
      lastVerified: TODAY,
      verification: { outcome: 'live', note: 'found by discovery scan', date: TODAY },
    })
    added++
  }
  // Cap: drop the oldest 'gone' entries beyond 20 total.
  while (db.listings.length > 20) {
    const i = db.listings.findIndex((l) => l.status === 'gone')
    db.listings.splice(i === -1 ? 0 : i, 1)
  }
  return added
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

// ————— main —————

const parsePayload = () => {
  const m = /```json\s*([\s\S]*?)```/.exec(process.env.ISSUE_BODY || '')
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}

async function main() {
  const dry = process.argv.includes('--dry')
  const all = process.argv.includes('--all')
  const hasKey = !!process.env.ANTHROPIC_API_KEY

  if (process.env.ISSUE_BODY && !all) {
    const payload = parsePayload()
    if (!payload) { out('status', 'error'); out('summary', 'no json payload in issue body'); return }
    const mode = (process.env.ISSUE_TITLE || '').startsWith('Analizza') ? 'analizza' : 'verifica'
    if (dry || !hasKey) {
      console.log(`[dry] would ${mode} listing ${payload.id} (${payload.name})`)
      out('status', 'ok'); return
    }
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic()
    const db = readDb()
    const l = db.listings.find((x) => x.id === payload.id)
    if (!l) {
      await commentAndClose(process.env.ISSUE_NUMBER, `Listing \`${payload.id}\` not found in data — nothing to ${mode}.`, process.env.GITHUB_TOKEN)
      out('status', 'ok'); return
    }
    if (mode === 'analizza') {
      const report = await analyseListing(client, l)
      await commentAndClose(process.env.ISSUE_NUMBER, report, process.env.GITHUB_TOKEN)
      out('status', 'ok'); out('summary', `due diligence posted for ${l.name}`)
      return
    }
    const res = await verifyListing(client, l)
    mergeVerification(db, payload.id, res)
    writeDb(db)
    const lines = [
      `**Verifica — ${l.name}** (${TODAY})`,
      '',
      `**Esito:** ${OUTCOME_IT[res.outcome]}`,
      '',
      `- Prezzo attuale: ${res.price != null ? '£' + res.price.toLocaleString('en-GB') : 'non indicato'}`,
      `- URL: ${res.url || (l.url || 'nessuno trovato')}`,
      `- Nota: ${res.note || '—'}`,
      `- Evidence: ${res.evidence || '—'}`,
      '',
      '_Dati aggiornati in `public/listings.json` — visibili nell\'app al prossimo deploy._',
    ].join('\n')
    await commentAndClose(process.env.ISSUE_NUMBER, lines, process.env.GITHUB_TOKEN)
    out('status', 'ok'); out('summary', `${l.name}: ${res.outcome}`)
    return
  }

  if (all) {
    if (dry || !hasKey) {
      console.log('[dry] would verify all listings + run discovery; no API key used')
      out('status', 'ok'); return
    }
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic()
    const db = readDb()
    db.updated = TODAY
    let ok = 0, problems = 0
    for (const l of [...db.listings]) {
      try {
        const res = await verifyListing(client, l)
        mergeVerification(db, l.id, res)
        res.outcome === 'unclear' ? problems++ : ok++
        console.log(`${l.name}: ${res.outcome}${res.note ? ' — ' + res.note : ''}`)
      } catch (e) {
        problems++
        console.log(`${l.name}: verify failed — ${e.message}`)
      }
    }
    let added = 0
    try {
      added = mergeDiscovery(db, await discoverListings(client, db.listings))
    } catch (e) {
      console.log('discovery failed — ' + e.message)
    }
    writeDb(db)
    out('status', 'ok')
    out('summary', `${ok} verificate · ${problems} incerte · ${added} nuove`)
    return
  }

  console.log('usage: node scripts/verifica.mjs [--all] [--dry]   (or run with ISSUE_BODY for single-request mode)')
}

main().catch((e) => {
  // Never fail the workflow — report and exit 0 (summerhome convention).
  console.error('agent error:', e.message)
  out('status', 'error')
  out('summary', String(e.message).slice(0, 200))
})
