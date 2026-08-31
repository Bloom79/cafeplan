// CafePlan worker — the listings verifier's tiny backend on Cloudflare.
// Same pattern as CasaTrova's worker (summerhome repo).
//
// Roles:
//  1. POST /verifica    file a "Verifica: <name>" issue (listing Verify button)
//  2. POST /analizza    file an "Analizza: <name>" issue (Analyse button)
//  3. GET  /stato       live progress of a request (button polling)
//  4. GET  /report      the finished report (last comment on the closed issue)
//  5. POST /subscribe   store a push subscription (KV) — bell button
//  6. POST /unsubscribe remove it
//  7. POST /check       diff listings.json vs the stored snapshot and push
//                       new-listing / price-drop / gone alerts (also on cron)
//  8. POST /test-push   send a test notification to a known subscription
//
// Secrets: GITHUB_TOKEN (Issues r/w), VAPID_PRIVATE_KEY. Vars: VAPID_PUBLIC_KEY.
// KV: ALERTS — sub:<sha256(endpoint)> records, plus snapshot/lastcheck.

import { buildPushPayload } from '@block65/webcrypto-web-push'
//
// Abuse control. The Action's author gate does NOT protect this endpoint:
// the worker files issues with the owner's PAT, so anything that reaches
// here passes the gate and spends Actions minutes and Copilot credits. A
// static site cannot hold a real secret, so instead:
//   1. POSTs must come from a known Origin (stops the browser-side case),
//   2. a hard ceiling on requests per hour, counted from the repo itself
//      (stops the curl case — it bounds the spend no matter who calls).
// Anything above the ceiling gets 429 until the hour rolls off.

const REPO = 'Bloom79/cafeplan'
const RAW_DATA = 'https://raw.githubusercontent.com/Bloom79/cafeplan/main/public/listings.json'
const PORTAL = 'https://bloom79.github.io/cafeplan/'

const ALLOWED_ORIGINS = [
  'https://bloom79.github.io',
  'http://localhost:5173', // vite dev
  'http://localhost:4173', // vite preview
]

// Ceiling on agent runs per hour. A real session clicks Verify a handful of
// times; a run costs Actions minutes and (on a premium model) credits.
const MAX_PER_HOUR = 12

const json = (data, status, cors) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })

// The verify agent ends its comment with a machine-readable marker the
// status endpoint parses — keep the two in sync.
const OUTCOMES = [
  ['ancora in vendita', 'live'],
  ['cambiato', 'changed'],
  ['non più in vendita', 'gone'],
  ['incerto', 'unclear'],
]

