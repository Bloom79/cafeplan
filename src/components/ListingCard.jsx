import React, { useState } from 'react'
import { gbp } from '../data/model.js'
import { OTHER_COSTS, applyListingToModel } from '../lib/applyListing.js'
import { gmapsHref, isWalled, listingHref, listingLabel, searchHref } from '../lib/links.js'
import { fitScore, scoreBand } from '../lib/score.js'
import { categoryLabel, categoryOf } from '../lib/category.js'
import { dueState } from '../lib/deals.js'
import { useInView } from '../hooks/useInView.js'
import Markdown from './Markdown.jsx'
import FairPrice from './FairPrice.jsx'
import Sparkline from './Sparkline.jsx'
import CallSheet, { DUE_LABEL, STAGES } from './CallSheet.jsx'

const OUTCOME_LABEL = {
  live: { text: '✓ verified for sale', cls: 'live' },
  changed: { text: '⚠ changed', cls: 'changed' },
  gone: { text: '✕ no longer available', cls: 'gone' },
  unclear: { text: '? unverified', cls: 'unclear' },
}

const STATUS_CLS = { 'under offer': 'under', gone: 'gone', stale: 'gone' }

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

const ago = (date) => {
  if (!date) return null
  const d = (Date.now() - new Date(date).getTime()) / 86400000
  if (!Number.isFinite(d)) return null
  if (d < 1) return 'today'
  if (d < 2) return 'yesterday'
  return `${Math.floor(d)} days ago`
}

// "checked today, unchanged since 29 Aug" — the honest freshness line.
const freshness = (l) => {
  const checked = l.lastChecked || l.lastVerified
  if (!checked) return null
  const changed = l.lastChanged
  return `checked ${ago(checked) || checked}${changed ? ` · unchanged since ${changed}` : ''}`
}

const rankCls = (rank) => (rank >= 75 ? 'good' : rank >= 55 ? 'mid' : 'low')
const cov = (v) => (Number.isFinite(v) ? v.toFixed(0) : '∞')

