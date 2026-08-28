import React from 'react'
import { STEPS } from '../data/steps.js'
import { useLocalStorage } from '../hooks/useLocalStorage.js'

const STATUSES = ['todo', 'in progress', 'blocked', 'done']

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

  return (
    <>
      <p className="progress-line">
        <b>{doneCount}</b> of {STEPS.length} done — status and notes persist in this browser
      </p>
      <div className="steps-list">
        {STEPS.map((s) => {
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
        })}
      </div>
    </>
  )
}
