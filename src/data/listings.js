// Fallback seed — used only when the runtime fetch of /listings.json fails
// (offline dev, deploy hiccup). The live data is public/listings.json,
// refreshed by the daily verify agent; importing it here keeps the fallback
// automatically in sync.
import seed from '../../public/listings.json'

export const SEED_DATA = seed
