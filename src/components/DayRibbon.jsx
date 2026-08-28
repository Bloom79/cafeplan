import React from 'react'
import { gbp } from '../data/model.js'

// The trading day, 06:00–22:00. Regular trade sits on the main lane; the
// occasional wine evenings sit on the thinner lane below. Each band shows
// its live revenue and jumps to the assumptions that drive it.

const W = 800
const H = 104
const X0 = 8
const X1 = W - 8
const OPEN = 6
const CLOSE = 22

const x = (h) => X0 + ((h - OPEN) / (CLOSE - OPEN)) * (X1 - X0)

const HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22]

export default function DayRibbon({ r }) {
  const focus = (id) => {
    const el = document.getElementById(`group-${id}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const band = (from, to, y, h, fill, id, title) => (
    <g
      className="ribbon-band"
      role="button"
      tabIndex={0}
      aria-label={`${title} — edit assumptions`}
      onClick={() => focus(id)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && focus(id)}
      style={{ animationDelay: `${y * 0.02}s` }}
    >
      <title>{title} — click to edit its assumptions</title>
      <rect x={x(from)} y={y} width={x(to) - x(from)} height={h} fill={fill} rx={5} />
    </g>
  )

  return (
    <section className="panel day-ribbon" aria-label="The trading day">
      <div className="ribbon-head">
        <h2 className="panel-title" style={{ margin: 0 }}>The trading day</h2>
        <span className="hint">the day is the model — click a band to edit its assumptions</span>
      </div>
      <svg
        className="ribbon-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Trading day timeline: daytime café 8:30 to 15:30 generating ${gbp(r.dayRev)}, aperitivo 17:00 to 20:00 generating ${gbp(r.apRev)}, occasional wine evenings generating ${gbp(r.wineRev)}.`}
      >
        {/* hour grid */}
        {HOURS.map((h) => (
          <g key={h}>
            <line x1={x(h)} y1={22} x2={x(h)} y2={84} stroke="var(--line)" strokeWidth={1} />
            <text className="ribbon-axis" x={x(h)} y={98} textAnchor="middle">
              {String(h).padStart(2, '0')}
            </text>
          </g>
        ))}

        {/* main lane — regular trade */}
        {band(8.5, 15.5, 26, 34, 'var(--brass)', 'daytime', 'Daytime café · 8:30–15:30')}
        {band(17, 20, 26, 34, 'var(--green)', 'aperitivo', 'Aperitivo · 17:00–20:00 Thu–Sun')}

        {/* occasional lane — wine evenings */}
        {band(19, 21.2, 66, 18, 'var(--plum)', 'wine', 'Wine tasting evenings · occasional')}

        {/* band labels */}
        <text className="ribbon-label" x={x(8.5) + 8} y={40}>Daytime café</text>
        <text className="ribbon-sub" x={x(8.5) + 8} y={53}>{`8:30–15:30 · ${gbp(r.dayRev)}`}</text>
        <text className="ribbon-label" x={x(17) + 8} y={40}>Aperitivo</text>
        <text className="ribbon-sub" x={x(17) + 8} y={53}>{`Thu–Sun · ${gbp(r.apRev)}`}</text>
        <text className="ribbon-sub" x={x(19) + 8} y={79}>{`Wine evenings · ${gbp(r.wineRev)}`}</text>
      </svg>
    </section>
  )
}
