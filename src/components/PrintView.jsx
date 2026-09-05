import React, { useEffect, useMemo } from 'react'
import { CASE_SECTIONS } from '../data/businessCase.js'
import { DEFAULTS, STARTUP, STARTUP_TOTALS, compute, gbp, pct } from '../data/model.js'
import { APPLIED_KEY, MODEL_KEY, startupFor } from '../lib/applyListing.js'
import { fitScore, sdeCheck, verdict as rankListing } from '../lib/score.js'
import { categoryLabel, categoryOf } from '../lib/category.js'
import { DD_ITEMS, ddProgress } from '../lib/deals.js'
import { readiness } from '../lib/gates.js'
import { useListings } from '../hooks/useListings.js'

// The document: the whole business case with the live numbers, your
// shortlist, your saved scenarios, and the deals in progress — laid out
// for paper. Opened at #print; the button calls window.print(), which is
// "Save as PDF" on every phone and desktop.

const read = (k, fallback) => {
  try { const v = JSON.parse(window.localStorage.getItem(k)); return v ?? fallback } catch { return fallback }
}

export default function PrintView({ onClose }) {
  const [data] = useListings()
  const live = useMemo(() => {
    const a = { ...DEFAULTS, ...read(MODEL_KEY, {}) }
    const r = compute(a)
    const k = (n) => `£${Math.round(n / 1000)}k`
    return { r, a, k, gbp, applied: read(APPLIED_KEY, null) }
  }, [])
  const saved = read('cafeplan:savedScenarios', [])
  const favs = read('cafeplan:favs', [])
  const dismissed = read('cafeplan:dismissed', [])
  const deals = read('cafeplan:deals', {})
  const sdeInputs = read('cafeplan:sdeInputs', {})
  const notes = read('cafeplan:listingNotes', {})
  const steps = read('cafeplan:steps', {})

  const { ranked, ready } = useMemo(() => {
    const base = live.a
    const rows = data.listings
      .filter((l) => !dismissed.includes(l.id))
      .map((l) => {
        const startup = startupFor(l)
        const r = compute({ ...base, rent: l.rent ?? base.rent })
        const payback = startup != null && r.profit > 0 ? startup / r.profit : null
        const v = rankListing(l, { payback, sde: sdeCheck(sdeInputs[l.id], l.price), stage: deals[l.id]?.stage })
        return { ...l, _startup: startup, _payback: payback, _rank: v.rank, _verdict: v, _fit: fitScore(l).score }
      })
      .filter((l) => l._verdict.band !== 'out')
      .sort((a, b) => b._rank - a._rank)
    return { ranked: rows, ready: readiness({ deals, steps, a: base }) }
  }, [data, live, dismissed, sdeInputs, deals, steps])

  useEffect(() => { document.title = 'Canalside — business case' }, [])

  const today = new Date().toISOString().slice(0, 10)
  const inProgress = ranked.filter((l) => deals[l.id]?.stage && !['watching', 'passed'].includes(deals[l.id].stage))

  return (
    <div className="print">
      <div className="print-tools no-print">
        <button className="action-btn" onClick={() => window.print()}>Save as PDF / print</button>
        <button className="action-btn ghost" onClick={onClose}>Back to the app</button>
        <span className="footnote">Use your browser's print dialog → "Save as PDF". The page is laid out for A4.</span>
      </div>

      <header className="print-head">
        <h1>Canalside<span className="dot">.</span></h1>
        <p className="sub">Café business case — Edinburgh · Shandon / Polwarth / Merchiston canal corridor · {today}</p>
      </header>

      <section className="print-kpis">
        <div><span>Revenue</span><b>{gbp(live.r.totalRev)}</b></div>
        <div><span>Profit (pre-tax)</span><b>{gbp(live.r.profit)}</b></div>
        <div><span>Margin</span><b>{pct(live.r.margin)}</b></div>
        <div><span>Breakeven</span><b>{Number.isFinite(live.r.coversBE) ? live.r.coversBE.toFixed(1) : '—'} covers/day</b></div>
        <div><span>Payback</span><b>{Number.isFinite(live.r.paybackYears) ? `${live.r.paybackYears.toFixed(1)} yr` : '—'}</b></div>
        <div><span>Startup budget</span><b>{gbp(live.a.startupTotal)}</b></div>
      </section>
      <p className="print-note">
        {live.r.vat > 0 ? <>VAT {gbp(live.r.vat)} net a year · </> : <>VAT not modelled · </>}
        {live.r.loanPayment > 0 ? <>loan {gbp(live.a.loan)} at {live.a.loanRate}% over {live.a.loanYears} yr = {gbp(live.r.loanPayment)} a year · </> : <>no borrowing · </>}
        take-home ≈ <b>{gbp(live.r.takeHome)}</b> a year after tax, NI and the loan (indicative), against {gbp(live.a.ownerDraw)} needed.
      </p>
      {live.applied && (
        <p className="print-note">Modelled on <b>{live.applied.name}</b> ({live.applied.area}) — rent {live.applied.rent != null ? gbp(live.applied.rent) : '—'}, asking {live.applied.price != null ? gbp(live.applied.price) : 'POA'}.</p>
      )}

      <section className="print-section">
        <h2>Ready to buy? — {ready.open} of {ready.total} gates open</h2>
        <ul className="print-gates">
          {ready.gates.map((g) => (
            <li key={g.id} className={g.ok ? 'ok' : ''}>{g.ok ? '✓' : '○'} {g.title} <span className="muted">— {g.why}</span></li>
          ))}
        </ul>
      </section>

      {ranked.length > 0 && (
        <section className="print-section">
          <h2>Shortlist — call these first</h2>
          <table className="print-table">
            <thead><tr><th>#</th><th>Listing</th><th>Type</th><th>Area</th><th>Asking</th><th>Rent</th><th>Payback</th><th>Verdict</th><th>Why</th></tr></thead>
            <tbody>
              {ranked.slice(0, 8).map((l, i) => (
                <tr key={l.id}>
                  <td>{i + 1}</td>
                  <td><b>{l.name}</b>{favs.includes(l.id) ? ' ★' : ''}</td>
                  <td>{categoryLabel(categoryOf(l))}</td>
                  <td>{l.area}</td>
                  <td>{l.price != null ? gbp(l.price) : 'POA'}</td>
                  <td>{l.rent != null ? gbp(l.rent) : '—'}</td>
                  <td>{l._payback != null ? `${l._payback.toFixed(1)} yr` : '—'}</td>
                  <td>{l._rank}</td>
                  <td className="why">{l._verdict.reasons.slice(0, 3).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {inProgress.length > 0 && (
        <section className="print-section">
          <h2>Deals in progress</h2>
          {inProgress.map((l) => {
            const d = deals[l.id]
            const dd = ddProgress(d)
            const missing = DD_ITEMS.filter(([id]) => !d.dd?.[id]).map(([, label]) => label.split(/[:—(]/)[0].trim())
            return (
              <div key={l.id} className="print-deal">
                <h3>{l.name} <span className="muted">· {l.area} · {d.stage}</span></h3>
                <dl>
                  {[['Next', d.nextAction ? `${d.nextAction}${d.nextOn ? ` — by ${d.nextOn}` : ''}` : d.nextOn ? `by ${d.nextOn}` : null],
                    ['Agent', d.agent], ['Called', d.calledOn], ['Viewed', d.viewedOn], ['Lease left', d.leaseLeft], ['Rent review', d.rentReview],
                    ['Rates / RV', d.ratesRV], ['Staff', d.staff], ['Hours', d.hours], ['Reason for sale', d.reason], ['Included', d.included], ['Offer', d.offer],
                    ['Due diligence', `${dd.done}/${dd.total} seen${missing.length && missing.length <= 6 ? ` — still to see: ${missing.join(', ')}` : ''}`]]
                    .filter(([, v]) => v).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
                </dl>
                {notes[l.id] && <p className="print-notes">{notes[l.id]}</p>}
              </div>
            )
          })}
        </section>
      )}

      {saved.length > 0 && (
        <section className="print-section">
          <h2>Scenarios</h2>
          <table className="print-table">
            <thead><tr><th>Scenario</th><th>Revenue</th><th>Profit</th><th>Margin</th><th>Breakeven</th><th>Payback</th></tr></thead>
            <tbody>
              {saved.map((s) => {
                const sa = { ...DEFAULTS, ...s.values }
                const sr = compute(sa)
                return (
                  <tr key={s.name}>
                    <td><b>{s.name}</b></td><td>{gbp(sr.totalRev)}</td><td>{gbp(sr.profit)}</td><td>{pct(sr.margin)}</td>
                    <td>{Number.isFinite(sr.coversBE) ? sr.coversBE.toFixed(1) : '—'}</td>
                    <td>{sr.profit > 0 ? `${(sa.startupTotal / sr.profit).toFixed(1)} yr` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      {CASE_SECTIONS.map((s) => (
        <section key={s.n} className="print-section case">
          <h2><span className="n">{String(s.n).padStart(2, '0')}</span> {s.title}</h2>
          {s.blocks.map((b, i) => {
            if (b.live) return <p key={i} className="live">{b.live(live)}</p>
            if (b.p) return <p key={i}>{b.p}</p>
            if (b.h) return <h3 key={i}>{b.h}</h3>
            if (b.ul) return <ul key={i}>{b.ul.map((li, j) => <li key={j}>{li}</li>)}</ul>
            if (b.table) {
              const [head, ...rows] = b.table
              return (
                <table className="print-table" key={i}>
                  <thead><tr>{head.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>
                  <tbody>{rows.map((row, j) => <tr key={j}>{row.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
                </table>
              )
            }
            return null
          })}
        </section>
      ))}

      <section className="print-section">
        <h2>Startup budget — going-concern acquisition</h2>
        <table className="print-table">
          <thead><tr><th>Item</th><th>Low</th><th>Mid</th><th>High</th></tr></thead>
          <tbody>
            {STARTUP.map(([label, l, m, h]) => <tr key={label}><td>{label}</td><td>{gbp(l)}</td><td>{gbp(m)}</td><td>{gbp(h)}</td></tr>)}
            <tr className="total"><td>Total</td><td>{gbp(STARTUP_TOTALS[0])}</td><td>{gbp(STARTUP_TOTALS[1])}</td><td>{gbp(STARTUP_TOTALS[2])}</td></tr>
          </tbody>
        </table>
      </section>

      <footer className="print-foot">Generated by Canalside · bloom79.github.io/cafeplan · figures are the live model as of {today}; listings data updated {data.updated}.</footer>
    </div>
  )
}
