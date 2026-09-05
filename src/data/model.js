// The live financial model. Defaults mirror the Aug 2026 business case
// (the Word/XLSX pair); every number here is editable in the Model tab and
// results recompute on each keystroke. Where the app and the static
// documents differ, the app supersedes.

export const gbp = (n) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(n)

export const gbp2 = (n) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 2,
  }).format(n)

export const pct = (x) => `${(x * 100).toFixed(1)}%`

// Scenario presets vary only what the case study evidence supports varying:
// daytime volume/spend and evening uptake. Structure stays identical.
// `values` is kept separate from the labels so applying a preset writes
// only real assumptions into the saved model.
export const SCENARIOS = {
  conservative: {
    label: 'Conservative',
    note: 'Plan base — residential-only footfall, cautious evening uptake',
    values: { coversDay: 40, spendDay: 8.5, apCovers: 15, wineCovers: 18 },
  },
  mid: {
    label: 'Mid',
    note: 'Established trade after year one',
    values: { coversDay: 65, spendDay: 8.5, apCovers: 20, wineCovers: 20 },
  },
  optimistic: {
    label: 'Optimistic',
    note: 'Strong canal-side draw, full sessions',
    values: { coversDay: 90, spendDay: 10.5, apCovers: 25, wineCovers: 24 },
  },
}

export const DEFAULTS = {
  // Daytime café (core, 7 days ~8:30–15:30)
  coversDay: 40,
  spendDay: 8.5,
  tradingDays: 350,
  cogsDayPct: 32,

  // Aperitivo (Thu–Sun, 17:00–20:00, £15 drink + focaccia/cheese/salami)
  apNights: 4,
  apWeeks: 52,
  apCovers: 15,
  apPrice: 15,
  apCogsPct: 30,

  // Wine tasting evenings (merchant-hosted, occasional)
  wineEvents: 12,
  wineCovers: 18,
  wineFood: 10,
  wineFee: 112,
  wineCogsPct: 30,

  // Annual cost base (owner-operator: no manager salary in the base)
  labour: 40000,
  apStaff: 9600,
  rent: 14000,
  rates: 0,
  overheads: 10000,

  // Acquisition (going concern) — mid startup budget, editable
  startupTotal: 106483,

  // VAT. Takings above the £90k registration threshold carry 20% VAT on
  // standard-rated sales — eat-in, hot food and hot drinks, which is most
  // of a café; cold takeaway is zero-rated. The prices customers pay
  // already contain it, so one sixth of standard-rated takings is HMRC's.
  vatRegistered: 1,
  vatStdPct: 85, // share of takings that is standard-rated
  vatInputPct: 20, // share of COGS + overheads carrying reclaimable VAT

  // Funding: how much of the startup budget is borrowed. A Start Up Loan
  // is up to £25k per founder at 6% fixed over 1–5 years; the rest is cash.
  loan: 25000,
  loanRate: 6,
  loanYears: 5,

  // You: what you need to take out to live on, and how year one starts.
  ownerDraw: 28000,
  rampStartPct: 70, // trade in month one, as a share of the plan
  rampMonths: 6, // months to reach the plan's volume
  workingCapital: 20000, // cash in the till on day one (the budget's mid case)
}

export const STARTUP = [
  ['Purchase price (goodwill / lease premium)', 30000, 55000, 80000],
  ['Stock at valuation', 1000, 2000, 3000],
  ['Legal fees (lease assignment)', 1500, 2250, 3000],
  ['Accountant due diligence', 1000, 1500, 2000],
  ['Lease deposit / landlord consent', 3500, 5250, 7000],
  ['Refurbishment & rebrand', 5000, 10000, 15000],
  ['Kitchen tweak (pasta of the day)', 1000, 2000, 3000],
  ['Wine-event setup (glassware, fridge)', 1000, 1750, 2500],
  ['Licensing & permits', 300, 600, 1000],
  ['Aperitivo additions (stock, licence, PLH, bar kit)', 3950, 6133, 8315],
  ['Working capital (3 months)', 15000, 20000, 25000],
]

export const STARTUP_TOTALS = STARTUP.reduce(
  (acc, [, l, m, h]) => [acc[0] + l, acc[1] + m, acc[2] + h],
  [0, 0, 0],
)

