// The deal pipeline's fixed parts: the due-diligence checklist every
// serious candidate goes through, and the follow-up date logic. Pure —
// the state itself lives in `cafeplan:deals` next to the call sheet.

// What to ask for before an offer means anything. Scotland-specific where
// it matters: SAA for the rateable value, Class 3 for food and drink,
// FHIS rather than the English hygiene ratings.
export const DD_ITEMS = [
  ['accounts', 'Three years of accounts, or management accounts plus VAT returns'],
  ['till', 'Till or card-terminal reports for the last 12 months (turnover you can see, not hear)'],
  ['lease', 'The lease: term left, break clauses, assignment consent, FRI repairing obligations'],
  ['rent', 'Rent review dates and basis; any arrears or landlord disputes'],
  ['rates', 'Rateable value on the SAA roll — SBBS relief needs RV under £12k'],
  ['planning', 'Planning use class (Class 3, food and drink) and any conditions on hours'],
  ['licence', 'Premises licence in place? Personal licence holder? Overprovision area?'],
  ['hygiene', 'Food hygiene: FHIS result and the last environmental health inspection report'],
  ['building', 'EPC, gas and electrical certificates, building condition, fire risk assessment'],
  ['staff', 'Staff contracts, hours and pay — they transfer with the business under TUPE'],
  ['equipment', 'Equipment inventory: owned, leased or on finance (coffee machine, fridges)'],
  ['suppliers', 'Supplier and utility contracts, tie-ins, notice periods'],
  ['reason', 'Reason for sale cross-checked: neighbours, reviews, Companies House filings'],
]

// The first phone call: what to ask before a viewing is worth your time.
// Answers go in the call sheet fields; these are the prompts.
export const CALL_QUESTIONS = [
  ['why', 'Why are they selling, and since when has it been on the market?'],
  ['figures', 'Turnover and net profit for the last two years — and will they show accounts before a viewing?'],
  ['wage', 'Does the owner work in it, and is their wage in the figures or added back?'],
  ['lease', 'Lease: years left, rent, next review, break clauses, will the landlord consent to assignment?'],
  ['rates', 'Rateable value — and are they on Small Business Bonus relief today?'],
  ['hours', 'Trading hours and days now; any evening trade or licence?'],
  ['staff', 'How many staff, on what contracts and hours — who stays?'],
  ['included', 'What exactly is in the price: fixtures, equipment (owned or leased), stock, goodwill, name?'],
  ['works', 'Any known works: extraction, gas safety, EPC, roof, drains, EHO conditions?'],
  ['offers', 'Have there been offers? What would they take for a quick, clean deal?'],
]

// The viewing: what to look at with your own eyes, and when to go.
export const VIEWING_CHECKS = [
  ['times', 'Go twice: a weekday mid-morning and a Saturday lunchtime. Count covers and the queue.'],
  ['street', 'Walk the street: footfall, parking, the bus stop, the canal path, who the neighbours are.'],
  ['kitchen', 'Kitchen: extraction, gas, fridges, the coffee machine (owned? age?), a dishwasher that works.'],
  ['fabric', 'Fabric: damp, roof, floors, toilets, back door, bins — what a refit would really cost.'],
  ['seats', 'Count the seats and measure the floor: does the aperitivo layout actually fit?'],
  ['till', 'Ask to see the till or card terminal totals for last week, on the screen, not on paper.'],
  ['reviews', 'Read the last 30 reviews before you go; ask about the ones that mention problems.'],
  ['staff', 'Talk to the staff if you can: mood, hours, whether they know it is for sale.'],
  ['licence', 'Look for the premises licence on the wall, the food hygiene certificate, the EPC.'],
  ['gut', 'The feeling on leaving: would you want to be here at 7am every day?'],
]

export const ddProgress = (deal) => {
  const done = DD_ITEMS.filter(([id]) => deal?.dd?.[id]).length
  return { done, total: DD_ITEMS.length }
}

// A deal that still has a live next step: not parked, not finished.
export const isOpen = (deal) => !!deal?.stage && !['watching', 'passed', 'won'].includes(deal.stage)

// The follow-up date, read against today: 'overdue', 'soon' (within three
// days) or 'later'; null when there is no date or the deal is closed.
export function dueState(deal, today = new Date()) {
  if (!deal?.nextOn || !isOpen(deal)) return null
  const due = new Date(deal.nextOn)
  if (Number.isNaN(due.getTime())) return null
  const days = Math.floor((due.setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 86400000)
  if (days < 0) return 'overdue'
  if (days <= 3) return 'soon'
  return 'later'
}
