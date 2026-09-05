import React, { useMemo, useState } from 'react'
import { DEFAULTS, compute, gbp, impliedCovers } from '../data/model.js'
import { MODEL_KEY, startupFor } from '../lib/applyListing.js'
import { listingHref } from '../lib/links.js'
import { fitScore, scoreBand, sdeCheck, verdict as rankListing } from '../lib/score.js'
import { CATEGORIES, categoryOf } from '../lib/category.js'
import { dueState } from '../lib/deals.js'
import { useLocalStorage } from '../hooks/useLocalStorage.js'
import { useListings } from '../hooks/useListings.js'
import { useAgentRequest } from '../hooks/useAgentRequest.js'
import ListingCard from './ListingCard.jsx'
import AlertsBell from './AlertsBell.jsx'

// Side-by-side comparison. The columns are the ones that decide whether a
// listing is worth a phone call: what it costs, what it costs to run, and
// what it earns against the 1.5×–2.5× SDE band we value on.
const COLUMNS = [
  ['name', 'Listing', (l) => l.name],
  ['cat', 'Type', (l) => categoryOf(l)],
  ['area', 'Area', (l) => l.area],
  ['price', 'Asking', (l) => l.price],
  ['rent', 'Rent / yr', (l) => l.rent],
  ['turnover', 'Turnover', (l) => l.turnover],
  ['profit', 'Profit', (l) => l.profit],
  ['multiple', 'Price / profit', (l) => (l.price != null && l.profit ? l.price / l.profit : null)],
  ['rentPct', 'Rent / turnover', (l) => (l.rent != null && l.turnover ? l.rent / l.turnover : null)],
  ['startup', 'Budget if bought', (l) => l._startup ?? null],
  ['payback', 'Payback (your concept)', (l) => l._payback ?? null],
  ['coversBE', 'Covers/day to break even', (l) => l._coversBE ?? null],
  ['implied', "Seller's covers/day", (l) => l._implied ?? null],
  ['days', 'Days listed', (l) => l._days ?? null],
  ['fit', 'Fit', (l) => l._fit ?? null],
  ['rank', 'Verdict', (l) => l._rank ?? null],
  ['status', 'Status', (l) => l.status],
]

// On a phone the table scrolls sideways; "essentials" keeps the decision
// columns in the first screen instead of hiding them off to the right.
const ESSENTIALS = new Set(['name', 'price', 'rent', 'coversBE', 'payback', 'rank'])

const cell = (key, v) => {
  if (v == null) return <span className="none">—</span>
  if (key === 'multiple') return `${v.toFixed(1)}×`
  if (key === 'rentPct') return `${Math.round(v * 100)}%`
  if (key === 'payback') return `${v.toFixed(1)} yr`
  if (key === 'coversBE' || key === 'implied') return v.toFixed(0)
  if (key === 'days') return `${v} d`
  if (key === 'fit') return <span className={`fit-chip ${scoreBand(v)}`}>{v}</span>
  if (key === 'rank') return <span className={`fit-chip ${v >= 75 ? 'good' : v >= 55 ? 'mid' : 'low'}`}>{v}</span>
  if (['price', 'rent', 'turnover', 'profit', 'startup'].includes(key)) return gbp(v)
  return v
}

