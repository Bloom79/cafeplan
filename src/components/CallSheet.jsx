import React from 'react'
import { DD_ITEMS, ddProgress, dueState, isOpen } from '../lib/deals.js'

// The deal pipeline for one listing: where it stands, what happens next
// and by when, the structured notes from the calls and viewings, and the
// due-diligence checklist. Everything here is yours (localStorage, synced
// with the workspace code) — the agent never writes it.

export const STAGES = [
  ['watching', 'Watching'],
  ['called', 'Called the agent'],
  ['viewed', 'Viewed'],
  ['offered', 'Offer made'],
  ['passed', 'Passed'],
  ['won', 'Deal agreed'],
]

const FIELDS = [
  ['agent', 'Agent / contact', 'name and phone'],
  ['calledOn', 'Called on', '', 'date'],
  ['viewedOn', 'Viewed on', '', 'date'],
  ['leaseLeft', 'Lease left', 'years, break clauses'],
  ['rentReview', 'Next rent review', 'date and basis'],
  ['ratesRV', 'Rateable value / rates', 'RV under £12k ⇒ SBBS relief'],
  ['staff', 'Staff', 'how many, TUPE?'],
  ['hours', 'Trading hours', 'current pattern'],
  ['reason', 'Reason for sale', 'their words'],
  ['included', "What's included", 'fixtures, stock, goodwill, lease assignment'],
  ['offer', 'Your offer', 'amount and conditions'],
]

export const DUE_LABEL = { overdue: 'overdue', soon: 'due soon', later: 'next' }

export default function CallSheet({ deal, setDeal }) {
  const d = deal || { stage: 'watching' }
  const set = (k, v) => setDeal({ ...d, [k]: v })
  const filled = FIELDS.filter(([k]) => d[k]).length
  const dd = ddProgress(d)
  const due = dueState(d)

  return (
    <details className="callsheet" open={isOpen(d) && filled === 0}>
      <summary>
        Deal · <b>{(STAGES.find(([k]) => k === d.stage) || STAGES[0])[1]}</b>
        {filled > 0 && <span className="mono"> · {filled}/{FIELDS.length} noted</span>}
        {dd.done > 0 && <span className="mono"> · DD {dd.done}/{dd.total}</span>}
        {due && <span className={`due-badge ${due}`}>{DUE_LABEL[due]} {d.nextOn}</span>}
      </summary>
      <div className="cs-body">
        <label className="cs-stage">
          <span>Stage</span>
          <select className="status-select" value={d.stage || 'watching'} onChange={(e) => set('stage', e.target.value)}>
            {STAGES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        {/* The one line that keeps a deal moving: what next, and by when. */}
        <div className="cs-next">
          <label className="cs-field">
            <span>Next action <i>what has to happen next</i></span>
            <input
              value={d.nextAction || ''}
              placeholder="e.g. chase the accounts, book a viewing"
              onChange={(e) => set('nextAction', e.target.value)}
            />
          </label>
          <label className="cs-field">
            <span>By <i>the follow-up date</i></span>
            <input type="date" value={d.nextOn || ''} onChange={(e) => set('nextOn', e.target.value)} />
          </label>
        </div>
        <div className="cs-grid">
          {FIELDS.map(([k, label, hint, type]) => (
            <label key={k} className="cs-field">
              <span>{label}{hint && <i> {hint}</i>}</span>
              <input
                type={type || 'text'}
                value={d[k] || ''}
                onChange={(e) => set(k, e.target.value)}
              />
            </label>
          ))}
        </div>
        <details className="dd">
          <summary>Due diligence · <b className="mono">{dd.done}/{dd.total}</b> seen</summary>
          <ul className="dd-list">
            {DD_ITEMS.map(([id, label]) => (
              <li key={id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!d.dd?.[id]}
                    onChange={(e) => set('dd', { ...(d.dd || {}), [id]: e.target.checked })}
                  />
                  <span>{label}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="fp-hint">
            Tick what you have actually seen, not what the agent promised. An offer before the accounts
            and the lease is a guess with a number on it.
          </p>
        </details>
      </div>
    </details>
  )
}
