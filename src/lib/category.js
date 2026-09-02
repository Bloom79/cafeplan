// Mirror of scripts/lib.mjs categoryOf — the app can't import the agent's
// module (different bundling), so keep the two in step.
export const CATEGORIES = [
  ['cafe', 'Café'],
  ['restaurant', 'Restaurant'],
  ['dessert', 'Dessert'],
  ['bar', 'Bar'],
  ['premises', 'Premises to let'],
]

const KNOWN = new Set(CATEGORIES.map(([k]) => k))

export const categoryOf = (l) => {
  if (l.category && KNOWN.has(l.category)) return l.category
  const s = `${l.name || ''} ${l.tenure || ''}`.toLowerCase()
  if (/to let|lease only|premises|vacant unit|fitted unit/.test(s)) return 'premises'
  // "sandwich bar" / "coffee bar" / "snack bar" are cafés, not bars.
  if (/pub|tavern|wine bar|cocktail|\bbar\b(?!.*(sandwich|coffee|snack|salad|juice))/.test(s)
    && !/(sandwich|coffee|snack|salad|juice)\s+bar/.test(s)) return 'bar'
  if (/restaurant|bistro|brasserie|trattoria|pizzeria|diner|eatery|grill/.test(s)) return 'restaurant'
  if (/caf[eé]|coffee|tea ?room|sandwich|deli/.test(s)) return 'cafe'
  if (/dessert|ice cream|gelat|bubble tea|matcha|cake|bakery|patisserie|chocolate/.test(s)) return 'dessert'
  return 'cafe'
}

export const categoryLabel = (k) => (CATEGORIES.find(([key]) => key === k) || [k, k])[1]
