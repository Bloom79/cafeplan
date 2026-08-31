// The listings verifier's tiny backend — a Cloudflare Worker deployed from
// worker/ (see worker/wrangler.toml). Until it exists the Verify / Analyse
// buttons explain that setup is pending instead of failing silently.
export const WORKER_URL = 'https://cafeplan-verify.casatrova.workers.dev'

// Listings data is read from the repo's raw file (always current the moment
// the agent commits — no Pages rebuild needed); local dev uses the copy
// served by vite from public/.
export const DATA_URL = typeof location !== 'undefined' && location.hostname === 'localhost'
  ? 'listings.json'
  : 'https://raw.githubusercontent.com/Bloom79/cafeplan/main/public/listings.json'

// Web-push application server key (public half; the private half lives as a
// worker secret). Rotating it requires re-subscribing every device.
export const VAPID_PUBLIC_KEY = 'BKGrZAooIZ-ZUx8_HqVbXapst2CpXFckF3ojNuV6LRLKdWNca6-rqLqbbpEeey7Pj9FqM7r9bpUpnuBxQPI4uEE'