export function compute(a) {
  const r = {}

  // Revenue
  r.dayRev = a.coversDay * a.spendDay * a.tradingDays
  r.apSessions = a.apNights * a.apWeeks
  r.apRev = r.apSessions * a.apCovers * a.apPrice
  r.wineFoodRev = a.wineEvents * a.wineCovers * a.wineFood
  r.wineFeeRev = a.wineEvents * a.wineFee
  r.wineRev = r.wineFoodRev + r.wineFeeRev
  r.totalRev = r.dayRev + r.apRev + r.wineRev

  // Costs
  r.cogs = a.coversDay * a.spendDay * a.tradingDays * (a.cogsDayPct / 100)
    + r.apRev * (a.apCogsPct / 100)
    + r.wineFoodRev * (a.wineCogsPct / 100)
  r.labourTotal = a.labour + a.apStaff
  r.occupancy = a.rent + a.rates
  r.totalCosts = r.cogs + r.labourTotal + r.occupancy + a.overheads

  // VAT. `nu` is HMRC's share of gross takings (20% inclusive = 1/6 of the
  // standard-rated part); `iota` the share of gross vatable costs that comes
  // back as input tax. Both are zero below the threshold, and every formula
  // below collapses to the plain version when they are.
  const vatOn = !!a.vatRegistered
  const nu = vatOn ? (a.vatStdPct / 100) / 6 : 0
  const iota = vatOn ? (a.vatInputPct / 100) / 6 : 0
  r.vatOut = r.totalRev * nu
  r.vatIn = (r.cogs + a.overheads) * iota
  r.vat = r.vatOut - r.vatIn
  r.vatRegistered = vatOn
  r.overThreshold = r.totalRev > VAT_THRESHOLD

  // Profit — after VAT, before income tax and loan repayments
  r.profit = r.totalRev - r.totalCosts - r.vat
  r.margin = r.totalRev > 0 ? r.profit / r.totalRev : 0
  r.grossProfit = r.totalRev - r.cogs
  r.grossMargin = r.totalRev > 0 ? r.grossProfit / r.totalRev : 0
  r.rentShare = r.totalRev > 0 ? a.rent / r.totalRev : 0

  // Breakeven — daytime covers/day needed. Contribution per cover is
  // spend (net of VAT) less its COGS (net of the reclaim); evening streams
  // are netted against the costs that belong to them (their COGS + the
  // extra staff member).
  const perCover = a.spendDay * ((1 - nu) - (a.cogsDayPct / 100) * (1 - iota))
  const fixed = a.labour + r.occupancy + a.overheads * (1 - iota)
  const eveningNet =
    r.apRev * ((1 - nu) - (a.apCogsPct / 100) * (1 - iota))
    + r.wineFoodRev * ((1 - nu) - (a.wineCogsPct / 100) * (1 - iota))
    + r.wineFeeRev * (1 - nu)
    - a.apStaff
  // No contribution per cover (spend or trading days zeroed out) means no
  // number of covers ever breaks even — say so rather than print Infinity.
  const coverBase = perCover * a.tradingDays
  r.coversBE = coverBase > 0 ? Math.max(0, (fixed - eveningNet) / coverBase) : Infinity
  r.coversBEStandalone = coverBase > 0 ? fixed / coverBase : Infinity

  // Payback on the acquisition
  r.paybackYears = r.profit > 0 ? a.startupTotal / r.profit : Infinity

  // Funding: the loan's annual repayment (amortised), what that leaves of
  // the profit, and the cash you put in yourself.
  r.loanPayment = loanPayment(a.loan, a.loanRate, a.loanYears)
  r.equity = Math.max(0, a.startupTotal - a.loan)
  r.afterDebt = r.profit - r.loanPayment
  r.dscr = r.loanPayment > 0 ? r.profit / r.loanPayment : Infinity

  // You: what is left after the loan and the draw you need to live on, and
  // an indicative take-home once income tax and NI have had their share.
  r.surplus = r.afterDebt - a.ownerDraw
  const th = takeHome(r.profit)
  r.tax = th.tax + th.ni
  r.takeHome = th.net - r.loanPayment

  return r
}

// ————— VAT, loan, tax ————————————————————————————
export const VAT_THRESHOLD = 90000

// Annual repayment on an amortising loan; zero when there is no loan.
export function loanPayment(principal, ratePct, years) {
  const n = Math.round((years || 0) * 12)
  if (!(principal > 0) || n <= 0) return 0
  const rm = (ratePct || 0) / 100 / 12
  const monthly = rm > 0 ? (principal * rm) / (1 - (1 + rm) ** -n) : principal / n
  return monthly * 12
}

