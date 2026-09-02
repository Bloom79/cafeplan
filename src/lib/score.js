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
  shandon: 1, polwarth: 1, merchiston: 1, fountainbridge: 0.9, slateford: 0.85,
  bruntsfield: 0.8, morningside: 0.7, marchmont: 0.7, haymarket: 0.65,
  stockbridge: 0.5, corstorphine: 0.4,
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

  // Area vs the canal corridor (weight 35) — the catchment IS the concept.
  const areaKey = String(l.area || '').toLowerCase().trim()
  const af = AREA_FIT[areaKey]
  parts.push(
    af != null
      ? { key: 'area', label: `${l.area} · corridor fit`, w: 35, s: af }
      : { key: 'area', label: `${l.area || 'area unknown'} — outside mapped areas`, w: 35, s: 0.3 },
  )

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

// ————— the verdict ————————————————————————————————
//
// One number and a sentence per listing: fit (does the site suit the
// concept), payback on your own model, the SDE band if you have seller
// figures, and the market status. Rank = 0–100; the shortlist is the top
// of the ranking among listings still for sale.

export function verdict(l, { payback = null, sde = null } = {}) {
  if (l.status === 'gone' || l.status === 'stale') return { rank: 0, band: 'out', reasons: ['no longer on the market'] }
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

  rank = Math.max(0, Math.min(100, Math.round(rank)))
  const band = rank >= 75 ? 'call' : rank >= 55 ? 'watch' : 'pass'
  return { rank, band, reasons }
}
