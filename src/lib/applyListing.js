import { DEFAULTS, STARTUP, STARTUP_TOTALS } from '../data/model.js'

// Load a real listing into the model. Only the two figures that belong to
// the *property* are taken — rent and asking price. Covers, spend and the
// evening offer stay yours: you are not buying their trade, you are buying
// their lease and running your own concept through it.
//
// The asking price replaces the purchase line of the startup budget; every
// other acquisition cost stays at the mid case.
const PURCHASE_MID = STARTUP[0][2] // [label, low, mid, high] — the purchase line
const OTHER_COSTS = STARTUP_TOTALS[1] - PURCHASE_MID

export const MODEL_KEY = 'cafeplan:model'
export const SCENARIO_KEY = 'cafeplan:scenario'
export const APPLIED_KEY = 'cafeplan:appliedListing'

const read = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key)
    return raw !== null ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

const write = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch { /* private mode — the tab still works */ }
}

export function startupFor(listing) {
  return listing.price != null ? Math.round(listing.price + OTHER_COSTS) : null
}

// Writes straight to storage rather than through React: the Model tab is
// unmounted while you are on Listings, and reads this on the way in.
export function applyListingToModel(listing) {
  const model = { ...DEFAULTS, ...read(MODEL_KEY, DEFAULTS) }
  if (listing.rent != null) model.rent = listing.rent
  const startup = startupFor(listing)
  if (startup != null) model.startupTotal = startup
  write(MODEL_KEY, model)
  write(SCENARIO_KEY, 'custom')
  write(APPLIED_KEY, {
    id: listing.id,
    name: listing.name,
    area: listing.area,
    rent: listing.rent ?? null,
    price: listing.price ?? null,
    turnover: listing.turnover ?? null,
    profit: listing.profit ?? null,
    startup,
    at: new Date().toISOString().slice(0, 10),
  })
}
