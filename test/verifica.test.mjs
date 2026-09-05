import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STALE_AFTER, categoryOf, daysListed, districtOf, extractJson, isFailedVerdict, listingLinks, mergeDiscovery, mergeVerification,
  metres, needsCheck, normaliseArea, okUrl, slug,
} from '../scripts/lib.mjs'

test('listingLinks: one anchor per listing, per portal; never contact forms, franchises or alerts', () => {
  const html = `
    <a href="/uk/search/cafes-for-sale-in-edinburgh?save=1&alert=1">Create alert</a>
    <a href="https://uk.businessesforsale.com/uk/fully-fitted-morningside-cafe-low-rent-in-edinburgh.aspx"><h2>Fully Fitted Morningside Cafe, Low Rent</h2></a>
    <a href="https://uk.businessesforsale.com/uk/fully-fitted-morningside-cafe-low-rent-in-edinburgh/contact">Contact seller</a>
    <a href="https://uk.businessesforsale.com/uk/franchises/opportunities/jamaica-blue-franchise-uk?location=Edinburgh">Jamaica Blue Franchise</a>
    <a href="/p/business-for-sale/nice-cafe-and-restaurant-for-sale-got-class-3-hot-food-/1462105894">nice cafe and restaurant for sale</a>
    <a href="/listing/very-busy-cafe-DB2541715/">Very busy café &amp; deli</a>
    <a href="https://altiusgroup.co.uk/business/dessert-lunch-cafe/">Dessert &amp; Lunch Café</a>
    <a href="https://scottishbusinessagency.co.uk/volunteer-arms-broxburn-for-sale/">Turn-Key Bar &amp; Bistro</a>
    <a href="https://www.cornerstoneba.co.uk/business-search/">Business Search</a>
    <a href="https://www.cornerstoneba.co.uk/business-search/45-morningside-road/">45 Morningside Road</a>
    <a href="/for-sale/kitchen-appliances/uk/edinburgh">Appliances</a>
    <a href="https://uk.businessesforsale.com/uk/fully-fitted-morningside-cafe-low-rent-in-edinburgh.aspx">duplicate</a>
  `
  const links = listingLinks(html, 'https://www.gumtree.com')
  assert.deepEqual(links.map((l) => l.href), [
    'https://uk.businessesforsale.com/uk/fully-fitted-morningside-cafe-low-rent-in-edinburgh.aspx',
    'https://www.gumtree.com/p/business-for-sale/nice-cafe-and-restaurant-for-sale-got-class-3-hot-food-/1462105894',
    'https://www.gumtree.com/listing/very-busy-cafe-DB2541715/',
    'https://altiusgroup.co.uk/business/dessert-lunch-cafe/',
    'https://scottishbusinessagency.co.uk/volunteer-arms-broxburn-for-sale/',
    'https://www.cornerstoneba.co.uk/business-search/45-morningside-road/',
  ])
  assert.equal(links[0].text, 'Fully Fitted Morningside Cafe, Low Rent')
  assert.equal(links[2].text, 'Very busy café & deli')
  assert.equal(listingLinks(html, 'https://x.test', 2).length, 2)
})

test('places: metres, districtOf, normaliseArea, daysListed', () => {
  assert.ok(Math.abs(metres(55.9429, -3.2861, 55.9429, -3.2861)) < 1)
  assert.ok(Math.abs(metres(55.9312, -3.2210, 55.9382, -3.2095) - 1050) < 150, 'Shandon→Bruntsfield ≈ 1 km')
  assert.equal(districtOf(55.9429, -3.2861), 'Corstorphine')
  assert.equal(districtOf(55.9382, -3.2095), 'Bruntsfield')
  assert.equal(districtOf(56.5, -3.0), null, 'far away → null')
  assert.equal(normaliseArea('Morningside/Bruntsfield, Edinburgh'), 'Morningside')
  assert.equal(normaliseArea('Elm Row, Edinburgh'), 'Leith Walk')
  assert.equal(normaliseArea('Shandwick Place, Edinburgh City Centre'), 'West End')
  assert.equal(normaliseArea('Edinburgh City Centre'), 'City Centre')
  assert.equal(normaliseArea('Somewhere, Edinburgh'), 'Somewhere')
  assert.equal(daysListed({ firstSeen: '2026-08-29' }, '2026-09-02'), 4)
  assert.equal(daysListed({ history: [{ date: '2026-08-01' }] }, '2026-09-02'), 32)
  assert.equal(daysListed({}, '2026-09-02'), null)
})

