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

  // Profit
  r.profit = r.totalRev - r.totalCosts
  r.margin = r.totalRev > 0 ? r.profit / r.totalRev : 0
  r.grossProfit = r.totalRev - r.cogs
  r.grossMargin = r.totalRev > 0 ? r.grossProfit / r.totalRev : 0

  // Breakeven — daytime covers/day needed. Contribution per cover is
  // spend less its COGS; evening streams are netted against the costs
  // that belong to them (their COGS + the extra staff member).
  const perCover = a.spendDay * (1 - a.cogsDayPct / 100)
  const fixed = a.labour + r.occupancy + a.overheads
  const eveningNet =
    r.apRev * (1 - a.apCogsPct / 100)
    + r.wineFoodRev * (1 - a.wineCogsPct / 100)
    + r.wineFeeRev
    - a.apStaff
  // No contribution per cover (spend or trading days zeroed out) means no
  // number of covers ever breaks even — say so rather than print Infinity.
  const coverBase = perCover * a.tradingDays
  r.coversBE = coverBase > 0 ? Math.max(0, (fixed - eveningNet) / coverBase) : Infinity
  r.coversBEStandalone = coverBase > 0 ? fixed / coverBase : Infinity

  // Payback on the acquisition
  r.paybackYears = r.profit > 0 ? a.startupTotal / r.profit : Infinity

  return r
}

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

// Month-by-month cash, starting from the working capital in the budget.
// Revenue and its COGS swing with the season; rent, labour and overheads
// do not — which is exactly why a quiet February bites.
export function monthly(a, r, workingCapital = WORKING_CAPITAL) {
  const fixed = (a.labour + a.apStaff + a.rent + a.rates + a.overheads) / 12
  let cash = workingCapital
  let trough = { month: null, cash: Infinity }
  const rows = MONTHS.map(([name, w]) => {
    const revenue = (r.totalRev / 12) * w
    const cogs = (r.cogs / 12) * w
    const profit = revenue - cogs - fixed
    cash += profit
    if (cash < trough.cash) trough = { month: name, cash }
    return { name, weight: w, revenue, profit, cash }
  })
  return { rows, trough, fixed }
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
    id: 'startup',
    name: 'Acquisition',
    stream: null,
    fields: [['startupTotal', 'Startup budget (mid case)', 'gbp']],
  },
]
