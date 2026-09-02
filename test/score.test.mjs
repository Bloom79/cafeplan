import test from 'node:test'
import assert from 'node:assert/strict'
import { fitScore, scoreBand, sdeCheck, verdict } from '../src/lib/score.js'

test('fitScore: corridor site with cheap rent and books scores high; far, dear, opaque scores low', () => {
  const good = fitScore({ area: 'Polwarth', rent: 11000, price: 30000, turnover: 120000, profit: 20000 })
  const bad = fitScore({ area: 'Leith', rent: 28000, price: 90000 })
  assert.ok(good.score >= 90, `good=${good.score}`)
  assert.ok(bad.score <= 30, `bad=${bad.score}`)
  assert.equal(scoreBand(good.score), 'good')
  assert.equal(scoreBand(bad.score), 'low')
  assert.equal(good.parts.length, 4)
})

test('fitScore: unknowns score neutral, not zero', () => {
  const f = fitScore({ area: 'Morningside' })
  const rent = f.parts.find((p) => p.key === 'rent')
  assert.equal(rent.s, 0.5)
  assert.match(rent.label, /undisclosed/)
})

test('sdeCheck: empty input is "not entered", band maths, verdicts', () => {
  assert.equal(sdeCheck({ profit: '' }, 40000), null)
  assert.equal(sdeCheck(undefined, 40000), null)
  const c = sdeCheck({ profit: 25000, ownerWage: 5000 }, 40000)
  assert.equal(c.sde, 30000)
  assert.deepEqual([c.low, c.high], [45000, 75000])
  assert.equal(c.verdict, 'below-band')
  assert.equal(sdeCheck({ profit: 25000 }, 40000).verdict, 'in-band')
  assert.equal(sdeCheck({ profit: 10000 }, 40000).verdict, 'above-band')
  assert.equal(sdeCheck({ profit: -2000 }, 40000).verdict, 'no-earnings')
  assert.equal(sdeCheck({ profit: 10000 }, null).verdict, 'no-ask')
})

test('verdict: parked listings are out; payback and SDE move the rank; bands', () => {
  assert.equal(verdict({ status: 'gone' }).band, 'out')
  assert.equal(verdict({ status: 'stale' }).rank, 0)
  const base = { area: 'Polwarth', rent: 12000, price: 30000, status: 'active' }
  const plain = verdict(base)
  const fast = verdict(base, { payback: 1.5 })
  const slow = verdict(base, { payback: 7 })
  assert.ok(fast.rank > plain.rank && slow.rank < plain.rank)
  assert.match(fast.reasons.join(' '), /pays back in 1\.5 yr/)
  const dear = verdict(base, { sde: { verdict: 'above-band' } })
  assert.ok(dear.rank < plain.rank)
  assert.equal(verdict({ ...base, status: 'under offer' }).reasons.includes('under offer'), true)
  assert.equal(fast.band, 'call')
})
