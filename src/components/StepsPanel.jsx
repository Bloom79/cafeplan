import React, { useMemo } from 'react'
import { LICENCE_STEPS, STEPS } from '../data/steps.js'
import { DEFAULTS, compute, gbp, monthly } from '../data/model.js'
import { MODEL_KEY } from '../lib/applyListing.js'
import { useLocalStorage } from '../hooks/useLocalStorage.js'

const STATUSES = ['todo', 'in progress', 'blocked', 'done']

const readModel = () => {
  try {
    const raw = window.localStorage.getItem(MODEL_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

// The six gates between "interesting" and "sign". Three are things you do
// (the steps below), three are things the numbers have to say; each reads
// its own source so the list is never a matter of opinion.
function Gates({ get }) {
  const [deals] = useLocalStorage('cafeplan:deals', {})
  const { r, cash } = useMemo(() => {
    const a = readModel()
    const res = compute(a)
    return { a, r: res, cash: monthly(a, res) }
  }, [])
  const seen = Object.values(deals).some((d) => ['viewed', 'offered', 'won'].includes(d?.stage))
  const done = (id) => get(id).status === 'done'
  const gates = [
    ['target', 'A real target, seen with your own eyes', seen,
      seen ? 'a deal at "viewed" or beyond' : 'no viewing yet — the Listings tab is where this opens'],
    ['sde', 'Accounts and SDE verified by an accountant', done('verify-sde'),
      done('verify-sde') ? 'step marked done' : 'never take an asking price at face value'],
    ['licence', 'Licensing route confirmed with the Board', done('licensing'),
      done('licensing') ? 'step marked done' : 'the aperitivo plan hangs on it'],
    ['rates', 'Rateable value of the actual unit checked', done('rates-check'),
      done('rates-check') ? 'step marked done' : 'SBBS relief only under £12k RV'],
    ['pays', 'The model pays the loan and your draw', r.surplus >= 0,
      `${r.surplus >= 0 ? '+' : ''}${gbp(r.surplus)} a year after the loan and what you need to live on`],
    ['cash', 'Cash holds through the quiet months', cash.trough.cash >= 0,
      `lowest point ${gbp(cash.trough.cash)} in ${cash.trough.month}, year one`],
  ]
  const open = gates.filter(([, , ok]) => ok).length
  return (
    <section className="panel gates" aria-label="Ready to buy?">
      <h2 className="panel-title">
        Ready to buy?
        <span className="side">{open} of {gates.length} gates open</span>
      </h2>
      <ul>
        {gates.map(([id, title, ok, why]) => (
          <li key={id} className={ok ? 'ok' : ''}>
            <span className="mark" aria-hidden="true">{ok ? '✓' : '○'}</span>
            <span className="t">{title}</span>
            <span className="why">{why}</span>
          </li>
        ))}
      </ul>
      <p className="footnote">
        The first four are steps you tick below; the last two are read live from the Model tab. Six open gates
        is not a guarantee — it is the point at which an offer stops being a guess.
      </p>
    </section>
  )
}

// status/note state persisted per step: { [id]: { status, note } }
export default function StepsPanel() {
  const [state, setState] = useLocalStorage('cafeplan:steps', {})

  const get = (id) => state[id] || { status: 'todo', note: '' }
  const patch = (id, p) => setState({ ...state, [id]: { ...get(id), ...p } })

  const toggle = (id) => {
    const cur = get(id)
    patch(id, { status: cur.status === 'done' ? 'todo' : 'done' })
  }

  const doneCount = STEPS.filter((s) => get(s.id).status === 'done').length
  const licDone = LICENCE_STEPS.filter((s) => get(s.id).status === 'done').length

  const renderStep = (s) => {
    const st = get(s.id)
    return (
      <div key={s.id} className={`step ${st.status === 'done' ? 'done' : ''}`}>
        <input
          type="checkbox"
          className="step-check"
          checked={st.status === 'done'}
          onChange={() => toggle(s.id)}
          aria-label={`Mark “${s.title}” ${st.status === 'done' ? 'not done' : 'done'}`}
        />
        <div>
          <h3>{s.title}</h3>
          <p className="detail">{s.detail}</p>
          <div className="step-controls">
            <select
              className="status-select"
              value={st.status}
              aria-label={`Status of “${s.title}”`}
              onChange={(e) => patch(s.id, { status: e.target.value })}
            >
              {STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <input
              className="step-note-input mono"
              placeholder="add a note…"
              value={st.note}
              aria-label={`Note on “${s.title}”`}
              onChange={(e) => patch(s.id, { note: e.target.value })}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <Gates get={get} />

      <p className="progress-line">
        <b>{doneCount}</b> of {STEPS.length} done — status and notes persist in this browser
      </p>
      <div className="steps-list">{STEPS.map(renderStep)}</div>

      <div className="lic-head">
        <h2>Licensing runway — the aperitivo plan</h2>
        <p className="progress-line">
          <b>{licDone}</b> of {LICENCE_STEPS.length} done · figures are typical for Edinburgh (Aug 2026) —
          <b> confirm everything with the Licensing Board</b>; fees are banded by rateable value and
          overprovision policies change.
        </p>
      </div>
      <div className="steps-list">{LICENCE_STEPS.map(renderStep)}</div>
    </>
  )
}
