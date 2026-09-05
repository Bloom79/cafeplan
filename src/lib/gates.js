import { compute, gbp, monthly } from '../data/model.js'

// The six gates between "interesting" and "sign". Four are things you do
// (steps you tick), two are things the numbers have to say. Pure: hand it
// the deals, the step statuses and the model assumptions, and both the
// Next steps tab and the PDF read the same answer.
export function readiness({ deals = {}, steps = {}, a }) {
  const r = compute(a)
  const cash = monthly(a, r)
  const done = (id) => steps[id]?.status === 'done'
  const seen = Object.values(deals).some((d) => ['viewed', 'offered', 'won'].includes(d?.stage))
  const gates = [
    { id: 'target', title: 'A real target, seen with your own eyes', ok: seen,
      why: seen ? 'a deal at "viewed" or beyond' : 'no viewing yet — the Listings tab is where this opens' },
    { id: 'sde', title: 'Accounts and SDE verified by an accountant', ok: done('verify-sde'),
      why: done('verify-sde') ? 'step marked done' : 'never take an asking price at face value' },
    { id: 'licence', title: 'Licensing route confirmed with the Board', ok: done('licensing'),
      why: done('licensing') ? 'step marked done' : 'the aperitivo plan hangs on it' },
    { id: 'rates', title: 'Rateable value of the actual unit checked', ok: done('rates-check'),
      why: done('rates-check') ? 'step marked done' : 'SBBS relief only under £12k RV' },
    { id: 'pays', title: 'The model pays the loan and your draw', ok: r.surplus >= 0,
      why: `${r.surplus >= 0 ? '+' : ''}${gbp(r.surplus)} a year after the loan and what you need to live on` },
    { id: 'cash', title: 'Cash holds through the quiet months', ok: cash.trough.cash >= 0,
      why: `lowest point ${gbp(cash.trough.cash)} in ${cash.trough.month}, year one` },
  ]
  return { gates, open: gates.filter((g) => g.ok).length, total: gates.length }
}