export default function ListingCard({
  listing: l, fav, onFav, dismissed, onDismiss, note, onNote,
  sdeInputs, onSdeInputs, action, onRequest, verdict, deal, onDeal,
  compact = false, onExpand, onCollapse,
}) {
  const stage = deal?.stage && deal.stage !== 'watching' ? STAGES.find(([k]) => k === deal.stage) : null
  const due = dueState(deal)
  const v = l.verification
  const vLabel = v ? OUTCOME_LABEL[v.outcome] || OUTCOME_LABEL.unclear : null
  const fit = fitScore(l)
  const [showFit, setShowFit] = useState(false)
  const [imgBroken, setImgBroken] = useState(false)
  const [mapRef, mapSeen] = useInView()

  // The phone card: the photo at full width when there is one (a café is
  // a place; a thumbnail says nothing), then what decides whether to tap.
  if (compact) {
    const open = (e) => { e.preventDefault(); onExpand && onExpand() }
    const hasPhoto = !!l.image && !imgBroken
    return (
      <article
        className={`listing compact ${hasPhoto ? 'photo-card' : 'row'} ${fav ? 'fav' : ''} ${dismissed ? 'dismissed' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Open ${l.name}`}
        onClick={open}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open(e)}
      >
        {hasPhoto && <img className="hero" src={l.image} alt="" loading="lazy" onError={() => setImgBroken(true)} />}
        <div className="c-body">
          <div className="c-top">
            <h3>{fav ? '★ ' : ''}{l.name}</h3>
            {verdict && verdict.band !== 'out' && <span className={`fit-chip ${rankCls(verdict.rank)}`}>{verdict.rank}</span>}
          </div>
          <div className="c-meta mono">
            {l.price != null ? gbp(l.price) : 'POA'} · {l.area}{l.rent != null && <> · rent {gbp(l.rent)}</>}
            {l.status !== 'active' && <> · {l.status}</>}
          </div>
          <div className="c-facts">
            {l._coversBE != null && <span><b>{cov(l._coversBE)}</b> to break even</span>}
            {l._coversPay != null && <span><b>{cov(l._coversPay)}</b> to pay you</span>}
            {verdict && verdict.band !== 'out' && verdict.reasons[0] && <span>{verdict.reasons[0]}</span>}
            {stage && <span className={`stage-badge ${deal.stage}`}>{stage[1]}</span>}
            {due && due !== 'later' && <span className={`due-badge ${due}`}>{DUE_LABEL[due]}</span>}
          </div>
        </div>
        <span className="c-open" aria-hidden="true">›</span>
      </article>
    )
  }

  return (
    <article className={`listing ${fav ? 'fav' : ''} ${dismissed ? 'dismissed' : ''}`}>
      {onCollapse && (
        <button className="c-collapse filter-chip" onClick={onCollapse} aria-label="Back to the list">▴ Back to the list</button>
      )}
      {l.image && !imgBroken ? (
        <a className="photo" href={l.url || l.image} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden="true">
          <img src={l.image} alt="" loading="lazy" onError={() => setImgBroken(true)} />
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
          className={`fav-btn ${fav ? 'on' : ''}`}
          aria-label={fav ? `Remove ${l.name} from saved` : `Save ${l.name}`}
          aria-pressed={fav}
          onClick={onFav}
        >
          {fav ? '★' : '☆'}
        </button>
      </div>

      {verdict && verdict.band !== 'out' && (
        <div className={`verdict-line ${verdict.band}`}>
          <b>{verdict.band === 'call' ? 'Call first' : verdict.band === 'watch' ? 'Worth a look' : 'Probably pass'}</b>
          <span className="mono"> · {verdict.rank}</span>
          {verdict.reasons.length > 0 && <span className="why"> — {verdict.reasons.slice(0, 3).join(', ')}</span>}
        </div>
      )}

      <div className="price">{l.price != null ? gbp(l.price) : 'POA'}</div>
      {l.history?.length > 0 && (
        <div className="price-history" title="Asking price since we started watching">
          <Sparkline listing={l} />
          <span className="when">changed {l.history[l.history.length - 1].date}</span>
        </div>
      )}
      <div className="meta">
        <span><b className="cat-tag">{categoryLabel(categoryOf(l))}</b> · {l.area} · {l.tenure}</span>
        {l.address && <span className="addr">{l.address}</span>}
        {l.rent != null && <span>Rent {gbp(l.rent)}/yr</span>}
        {l.turnover != null && (
          <span>Turnover {gbp(l.turnover)}/yr · profit {gbp(l.profit)} ({Math.round((l.profit / l.turnover) * 100)}%)</span>
        )}
      </div>

      <div className="badge-row">
        <span className={`status-badge ${STATUS_CLS[l.status] || 'active'}`}>{l.status}</span>
        {stage && <span className={`stage-badge ${deal.stage}`}>{stage[1]}</span>}
        {due && due !== 'later' && (
          <span className={`due-badge ${due}`} title={deal.nextAction || 'follow-up'}>
            {DUE_LABEL[due]} · {deal.nextAction ? deal.nextAction.slice(0, 40) : deal.nextOn}
          </span>
        )}
        {vLabel && (
          <span className={`vbadge ${vLabel.cls}`} title={v.note || ''}>
            {vLabel.text}
          </span>
        )}
        <button
          className={`fit-chip ${scoreBand(fit.score)}`}
          aria-expanded={showFit}
          onClick={() => setShowFit(!showFit)}
          title="How well this site fits the concept — tap for the breakdown"
        >
          fit {fit.score}
        </button>
      </div>
      {(freshness(l) || l._days != null) && (
        <div className="freshness mono">
          {freshness(l)}{l._days != null ? ` · listed ${l._days} d` : ''}
        </div>
      )}
      {(l._coversBE != null || l._implied != null || l.place || l.leaseYears != null || l.rateableValue != null || l.covers != null || l.sqft != null) && (
        <div className="facts">
          {l._coversBE != null && (
            <span title="Daytime covers a day your concept needs to break even at this rent">
              <b className="mono">{l._coversBE.toFixed(0)}</b> covers/day to break even
            </span>
          )}
          {l._coversPay != null && (
            <span title="Daytime covers a day at which your take-home reaches what you need, after VAT, the loan and tax">
              <b className="mono">{Number.isFinite(l._coversPay) ? l._coversPay.toFixed(0) : '∞'}</b> to pay you
            </span>
          )}
          {l.leaseYears != null && <span><b className="mono">{l.leaseYears} yr</b> lease left</span>}
          {l.rateableValue != null && (
            <span title={l.rateableValue < 12000 ? 'Under the £12k Small Business Bonus threshold: rates about £0' : 'Over the £12k SBBS threshold: rates are a real cost'}>
              RV <b className="mono">{gbp(l.rateableValue)}</b>{l.rateableValue < 12000 ? ' · SBBS' : ' · rates due'}
            </span>
          )}
          {l.covers != null && <span><b className="mono">{l.covers}</b> covers</span>}
          {l.sqft != null && <span><b className="mono">{l.sqft}</b> sq ft</span>}
          {l._implied != null && (
            <span title="The seller's declared turnover, converted at your average spend and trading days — how busy they say they are, in your units">
              seller's turnover = <b className="mono">{l._implied.toFixed(0)}</b> covers/day
            </span>
          )}
          {l.place && l.place.canalM != null && <span><b className="mono">{l.place.canalM} m</b> to the canal</span>}
          {l.place && l.place.canalM == null && <span>no canal within 2.5 km</span>}
          {l.place && l.place.cafes300 != null && <span><b className="mono">{l.place.cafes300}</b> cafés within 300 m</span>}
          {l.place && l.place.stopM != null && <span>stop <b className="mono">{l.place.stopM} m</b></span>}
        </div>
      )}
      {showFit && (
        <ul className="fit-breakdown">
          {fit.parts.map((p) => (
            <li key={p.key}>
              <span>{p.label}</span>
              <b className="mono">{Math.round(p.s * p.w)}/{p.w}</b>
            </li>
          ))}
        </ul>
      )}

      <div className="tag-row">{l.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
      <p className="notes">{l.notes}</p>

      {l.lat != null && l.lng != null && (
        <a
          ref={mapRef}
          className="map-preview"
          href={gmapsHref(l)}
          target="_blank"
          rel="noreferrer"
          title="Open in Google Maps"
          aria-label={`${l.name} on the map — opens Google Maps`}
        >
          {mapSeen && (() => {
            const m = mosaic(l.lat, l.lng)
            return (
              <span className="mosaic" style={{ '--px': m.px, '--py': m.py }}>
                {m.urls.map((u) => (
                  <img key={u} src={u} alt="" width="256" height="256" loading="lazy" />
                ))}
                <span className={`mpin ${l.coordsExact ? 'exact' : ''}`} />
              </span>
            )
          })()}
          <span className="osm-credit">© OpenStreetMap{l.coordsExact ? '' : ' · area centre'}</span>
        </a>
      )}

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
        <button className="action-btn" disabled={action?.busy} onClick={() => onRequest('verifica', l)}>
          {action?.busy && action?.kind === 'verifica' ? 'verifying…' : 'Verify now'}
        </button>
        <button className="action-btn ghost" disabled={action?.busy} onClick={() => onRequest('analizza', l)}>
          {action?.busy && action?.kind === 'analizza' ? 'analysing…' : 'Analyse'}
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
        <button
          className="action-btn ghost dismiss"
          onClick={onDismiss}
          title={dismissed ? 'Bring it back into the running' : 'Hide it from the shortlist, compare and map'}
        >
          {dismissed ? 'Reconsider' : 'Not for me'}
        </button>
      </div>

      <CallSheet deal={deal} setDeal={onDeal} />

      <FairPrice listing={l} inputs={sdeInputs} setInputs={onSdeInputs} profit={l._profit} otherCosts={OTHER_COSTS} />

      <label className="own-note">
        <span>Your notes</span>
        <textarea
          rows={2}
          value={note || ''}
          placeholder="what the agent said, what to check, what it felt like…"
          onChange={(e) => onNote(e.target.value)}
        />
      </label>

      {action?.error && <p className="act-error">{action.error}</p>}
      {action?.busy && !action?.error && (
        <p className="act-status mono">
          agent running{action.issue ? ` · issue #${action.issue}` : ''} — a minute or two, this tab keeps polling
        </p>
      )}
      {action?.open && !action?.busy && action?.report ? (
        <details className="report" open>
          <summary>{action.kind === 'analizza' ? 'Due diligence report' : 'Verification report'}</summary>
          <Markdown text={action.report} />
        </details>
      ) : l.analysis?.report ? (
        // The stored copy: an Analyse run costs credits, so it is kept in
        // the data rather than lost with the tab.
        <details className="report">
          <summary>Due diligence · {l.analysis.date}</summary>
          <Markdown text={l.analysis.report} />
        </details>
      ) : null}

      <span className="src">snapshot · {l.source}</span>
    </article>
  )
}
