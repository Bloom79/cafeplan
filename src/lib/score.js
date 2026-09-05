// Fit score and fair-price maths — the judgement layer between a listing
// and the business case. Pure functions; anchors mirror the written case.

// ————— fit score ————————————————————————————————
//
// "How well does this site fit OUR concept?" — not "is it a good deal".
// Four ingredients, weighted by how much they bear on the canal-side
// café + aperitivo plan. Unknown ingredients score neutral (half marks)
// rather than zero: missing data is a question, not a fault.

const RENT_ANCHOR = 14000 // Ashley Terrace comparable, £/yr
const PRICE_BAND = [35000, 55000] // where comparable asks cluster

// Walking distance to the Union Canal corridor, in spirit: the closer an
// area sits to Shandon/Polwarth/Merchiston, the closer to the concept.
const AREA_FIT = {
  shandon: 1, polwarth: 1, merchiston: 1, fountainbridge: 0.9, slateford: 0.85, gorgie: 0.8, dalry: 0.8,
  bruntsfield: 0.8, morningside: 0.7, marchmont: 0.7, haymarket: 0.65, tollcross: 0.7, 'west end': 0.55,
  'city centre': 0.45, 'old town': 0.4, 'new town': 0.45, stockbridge: 0.5, 'comely bank': 0.45,
  corstorphine: 0.4, southside: 0.5, newington: 0.5, leith: 0.3, 'leith walk': 0.35, broughton: 0.4,
  portobello: 0.25,
}

export function fitScore(l) {
  const parts = []

  // Rent vs the £14k anchor (weight 35) — the cost you pay every year.
  if (l.rent != null) {
    const ratio = l.rent / RENT_ANCHOR
    const s = ratio <= 0.8 ? 1 : ratio <= 1.1 ? 0.85 : ratio <= 1.4 ? 0.55 : ratio <= 1.8 ? 0.3 : 0.1
    parts.push({ key: 'rent', label: `rent £${(l.rent / 1000).toFixed(1)}k vs £14k anchor`, w: 35, s })
  } else {
    parts.push({ key: 'rent', label: 'rent undisclosed — ask', w: 35, s: 0.5 })
  }

  // Location (weight 35) — measured when we have OSM place facts for an
  // exact address: metres to the Union Canal is the catchment question
  // itself, and cafés within 300 m says how crowded the street already is.
  // Otherwise the area name stands in.
  const p = l.place
  if (p && (p.canalM != null || p.cafes300 != null)) {
    let s
    if (p.canalM == null) s = 0.3
    else if (p.canalM <= 400) s = 1
    else if (p.canalM <= 800) s = 0.9
    else if (p.canalM <= 1500) s = 0.7
    else if (p.canalM <= 2500) s = 0.5
    else s = 0.3
    // Crowding: a couple of neighbours is a scene, twenty is a fight.
    const c = p.cafes300 ?? 0
    const crowd = c <= 3 ? 0 : c <= 8 ? -0.1 : c <= 15 ? -0.2 : -0.3
    s = Math.max(0.1, Math.min(1, s + crowd))
    parts.push({
      key: 'area',
      label: `${p.canalM != null ? `${p.canalM} m to the canal` : 'no canal within 2.5 km'} · ${c} café${c === 1 ? '' : 's'} within 300 m`,
      w: 35,
      s,
    })
  } else {
    const areaKey = String(l.area || '').toLowerCase().trim()
    const af = AREA_FIT[areaKey]
    parts.push(
      af != null
        ? { key: 'area', label: `${l.area} · corridor fit (by area)`, w: 35, s: af }
        : { key: 'area', label: `${l.area || 'area unknown'} — outside mapped areas`, w: 35, s: 0.3 },
    )
  }

  // Ask vs the comparable band (weight 20) — cheap is good, suspicious-cheap
  // still scores well here because price risk shows up in the SDE check.
  if (l.price != null) {
    const s = l.price <= PRICE_BAND[0] ? 1 : l.price <= PRICE_BAND[1] ? 0.75 : l.price <= 80000 ? 0.4 : 0.15
    parts.push({ key: 'price', label: `ask £${(l.price / 1000).toFixed(0)}k vs £35–55k band`, w: 20, s })
  } else {
    parts.push({ key: 'price', label: 'price on application', w: 20, s: 0.5 })
  }

  // Disclosed accounts (weight 10) — a seller who shows numbers is a seller
  // you can actually negotiate with.
  parts.push(
    l.turnover != null || l.profit != null
      ? { key: 'books', label: 'trading figures disclosed', w: 10, s: 1 }
      : { key: 'books', label: 'no trading figures shown', w: 10, s: 0.3 },
  )

  const score = Math.round(parts.reduce((acc, p) => acc + p.w * p.s, 0))
  return { score, parts }
}

export const scoreBand = (score) =>
  score >= 75 ? 'good' : score >= 55 ? 'mid' : 'low'

