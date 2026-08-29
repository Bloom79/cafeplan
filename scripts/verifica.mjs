// CafePlan verify agent — keeps public/listings.json honest.
//
// The whole agent is the GitHub Copilot CLI (`copilot -p ...`) on the
// owner's Copilot subscription: it searches the live web itself (built-in
// web search), which also gets past Rightbiz's anti-bot wall via search
// snippets and indexed pages. Zero marginal API cost on the default model;
// set VERIFY_MODEL (e.g. claude-opus-5) to spend premium credits for
// sharper judgements — note ~20 credits per opus request with search.
// Optional ANTHROPIC_API_KEY falls back to the Anthropic API with its
// server-side web_search tool if Copilot is unavailable.
//
// Modes (first match wins):
//   env ISSUE_BODY set   → single request from the app: "Verifica:" re-checks
//                          one listing, "Analizza:" runs due diligence. Posts
//                          the report as the issue comment the app polls,
//                          closes the issue.
//   --all                → daily run: verify every listing + discover new
//                          Edinburgh going-concerns; rewrite listings.json.
//   --dry                → no model, no network: prints the plan (testing).
//
// Never exits non-zero: workflows branch on the `status` GITHUB_OUTPUT.

import { appendFileSync, readFileSync, writeFileSync } from 'fs'
import { spawnSync as run } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'public', 'listings.json')
const TODAY = new Date().toISOString().slice(0, 10)

// Empty = the subscription's default model (no premium credits).
const MODEL = process.env.VERIFY_MODEL || ''

const out = (k, v) => {
  console.log(`${k}=${v}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`)
}

const readDb = () => JSON.parse(readFileSync(DATA, 'utf8'))
const writeDb = (db) => writeFileSync(DATA, JSON.stringify(db, null, 2) + '\n')

// ————— the model ——————————————————————————————————

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function copilot(prompt) {
  const args = ['-p', prompt]
  if (MODEL) args.push('--model', MODEL)
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
      model: MODEL || 'claude-opus-5',
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

async function judge(prompt) {
  return (await copilot(prompt)) || (await anthropic(prompt))
}

// The CLI's output carries banner/progress noise — including TRUNCATED json
// fragments from tool results whose braces never close (which would poison
// a brace-matcher). The model's actual answer always sits on its own
// line(s), so: try to parse every line that starts with { or [, joining up
// to 6 following lines for pretty-printed output.
const extractJson = (text, expectedKey) => {
  if (!text) throw new Error('no model output')
  const parsed = []
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1])
  const lines = text.split('\n')
  const candidates = [...fenced]
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

Reply with ONLY this JSON object:
{"outcome":"live|changed|gone|unclear","price":<current asking price as number, or null>,"url":<best canonical listing url you saw, or null>,"note":"<=160 chars English","sources":[<=3 urls you actually used]}`
  try {
    const res = extractJson(await judge(prompt), 'outcome')
    if (!['live', 'changed', 'gone', 'unclear'].includes(res.outcome)) res.outcome = 'unclear'
    return res
  } catch (e) {
    return { outcome: 'unclear', price: null, url: null, note: 'verdict unavailable: ' + e.message, sources: [] }
  }
}

// ————— discover new listings ——————————————————————

const TARGET_AREAS = 'Shandon, Polwarth, Merchiston, Bruntsfield, Morningside, Marchmont, Fountainbridge, Slateford, Haymarket, Stockbridge, Corstorphine, Edinburgh'

async function discoverListings(known) {
  const prompt = `Today is ${TODAY}. Search the LIVE web for café / coffee-shop / dessert / small-restaurant businesses-for-sale that are CURRENTLY listed in Edinburgh (going concerns, not franchises, not outside Edinburgh), especially in or near: ${TARGET_AREAS}.

Useful angles: site:rightbiz.co.uk cafe Edinburgh; site:daltonsbusiness.com; "business for sale" Bruntsfield OR Morningside OR Marchmont; business-transfer agents (Christie & Co, The Restaurant Agency, Central Business Sales, DJK Group) Edinburgh café listings; Businesses for Sale Scotland. Rightbiz blocks direct fetches — snippets and indexed pages are fine.

