import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  DEFAULTS, MONTHS, SCENARIOS, STARTUP_TOTALS, WORKING_CAPITAL,
  compute, monthly, sensitivity,
} from '../src/data/model.js'

// Every figure in the business case comes out of compute(). These pin the
// base case so a refactor cannot quietly move the answer.

test('base case matches the Aug 2026 business case', () => {
  const r = compute(DEFAULTS)
  assert.equal(r.dayRev, 119000) // 40 covers x £8.50 x 350 days
  assert.equal(r.apRev, 46800) // 4 nights x 52 weeks x 15 covers x £15
  assert.equal(r.wineRev, 3504) // 12 x 18 x £10 food + 12 x £112 fee
  assert.equal(r.totalRev, 169304)
  assert.equal(r.totalCosts, 126368)
  assert.equal(r.profit, 42936)
})

test('breakeven nets the evening trade against its own costs', () => {
  const r = compute(DEFAULTS)
  assert.equal(r.coversBE.toFixed(1), '18.8')
  // Without the evening the café has to carry the whole fixed base itself.
  assert.ok(r.coversBEStandalone > r.coversBE)
  assert.equal(r.coversBEStandalone.toFixed(1), '31.6')
})

test('payback runs on the startup budget', () => {
  const r = compute(DEFAULTS)
  assert.equal(r.paybackYears.toFixed(1), '2.5')
  // A loss-making plan never pays back rather than reporting a negative year.
  assert.equal(compute({ ...DEFAULTS, rent: 200000 }).paybackYears, Infinity)
})

test('zeroed trade degrades to — rather than NaN or Infinity in the UI', () => {
  const r = compute({ ...DEFAULTS, spendDay: 0 })
  assert.equal(Number.isFinite(r.coversBE), false)
  assert.equal(Number.isNaN(r.margin), false)
  assert.equal(compute({ ...DEFAULTS, coversDay: 0, apCovers: 0, wineCovers: 0, wineFee: 0 }).margin, 0)
})

test('scenario presets carry values only, never their own labels', () => {
  for (const [key, s] of Object.entries(SCENARIOS)) {
    assert.ok(s.values, `${key} has values`)
    assert.equal(s.values.label, undefined)
    assert.equal(s.values.note, undefined)
    for (const k of Object.keys(s.values)) assert.ok(k in DEFAULTS, `${k} is a real assumption`)
  }
  // Optimistic must beat conservative, or the presets are mislabelled.
  const p = (k) => compute({ ...DEFAULTS, ...SCENARIOS[k].values }).profit
  assert.ok(p('optimistic') > p('mid') && p('mid') > p('conservative'))
})

test('the startup budget adds up in all three columns', () => {
  const [low, mid, high] = STARTUP_TOTALS
  assert.ok(low < mid && mid < high)
  assert.equal(mid, 106483) // the figure the app quotes as the base budget
})

test('seasonality moves when the money arrives, not how much', () => {
  const r = compute(DEFAULTS)
  const { rows, trough } = monthly(DEFAULTS, r)
  assert.equal(rows.length, 12)
  assert.equal(MONTHS.reduce((s, [, w]) => s + w, 0).toFixed(2), '12.00')
  const yearRev = rows.reduce((s, m) => s + m.revenue, 0)
  assert.equal(Math.round(yearRev), r.totalRev)
  const yearProfit = rows.reduce((s, m) => s + m.profit, 0)
  assert.equal(Math.round(yearProfit), Math.round(r.profit))
  // August is the peak, February the pinch — and the trough is a real month.
  assert.equal(rows.reduce((a, b) => (b.revenue > a.revenue ? b : a)).name, 'Aug')
  assert.ok(MONTHS.some(([name]) => name === trough.month))
  assert.equal(trough.cash, Math.min(...rows.map((m) => m.cash)))
  // A fixed base heavy enough to outrun the quiet months eats the buffer.
  const squeezed = { ...DEFAULTS, rent: 40000, labour: 60000 }
  const hard = monthly(squeezed, compute(squeezed))
  assert.ok(hard.trough.cash < WORKING_CAPITAL)
})

test('sensitivity ranks the assumptions by how much they move profit', () => {
  const s = sensitivity(DEFAULTS)
  assert.ok(s.length > 1)
  for (let i = 1; i < s.length; i++) assert.ok(s[i - 1].swing >= s[i].swing)
  // Volume leads: at these defaults covers/day outranks rent by a distance.
  assert.equal(s[0].key, 'coversDay')
  const rent = s.find((x) => x.key === 'rent')
  assert.ok(s[0].swing > rent.swing)
  // More rent is less profit; more covers is more profit.
  assert.ok(rent.up < 0 && s[0].up > 0)
})
