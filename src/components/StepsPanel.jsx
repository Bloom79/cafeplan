import React, { useMemo } from 'react'
import { LICENCE_STEPS, STEPS } from '../data/steps.js'
import { DEFAULTS } from '../data/model.js'
import { MODEL_KEY } from '../lib/applyListing.js'
import { readiness } from '../lib/gates.js'
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

// The six gates between "interesting" and "sign" (lib/gates.js): four are
// steps you tick below, two are read live from the model.
function Gates({ steps }) {
  const [deals] = useLocalStorage('cafeplan:deals', {})
  const a = useMemo(() => readModel(), [])
  const { gates, open, total } = readiness({ deals, steps, a })
  return (
    <section className="panel gates" aria-label="Ready to buy?">
      <h2 className="panel-title">
        Ready to buy?
        <span className="side">{open} of {total} gates open</span>
      </h2>
      <ul>
        {gates.map((g) => (
          <li key={g.id} className={g.ok ? 'ok' : ''}>
            <span className="mark" aria-hidden="true">{g.ok ? '✓' : '○'}</span>
            <span className="t">{g.title}</span>
            <span className="why">{g.why}</span>
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
      <Gates steps={state} />

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