// ————— SDE fair-price check ————————————————————————
//
// Seller's Discretionary Earnings: declared profit + the owner's own wage
// and one-off costs added back — the number small-café multiples apply to.
// Small UK cafés change hands at 1.5×–2.5× SDE.

export const SDE_MULTIPLES = [1.5, 2.5]

export function sdeCheck({ profit, ownerWage = 0, oneOffs = 0 } = {}, ask) {
  // An empty box is "not entered", not zero — Number('') would say 0.
  if (profit === '' || profit == null) return null
  const p = Number(profit)
  if (!Number.isFinite(p)) return null
  const sde = p + (Number(ownerWage) || 0) + (Number(oneOffs) || 0)
  if (sde <= 0) return { sde, low: 0, high: 0, verdict: 'no-earnings', ask }
  const [low, high] = SDE_MULTIPLES.map((m) => Math.round(sde * m))
  let verdict = 'in-band'
  if (ask != null) {
    if (ask < low) verdict = 'below-band'
    else if (ask > high) verdict = 'above-band'
  } else {
    verdict = 'no-ask'
  }
  return { sde, low, high, verdict, ask }
}

// ————— the offer ————————————————————————————————
//
// Where to open and where to stop. Open at the bottom of the SDE band;
// stop at the top of it, or lower if your own concept would not pay the
// price back within `paybackYears` — whichever bites first. `profit` is
// what YOUR model makes in their premises; `otherCosts` is the rest of the
// startup budget that comes on top of the price.

export function offerPlan(check, { profit = null, otherCosts = 0, paybackYears = 3 } = {}) {
  if (!check || !(check.sde > 0)) return null
  const open = check.low
  let cap = null
  if (profit > 0) cap = Math.max(0, Math.round(profit * paybackYears - otherCosts))
  const ceiling = cap != null ? Math.min(check.high, cap) : check.high
  const askMultiple = check.ask != null ? check.ask / check.sde : null
  const limitedBy = cap != null && cap < check.high ? 'payback' : 'band'
  return { open, ceiling, cap, askMultiple, limitedBy }
}

// ————— the verdict ————————————————————————————————
//
// One number and a sentence per listing: fit (does the site suit the
// concept), payback on your own model, the SDE band if you have seller
// figures, and the market status. Rank = 0–100; the shortlist is the top
// of the ranking among listings still for sale.

export function verdict(l, { payback = null, sde = null, stage = null } = {}) {
  if (l.status === 'gone' || l.status === 'stale') return { rank: 0, band: 'out', reasons: ['no longer on the market'] }
  if (stage === 'passed') return { rank: 0, band: 'out', reasons: ['you passed on it'] }
  const fit = fitScore(l)
  let rank = fit.score
  const reasons = []

  const rentPart = fit.parts.find((p) => p.key === 'rent')
  if (rentPart && rentPart.s >= 0.85) reasons.push('rent under the anchor')
  else if (rentPart && rentPart.s <= 0.3) reasons.push('rent well above the anchor')
  const areaPart = fit.parts.find((p) => p.key === 'area')
  if (areaPart && areaPart.s >= 0.9) reasons.push('in the canal corridor')
  else if (areaPart && areaPart.s <= 0.4) reasons.push('outside the target catchment')

  if (payback != null) {
    if (payback <= 2) { rank += 15; reasons.push(`pays back in ${payback.toFixed(1)} yr on your concept`) }
    else if (payback <= 3) { rank += 5; reasons.push(`${payback.toFixed(1)} yr payback`) }
    else if (payback > 5) { rank -= 15; reasons.push(`slow payback (${payback.toFixed(1)} yr)`) }
  }
  if (sde) {
    if (sde.verdict === 'below-band') { rank += 10; reasons.push('ask below the SDE band') }
    else if (sde.verdict === 'in-band') { rank += 5; reasons.push('ask inside the SDE band') }
    else if (sde.verdict === 'above-band') { rank -= 15; reasons.push('ask above the SDE band') }
    else if (sde.verdict === 'no-earnings') { rank -= 10; reasons.push('no earnings behind the price') }
  } else if (l.turnover == null && l.profit == null) {
    reasons.push('no figures yet — ask the agent')
  }
  if (l.status === 'under offer') { rank -= 30; reasons.push('under offer') }
  // A listing nobody can confirm is on the market is a listing you cannot
  // call about with confidence — and it drifts to "stale" after a few more.
  if (l.verification?.outcome === 'unclear') { rank -= 12; reasons.push('could not be verified') }
  if (stage && stage !== 'watching') { rank += 8; reasons.push(`in progress: ${stage}`) }

  rank = Math.max(0, Math.min(100, Math.round(rank)))
  const band = rank >= 75 ? 'call' : rank >= 55 ? 'watch' : 'pass'
  return { rank, band, reasons }
}
