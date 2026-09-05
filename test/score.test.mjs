import test from 'node:test'
import assert from 'node:assert/strict'
import { fitScore, offerPlan, scoreBand, sdeCheck, verdict } from '../src/lib/score.js'
import { DD_ITEMS, ddProgress, dueState, isOpen } from '../src/lib/deals.js'

test('offerPlan: open at 1.5x SDE, stop at 2.5x or the 3-year payback, whichever is lower', () => {
  assert.equal(offerPlan(null), null)
  assert.equal(offerPlan(sdeCheck({ profit: -1 }, 40000)), null)
  const check = sdeCheck({ profit: 25000 }, 40000) // band 37.5k–62.5k
  const band = offerPlan(check)
  assert.deepEqual([band.open, band.ceiling, band.limitedBy], [37500, 62500, 'band'])
  assert.equal(band.askMultiple.toFixed(1), '1.6')
  // Your concept makes £20k a year in their premises with £51k of other
  // costs: three years of profit buys at most £9k of goodwill.
  const tight = offerPlan(check, { profit: 20000, otherCosts: 51483 })
  assert.deepEqual([tight.ceiling, tight.limitedBy], [8517, 'payback'])
  // A richer concept leaves the band as the limit.
  assert.equal(offerPlan(check, { profit: 60000, otherCosts: 51483 }).limitedBy, 'band')
})

test('deals: follow-up dates and the due-diligence checklist', () => {
  const today = new Date('2026-09-05')
  assert.equal(dueState(null, today), null)
  assert.equal(dueState({ stage: 'called' }, today), null)
  assert.equal(dueState({ stage: 'called', nextOn: '2026-09-03' }, today), 'overdue')
  assert.equal(dueState({ stage: 'called', nextOn: '2026-09-05' }, today), 'soon')
  assert.equal(dueState({ stage: 'called', nextOn: '2026-09-08' }, today), 'soon')
  assert.equal(dueState({ stage: 'called', nextOn: '2026-09-20' }, today), 'later')
  // A parked or finished deal has no follow-up, whatever the date says.
  assert.equal(dueState({ stage: 'passed', nextOn: '2026-09-03' }, today), null)
  assert.equal(dueState({ stage: 'watching', nextOn: '2026-09-03' }, today), null)
  assert.equal(isOpen({ stage: 'viewed' }), true)
  assert.equal(isOpen({ stage: 'won' }), false)
  assert.ok(DD_ITEMS.length >= 10)
  assert.deepEqual(ddProgress({ dd: { accounts: true, lease: true } }), { done: 2, total: DD_ITEMS.length })
  assert.deepEqual(ddProgress(undefined), { done: 0, total: DD_ITEMS.length })
})

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
