import React, { useMemo, useState } from 'react'
import {
  DEFAULTS, GROUPS, SCENARIOS, STARTUP, STARTUP_TOTALS, WORKING_CAPITAL,
  compute, gbp, monthly, pct, sensitivity,
} from '../data/model.js'
import { APPLIED_KEY } from '../lib/applyListing.js'
import { useLocalStorage } from '../hooks/useLocalStorage.js'
import DayRibbon from './DayRibbon.jsx'

const STREAM_COLOR = { day: 'var(--brass)', ap: 'var(--green)', wine: 'var(--plum)' }

const stepFor = { count: 1, gbp: 500, gbp2: 0.25, pct: 1 }

export default function ModelPanel() {
  const [a, setA] = useLocalStorage('cafeplan:model', DEFAULTS)
  const [scenario, setScenario] = useLocalStorage('cafeplan:scenario', 'conservative')
  const [showStartup, setShowStartup] = useState(false)
  const [applied, setApplied] = useLocalStorage(APPLIED_KEY, null)
  // While a field is being retyped it may be empty or half-written ("8." ,
  // ""); keep that text here so the box doesn't snap back to 0 mid-edit.
  const [draft, setDraft] = useState(null)

  const r = useMemo(() => compute(a), [a])

  const applyScenario = (key) => {
    setDraft(null)
    setScenario(key)
    setA({ ...a, ...SCENARIOS[key].values })
  }

  const set = (k, vRaw) => {
    const v = parseFloat(vRaw)
    const ok = Number.isFinite(v) && v >= 0
    setDraft(ok && String(v) === vRaw.trim() ? null : { k, text: vRaw })
    setScenario('custom')
    setA({ ...a, [k]: ok ? v : 0 })
  }

  // scenario comparison — presets over the current structure
  const scenarioResults = useMemo(
    () =>
      Object.entries(SCENARIOS).map(([key, s]) => {
        const res = compute({ ...a, ...s.values })
        return { key, label: s.label, profit: res.profit, margin: res.margin }
      }),
    [a],
  )
  const maxProfit = Math.max(...scenarioResults.map((s) => Math.max(s.profit, 1)))

  const costRows = [
    ['Food & drink COGS', r.cogs],
    ['Core labour', a.labour],
    ['Aperitivo staff', a.apStaff],
    ['Rent', a.rent],
    ...(a.rates > 0 ? [['Business rates', a.rates]] : []),
    ['Overheads', a.overheads],
  ]
  const maxCost = Math.max(...costRows.map(([, v]) => v), 1)

  const sens = useMemo(() => sensitivity(a), [a])
  const maxSwing = Math.max(...sens.map((s) => Math.max(Math.abs(s.down), Math.abs(s.up))), 1)
  const rentSwing = sens.find((s) => s.key === 'rent')?.swing || 0

  const cash = useMemo(() => monthly(a, r), [a, r])
  // Bars are the month's profit, not its revenue: revenue only swings with
  // the season, profit swings with the season *against a flat cost base* —
  // which is the whole point of looking at the year month by month.
  const maxMonthProfit = Math.max(...cash.rows.map((m) => Math.abs(m.profit)), 1)

  const streams = [
    ['Daytime café', r.dayRev, 'var(--brass)'],
    ['Aperitivo', r.apRev, 'var(--green)'],
    ['Wine events', r.wineRev, 'var(--plum)'],
  ]

  return (
    <>
      <DayRibbon r={r} />

      {applied && (
        <div className="applied-bar panel">
          <div>
            <span className="k">Modelled on</span>
            <b>{applied.name}</b>
            <span className="sep">·</span>
            {applied.area}
            <span className="sep">·</span>
            rent {applied.rent != null ? gbp(applied.rent) : '—'}
            <span className="sep">·</span>
            asking {applied.price != null ? gbp(applied.price) : 'POA'}
            {applied.startup != null && <> → budget {gbp(applied.startup)}</>}
          </div>
          {applied.turnover != null && (
            <div className="seller">
              Seller declares {gbp(applied.turnover)} turnover
              {applied.profit != null && <> · {gbp(applied.profit)} profit</>} — this model makes{' '}
              {gbp(r.totalRev)} and {gbp(r.profit)} on your concept.
            </div>
          )}
          <button
            className="reset-btn"
            onClick={() => { setApplied(null); setA(DEFAULTS); setScenario('conservative') }}
          >
            Back to the plan
          </button>
        </div>
      )}

      <div className="scenario-bar">
        <span className="label">Scenario</span>
        {Object.entries(SCENARIOS).map(([key, s]) => (
          <button
            key={key}
            className="scenario-pill"
            aria-pressed={scenario === key}
            onClick={() => applyScenario(key)}
            title={s.note}
          >
            {s.label}
          </button>
        ))}
        {scenario === 'custom' && <span className="dirty-note">custom edits</span>}
        <button className="reset-btn" onClick={() => { setDraft(null); setA(DEFAULTS); setScenario('conservative') }}>
          Reset to plan
        </button>
      </div>

      <div className="model-grid">
        {/* ————— assumptions ————— */}
        <section className="panel" aria-label="Assumptions">
          <h2 className="panel-title">Assumptions</h2>
          {GROUPS.map((g) => (
            <div className="group" key={g.id} id={`group-${g.id}`}>
              <div className="group-head">
                {g.stream && <span className="swatch" style={{ background: STREAM_COLOR[g.stream] }} />}
                {g.name}
              </div>
              {g.fields.map(([k, label, kind]) => (
                <div className="field-row" key={k}>
                  <label htmlFor={`f-${k}`}>{label}</label>
                  <input
                    id={`f-${k}`}
                    className={a[k] !== DEFAULTS[k] ? 'changed' : ''}
                    type="number"
                    inputMode="decimal"
                    step={stepFor[kind]}
                    min={0}
                    value={draft && draft.k === k ? draft.text : a[k]}
                    onChange={(e) => set(k, e.target.value)}
                    onBlur={() => setDraft(null)}
                  />
                </div>
              ))}
            </div>
          ))}
          <p className="footnote">
            Edits save in this browser and survive reloads. Defaults mirror the Aug 2026
            business case; the live figures here supersede the static document.
          </p>
        </section>

        {/* ————— results ————— */}
        <section className="panel" aria-label="Results">
          <h2 className="panel-title">Results</h2>

          <div className="stat-row">
            <div className="stat">
              <div className="k">Revenue</div>
              <div className="v">{gbp(r.totalRev)}</div>
              <div className="s">{pct(r.grossMargin)} gross margin</div>
            </div>
            <div className="stat">
              <div className="k">Profit (pre-tax)</div>
              <div className={`v ${r.profit >= 0 ? 'pos' : 'neg'}`}>{gbp(r.profit)}</div>
              <div className="s">{r.totalRev > 0 ? pct(r.margin) + ' of revenue' : '—'}</div>
            </div>
            <div className="stat">
              <div className="k">Breakeven</div>
              <div className="v">{Number.isFinite(r.coversBE) ? r.coversBE.toFixed(1) : '—'}</div>
              <div className="s">daytime covers/day, evening netted</div>
            </div>
            <div className="stat">
              <div className="k">Payback</div>
              <div className="v">{Number.isFinite(r.paybackYears) ? `${r.paybackYears.toFixed(1)} yr` : '—'}</div>
              <div className="s">on {gbp(a.startupTotal)} startup budget</div>
            </div>
          </div>

          {/* revenue composition */}
          <div className="chart-block">
            <h3 className="chart-title">
              Revenue by stream
              <span className="side">{gbp(r.totalRev)} total</span>
            </h3>
            <div className="legend">
              {streams.map(([name, v, c]) => (
                <span className="li" key={name}>
                  <span className="swatch" style={{ background: c }} />
                  {name} {gbp(v)} · {r.totalRev > 0 ? Math.round((v / r.totalRev) * 100) : 0}%
                </span>
              ))}
            </div>
            <div className="stack-bar" role="img" aria-label={streams.map(([n, v]) => `${n} ${gbp(v)}`).join(', ')}>
              {streams.map(([name, v, c]) => (
                <div
                  key={name}
                  className="stack-seg"
                  style={{ width: `${r.totalRev > 0 ? (v / r.totalRev) * 100 : 0}%`, background: c }}
                  title={`${name}: ${gbp(v)}`}
                />
              ))}
            </div>
          </div>

          {/* costs */}
          <div className="chart-block">
            <h3 className="chart-title">
              Annual cost base
              <span className="side">{gbp(r.totalCosts)} total</span>
            </h3>
            {costRows.map(([label, v]) => (
              <div className="bar-row" key={label}>
                <span className="bl">{label}</span>
                <span className="track">
                  <span className="fill" style={{ width: `${(v / maxCost) * 100}%` }} />
                </span>
                <span className="bv">{gbp(v)}</span>
              </div>
            ))}
          </div>

          {/* scenario comparison */}
          <div className="chart-block">
            <h3 className="chart-title">
              Profit by scenario
              <span className="side">same structure, different volume</span>
            </h3>
            <div className="scenario-chart">
              {scenarioResults.map((s) => (
                <div className="sc-bar" key={s.key} title={`${s.label}: ${gbp(s.profit)} (${pct(s.margin)})`}>
                  <span className="cap"><b>{gbp(s.profit)}</b>{s.label}</span>
                  <div
                    className="col"
                    style={{
                      height: `${Math.max((Math.max(s.profit, 0) / maxProfit) * 100, 1.5)}%`,
                      background: s.key === scenario ? 'var(--brass-bright)' : 'var(--neutral-bar)',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* what actually moves the answer */}
          <div className="chart-block">
            <h3 className="chart-title">
              Sensitivity
              <span className="side">±10% on each assumption</span>
            </h3>
            <div className="tornado">
              {sens.map((s) => (
                <div className="tor-row" key={s.key}>
                  <span className="bl">{s.label}</span>
                  <span className="tor-track">
                    <span className="axis" />
                    <span
                      className="seg down"
                      style={{ width: `${(Math.abs(Math.min(s.down, s.up)) / maxSwing) * 50}%` }}
                      title={`−10%: ${gbp(Math.min(s.down, s.up))}`}
                    />
                    <span
                      className="seg up"
                      style={{ width: `${(Math.abs(Math.max(s.down, s.up)) / maxSwing) * 50}%` }}
                      title={`+10%: ${gbp(Math.max(s.down, s.up))}`}
                    />
                  </span>
                  <span className="bv">±{gbp(s.swing / 2)}</span>
                </div>
              ))}
            </div>
            <p className="footnote" style={{ marginTop: 10 }}>
              Covers, spend and trading days tie because they are the same lever: any 10% shortfall
              in daytime trade costs the same {gbp(sens[0].swing / 2)}
              {rentSwing > 0 && <> — about {Math.round(sens[0].swing / rentSwing)}× what a 10% rent
              rise costs</>}. Rent is fixed the day you sign; trade is the part you can still work on.
            </p>
          </div>

          <p className="footnote">
            Breakeven standalone (no evening trade): <b className="mono">{Number.isFinite(r.coversBEStandalone) ? r.coversBEStandalone.toFixed(1) : '—'}</b> daytime
            covers/day. The gap between the two breakeven figures is the case for the evening offer in one number.
            Owner profit and owner wage are the same pot in this model — read the margin as pay for your
            full-time presence plus risk, not income on top of a salary.
          </p>

          <details className="startup" open={showStartup} onToggle={(e) => setShowStartup(e.target.open)}>
            <summary>Startup budget — going-concern acquisition</summary>
            <table className="startup-table">
              <thead>
                <tr><th>Item</th><th>Low</th><th>Mid</th><th>High</th></tr>
              </thead>
              <tbody>
                {STARTUP.map(([label, l, m, h]) => (
                  <tr key={label}>
                    <td>{label}</td><td>{gbp(l)}</td><td>{gbp(m)}</td><td>{gbp(h)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Total</td>
                  <td>{gbp(STARTUP_TOTALS[0])}</td>
                  <td>{gbp(STARTUP_TOTALS[1])}</td>
                  <td>{gbp(STARTUP_TOTALS[2])}</td>
                </tr>
              </tbody>
            </table>
            <p className="footnote">
              Anchored on the Ashley Terrace comparables (£14k rent, £5.6k RV — under the £12k SBBS
              threshold, so rates ≈ £0). The purchase price is the biggest swing factor: Bennitos
              (£40k asking, £150k turnover, £25k profit) shows what the £35k–£40k band actually buys.
            </p>
          </details>
        </section>
      </div>

      {/* the year is not flat, and that is a working-capital question */}
      <section className="panel season" aria-label="The first year, month by month">
        <h2 className="panel-title">
          The first year, month by month
          <span className="side">
            cash starts at {gbp(WORKING_CAPITAL)} working capital
          </span>
        </h2>

        <div className="season-chart">
          {cash.rows.map((m) => (
            <div className="s-col" key={m.name} title={`${m.name}: ${gbp(m.revenue)} revenue · ${gbp(m.profit)} profit · cash ${gbp(m.cash)}`}>
              <span className="cap mono">{m.profit >= 0 ? '+' : ''}{Math.round(m.profit / 100) / 10}k</span>
              <div className="col-wrap">
                <div
                  className={`col ${m.profit < 0 ? 'neg' : ''}`}
                  style={{ height: `${(Math.abs(m.profit) / maxMonthProfit) * 100}%` }}
                />
              </div>
              <span className={`m ${m.name === cash.trough.month ? 'low' : ''}`}>{m.name}</span>
            </div>
          ))}
        </div>

        <p className={`trough ${cash.trough.cash < 0 ? 'bad' : ''}`}>
          Lowest cash point: <b className="mono">{gbp(cash.trough.cash)}</b> in {cash.trough.month}
          {cash.trough.cash < 0
            ? ' — the plan runs out of money before the season turns. Raise the working capital, or cut the fixed base.'
            : ' — the buffer holds through the quiet months.'}
        </p>

        <p className="footnote">
          Same annual totals as above, spread over an Edinburgh year: the Festival fills August,
          January and February empty out. Rent, labour and overheads do not follow the season —
          that gap is the whole reason the budget carries three months of working capital.
        </p>
      </section>
    </>
  )
}
