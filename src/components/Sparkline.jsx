import React from 'react'
import { gbp } from '../data/model.js'

// Tiny inline price-history chart: past asks from `history` plus today's
// price as the last point. Only renders when there is an actual change to
// show. Pure SVG, no library.
export default function Sparkline({ listing }) {
  const pts = [...(listing.history || []).map((h) => h.price), listing.price].filter(
    (v) => v != null && Number.isFinite(v),
  )
  if (pts.length < 2) return null

  const W = 120
  const H = 28
  const PAD = 3
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const span = max - min || 1
  const x = (i) => PAD + (i * (W - 2 * PAD)) / (pts.length - 1)
  const y = (v) => H - PAD - ((v - min) / span) * (H - 2 * PAD)
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const falling = pts[pts.length - 1] < pts[0]
  const color = falling ? 'var(--green)' : 'var(--brass-bright)'

  return (
    <span
      className="sparkline"
      title={`Asking price: ${pts.map((v) => gbp(v)).join(' → ')}`}
      role="img"
      aria-label={`price history ${pts.map((v) => gbp(v)).join(', then ')}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="3" fill={color} />
      </svg>
      <b style={{ color }}>{falling ? '▼' : '▲'} {gbp(Math.abs(pts[pts.length - 1] - pts[0]))}</b>
    </span>
  )
}
