import React from 'react'
import { gbp } from '../data/model.js'
import { offerPlan, sdeCheck, SDE_MULTIPLES } from '../lib/score.js'

// Per-listing fair-price check: type in what the seller actually tells you
// and see the 1.5×–2.5× SDE band land next to the asking price — then
// where to open and where to stop. Inputs persist per listing
// (localStorage, via the parent's inputs/setInputs).

const FIELDS = [
  ['profit', 'Declared annual profit', 'their accounts, not the advert'],
  ['ownerWage', "Owner's own wage to add back", 'if they pay themselves through the books'],
  ['oneOffs', 'One-off costs to add back', 'refit, legal spats, anything non-recurring'],
]

const VERDICT = {
  'below-band': ['below the fair band — either a bargain or a question', 'good'],
  'in-band': ['inside the 1.5×–2.5× band — a defensible ask', 'mid'],
  'above-band': ['above the fair band — needs a reason or a lower offer', 'bad'],
  'no-ask': ['no asking price to compare — band shown for your offer', 'mid'],
  'no-earnings': ['SDE is zero or negative — the price is for the lease, not the trade', 'bad'],
}

export default function FairPrice({ listing, inputs, setInputs, profit = null, otherCosts = 0 }) {
  const vals = inputs || {}
  const check = sdeCheck(vals, listing.price)
  const plan = offerPlan(check, { profit, otherCosts })

  const set = (k, raw) => {
    const v = raw === '' ? '' : Number(String(raw).replace(/[^0-9.]/g, ''))
    setInputs({ ...vals, [k]: v })
  }

  const askWord = plan && check.ask != null
    ? check.ask > plan.ceiling ? 'above your ceiling' : check.ask <= plan.open ? 'at or under your opener' : 'inside your range'
    : null

  return (
    <details className="fairprice">
      <summary>Fair-price check (SDE)</summary>
      <div className="fp-body">
        {listing.profit != null && vals.profit === undefined && (
          <button
            className="action-btn ghost fp-prefill"
            onClick={() => setInputs({ ...vals, profit: listing.profit })}
          >
            Start from the advert's {gbp(listing.profit)} profit
          </button>
        )}
        {FIELDS.map(([k, label, hint]) => (
          <label key={k} className="fp-field">
            <span>{label} <i>{hint}</i></span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="£"
              value={vals[k] ?? ''}
              onChange={(e) => set(k, e.target.value)}
            />
          </label>
        ))}
        {check ? (
          <div className={`fp-result ${VERDICT[check.verdict][1]}`}>
            <div className="fp-line mono">
              SDE {gbp(check.sde)} → fair band {gbp(check.low)}–{gbp(check.high)}
              {check.ask != null && <> · ask {gbp(check.ask)}</>}
            </div>
            <div className="fp-verdict">{VERDICT[check.verdict][0]}</div>
            {plan && (
              <div className="fp-offer">
                <div>
                  <span>Open at</span>
                  <b className="mono">{gbp(plan.open)}</b>
                  <i>{SDE_MULTIPLES[0]}× SDE</i>
                </div>
                <div>
                  <span>Walk away above</span>
                  <b className="mono">{gbp(plan.ceiling)}</b>
                  <i>{plan.limitedBy === 'payback' ? '3-yr payback on your concept' : `${SDE_MULTIPLES[1]}× SDE`}</i>
                </div>
                {plan.askMultiple != null && (
                  <div>
                    <span>The ask</span>
                    <b className="mono">{plan.askMultiple.toFixed(1)}× SDE</b>
                    <i>{askWord}</i>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="fp-hint">
            Enter the declared profit to see the fair band ({SDE_MULTIPLES[0]}×–{SDE_MULTIPLES[1]}× SDE)
            and where to open. Get these numbers from the agent — never from the advert alone.
          </p>
        )}
      </div>
    </details>
  )
}
