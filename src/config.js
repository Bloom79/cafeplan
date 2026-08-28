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
