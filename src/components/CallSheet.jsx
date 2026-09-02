import React from 'react'

// The deal pipeline for one listing: where it stands, and the structured
// notes from the calls and viewings. Everything here is yours (localStorage,
// synced with the workspace code) — the agent never writes it.

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

export default function CallSheet({ deal, setDeal }) {
  const d = deal || { stage: 'watching' }
  const set = (k, v) => setDeal({ ...d, [k]: v })
  const filled = FIELDS.filter(([k]) => d[k]).length

  return (
    <details className="callsheet" open={d.stage !== 'watching' && d.stage !== 'passed' && filled === 0}>
      <summary>
        Deal · <b>{(STAGES.find(([k]) => k === d.stage) || STAGES[0])[1]}</b>
        {filled > 0 && <span className="mono"> · {filled}/{FIELDS.length} noted</span>}
      </summary>
      <div className="cs-body">
        <label className="cs-stage">
          <span>Stage</span>
          <select className="status-select" value={d.stage || 'watching'} onChange={(e) => set('stage', e.target.value)}>
            {STAGES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
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
      </div>
    </details>
  )
}
