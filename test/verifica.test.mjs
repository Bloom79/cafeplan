import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STALE_AFTER, extractJson, isFailedVerdict, mergeDiscovery, mergeVerification, needsCheck, okUrl, slug,
} from '../scripts/lib.mjs'

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

test('mergeDiscovery: adds new, skips same-name cross-posts, validates fields', () => {
  const d = db()
  const added = mergeDiscovery(d, [
    { name: 'Cafe A', area: 'Polwarth', price: 1 }, // same business on another portal
    { name: 'New Deli', area: 'Bruntsfield', price: '30000', url: 'https://www.google.com/search?q=x', rent: 'n/a' },
    { name: '', area: 'x' },
  ], T)
  assert.equal(added, 1)
  const n = d.listings.find((l) => l.id === 'new-deli')
  assert.equal(n.price, 30000)
  assert.equal(n.rent, null)
  assert.equal(n.url, null, 'search-engine url rejected')
  assert.equal(n.lastChecked, T)
})
