import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  DEFAULTS, MONTHS, SCENARIOS, STARTUP_TOTALS, VAT_THRESHOLD, WORKING_CAPITAL,
  compute, impliedCovers, loanPayment, monthly, sensitivity, takeHome,
} from '../src/data/model.js'

// Every figure in the business case comes out of compute(). These pin the
// base case so a refactor cannot quietly move the answer.

// The Aug 2026 case was written before VAT entered the model; its figures
// are the VAT-free ones.
const CASE = { ...DEFAULTS, vatRegistered: 0 }

test('base case matches the Aug 2026 business case', () => {
  const r = compute(CASE)
  assert.equal(r.dayRev, 119000) // 40 covers x £8.50 x 350 days
  assert.equal(r.apRev, 46800) // 4 nights x 52 weeks x 15 covers x £15
  assert.equal(r.wineRev, 3504) // 12 x 18 x £10 food + 12 x £112 fee
  assert.equal(r.totalRev, 169304)
  assert.equal(r.totalCosts, 126368)
  assert.equal(r.profit, 42936)
  assert.equal(r.vat, 0)
})

test('VAT: over the threshold, a sixth of standard-rated takings goes to HMRC, less the reclaim', () => {
  const r = compute(DEFAULTS)
  assert.ok(r.overThreshold && r.totalRev > VAT_THRESHOLD)
  assert.equal(Math.round(r.vatOut), Math.round(169304 * 0.85 / 6))
  assert.equal(Math.round(r.vatIn), Math.round((r.cogs + DEFAULTS.overheads) * 0.2 / 6))
  assert.equal(Math.round(r.profit), Math.round(42936 - r.vat))
  // Registering is the honest default: the profit falls by the VAT and
  // nothing else moves.
  assert.equal(r.totalCosts, compute(CASE).totalCosts)
  assert.ok(r.profit < compute(CASE).profit)
  // Breakeven rises with VAT: every cover is worth a sixth less.
  assert.ok(r.coversBE > compute(CASE).coversBE)
  assert.equal(compute({ ...DEFAULTS, vatStdPct: 0, vatInputPct: 0 }).profit, compute(CASE).profit)
})

test('breakeven nets the evening trade against its own costs', () => {
  const r = compute(CASE)
  assert.equal(r.coversBE.toFixed(1), '18.8')
  // Without the evening the café has to carry the whole fixed base itself.
  assert.ok(r.coversBEStandalone > r.coversBE)
  assert.equal(r.coversBEStandalone.toFixed(1), '31.6')
})

test('payback runs on the startup budget', () => {
  const r = compute(CASE)
  assert.equal(r.paybackYears.toFixed(1), '2.5')
  // A loss-making plan never pays back rather than reporting a negative year.
  assert.equal(compute({ ...DEFAULTS, rent: 200000 }).paybackYears, Infinity)
})

test('loan: amortised repayment, equity is the rest of the budget, DSCR', () => {
  // £25k at 6% over 5 years is £483.32 a month — the Start Up Loan quote.
  assert.equal((loanPayment(25000, 6, 5) / 12).toFixed(2), '483.32')
  assert.equal(loanPayment(0, 6, 5), 0)
  assert.equal(loanPayment(12000, 0, 1), 12000)
  const r = compute(DEFAULTS)
  assert.equal(r.equity, DEFAULTS.startupTotal - 25000)
  assert.equal(Math.round(r.afterDebt), Math.round(r.profit - r.loanPayment))
  assert.ok(r.dscr > 1)
  assert.equal(compute({ ...DEFAULTS, loan: 0 }).dscr, Infinity)
})

test('take-home: Scottish bands and Class 4 NI, indicative', () => {
  assert.deepEqual(takeHome(0), { tax: 0, ni: 0, net: 0 })
  assert.equal(takeHome(12570).tax, 0)
  // £30k profit: 19% on the starter band, 20% basic, 21% on the rest; NI 6% over £12,570.
  const t = takeHome(30000)
  const tax = (15397 - 12570) * 0.19 + (27491 - 15397) * 0.20 + (30000 - 27491) * 0.21
  assert.equal(t.tax.toFixed(2), tax.toFixed(2))
  assert.equal(t.ni.toFixed(2), ((30000 - 12570) * 0.06).toFixed(2))
  assert.equal(Math.round(t.net), Math.round(30000 - tax - t.ni))
  // Above the NI upper limit the rate drops to 2%.
  assert.ok(takeHome(60000).ni < (60000 - 12570) * 0.06)
  const r = compute(DEFAULTS)
  assert.equal(Math.round(r.takeHome), Math.round(takeHome(r.profit).net - r.loanPayment))
  assert.equal(Math.round(r.surplus), Math.round(r.afterDebt - DEFAULTS.ownerDraw))
})

test('implied covers turn a seller turnover into your units', () => {
  // Bennitos: £150k at £8.50 over 350 days is about 50 covers a day.
  assert.equal(impliedCovers(150000, DEFAULTS).toFixed(1), '50.4')
  assert.equal(impliedCovers(null, DEFAULTS), null)
  assert.equal(impliedCovers(150000, { ...DEFAULTS, spendDay: 0 }), null)
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
  // Steady state: no ramp, so the twelve months add back up to the year.
  const steady = { ...DEFAULTS, rampStartPct: 100, rampMonths: 0 }
  const r = compute(steady)
  const { rows, trough } = monthly(steady, r)
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
  const squeezed = { ...steady, rent: 40000, labour: 60000 }
  const hard = monthly(squeezed, compute(squeezed))
  assert.ok(hard.trough.cash < WORKING_CAPITAL)
})

test('year one: the ramp and the loan repayments both come out of the cash', () => {
  const r = compute(DEFAULTS)
  const { rows, trough, debt } = monthly(DEFAULTS, r)
  assert.equal(rows[0].ramp, 0.7)
  assert.equal(rows[6].ramp, 1)
  assert.equal(rows[11].ramp, 1)
  const yearRev = rows.reduce((s, m) => s + m.revenue, 0)
  assert.ok(yearRev < r.totalRev)
  assert.equal((debt * 12).toFixed(0), r.loanPayment.toFixed(0))
  // The same plan with no loan and no ramp ends the year with more cash.
  const easy = { ...DEFAULTS, loan: 0, rampStartPct: 100, rampMonths: 0 }
  const e = monthly(easy, compute(easy))
  assert.ok(e.rows[11].cash > rows[11].cash)
  assert.ok(e.trough.cash >= trough.cash)
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