test('categoryOf: stored category wins; names classify sensibly', () => {
  assert.equal(categoryOf({ category: 'bar', name: 'Cafe X' }), 'bar')
  assert.equal(categoryOf({ name: 'City Centre Coffee Shop and Sandwich Bar' }), 'cafe')
  assert.equal(categoryOf({ name: 'Cafe and Ice Cream Shop' }), 'cafe')
  assert.equal(categoryOf({ name: 'Dessert & Ice Cream Parlour' }), 'dessert')
  assert.equal(categoryOf({ name: 'Charming 20-Seat Restaurant' }), 'restaurant')
  assert.equal(categoryOf({ name: 'The Canal Tavern' }), 'bar')
  assert.equal(categoryOf({ name: 'Fitted unit, Polwarth', tenure: 'To let' }), 'premises')
})

test('mergeDiscovery: per-category price caps (restaurants higher than cafés)', () => {
  const d = { listings: [] }
  const added = mergeDiscovery(d, [
    { name: 'Corner Cafe', area: 'Polwarth', price: 95000 }, // over the café cap
    { name: 'Canal Bistro', area: 'Polwarth', price: 120000, category: 'restaurant' }, // under the restaurant cap
  ], T)
  assert.equal(added, 1)
  assert.equal(d.listings[0].category, 'restaurant')
})

const T = '2026-09-02'
const db = () => ({
  listings: [
    { id: 'a', name: 'Cafe A', area: 'Polwarth', price: 30000, rent: 12000, status: 'active', tags: ['under offer', 'nice'], lastChecked: '2026-08-31' },
    { id: 'b', name: 'Cafe B', area: 'Leith', price: null, status: 'gone', lastChecked: '2026-08-30' },
  ],
})

test('extractJson: picks the answer object out of CLI noise and truncated fragments', () => {
  const text = `● Web Search · {"type":"output_text","text":{"value":"truncated…
✗ Fetching https://x
Some prose {"not":"the answer"}
{"outcome":"live","price":29500,"url":"https://www.rightbiz.co.uk/buy_business/for_sale/1.html"}
["https://a", "https://b"]`
  const res = extractJson(text, 'outcome')
  assert.equal(res.outcome, 'live')
  assert.equal(res.price, 29500)
})

test('extractJson: fenced block wins, arrays returned when no object', () => {
  assert.deepEqual(extractJson('```json\n[{"name":"x"}]\n```'), [{ name: 'x' }])
  assert.throws(() => extractJson('no json here'), /no JSON/)
})

test('slug / okUrl', () => {
  assert.equal(slug('Mirth + Zest Café!'), 'mirth-zest-caf')
  assert.equal(okUrl('https://www.daltonsbusiness.com/listing/x-DB1/'), true)
  assert.equal(okUrl('https://www.google.com/search?q=cafe'), false)
  assert.equal(okUrl('http://insecure.example/x'), false)
  assert.equal(okUrl('https://rightbiz.co.uk/'), false)
})

test('needsCheck: cadence by status, force overrides', () => {
  assert.equal(needsCheck({ status: 'active' }, T), true, 'never checked → due')
  assert.equal(needsCheck({ status: 'active', lastChecked: '2026-09-01' }, T), false, 'active, 1 day → not due')
  assert.equal(needsCheck({ status: 'active', lastChecked: '2026-08-31' }, T), true, 'active, 2 days → due')
  assert.equal(needsCheck({ status: 'gone', lastChecked: '2026-08-28' }, T), false, 'gone, 5 days → not due')
  assert.equal(needsCheck({ status: 'gone', lastChecked: '2026-08-26' }, T), true, 'gone, 7 days → due')
  assert.equal(needsCheck({ status: 'gone', lastChecked: '2026-09-01' }, T, true), true, 'force')
})