// Indicative income tax + Class 4 NI on a sole trader's profit, Scottish
// bands. Personal allowance £12,570; the taper above £100k is ignored
// (this café is not there). Confirm with an accountant before relying on it.
export const TAX_YEAR = '2025/26'
const PERSONAL_ALLOWANCE = 12570
const SCOTTISH_BANDS = [
  [15397, 0.19], [27491, 0.20], [43662, 0.21], [75000, 0.42], [125140, 0.45], [Infinity, 0.48],
]
const NI_LOWER = 12570
const NI_UPPER = 50270

export function takeHome(profit) {
  const p = Math.max(0, profit || 0)
  let tax = 0
  let lower = PERSONAL_ALLOWANCE
  for (const [upper, rate] of SCOTTISH_BANDS) {
    if (p > lower) tax += (Math.min(p, upper) - lower) * rate
    lower = upper
    if (p <= upper) break
  }
  const ni = Math.max(0, Math.min(p, NI_UPPER) - NI_LOWER) * 0.06 + Math.max(0, p - NI_UPPER) * 0.02
  return { tax, ni, net: p - tax - ni }
}

// The daytime covers a day at which the café pays you: take-home (after
// VAT, the loan, tax and NI) reaches what you said you need to live on.
// Breakeven answers "when does it stop losing"; this answers "when does it
// start being worth it". Solved numerically — take-home is not linear in
// covers once the tax bands bite.
export function coversToPay(a, target = a.ownerDraw) {
  if (!(a.spendDay > 0) || !(a.tradingDays > 0)) return Infinity
  const th = (x) => compute({ ...a, coversDay: x }).takeHome
  let lo = 0
  let hi = 400
  if (th(hi) < target) return Infinity
  if (th(lo) >= target) return 0
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (th(mid) >= target) hi = mid
    else lo = mid
  }
  return hi
}

// What a seller's declared turnover means in your units: covers a day at
// your average spend. Their trade, your yardstick — the plausibility check
// on both numbers at once.
export const impliedCovers = (turnover, a) =>
  turnover > 0 && a.spendDay > 0 && a.tradingDays > 0 ? turnover / (a.spendDay * a.tradingDays) : null

// ————— seasonality ——————————————————————————————
// Edinburgh trades nothing like a flat year: the Festival fills August, and
// January–February empty out. Weights are relative to an average month and
// sum to 12, so the annual totals above are untouched — they only say when
// the money arrives, which is the question working capital has to answer.
export const MONTHS = [
  ['Jan', 0.80], ['Feb', 0.82], ['Mar', 0.92], ['Apr', 0.98],
  ['May', 1.05], ['Jun', 1.08], ['Jul', 1.15], ['Aug', 1.35],
  ['Sep', 1.05], ['Oct', 0.98], ['Nov', 0.92], ['Dec', 0.90],
]

// Mid-case working capital from the startup budget (3 months).
export const WORKING_CAPITAL = 20000

// Month-by-month cash in the first year, starting from the working capital
// in the budget. Revenue, its COGS and the VAT swing with the season and
// climb the ramp (month one trades at `rampStartPct` of the plan, reaching
// it after `rampMonths`); rent, labour, overheads and the loan repayment
// do not move — which is exactly why a quiet February bites.
export function monthly(a, r, workingCapital = a.workingCapital ?? WORKING_CAPITAL) {
  const fixed = (a.labour + a.apStaff + a.rent + a.rates + a.overheads) / 12
  const debt = (r.loanPayment || 0) / 12
  const start = Math.min(1, Math.max(0, (a.rampStartPct ?? 100) / 100))
  const months = Math.max(0, a.rampMonths ?? 0)
  let cash = workingCapital
  let trough = { month: null, cash: Infinity }
  const rows = MONTHS.map(([name, w], i) => {
    const ramp = months > 0 ? Math.min(1, start + (1 - start) * (i / months)) : 1
    const revenue = (r.totalRev / 12) * w * ramp
    const cogs = (r.cogs / 12) * w * ramp
    const vat = ((r.vat || 0) / 12) * w * ramp
    const profit = revenue - cogs - vat - fixed
    cash += profit - debt
    if (cash < trough.cash) trough = { month: name, cash }
    return { name, weight: w, ramp, revenue, profit, debt, cash }
  })
  return { rows, trough, fixed, debt }
}

