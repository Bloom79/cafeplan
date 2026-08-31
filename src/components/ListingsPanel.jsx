import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULTS, compute, gbp } from '../data/model.js'
import { MODEL_KEY, applyListingToModel, startupFor } from '../lib/applyListing.js'
import { gmapsHref, isWalled, listingHref, listingLabel, searchHref } from '../lib/links.js'
import { WORKER_URL } from '../config.js'
import { useLocalStorage } from '../hooks/useLocalStorage.js'
import { useListings } from '../hooks/useListings.js'
import Markdown from './Markdown.jsx'

const OUTCOME_LABEL = {
  live: { text: '✓ verified for sale', cls: 'live' },
  changed: { text: '⚠ changed', cls: 'changed' },
  gone: { text: '✕ no longer available', cls: 'gone' },
  unclear: { text: '? unverified', cls: 'unclear' },
}

// Card thumbnails are a static 2×2 OpenStreetMap tile mosaic, not an
// <iframe> of the OSM embed app: four ~20 kB PNGs instead of a whole second
// web app per card, and no third-party attribution bar sprawling across a
// 140px thumbnail. The block is chosen so the listing is never near an edge,
// which lets the CSS centre it without exposing empty space.
const TILE_Z = 15

const mosaic = (lat, lng) => {
  const n = 2 ** TILE_Z
  const X = ((lng + 180) / 360) * n
  const rad = (lat * Math.PI) / 180
  const Y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
  const x0 = Math.floor(X) - (X - Math.floor(X) < 0.5 ? 1 : 0)
  const y0 = Math.floor(Y) - (Y - Math.floor(Y) < 0.5 ? 1 : 0)
  const wrap = (v) => ((v % n) + n) % n
  const urls = []
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++)
      urls.push(`https://tile.openstreetmap.org/${TILE_Z}/${wrap(x0 + dx)}/${wrap(y0 + dy)}.png`)
  return { urls, px: (X - x0) / 2, py: (Y - y0) / 2 }
}

// Side-by-side comparison. The columns are the ones that decide whether a
// listing is worth a phone call: what it costs, what it costs to run, and
// what it earns against the 1.5×–2.5× SDE band we value on.
const COLUMNS = [
  ['name', 'Listing', (l) => l.name],
  ['area', 'Area', (l) => l.area],
  ['price', 'Asking', (l) => l.price],
  ['rent', 'Rent / yr', (l) => l.rent],
  ['turnover', 'Turnover', (l) => l.turnover],
  ['profit', 'Profit', (l) => l.profit],
  ['multiple', 'Price / profit', (l) => (l.price != null && l.profit ? l.price / l.profit : null)],
  ['rentPct', 'Rent / turnover', (l) => (l.rent != null && l.turnover ? l.rent / l.turnover : null)],
  ['startup', 'Budget if bought', (l) => l._startup ?? null],
  ['payback', 'Payback (your concept)', (l) => l._payback ?? null],
  ['status', 'Status', (l) => l.status],
]

const cell = (key, v) => {
  if (v == null) return <span className="none">—</span>
  if (key === 'multiple') return `${v.toFixed(1)}×`
  if (key === 'rentPct') return `${Math.round(v * 100)}%`
  if (key === 'payback') return `${v.toFixed(1)} yr`
  if (['price', 'rent', 'turnover', 'profit', 'startup'].includes(key)) return gbp(v)
  return v
}

