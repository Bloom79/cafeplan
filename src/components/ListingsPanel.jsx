import React, { useEffect, useRef, useState } from 'react'
import { SEED_DATA } from '../data/listings.js'
import { gbp } from '../data/model.js'
import { WORKER_URL, DATA_URL } from '../config.js'
import { useLocalStorage } from '../hooks/useLocalStorage.js'
import Markdown from './Markdown.jsx'

const OUTCOME_LABEL = {
  live: { text: '✓ verified for sale', cls: 'live' },
  changed: { text: '⚠ changed', cls: 'changed' },
  gone: { text: '✕ no longer available', cls: 'gone' },
  unclear: { text: '? unverified', cls: 'unclear' },
}

const ago = (date) => {
  if (!date) return null
  const d = (Date.now() - new Date(date).getTime()) / 86400000
  if (!Number.isFinite(d)) return null
  if (d < 1) return 'today'
  if (d < 2) return 'yesterday'
  return `${Math.floor(d)} days ago`
}

export default function ListingsPanel() {
  const [data, setData] = useState(SEED_DATA)
  const [area, setArea] = useLocalStorage('cafeplan:area', 'All')
  const [favsOnly, setFavsOnly] = useLocalStorage('cafeplan:favsOnly', false)
  const [favs, setFavs] = useLocalStorage('cafeplan:favs', [])
  // per-listing action state: { kind, issue, busy, outcome, report, error }
  const [actions, setActions] = useState({})
  const pollTimers = useRef({})
  const mounted = useRef(true)

  const refetch = React.useCallback(async () => {
    try {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } catch { /* keep current data */ }
  }, [])

  useEffect(() => {
    mounted.current = true
    refetch()
    return () => {
      mounted.current = false
      Object.values(pollTimers.current).forEach(clearTimeout)
    }
  }, [refetch])

  const setAction = (id, patch) =>
    setActions((a) => ({ ...a, [id]: { ...a[id], ...patch } }))

  const stopPoll = (id) => {
    if (pollTimers.current[id]) { clearTimeout(pollTimers.current[id]); delete pollTimers.current[id] }
  }

  const poll = (id, issue, tries = 0) => {
    if (!mounted.current || tries > 60) {
      stopPoll(id)
      if (mounted.current && tries > 60) setAction(id, { busy: false, error: 'timed out — check the issue on GitHub' })
      return
    }
    pollTimers.current[id] = setTimeout(async () => {
      try {
        const res = await fetch(`${WORKER_URL}/stato?issue=${issue}`, { cache: 'no-store' })
        if (res.ok) {
          const { state, outcome } = await res.json()
          if (state === 'closed') {
            const rr = await fetch(`${WORKER_URL}/report?issue=${issue}`, { cache: 'no-store' })
            const { report } = rr.ok ? await rr.json() : {}
            setAction(id, { busy: false, outcome, report, open: true })
            setTimeout(() => mounted.current && refetch(), 4000)
            return
          }
        }
      } catch { /* transient — keep polling */ }
      poll(id, issue, tries + 1)
    }, 5000)
  }

  const request = async (kind, l) => {
    setAction(l.id, { kind, busy: true, error: null, report: null, open: true })
    try {
      const res = await fetch(`${WORKER_URL}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: l.id, name: l.name, url: l.url }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.error || `worker ${res.status}`)
      setAction(l.id, { issue: body.issue })
      poll(l.id, body.issue)
    } catch (e) {
      setAction(l.id, {
        busy: false,
        error: /failed to fetch|networkerror/i.test(String(e))
          ? 'verifier not reachable — is the worker deployed? (see README)'
          : String(e.message || e),
      })
    }
  }

  const toggleFav = (id) =>
    setFavs(favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id])

  const areas = ['All', ...new Set(data.listings.map((l) => l.area))]
  const shown = data.listings.filter(
    (l) => (area === 'All' || l.area === area) && (!favsOnly || favs.includes(l.id)),
  )

  // Images from the portals sometimes rot or hotlink-block; drop broken
  // ones silently instead of showing a torn-image icon.
  const [brokenImgs, setBrokenImgs] = useState({})
  const imgFailed = (id) => setBrokenImgs((b) => ({ ...b, [id]: true }))

  return (
    <>
      <div className="filters-row">
        {areas.map((ar) => (
          <button key={ar} className="filter-chip" aria-pressed={area === ar} onClick={() => setArea(ar)}>
            {ar}
          </button>
        ))}
        <button
          className="filter-chip"
          aria-pressed={favsOnly}
          onClick={() => setFavsOnly(!favsOnly)}
          title="Show saved listings only"
        >
          ♥ Saved {favs.length > 0 && `(${favs.length})`}
        </button>
        <span className="updated-line mono">data updated {data.updated}</span>
      </div>

      {shown.length === 0 ? (
        <div className="empty panel">No listings match. Clear the area filter or turn off “♥ Saved”.</div>
      ) : (
        <div className="listing-grid">
          {shown.map((l) => {
            const v = l.verification
            const vLabel = v ? OUTCOME_LABEL[v.outcome] || OUTCOME_LABEL.unclear : null
            const act = actions[l.id]
            return (
              <article key={l.id} className={`listing ${favs.includes(l.id) ? 'fav' : ''}`}>
                {l.image && !brokenImgs[l.id] ? (
                  <a className="photo" href={l.url || l.image} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden="true">
                    <img src={l.image} alt="" loading="lazy" onError={() => imgFailed(l.id)} />
                  </a>
                ) : (
                  <div className="photo tile" aria-hidden="true">
                    <span className="tile-name">{l.name}</span>
                    <span className="tile-area">{l.area} · Edinburgh</span>
                  </div>
                )}
                <div className="top">
                  <h3>{l.name}</h3>
                  <button
                    className={`fav-btn ${favs.includes(l.id) ? 'on' : ''}`}
                    aria-label={favs.includes(l.id) ? `Remove ${l.name} from saved` : `Save ${l.name}`}
                    aria-pressed={favs.includes(l.id)}
                    onClick={() => toggleFav(l.id)}
                  >
                    {favs.includes(l.id) ? '★' : '☆'}
                  </button>
                </div>
                <div className="price">{l.price != null ? gbp(l.price) : 'POA'}</div>
                <div className="meta">
                  <span>{l.area} · {l.tenure}</span>
                  {l.rent != null && <span>Rent {gbp(l.rent)}/yr</span>}
                  {l.turnover != null && (
                    <span>Turnover {gbp(l.turnover)}/yr · profit {gbp(l.profit)} ({Math.round((l.profit / l.turnover) * 100)}%)</span>
                  )}
                </div>
                <div className="badge-row">
                  <span className={`status-badge ${l.status === 'under offer' ? 'under' : l.status === 'gone' ? 'gone' : 'active'}`}>
                    {l.status}
                  </span>
                  {vLabel && (
                    <span className={`vbadge ${vLabel.cls}`} title={v.note || ''}>
                      {vLabel.text}{l.lastVerified ? ` · ${ago(l.lastVerified) || l.lastVerified}` : ''}
                    </span>
                  )}
                </div>
                <div className="tag-row">{l.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
                <p className="notes">{l.notes}</p>

                {l.lat != null && l.lng != null && (
                  <a
                    className="map-preview"
                    href={`https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open in Google Maps"
                  >
                    <iframe
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${l.lng - 0.005},${l.lat - 0.0025},${l.lng + 0.005},${l.lat + 0.0025}&layer=mapnik&marker=${l.lat},${l.lng}`}
                      loading="lazy"
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                  </a>
                )}

                <div className="card-actions">
                  {l.url && (
                    <a className="action-btn view" href={l.url} target="_blank" rel="noreferrer">
                      Open the listing ↗
                    </a>
                  )}
                  <button className="action-btn" disabled={act?.busy} onClick={() => request('verifica', l)}>
                    {act?.busy && act?.kind === 'verifica' ? 'verifying…' : 'Verify now'}
                  </button>
                  <button className="action-btn ghost" disabled={act?.busy} onClick={() => request('analizza', l)}>
                    {act?.busy && act?.kind === 'analizza' ? 'analysing…' : 'Analyse'}
                  </button>
                  <a
                    className="action-btn ghost gmaps"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.name} ${l.area} Edinburgh`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google Maps ↗
                  </a>
                </div>

                {act?.error && <p className="act-error">{act.error}</p>}
                {act?.busy && !act?.error && (
                  <p className="act-status mono">
                    agent running{act.issue ? ` · issue #${act.issue}` : ''} — a minute or two, this tab keeps polling
                  </p>
                )}
                {act?.open && !act?.busy && act?.report && (
                  <details className="report" open>
                    <summary>{act.kind === 'analizza' ? 'Due diligence report' : 'Verification report'}</summary>
                    <Markdown text={act.report} />
                  </details>
                )}

                <span className="src">snapshot · {l.source}</span>
              </article>
            )
          })}
        </div>
      )}

      <p className="footnote" style={{ marginTop: 18 }}>
        Verify re-checks a listing against the live web (Copilot agent) and updates the badge; Analyse runs a full
        due-diligence report against our valuation anchors. A daily run keeps everything fresh automatically.
      </p>
    </>
  )
}