// ————— sensitivity ——————————————————————————————
// Which assumption actually moves the answer. Same ±10% nudge on each, so
// the bars are comparable; sorted by how much they swing the profit.
export const SENSITIVITY = [
  ['coversDay', 'Covers / day'],
  ['spendDay', 'Average spend'],
  ['cogsDayPct', 'Food & drink COGS'],
  ['rent', 'Rent'],
  ['labour', 'Core labour'],
  ['overheads', 'Overheads'],
  ['apCovers', 'Aperitivo covers'],
  ['tradingDays', 'Trading days'],
]

export function sensitivity(a, delta = 0.1) {
  const base = compute(a).profit
  return SENSITIVITY.map(([key, label]) => {
    const down = compute({ ...a, [key]: a[key] * (1 - delta) }).profit - base
    const up = compute({ ...a, [key]: a[key] * (1 + delta) }).profit - base
    return { key, label, down, up, swing: Math.abs(up - down) }
  }).sort((x, y) => y.swing - x.swing)
}

// Assumption groups drive the left-hand editor and the day ribbon anchors.
export const GROUPS = [
  {
    id: 'daytime',
    name: 'Daytime café',
    stream: 'day',
    fields: [
      ['coversDay', 'Covers / day', 'count'],
      ['spendDay', 'Average spend', 'gbp2'],
      ['tradingDays', 'Trading days / year', 'count'],
      ['cogsDayPct', 'Food & drink COGS', 'pct'],
    ],
  },
  {
    id: 'aperitivo',
    name: 'Aperitivo · Thu–Sun 17:00–20:00',
    stream: 'ap',
    fields: [
      ['apNights', 'Nights / week', 'count'],
      ['apWeeks', 'Weeks / year', 'count'],
      ['apCovers', 'Covers / session', 'count'],
      ['apPrice', 'Price / person', 'gbp2'],
      ['apCogsPct', 'COGS (drink + food)', 'pct'],
    ],
  },
  {
    id: 'wine',
    name: 'Wine tasting evenings',
    stream: 'wine',
    fields: [
      ['wineEvents', 'Events / year', 'count'],
      ['wineCovers', 'Covers / event', 'count'],
      ['wineFood', 'Food spend / head', 'gbp2'],
      ['wineFee', 'Venue fee / event', 'gbp2'],
      ['wineCogsPct', 'Food COGS', 'pct'],
    ],
  },
  {
    id: 'costs',
    name: 'Annual cost base',
    stream: null,
    fields: [
      ['labour', 'Core labour (owner + part-time)', 'gbp'],
      ['apStaff', 'Aperitivo staff member', 'gbp'],
      ['rent', 'Rent', 'gbp'],
      ['rates', 'Business rates (SBBS relief)', 'gbp'],
      ['overheads', 'Utilities, insurance, admin, marketing', 'gbp'],
    ],
  },
  {
    id: 'vat',
    name: 'VAT',
    stream: null,
    fields: [
      ['vatRegistered', 'VAT-registered (takings over £90k)', 'bool'],
      ['vatStdPct', 'Takings standard-rated (eat-in, hot)', 'pct'],
      ['vatInputPct', 'Costs with reclaimable VAT', 'pct'],
    ],
  },
  {
    id: 'startup',
    name: 'Acquisition & funding',
    stream: null,
    fields: [
      ['startupTotal', 'Startup budget (mid case)', 'gbp'],
      ['loan', 'Borrowed (Start Up Loan / bank)', 'gbp'],
      ['loanRate', 'Interest rate', 'pct'],
      ['loanYears', 'Repaid over (years)', 'count'],
    ],
  },
  {
    id: 'you',
    name: 'You, and year one',
    stream: null,
    fields: [
      ['ownerDraw', 'What you need to draw to live on', 'gbp'],
      ['rampStartPct', 'Month-one trade, share of plan', 'pct'],
      ['rampMonths', 'Months to reach the plan', 'count'],
      ['workingCapital', 'Cash in the till on day one', 'gbp'],
    ],
  },
]

// ————— staffing sanity check ————————————————————
// What a labour budget buys at the National Living Wage, once employer NI,
// holiday pay and pension are on top — the check that "£40k of staff" is
// really about one and a bit paid people, not a team.
export const NLW = 12.71 // £/hour, 21+, from April 2026
export const ON_COSTS = 0.25 // employer NI, 12.07% holiday accrual, auto-enrolment pension — rough
export const paidHoursPerWeek = (labour) => (labour > 0 ? labour / (NLW * (1 + ON_COSTS)) / 52 : 0)