test('mergeVerification: failed verdicts never touch the record', () => {
  const d = db()
  const before = JSON.stringify(d.listings[0])
  mergeVerification(d, 'a', { outcome: 'unclear', note: 'verdict unavailable: no model output' }, T)
  mergeVerification(d, 'a', { outcome: 'unclear', note: 'Copilot monthly quota exhausted — x' }, T)
  assert.equal(JSON.stringify(d.listings[0]), before)
  assert.equal(isFailedVerdict({ outcome: 'unclear', note: 'quota exhausted' }), true)
  assert.equal(isFailedVerdict({ outcome: 'unclear', note: 'no snippets found' }), false)
})

test('mergeVerification: price change records history, lastChanged, and flips live→changed', () => {
  const d = db()
  const res = { outcome: 'live', price: 25000, url: 'https://www.rightbiz.co.uk/buy_business/for_sale/9.html' }
  const l = mergeVerification(d, 'a', res, T)
  assert.equal(l.price, 25000)
  assert.deepEqual(l.history, [{ date: T, price: 30000 }])
  assert.equal(res.outcome, 'changed')
  assert.equal(l.lastChanged, T)
  assert.equal(l.lastChecked, T)
  assert.equal(l.lastVerified, T)
  assert.equal(l.url, res.url, 'confirmed sighting repairs the url')
  assert.deepEqual(l.tags, ['nice'], 'status-asserting tags dropped')
})

test('mergeVerification: unchanged verdict updates lastChecked but not lastChanged', () => {
  const d = db()
  const l = mergeVerification(d, 'a', { outcome: 'live', price: 30000 }, T)
  assert.equal(l.lastChecked, T)
  assert.equal(l.lastChanged, undefined)
})

test('mergeVerification: stale after consecutive genuine unclears; live revives', () => {
  const d = db()
  for (let i = 0; i < STALE_AFTER; i++) mergeVerification(d, 'a', { outcome: 'unclear', note: 'no snippets' }, T)
  assert.equal(d.listings[0].status, 'stale')
  assert.equal(d.listings[0].unclearStreak, STALE_AFTER)
  mergeVerification(d, 'a', { outcome: 'live', price: 30000 }, T)
  assert.equal(d.listings[0].status, 'active')
  assert.equal(d.listings[0].unclearStreak, 0)
})

test('mergeVerification: exact (geocoded) coordinates win over model guesses', () => {
  const d = db()
  mergeVerification(d, 'a', { outcome: 'live', lat: 55.93, lng: -3.21 }, T)
  assert.equal(d.listings[0].coordsExact, undefined)
  mergeVerification(d, 'a', { outcome: 'live', lat: 55.9401, lng: -3.2233, coordsExact: true, address: '12 Polwarth Cres' }, T)
  assert.equal(d.listings[0].coordsExact, true)
  assert.equal(d.listings[0].address, '12 Polwarth Cres')
  mergeVerification(d, 'a', { outcome: 'live', lat: 55.1, lng: -3.9 }, T)
  assert.equal(d.listings[0].lat, 55.9401, 'guess does not overwrite exact')
})

test('mergeDiscovery: adds new, skips same-name cross-posts, out-of-band and freeholds, validates fields', () => {
  const d = db()
  const added = mergeDiscovery(d, [
    { name: 'Cafe A', area: 'Polwarth', price: 1 }, // same business on another portal
    { name: 'New Deli', area: 'Bruntsfield', price: '30000', url: 'https://www.google.com/search?q=x', rent: 'n/a' },
    { name: 'Big Bakery', area: 'Leith', price: 600000 },
    { name: 'Very Successful Freehold Cafe', area: 'Edinburgh', price: 60000 },
    { name: 'Very Profitable Fish and Chip Shop', area: 'Edinburgh', price: 65000 },
    { name: 'New Deli (Recently Renovated)', area: 'Bruntsfield', price: 30000 }, // same as New Deli
    { name: '', area: 'x' },
  ], T)
  assert.equal(added, 1)
  const n = d.listings.find((l) => l.id === 'new-deli')
  assert.equal(n.price, 30000)
  assert.equal(n.rent, null)
  assert.equal(n.url, null, 'search-engine url rejected')
  assert.equal(n.lastChecked, T)
})