function CompareTable({ rows, sort, setSort }) {
  const get = Object.fromEntries(COLUMNS.map(([k, , fn]) => [k, fn]))
  const sorted = [...rows].sort((a, b) => {
    const x = get[sort.key](a)
    const y = get[sort.key](b)
    if (x == null) return 1
    if (y == null) return -1
    const d = typeof x === 'number' ? x - y : String(x).localeCompare(String(y))
    return sort.dir === 'asc' ? d : -d
  })
  const toggle = (key) =>
    setSort({ key, dir: sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc' })

  return (
    <div className="panel compare-wrap">
      <table className="case-table compare">
        <thead>
          <tr>
            {COLUMNS.map(([key, label]) => (
              <th key={key}>
                <button className="th-sort" onClick={() => toggle(key)} aria-label={`Sort by ${label}`}>
                  {label}
                  {sort.key === key && <span className="dir">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((l) => (
            <tr key={l.id} className={l.status === 'gone' ? 'faded' : ''}>
              {COLUMNS.map(([key, , fn]) => (
                <td key={key} className={key === 'name' ? 'name' : 'mono'}>
                  {key === 'name'
                    ? <a href={listingHref(l)} target="_blank" rel="noreferrer">{l.name}</a>
                    : cell(key, fn(l))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="footnote">
        Price / profit is the multiple you are being asked to pay — small UK cafés change hands at
        1.5×–2.5× adjusted profit, so anything above that needs a reason. Rent / turnover above
        ~12% is the number that quietly eats the year. <b>Budget if bought</b> is the asking price
        plus the rest of the mid-case startup budget; <b>Payback</b> divides it by the profit YOUR
        model makes with that listing's rent plugged in — the seller's trade doesn't enter it.
        Blanks are undisclosed: that is itself the first question for the agent.
      </p>
    </div>
  )
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
  const [data, refetch] = useListings()
  const [area, setArea] = useLocalStorage('cafeplan:area', 'All')
  const [favsOnly, setFavsOnly] = useLocalStorage('cafeplan:favsOnly', false)
  const [favs, setFavs] = useLocalStorage('cafeplan:favs', [])
  const [notes, setNotes] = useLocalStorage('cafeplan:listingNotes', {})
  const [view, setView] = useLocalStorage('cafeplan:listingsView', 'cards')
  const [sort, setSort] = useState({ key: 'price', dir: 'asc' })
  // per-listing action state: { kind, issue, busy, outcome, report, error }
  const [actions, setActions] = useState({})
  const pollTimers = useRef({})
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const timers = pollTimers.current
    return () => {
      mounted.current = false
      Object.values(timers).forEach(clearTimeout)
    }
  }, [])

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

  // Decision columns for the compare view: total budget at the asking price,
  // and how long YOUR concept (the live model, with this listing's rent
  // plugged in) takes to pay it back. Reads the model the user last edited.
  const compareRows = useMemo(() => {
    if (view !== 'table') return shown
    let base = DEFAULTS
    try {
      const raw = window.localStorage.getItem(MODEL_KEY)
      if (raw) base = { ...DEFAULTS, ...JSON.parse(raw) }
    } catch { /* private mode — plan defaults */ }
    return shown.map((l) => {
      const startup = startupFor(l)
      let payback = null
      if (startup != null) {
        const r = compute({ ...base, rent: l.rent ?? base.rent })
        if (r.profit > 0) payback = startup / r.profit
      }
      return { ...l, _startup: startup, _payback: payback }
    })
  }, [shown, view])

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
        <button
          className="filter-chip"
          aria-pressed={view === 'table'}
          onClick={() => setView(view === 'table' ? 'cards' : 'table')}
          title="Compare every listing side by side"
        >
          ▤ Compare
        </button>
        <span className="updated-line mono">data updated {data.updated}</span>
      </div>

      {view === 'table' && shown.length > 0 && (
        <CompareTable rows={compareRows} sort={sort} setSort={setSort} />
      )}

      {shown.length === 0 ? (
        <div className="empty panel">No listings match. Clear the area filter or turn off “♥ Saved”.</div>
      ) : view === 'table' ? null : (
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
                {l.history?.length > 0 && (
                  <div className="price-history" title="Asking price since we started watching">
                    {l.history.map((h) => (
                      <span key={h.date}>{gbp(h.price)} <i>→</i> </span>
                    ))}
                    <b>{l.price != null ? gbp(l.price) : 'POA'}</b>
                    <span className="when">changed {l.history[l.history.length - 1].date}</span>
                  </div>
                )}
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

                {l.lat != null && l.lng != null && (() => {
                  const m = mosaic(l.lat, l.lng)
                  return (
                    <a
                      className="map-preview"
                      href={gmapsHref(l)}
                      target="_blank"
                      rel="noreferrer"
                      title="Open in Google Maps"
                      aria-label={`${l.name} on the map — opens Google Maps`}
                    >
                      <span className="mosaic" style={{ '--px': m.px, '--py': m.py }}>
                        {m.urls.map((u) => (
                          <img key={u} src={u} alt="" width="256" height="256" loading="lazy" />
                        ))}
                        <span className="mpin" />
                      </span>
                      <span className="osm-credit">© OpenStreetMap</span>
                    </a>
                  )
                })()}

                <div className="card-actions">
                  <a className="action-btn view" href={listingHref(l)} target="_blank" rel="noreferrer">
                    {listingLabel(l)}
                  </a>
                  {l.url && isWalled(l) && (
                    <a
                      className="action-btn ghost"
                      href={searchHref(l)}
                      target="_blank"
                      rel="noreferrer"
                      title="Rightbiz may ask you to prove you are human — this route goes via search instead"
                    >
                      via search ↗
                    </a>
                  )}
                  <button className="action-btn" disabled={act?.busy} onClick={() => request('verifica', l)}>
                    {act?.busy && act?.kind === 'verifica' ? 'verifying…' : 'Verify now'}
                  </button>
                  <button className="action-btn ghost" disabled={act?.busy} onClick={() => request('analizza', l)}>
                    {act?.busy && act?.kind === 'analizza' ? 'analysing…' : 'Analyse'}
                  </button>
                  <button
                    className="action-btn model"
                    onClick={() => { applyListingToModel(l); window.location.hash = '#model' }}
                    title="Load this site's rent and asking price into the model"
                  >
                    Run in the model →
                  </button>
                  <a className="action-btn ghost gmaps" href={gmapsHref(l)} target="_blank" rel="noreferrer">
                    Google Maps ↗
                  </a>
                </div>

                <label className="own-note">
                  <span>Your notes</span>
                  <textarea
                    rows={2}
                    value={notes[l.id] || ''}
                    placeholder="what the agent said, what to check, what it felt like…"
                    onChange={(e) => setNotes({ ...notes, [l.id]: e.target.value })}
                  />
                </label>

                {act?.error && <p className="act-error">{act.error}</p>}
                {act?.busy && !act?.error && (
                  <p className="act-status mono">
                    agent running{act.issue ? ` · issue #${act.issue}` : ''} — a minute or two, this tab keeps polling
                  </p>
                )}
                {act?.open && !act?.busy && act?.report ? (
                  <details className="report" open>
                    <summary>{act.kind === 'analizza' ? 'Due diligence report' : 'Verification report'}</summary>
                    <Markdown text={act.report} />
                  </details>
                ) : l.analysis?.report ? (
                  // The stored copy: an Analyse run costs credits, so it is
                  // kept in the data rather than lost with the tab.
                  <details className="report">
                    <summary>Due diligence · {l.analysis.date}</summary>
                    <Markdown text={l.analysis.report} />
                  </details>
                ) : null}

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
