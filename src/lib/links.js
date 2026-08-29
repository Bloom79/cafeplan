// Outbound links for a listing. One place, because the card and the map pin
// have to agree — they drifted apart once already.
//
// Rightbiz sits behind a Cloudflare bot check, so its deep links can greet
// you with "verify you are human" before the listing. We used to dodge that
// by pointing at a Google search for the business name instead — but the
// names are generic ("Cafe and Ice Cream Shop", "20-Seat Restaurant"), so
// the search could land on some other listing or on a category page. The
// canonical URL is now the primary link, with the site search kept as a
// visible second option on the walled portal only.

const WALLED = /rightbiz\.co\.uk/

const google = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`

export const isWalled = (l) => WALLED.test(l.url || '')

export const listingHref = (l) => l.url || searchHref(l)

export const listingLabel = (l) => (l.url ? 'Open the listing ↗' : 'Search for it ↗')

// Brackets in a name usually hold the trading name — the most identifying
// part — so keep the words and drop the punctuation that skews the query.
export const searchHref = (l) => {
  const name = String(l.name || '').replace(/[()"]/g, ' ').replace(/\s+/g, ' ').trim()
  return google(
    isWalled(l)
      ? `site:rightbiz.co.uk ${name} ${l.area}`
      : `"${name}" ${l.area} Edinburgh business for sale`,
  )
}

export const gmapsHref = (l) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.name} ${l.area} Edinburgh`)}`