function CompareTable({ rows, sort, setSort, essentials, setEssentials }) {
  const cols = essentials ? COLUMNS.filter(([k]) => ESSENTIALS.has(k)) : COLUMNS
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
      <div className="compare-tools">
        <button className="filter-chip" aria-pressed={essentials} onClick={() => setEssentials(true)}>Essentials</button>
        <button className="filter-chip" aria-pressed={!essentials} onClick={() => setEssentials(false)}>All columns</button>
        <span className="scroll-hint mono">scroll sideways for more →</span>
      </div>
      <div className="compare-scroll">
        <table className="case-table compare">
          <thead>
            <tr>
              {cols.map(([key, label]) => (
                <th key={key} className={key === 'name' ? 'sticky' : ''}>
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
              <tr key={l.id} className={l.status === 'gone' || l.status === 'stale' ? 'faded' : ''}>
                {cols.map(([key, , fn]) => (
                  <td key={key} className={key === 'name' ? 'name sticky' : 'mono'}>
                    {key === 'name'
                      ? <a href={listingHref(l)} target="_blank" rel="noreferrer">{l.name}</a>
                      : cell(key, fn(l))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="footnote">
        Price / profit is the multiple you are being asked to pay — small UK cafés change hands at
        1.5×–2.5× adjusted profit, so anything above that needs a reason. Rent / turnover above
        ~12% is the number that quietly eats the year. <b>Budget if bought</b> is the asking price
        plus the rest of the mid-case startup budget; <b>Payback</b> divides it by the profit YOUR
        model makes with that listing's rent plugged in — the seller's trade doesn't enter it.
        <b> Covers/day to break even</b> is the same idea as a daily target: your concept, their rent.
        <b> Seller's covers/day</b> is their declared turnover at your average spend — how busy they claim to be, in your units.
        <b> Days listed</b> counts from when we first saw it — long-listed is leverage.
        <b> Verdict</b> folds fit, payback, the SDE band and market status into one 0–100 rank.
        Blanks are undisclosed: that is itself the first question for the agent.
      </p>
    </div>
  )
}

// What moved in the last seven days: new listings, price changes, status
// changes — the same events the weekly push digest carries, in the app.
const WEEK_DAYS = 7
const within = (date, today) => {
  if (!date) return false
  const d = (today - new Date(date)) / 86400000
  return Number.isFinite(d) && d >= -1 && d <= WEEK_DAYS
}

function ThisWeek({ rows }) {
  const today = new Date()
  const events = []
  // A first-seen date shared by more than half the watchlist is the day the
  // field was backfilled, not a discovery: nothing was new that day.
  const seenOn = {}
  for (const l of rows) if (l.firstSeen) seenOn[l.firstSeen] = (seenOn[l.firstSeen] || 0) + 1
  const backfill = new Set(Object.entries(seenOn).filter(([, n]) => n > rows.length / 2).map(([d]) => d))
  for (const l of rows) {
    const price = l.price != null ? gbp(l.price) : 'POA'
    if (within(l.firstSeen, today) && !backfill.has(l.firstSeen)) {
      events.push({ date: l.firstSeen, id: l.id, kind: 'new', text: `New: ${l.name} · ${l.area} · ${price}` })
      continue
    }
    const h = l.history?.[l.history.length - 1]
    if (h && within(h.date, today) && h.price != null && l.price != null && h.price !== l.price) {
      events.push({ date: h.date, id: l.id, kind: 'price', text: `Price: ${l.name} ${gbp(h.price)} → ${price}` })
    } else if (within(l.lastChanged, today)) {
      const note = l.verification?.note ? ` — ${l.verification.note.slice(0, 110)}${l.verification.note.length > 110 ? '…' : ''}` : ''
      events.push({ date: l.lastChanged, id: l.id, kind: l.status === 'gone' ? 'gone' : 'changed', text: `${l.name}: ${l.status}${note}` })
    }
  }
  if (!events.length) return null
  events.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return (
    <div className="panel thisweek">
      <h2 className="panel-title">
        This week
        <span className="side">{events.length} change{events.length === 1 ? '' : 's'} in the last {WEEK_DAYS} days</span>
      </h2>
      <ul>
        {events.slice(0, 8).map((e) => (
          <li key={`${e.id}-${e.kind}`} className={e.kind}>
            <span className="mono when">{e.date}</span>
            <span>{e.text}</span>
          </li>
        ))}
        {events.length > 8 && <li className="more"><span className="mono when" /><span>and {events.length - 8} more</span></li>}
      </ul>
    </div>
  )
}

function Shortlist({ rows }) {
  const top = rows.filter((l) => l._verdict && l._verdict.band !== 'out').slice(0, 3)
  if (!top.length) return null
  return (
    <div className="panel shortlist">
      <h2 className="panel-title">Call these first</h2>
      <ol>
        {top.map((l) => (
          <li key={l.id}>
            <span className={`fit-chip ${l._rank >= 75 ? 'good' : l._rank >= 55 ? 'mid' : 'low'}`}>{l._rank}</span>
            <b>{l.name}</b>
            <span className="muted"> · {l.area} · {l.price != null ? gbp(l.price) : 'POA'}</span>
            {l._verdict.reasons.length > 0 && <span className="why"> — {l._verdict.reasons.slice(0, 3).join(', ')}</span>}
          </li>
        ))}
      </ol>
      <p className="footnote">
        Ranked by the verdict score: how well the site fits the concept, what it pays back on your own model,
        the SDE band where you have seller figures, and whether it is actually still for sale. Save (★) the ones
        you call; dismiss (Not for me) the ones you rule out and they drop out of everything.
      </p>
    </div>
  )
}

export default function ListingsPanel() {
  const [data, refetch] = useListings()
  const [area, setArea] = useLocalStorage('cafeplan:area', 'All')
  const [cat, setCat] = useLocalStorage('cafeplan:category', 'all')
  const [favsOnly, setFavsOnly] = useLocalStorage('cafeplan:favsOnly', false)
  const [favs, setFavs] = useLocalStorage('cafeplan:favs', [])
  const [dismissed, setDismissed] = useLocalStorage('cafeplan:dismissed', [])
  const [deals, setDeals] = useLocalStorage('cafeplan:deals', {})
  const [showDismissed, setShowDismissed] = useState(false)
  const [inProgress, setInProgress] = useState(false)
  const [dueOnly, setDueOnly] = useState(false)
  const [notes, setNotes] = useLocalStorage('cafeplan:listingNotes', {})
  const [sdeInputs, setSdeInputs] = useLocalStorage('cafeplan:sdeInputs', {})
  const [view, setView] = useLocalStorage('cafeplan:listingsView', 'cards')
  const [essentials, setEssentials] = useLocalStorage('cafeplan:compareEssentials', true)
  const [sort, setSort] = useState({ key: 'rank', dir: 'desc' })
  const [cardSort, setCardSort] = useLocalStorage('cafeplan:cardSort', 'rank')
  const [actions, request] = useAgentRequest(refetch)

  const toggleIn = (list, setList, id) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const areas = ['All', ...new Set(data.listings.map((l) => l.area))]

  // Decision figures for every listing: total budget at the asking price,
  // payback of YOUR concept (live model, this listing's rent plugged in),
  // fit score, SDE band from your inputs, and the verdict that folds them.
  const enriched = useMemo(() => {
    let base = DEFAULTS
    try {
      const raw = window.localStorage.getItem(MODEL_KEY)
      if (raw) base = { ...DEFAULTS, ...JSON.parse(raw) }
    } catch { /* private mode — plan defaults */ }
    const today = new Date()
    return data.listings.map((l) => {
      const startup = startupFor(l)
      // Your concept in their premises: what it needs to break even at THAT rent.
      const r = compute({ ...base, rent: l.rent ?? base.rent })
      const coversBE = l.rent != null && Number.isFinite(r.coversBE) ? r.coversBE : null
      let payback = null
      if (startup != null && r.profit > 0) payback = startup / r.profit
      const sde = sdeCheck(sdeInputs[l.id], l.price)
      const v = rankListing(l, { payback, sde, stage: deals[l.id]?.stage })
      const from = l.firstSeen || l.history?.[0]?.date || l.lastVerified
      const days = from ? Math.max(0, Math.round((today - new Date(from)) / 86400000)) : null
      return {
        ...l,
        _startup: startup, _payback: payback, _coversBE: coversBE, _days: days,
        _profit: r.profit, _implied: impliedCovers(l.turnover, base), _due: dueState(deals[l.id], today),
        _fit: fitScore(l).score, _rank: v.rank, _verdict: v,
      }
    })
  }, [data, sdeInputs, deals])

  const counts = {}
  for (const l of enriched) if (!dismissed.includes(l.id)) counts[categoryOf(l)] = (counts[categoryOf(l)] || 0) + 1

  const active = (id) => deals[id]?.stage && !['watching', 'passed'].includes(deals[id].stage)
  const inProgressCount = Object.keys(deals).filter(active).length
  const isDue = (l) => l._due === 'overdue' || l._due === 'soon'
  const dueCount = enriched.filter((l) => isDue(l) && !dismissed.includes(l.id)).length
  const overdueCount = enriched.filter((l) => l._due === 'overdue' && !dismissed.includes(l.id)).length

  const shown = enriched.filter(
    (l) =>
      (area === 'All' || l.area === area)
      && (cat === 'all' || categoryOf(l) === cat)
      && (!favsOnly || favs.includes(l.id))
      && (!inProgress || active(l.id))
      && (!dueOnly || isDue(l))
      && (showDismissed ? dismissed.includes(l.id) : !dismissed.includes(l.id)),
  )
  // Cards: by verdict unless you ask otherwise; blanks always sink.
  const nz = (v) => (v == null ? Infinity : v)
  const ORDER = {
    rank: (a, b) => b._rank - a._rank,
    price: (a, b) => nz(a.price) - nz(b.price),
    rent: (a, b) => nz(a.rent) - nz(b.rent),
    payback: (a, b) => nz(a._payback) - nz(b._payback),
    newest: (a, b) => nz(a._days) - nz(b._days),
    longest: (a, b) => nz(b._days === null ? null : -b._days) - nz(a._days === null ? null : -a._days),
  }
  const ranked = [...shown].sort(ORDER[cardSort] || ORDER.rank)
  const unfiltered = !showDismissed && !favsOnly && !inProgress && !dueOnly && area === 'All' && cat === 'all'

  return (
    <>
      <div className="filters-row cat-row">
        <button className="filter-chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
          All types
        </button>
        {CATEGORIES.filter(([k]) => counts[k]).map(([k, label]) => (
          <button key={k} className="filter-chip" aria-pressed={cat === k} onClick={() => setCat(k)}>
            {label} <span className="count">{counts[k]}</span>
          </button>
        ))}
      </div>
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
        {inProgressCount > 0 && (
          <button
            className="filter-chip"
            aria-pressed={inProgress}
            onClick={() => setInProgress(!inProgress)}
            title="Listings you have called, viewed or made an offer on"
          >
            ☎ In progress ({inProgressCount})
          </button>
        )}
        {dueCount > 0 && (
          <button
            className={`filter-chip ${overdueCount > 0 ? 'overdue' : ''}`}
            aria-pressed={dueOnly}
            onClick={() => setDueOnly(!dueOnly)}
            title="Deals with a follow-up due within three days, or overdue"
          >
            ⏰ Follow-ups ({dueCount})
          </button>
        )}
        {dismissed.length > 0 && (
          <button
            className="filter-chip"
            aria-pressed={showDismissed}
            onClick={() => setShowDismissed(!showDismissed)}
            title="Listings you ruled out"
          >
            ✕ Dismissed ({dismissed.length})
          </button>
        )}
        <button
          className="filter-chip"
          aria-pressed={view === 'table'}
          onClick={() => setView(view === 'table' ? 'cards' : 'table')}
          title="Compare every listing side by side"
        >
          ▤ Compare
        </button>
        <AlertsBell />
        {view !== 'table' && (
          <label className="card-sort">
            <span className="mono">sort</span>
            <select className="status-select" value={cardSort} onChange={(e) => setCardSort(e.target.value)} aria-label="Sort listings">
              <option value="rank">verdict</option>
              <option value="price">asking price</option>
              <option value="rent">rent</option>
              <option value="payback">payback</option>
              <option value="newest">newest</option>
              <option value="longest">longest listed</option>
            </select>
          </label>
        )}
        <span className="updated-line mono">data updated {data.updated}</span>
      </div>

      {unfiltered && <ThisWeek rows={enriched.filter((l) => !dismissed.includes(l.id))} />}
      {unfiltered && <Shortlist rows={ranked} />}

      {view === 'table' && shown.length > 0 && (
        <CompareTable rows={shown} sort={sort} setSort={setSort} essentials={essentials} setEssentials={setEssentials} />
      )}

      {shown.length === 0 ? (
        <div className="empty panel">
          {showDismissed ? 'Nothing dismissed yet.' : dueOnly ? 'No follow-ups due in the next three days.' : 'No listings match. Clear the area filter or turn off “♥ Saved”.'}
        </div>
      ) : view === 'table' ? null : (
        <div className="listing-grid">
          {ranked.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              verdict={l._verdict}
              fav={favs.includes(l.id)}
              onFav={() => toggleIn(favs, setFavs, l.id)}
              dismissed={dismissed.includes(l.id)}
              onDismiss={() => toggleIn(dismissed, setDismissed, l.id)}
              note={notes[l.id]}
              onNote={(v) => setNotes({ ...notes, [l.id]: v })}
              sdeInputs={sdeInputs[l.id]}
              onSdeInputs={(v) => setSdeInputs({ ...sdeInputs, [l.id]: v })}
              deal={deals[l.id]}
              onDeal={(v) => setDeals({ ...deals, [l.id]: v })}
              action={actions[l.id]}
              onRequest={request}
            />
          ))}
        </div>
      )}

      <p className="footnote" style={{ marginTop: 18 }}>
        Verify re-checks a listing against the live web (Copilot agent) and updates the badge; Analyse runs a full
        due-diligence report against our valuation anchors. Active listings are re-checked every two days
        automatically, parked ones weekly.
      </p>
    </>
  )
}
