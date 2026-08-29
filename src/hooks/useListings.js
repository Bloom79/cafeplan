import { useEffect, useSyncExternalStore } from 'react'
import { SEED_DATA } from '../data/listings.js'
import { DATA_URL } from '../config.js'

// One fetch per session, shared by every panel that needs the watchlist.
// Panels unmount when you switch tabs, so without this each tab switch
// re-hit the network; and Listings + Map each fetched their own copy.
//
// Fallback ladder: the raw file on GitHub (always current, no rebuild) →
// the copy deployed with the site (right at build time) → the seed baked
// into the bundle (always something to render).

const STALE_MS = 5 * 60 * 1000

let cache = SEED_DATA
let fetchedAt = 0
let inflight = null
const subscribers = new Set()

const valid = (d) => d && Array.isArray(d.listings) && d.listings.length > 0

const publish = (data) => {
  cache = data
  fetchedAt = Date.now()
  subscribers.forEach((fn) => fn(data))
}

const fetchJson = async (url) => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

export function refreshListings() {
  if (inflight) return inflight
  inflight = (async () => {
    for (const url of [`${DATA_URL}?t=${Date.now()}`, `${import.meta.env.BASE_URL}listings.json`]) {
      try {
        const d = await fetchJson(url)
        if (valid(d)) { publish(d); return d }
      } catch { /* try the next source */ }
    }
    return cache
  })().finally(() => { inflight = null })
  return inflight
}

const subscribe = (fn) => {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function useListings() {
  // The cache is an external store, so read it as one: every panel renders
  // whatever is loaded, and republishing updates them all.
  const data = useSyncExternalStore(subscribe, () => cache)

  useEffect(() => {
    if (cache === SEED_DATA || Date.now() - fetchedAt > STALE_MS) refreshListings()
  }, [])

  return [data, refreshListings]
}
