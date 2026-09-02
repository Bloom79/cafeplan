import { useEffect, useRef, useState } from 'react'
import { WORKER_URL } from '../config.js'

// The Verify / Analyse round trip: POST to the worker, which files an issue
// the Action picks up; poll the issue until it closes; fetch the report.
// State is per listing id: { kind, issue, busy, outcome, report, error, open }.
export function useAgentRequest(onDone) {
  const [actions, setActions] = useState({})
  const timers = useRef({})
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const t = timers.current
    return () => {
      mounted.current = false
      Object.values(t).forEach(clearTimeout)
    }
  }, [])

  const patch = (id, p) => setActions((a) => ({ ...a, [id]: { ...a[id], ...p } }))

  const poll = (id, issue, tries = 0) => {
    if (!mounted.current) return
    if (tries > 60) { patch(id, { busy: false, error: 'timed out — check the issue on GitHub' }); return }
    timers.current[id] = setTimeout(async () => {
      try {
        const res = await fetch(`${WORKER_URL}/stato?issue=${issue}`, { cache: 'no-store' })
        if (res.ok) {
          const { state, outcome } = await res.json()
          if (state === 'closed') {
            const rr = await fetch(`${WORKER_URL}/report?issue=${issue}`, { cache: 'no-store' })
            const { report } = rr.ok ? await rr.json() : {}
            patch(id, { busy: false, outcome, report, open: true })
            if (onDone) setTimeout(() => mounted.current && onDone(), 4000)
            return
          }
        }
      } catch { /* transient — keep polling */ }
      poll(id, issue, tries + 1)
    }, 5000)
  }

  const request = async (kind, l) => {
    patch(l.id, { kind, busy: true, error: null, report: null, open: true })
    try {
      const res = await fetch(`${WORKER_URL}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: l.id, name: l.name, url: l.url }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.error || `worker ${res.status}`)
      patch(l.id, { issue: body.issue })
      poll(l.id, body.issue)
    } catch (e) {
      patch(l.id, {
        busy: false,
        error: /failed to fetch|networkerror/i.test(String(e))
          ? 'verifier not reachable — is the worker deployed? (see README)'
          : String(e.message || e),
      })
    }
  }

  return [actions, request]
}