Already on our watchlist (do NOT repeat): ${known.map((l) => l.name).join('; ')}

Reply with ONLY a JSON array (empty if nothing new), max 6 items:
[{"id":"kebab-case-id","name":"","area":"","price":<number|null>,"tenure":"","rent":<number|null>,"turnover":<number|null>,"profit":<number|null>,"url":<string|null>,"notes":"<=140 chars English — why it matters for a canal-side café plan"}]`
  try {
    const arr = extractJson(await judge(prompt))
    return Array.isArray(arr) ? arr.slice(0, 6) : []
  } catch (e) {
    console.log('  discovery verdict failed: ' + e.message)
    return []
  }
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
  const report = await judge(prompt)
  if (!report) throw new Error('no model available (install Copilot CLI or set COPILOT_GITHUB_TOKEN / ANTHROPIC_API_KEY)')
  return report
}

// ————— data merge ——————————————————————————————

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)

function mergeVerification(db, id, res) {
  const l = db.listings.find((x) => x.id === id)
  if (!l) return null
  // A failed verdict (no model available, transient auth) must never
  // overwrite a previous good verification — keep the old badge instead.
  if (res.outcome === 'unclear' && /verdict unavailable|no model/i.test(res.note || '')) return l
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
      source: `agent discovery (${TODAY})`,
      url: f.url || null,
      lastVerified: TODAY,
      verification: { outcome: 'live', note: 'found by discovery scan', date: TODAY },
    })
    added++
  }
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
    mergeVerification(db, l.id, res)
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
      await commentAndClose(process.env.ISSUE_NUMBER, report, process.env.GITHUB_TOKEN)
      out('status', 'ok'); out('summary', `due diligence posted for ${l.name}`)
      return
    }
    const res = await verifyListing(l)
    mergeVerification(db, payload.id, res)
    writeDb(db)
    const lines = [
      `**Verifica — ${l.name}** (${TODAY})`,
      '',
      `**Esito:** ${OUTCOME_IT[res.outcome]}`,
      '',
      `- Prezzo attuale: ${res.price != null ? '£' + res.price.toLocaleString('en-GB') : 'non indicato'}`,
      `- URL: ${res.url || l.url || 'nessuno trovato'}`,
      `- Nota: ${res.note || '—'}`,
      res.sources?.length ? `- Fonti: ${res.sources.join(' · ')}` : '- Fonti: —',
      '',
      '_Dati aggiornati in \`public/listings.json\` — visibili nell\'app al prossimo deploy._',
    ].join('\n')
    await commentAndClose(process.env.ISSUE_NUMBER, lines, process.env.GITHUB_TOKEN)
    out('status', 'ok'); out('summary', `${l.name}: ${res.outcome}`)
    return
  }

  if (all) {
    const discover = process.argv.includes('--discover')
    if (dry) {
      console.log(`[dry] would verify all listings${discover ? ' + run discovery' : ''} (no model, no network)`)
      out('status', 'ok'); return
    }
    const db = readDb()
    db.updated = TODAY
    let ok = 0, unclear = 0
    for (const l of [...db.listings]) {
      try {
        const res = await verifyListing(l)
        mergeVerification(db, l.id, res)
        res.outcome === 'unclear' ? unclear++ : ok++
        console.log(`${l.name}: ${res.outcome}${res.note ? ' — ' + res.note : ''}`)
      } catch (e) {
        unclear++
        console.log(`${l.name}: verify failed — ${e.message}`)
      }
    }
    let added = 0
    if (discover) {
      try {
        added = mergeDiscovery(db, await discoverListings(db.listings))
      } catch (e) {
        console.log('discovery failed — ' + e.message)
      }
    }
    writeDb(db)
    out('status', 'ok')
    out('summary', `${ok} verificate · ${unclear} incerte · ${added} nuove`)
    return
  }

  console.log('usage: node scripts/verifica.mjs [--all] [--dry]   (or run with ISSUE_BODY for single-request mode)')
}

main().catch((e) => {
  console.error('agent error:', e.message)
  out('status', 'error')
  out('summary', String(e.message).slice(0, 200))
})
