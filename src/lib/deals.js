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