const sha256hex = async (s) => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Diff the published listings against the KV snapshot and push alerts.
// Self-sourcing and throttled, so it needs no auth: the worst an abuser
// can trigger is a no-op re-check.
async function runCheck(env) {
  const now = Date.now()
  const last = +((await env.ALERTS.get('lastcheck')) || 0)
  if (now - last < 60e3) return { skipped: 'throttled' }
  await env.ALERTS.put('lastcheck', String(now))

  const db = await (await fetch(`${RAW_DATA}?t=${now}`)).json()
  const cur = {}
  for (const l of db.listings || [])
    cur[l.id] = { name: l.name, area: l.area, price: l.price, status: l.status }

  const snapRaw = await env.ALERTS.get('snapshot')
  await env.ALERTS.put('snapshot', JSON.stringify(cur))
  if (!snapRaw) return { first: true, listings: Object.keys(cur).length }
  const snap = JSON.parse(snapRaw)

  const events = []
  for (const [id, l] of Object.entries(cur)) {
    const old = snap[id]
    if (!old) events.push({ type: 'nuova', l })
    else if (l.price != null && old.price != null && l.price < old.price)
      events.push({ type: 'ribasso', l, oldPrice: old.price })
    else if (l.status === 'gone' && old.status !== 'gone')
      events.push({ type: 'gone', l })
  }
  if (!events.length) return { events: 0 }

  const fmt = (l) => `${l.name} (${l.area}) ${l.price != null ? '£' + Math.round(l.price / 1000) + 'k' : ''}`.trim()
  const parts = []
  const by = (t) => events.filter((e) => e.type === t)
  if (by('nuova').length) parts.push(`🏪 ${by('nuova').length} new: ${by('nuova').slice(0, 3).map((e) => fmt(e.l)).join(', ')}`)
  if (by('ribasso').length) parts.push(`📉 price drop: ${by('ribasso').slice(0, 3).map((e) => `${fmt(e.l)} (was £${Math.round(e.oldPrice / 1000)}k)`).join(', ')}`)
  if (by('gone').length) parts.push(`🔴 ${by('gone').length} gone: ${by('gone').slice(0, 3).map((e) => e.l.name).join(', ')}`)

  const vapid = { subject: 'mailto:dedalus79@gmail.com', publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
  const msg = {
    data: JSON.stringify({ title: 'Canalside ☕ listings news', body: parts.join(' · '), url: PORTAL + '#listings' }),
    options: { ttl: 86400 },
  }
  const subs = await env.ALERTS.list({ prefix: 'sub:' })
  let sent = 0
  for (const k of subs.keys) {
    const rec = JSON.parse((await env.ALERTS.get(k.name)) || 'null')
    if (!rec?.subscription) continue
    try {
      const payload = await buildPushPayload(msg, rec.subscription, vapid)
      const res = await fetch(rec.subscription.endpoint, payload)
      if (res.status === 404 || res.status === 410) await env.ALERTS.delete(k.name)
      else if (res.status < 300) sent++
    } catch { /* transient push failure: keep the subscription */ }
  }
  return { events: events.length, sent, subs: subs.keys.length }
}

export default {
  async scheduled(event, env) {
    await runCheck(env)
  },

  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    const u = new URL(request.url)

    const gh = (path, init = {}) =>
      fetch('https://api.github.com' + path, {
        ...init,
        headers: {
          Authorization: 'Bearer ' + env.GITHUB_TOKEN,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'cafeplan-verify-worker',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      })

    const readBody = async () => {
      try { return await request.json() } catch { return {} }
    }
    const clean = (s, n = 90) => String(s || '').replace(/[`\r\n]/g, ' ').trim().slice(0, n)

    // ————— GET routes —————

    if (request.method === 'GET') {
      const issue = +u.searchParams.get('issue')
      if (!issue) return json({ error: 'issue param required' }, 400, cors)

      if (u.pathname === '/report') {
        const r = await gh(`/repos/${REPO}/issues/${issue}`)
        if (!r.ok) return json({ error: 'github ' + r.status }, 502, cors)
        const it = await r.json()
        let report = null
        if (it.comments > 0) {
          const cr = await gh(`/repos/${REPO}/issues/${issue}/comments`)
          if (cr.ok) {
            const cs = await cr.json()
            report = (cs[cs.length - 1] || {}).body || null
          }
        }
        return json({ state: it.state, report }, 200, cors)
      }

      if (u.pathname === '/stato') {
        const r = await gh(`/repos/${REPO}/issues/${issue}`)
        if (!r.ok) return json({ error: 'github ' + r.status }, 502, cors)
        const it = await r.json()
        let outcome = null
        if (it.comments > 0) {
          const cr = await gh(`/repos/${REPO}/issues/${issue}/comments`)
          if (cr.ok) {
            const cs = await cr.json()
            const last = (cs[cs.length - 1] || {}).body || ''
            for (const [marker, out] of OUTCOMES)
              if (last.includes(`**Esito:** ${marker}`)) { outcome = out; break }
            if (!outcome && last.includes('## Due diligence')) outcome = 'ok'
          }
        }
        if (!outcome && it.state === 'closed') outcome = 'ok'
        return json({ state: it.state, outcome }, 200, cors)
      }

      return json({ error: 'not found' }, 404, cors)
    }

    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors)

    // ————— POST routes —————

    if (!ALLOWED_ORIGINS.includes(origin))
      return json({ error: 'origin not allowed' }, 403, cors)

    // Requests filed in the last hour, whoever asked for them. `since`
    // filters on last-updated, so this over-counts rather than under —
    // the safe direction for a spend ceiling.
    const underCeiling = async () => {
      const since = new Date(Date.now() - 3600e3).toISOString()
      const r = await gh(`/repos/${REPO}/issues?state=all&since=${since}&per_page=100`)
      if (!r.ok) return true // GitHub unreachable: don't punish the user
      const recent = (await r.json()).filter((it) =>
        /^(Verifica|Analizza):/.test(it.title || ''))
      return recent.length < MAX_PER_HOUR
    }

    const fileIssue = async (kind, body) => {
      const { id, name, url } = body
      if (!/^[a-z0-9-]{2,60}$/.test(String(id || '')))
        return json({ error: 'invalid id' }, 400, cors)
      if (!(await underCeiling()))
        return json({ error: `hourly limit reached (${MAX_PER_HOUR}) — try again later` }, 429, cors)
      const label = kind === 'verifica' ? 'verifica' : 'analizza'
      const title = `${kind === 'verifica' ? 'Verifica' : 'Analizza'}: ${clean(name) || id}`

      // Dedupe: an open request for the same listing id is the same request.
      const open = await gh(`/repos/${REPO}/issues?state=open&labels=${label}&per_page=30`)
      if (open.ok)
        for (const it of await open.json())
          if ((it.body || '').includes(`"id": "${id}"`))
            return json({ ok: true, duplicate: true, issue: it.number }, 200, cors)

      const payload = { id, name: clean(name), url: url || null }
      const res = await gh(`/repos/${REPO}/issues`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          body: [
            `Richiesta **${kind === 'verifica' ? 'verifica annuncio' : 'analisi due-diligence'}** dall'app CafePlan.`,
            '', '```json', JSON.stringify(payload, null, 2), '```',
          ].join('\n'),
          labels: [label],
        }),
      })
      if (res.status === 422) {
        // Label problems must not block the request; the Action matches by title.
        const retry = await gh(`/repos/${REPO}/issues`, {
          method: 'POST',
          body: JSON.stringify({ title, body: '```json\n' + JSON.stringify(payload, null, 2) + '\n```' }),
        })
        if (!retry.ok) return json({ error: 'github ' + retry.status }, 502, cors)
        return json({ ok: true, issue: (await retry.json()).number }, 200, cors)
      }
      if (!res.ok) return json({ error: 'github ' + res.status }, 502, cors)
      return json({ ok: true, issue: (await res.json()).number }, 200, cors)
    }

    // Push endpoints — no GitHub, no rate ceiling needed (KV writes only).
    if (u.pathname === '/check') return json(await runCheck(env), 200, cors)

    if (u.pathname === '/subscribe') {
      const body = await readBody()
      const s = body?.subscription
      if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth || !/^https:\/\//.test(s.endpoint))
        return json({ error: 'invalid subscription' }, 400, cors)
      await env.ALERTS.put('sub:' + (await sha256hex(s.endpoint)), JSON.stringify({ subscription: s, ts: Date.now() }))
      return json({ ok: true }, 200, cors)
    }

    if (u.pathname === '/unsubscribe') {
      const body = await readBody()
      if (!body?.endpoint) return json({ error: 'endpoint required' }, 400, cors)
      await env.ALERTS.delete('sub:' + (await sha256hex(body.endpoint)))
      return json({ ok: true }, 200, cors)
    }

    // {endpoint}: endpoints are unguessable, so knowing one proves ownership.
    if (u.pathname === '/test-push') {
      const body = await readBody()
      if (!body?.endpoint) return json({ error: 'endpoint required' }, 400, cors)
      const rec = JSON.parse((await env.ALERTS.get('sub:' + (await sha256hex(body.endpoint)))) || 'null')
      if (!rec?.subscription) return json({ error: 'not subscribed' }, 404, cors)
      const vapid = { subject: 'mailto:dedalus79@gmail.com', publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
      const msg = {
        data: JSON.stringify({ title: 'Canalside ☕', body: 'Test notification: alerts are working ✅', url: PORTAL }),
        options: { ttl: 600 },
      }
      try {
        const payload = await buildPushPayload(msg, rec.subscription, vapid)
        const res = await fetch(rec.subscription.endpoint, payload)
        return json({ ok: res.status < 300, status: res.status }, 200, cors)
      } catch (e) {
        return json({ ok: false, error: String((e && e.message) || e) }, 200, cors)
      }
    }

    if (u.pathname === '/verifica') return fileIssue('verifica', await readBody())
    if (u.pathname === '/analizza') return fileIssue('analizza', await readBody())
    return json({ error: 'not found' }, 404, cors)
  },
}
