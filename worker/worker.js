// CafePlan worker — the listings verifier's tiny backend on Cloudflare.
// Same pattern as CasaTrova's worker (summerhome repo), minus push alerts.
//
// Roles:
//  1. POST /verifica   file a "Verifica: <name>" issue (listing Verify button)
//  2. POST /analizza   file an "Analizza: <name>" issue (Analyse button)
//  3. GET  /stato      live progress of a request (button polling)
//  4. GET  /report     the finished report (last comment on the closed issue)
//
// Secret: GITHUB_TOKEN — fine-grained PAT, Issues read/write on Bloom79/cafeplan.
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

export default {
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

    if (u.pathname === '/verifica') return fileIssue('verifica', await readBody())
    if (u.pathname === '/analizza') return fileIssue('analizza', await readBody())
    return json({ error: 'not found' }, 404, cors)
  },
}
