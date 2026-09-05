// The nine sections of the business case (Aug 2026), condensed for reading
// in-app. The Model tab recomputes the figures live; the numbers quoted in
// prose here are the snapshot the model was seeded with.

export const CASE_SECTIONS = [
  {
    n: 1,
    id: 'summary',
    title: 'Executive Summary',
    blocks: [
      { p: 'The plan: acquire a going-concern café in the Shandon / Polwarth / Merchiston canal corridor of Edinburgh and run it as an owner-operated daytime café with three deliberate extensions to the case-study model — a pasta of the day at lunch, an Italian aperitivo hour (Thu–Sun, 17:00–20:00, ~£15 for a drink and focaccia/cheese/salami), and occasional merchant-hosted wine tasting evenings.' },
      { live: ({ r, a, k, applied }) => `Because the owner works full-time in the café, the real question is not just "is this profitable" but whether the margin — on top of forgoing a market wage elsewhere — makes the move worth it. ${applied ? `Modelled on ${applied.name} (${applied.area}), ` : 'On the assumptions currently in the Model tab, '}the café makes ${k(r.dayRev)} daytime + ${k(r.apRev)} aperitivo + ${k(r.wineRev)} wine events ≈ ${k(r.totalRev)} takings against ${k(r.totalCosts)} costs${r.vat > 0 ? ` and ${k(r.vat)} of VAT` : ''}: ${k(r.profit)} pre-tax, a ${Math.round(r.margin * 100)}% margin${Number.isFinite(r.paybackYears) ? `, paying the startup budget back in ${r.paybackYears.toFixed(1)} years` : ''}. After ${r.loanPayment > 0 ? 'the loan and ' : ''}income tax that is about ${k(r.takeHome)} a year in your pocket — ${r.surplus >= 0 ? `${k(r.surplus)} more than` : `${k(-r.surplus)} short of`} the ${k(a.ownerDraw)} you said you need. These figures are live — change an assumption in the Model tab and this paragraph re-answers itself.` },
      { ul: [
        'Target: a small leasehold going concern in the £35k–£55k purchase band (comparables cluster at £35k–£40k).',
        'Startup budget: £63k–£150k including working capital; mid case ~£106k.',
        'Licensing step-up: regular aperitivo service requires a full Premises Licence and a qualified Personal Licence Holder — a bigger regulatory commitment than the occasional wine evenings alone.',
      ] },
    ],
  },
  {
    n: 2,
    id: 'benchmark',
    title: 'Case Study Benchmark — Brews & Bites',
    blocks: [
      { p: 'Brew and Bite Cafe Ltd (SC810330), incorporated 13 May 2024 at 1e Ashley Terrace, Edinburgh EH11 1RF — a cosy, dog-friendly community café on the Union Canal at Shandon.' },
      { ul: [
        'Trades 7 days, ~8:30–15:30: a breakfast/brunch/lunch operation with no evening trade.',
        'Offer: flat whites, cappuccinos, espresso, cortado; breakfasts, wraps, paninis (~£9.95), toasties, salad bowls; gluten-free friendly.',
        '100% recommend across ~38 Facebook reviews — praised for coffee, friendliness, community feel.',
        'As a micro-entity it files only an abridged balance sheet, so turnover and profit are not public.',
      ] },
      { p: 'Borrowed from the benchmark: the site model (small residential/canal-side unit, local loyalty over footfall), the limited-hours daytime operation, and the community-first positioning. Changed: everything after 15:30.' },
    ],
  },
  {
    n: 3,
    id: 'concept',
    title: 'Concept & Offer',
    blocks: [
      { h: 'Daytime (core, 7 days, ~8:30–15:30)' },
      { ul: [
        'Coffee and café menu as per the case study.',
        'Pasta of the day: bought-in fresh pasta with a house sauce — light kitchen lift, no new equipment, ~£10–13 price point.',
      ] },
      { h: 'Aperitivo (new, regular)' },
      { ul: [
        'Thu–Sun, 17:00–20:00 — the café\'s second trading session.',
        '~£15 per person: a drink (wine, beer, spritz or simple cocktail) with focaccia, cheese and salami.',
        'Own stock: we buy and hold the alcohol — the licensing and stock-risk consequences are priced into the plan.',
        'Requires one additional staff member; role to be defined (host vs kitchen support).',
      ] },
      { h: 'Wine tasting evenings (occasional, venue-hosted)' },
      { ul: [
        'Fortnightly/monthly, run alongside aperitivo — not instead of it.',
        'A wine merchant partner hosts and supplies; we provide the venue, front of house and food (cheese boards, small plates).',
        'Commercial split (flat venue fee vs % of tickets) is the biggest open variable — negotiation task, not a guess.',
      ] },
    ],
  },
  {
    n: 4,
    id: 'market',
    title: 'Market & Location',
    blocks: [
      { p: 'Catchment: the Shandon / Polwarth / Merchiston canal corridor — predominantly residential, high-density, low through-traffic, bounded by Slateford Road, Harrison Road, the Union Canal and the rail line. A walkable, locally-loyal catchment rather than a high-footfall commercial strip. Edinburgh Napier\'s Merchiston campus adds a student population at the edge.' },
      { h: 'Target customers' },
      { ul: [
        'Daytime: locals, dog walkers, families, canal-path users.',
        'Aperitivo & wine events: wine-curious locals from the same catchment — deliberately not chasing city-wide draw.',
      ] },
      { h: 'Competition' },
      { ul: [
        'Daytime: little direct café competition in Shandon itself; more choice along the canal corridor (e.g. the canal-boat café towards Fountainbridge).',
        'Evening: pubs and bars (Cargo, Embark, Polworth Tavern, Golden Rule) — none apparently running a dedicated tasting/small-plates format, which supports the aperitivo niche.',
      ] },
      { p: 'Implication: because the target customer is deliberately local, both daytime covers and evening sessions are capped by catchment size — the financial model stays conservative on volume as a design choice.' },
    ],
  },
  {
    n: 5,
    id: 'operations',
    title: 'Operations',
    blocks: [
      { h: 'Daytime' },
      { ul: [
        '~8:30–15:30, 7 days; owner-operated full-time (no manager salary, but a single point of failure — see Risks).',
        'Small team alongside the owner: 1–2 baristas/FOH, possibly a kitchen assistant; simple prep, no specialist pasta equipment.',
      ] },
      { h: 'Evening' },
      { ul: [
        'Aperitivo Thu–Sun 17:00–20:00 with one additional staff member; kitchen stays on for boards and small plates.',
        'Wine events hosted personally by the owner on top of a full trading day — kept occasional deliberately.',
      ] },
      { h: 'Licensing — the regulatory step-up' },
      { ul: [
        'Regular aperitivo service (own alcohol stock, 4 nights/week) requires a full Premises Licence from the Edinburgh licensing board — Occasional Licences no longer suffice.',
        'A Premises Licence needs a Personal Licence Holder on staff: licensing qualification + application (~£200–£300 in fees).',
        'Confirmed open question for the board/solicitor: who holds what for the merchant-hosted wine evenings.',
      ] },
      { h: 'Supply chain' },
      { ul: [
        'Daytime: standard café suppliers (roaster, bakery, dairy, produce) as per the case study.',
        'New: fresh pasta + sauce ingredients; aperitivo stock (wine, beer, spirits, charcuterie); wine merchant brings event stock.',
      ] },
    ],
  },
  {
    n: 6,
    id: 'costs',
    title: 'Premises & Costs',
    blocks: [
      { p: 'Site model: a going-concern acquisition rather than a shell fit-out — pay for goodwill instead of building from scratch. The Ashley Terrace parade anchors the numbers: a comparable 747 sq ft unit rents at £14,000/yr on a 5-year FRI lease with a £5,600 rateable value — which lands under the £12,000 Small Business Bonus threshold, so rates are effectively £0.' },
      { p: 'Startup budget, three cases (full itemisation lives in the Model tab): Low £63,250 · Mid £106,483 · High £149,815. The purchase price is the biggest swing factor and the least knowable without a real target\'s trading accounts. When a candidate surfaces: insist on real accounts / SDE before trusting any asking price — small cafés are typically valued at 1.5×–2.5× adjusted annual profit.' },
      { h: 'VAT and funding' },
      { live: ({ r, a, k, gbp }) => `Takings of ${k(r.totalRev)} sit ${r.overThreshold ? 'above' : 'below'} the £90k VAT registration threshold${r.overThreshold ? ', so the café registers whether it likes it or not' : ''}. Eat-in food, hot food and hot drinks are standard-rated: the price on the menu already contains 20% VAT, and a sixth of those takings is HMRC's — ${r.vat > 0 ? `${k(r.vatOut)} out, ${k(r.vatIn)} reclaimed on costs, ${k(r.vat)} net a year in the current model` : 'switched off in the current model, which overstates the profit if the café registers'}. Cold takeaway is zero-rated, which is why the share of standard-rated takings is an assumption you can edit. Funding: ${a.loan > 0 ? `${gbp(a.loan)} borrowed at ${a.loanRate}% over ${a.loanYears} years (a Start Up Loan runs to £25k per founder at 6% fixed) costs ${k(r.loanPayment)} a year, covered ${Number.isFinite(r.dscr) ? r.dscr.toFixed(1) : '—'} times by the profit; the other ${k(r.equity)} is your own cash.` : `no borrowing — the whole ${k(a.startupTotal)} is your own cash.`}` },
    ],
  },
  {
    n: 7,
    id: 'financial',
    title: 'Financial Case',
    blocks: [
      { live: ({ r, a, k, gbp }) => `Right now the model runs at: ${a.coversDay} daytime covers × ${gbp(a.spendDay)} × ${a.tradingDays} days (${k(r.dayRev)}), aperitivo ${a.apNights} nights × ${a.apWeeks} weeks × ${a.apCovers} covers × ${gbp(a.apPrice)} (${k(r.apRev)}), and ${a.wineEvents} wine events × ${a.wineCovers} covers (${k(r.wineRev)}) — ${k(r.totalRev)} revenue against ${k(r.totalCosts)} costs, ${k(r.profit)} pre-tax. Breakeven is ${Number.isFinite(r.coversBE) ? r.coversBE.toFixed(1) : '—'} daytime covers a day with the evening trade netted, ${Number.isFinite(r.coversBEStandalone) ? r.coversBEStandalone.toFixed(1) : '—'} without it. The Conservative / Mid / Optimistic presets change only volume and evening uptake; everything is editable in the Model tab, which this paragraph mirrors live.` },
      { p: 'Reality checks that shaped the assumptions: sector margins for independent cafés run 3–15%; the Bennitos comparable (Edinburgh, £150k turnover, £25k profit, 17%) validates the conservative end; owner "profit" and owner wage are the same pot in an owner-operated model.' },
      { live: ({ r, a, k, gbp }) => `The owner's own line: profit ${k(r.profit)}, less ${k(r.loanPayment)} of loan repayments and roughly ${k(r.tax)} of income tax and NI (Scottish bands, sole trader, indicative) leaves about ${k(r.takeHome)} — ${gbp(Math.round(r.takeHome / 12))} a month. Against the ${k(a.ownerDraw)} a year set as what you need to live on, the plan is ${r.surplus >= 0 ? `${k(r.surplus)} ahead` : `${k(-r.surplus)} behind`}. Year one starts at ${a.rampStartPct}% of the plan's trade and reaches it by month ${a.rampMonths}; with the loan taking its slice every month, the cash buffer bottoms out in the Model tab's month-by-month view.` },
      { p: 'Breakeven is quoted two ways in the Model tab: standalone (daytime covers with no evening trade) and evening-netted (how few daytime covers the café needs once aperitivo and wine events cover their own costs). The gap between the two is the case for the evening offer in one number.' },
    ],
  },
  {
    n: 8,
    id: 'risks',
    title: 'Risks & Mitigations',
    blocks: [
      { table: [
        ['Risk', 'Why it matters', 'Mitigation'],
        ['Sole owner-operator dependency', 'Full-time in the café and hosting evenings personally — no cover if ill or away', 'Trusted keyholder/part-time manager from early on; evenings stay occasional'],
        ['Thin margin base case', 'Sector norm 3–15%; little room for cost slippage', 'Tight COGS/labour control from day one; revisit pricing if margins slip'],
        ['Unknown target valuation', 'Purchase price is the biggest unknown (£30k–£80k+)', 'Real accounts/SDE before offering; accountant verifies'],
        ['Undefined wine merchant terms', 'Evening revenue could be £0–several thousands', 'Treat as bonus, not core viability; negotiate before licensing/marketing spend'],
        ['Licensing step-up', 'Regular aperitivo = full Premises Licence + Personal Licence Holder', 'Confirm route with Edinburgh licensing board early; budget fees and training'],
        ['Aperitivo footfall dependency', '4 nights/week of evening trade assumes locals show up', 'Soft-launch nights before committing to the pattern; watch covers/session'],
        ['Own-stock risk', 'Buying/holding alcohol adds wastage, theft and cash-tie-up exposure', 'Tight stocktakes; start with a short list; sale-or-return where possible'],
        ['Local-only catchment ceiling', 'Deliberately no city-wide draw caps volume', 'Design choice — keep costs sized to catchment, don\'t assume scale'],
        ['Cost inflation', 'Rent, NI changes and food costs squeezing sector margins', 'Contingency in working capital; periodic price reviews'],
        ['Rates relief lapse', 'SBBS depends on RV staying under threshold; revaluation risk', 'Verify actual RV of the actual target before finalising costs'],
        ['VAT on takings', 'Over £90k the café must register: a sixth of eat-in and hot sales is HMRC\'s, not margin', 'Model it from day one (VAT group in the Model tab); price the menu VAT-inclusive; keep the zero-rated cold-takeaway share visible'],
        ['Debt service in a quiet month', 'Loan repayments do not follow the season; February still costs the same', 'Size the loan to the trough in the month-by-month view, not to the annual profit; keep three months of working capital'],
      ] },
    ],
  },
  {
    n: 9,
    id: 'next',
    title: 'Next Steps',
    blocks: [
      { p: 'Tracked live in the Next steps tab — status and notes persist in your browser. The six that unlock everything else:' },
      { ul: [
        'Identify a real target going-concern in the corridor and obtain its actual trading accounts/SDE.',
        'Confirm the licensing route for aperitivo + wine evenings (Edinburgh licensing board or a solicitor).',
        'Open a conversation with a wine merchant — the commercial split is the biggest undefined variable.',
        'Verify the actual site\'s rateable value (SBBS eligibility) once a target is identified.',
        'Re-run the model with a real target\'s figures instead of scenario assumptions.',
        'Decide owner cover/backup — illness, holiday, burnout — before committing.',
        'Define the aperitivo staff role: host, kitchen, or a hybrid.',
      ] },
    ],
  },
  {
    n: 10,
    id: 'decision',
    title: 'Decision',
    blocks: [
      { live: ({ r, a, k, ready, needCovers }) => {
        const closed = ready.gates.filter((g) => !g.ok).map((g) => g.title.toLowerCase())
        const pays = r.surplus >= 0
        return `Where it stands today: ${ready.open} of ${ready.total} gates open${closed.length ? ` — still closed: ${closed.join('; ')}` : ' — every gate is open'}. On the current assumptions the café makes ${k(r.profit)} pre-tax and leaves about ${k(r.takeHome)} after the loan and tax, against the ${k(a.ownerDraw)} you need: the plan ${pays ? `pays you, with ${k(r.surplus)} to spare` : `does not pay you yet, ${k(-r.surplus)} short`}. ${Number.isFinite(needCovers) ? `It would at ${needCovers.toFixed(0)} daytime covers a day (the plan assumes ${a.coversDay}).` : 'No number of covers gets there on this cost base — the fix is the rent, the loan or the draw, not the trade.'}`
      } },
      { p: 'The rule, so the decision is not made on a good day at a viewing: no offer while any of the four evidence gates (target seen, accounts verified, licensing route, rateable value) is closed; no signature while the model does not pay the draw at a trade you can evidence from the seller\'s till reports, not the advert. An asking price is an opening position; the SDE band and the three-year payback on your own concept set the ceiling.' },
      { h: 'What would change the answer' },
      { ul: [
        'Rent under the £14k anchor, or a lease long enough to amortise the refit — the two things you cannot renegotiate after signing.',
        'A site whose till proves 50+ covers a day already, so the ramp is a formality rather than a hope.',
        'A price inside the SDE band, or a seller who will carry part of it (deferred consideration) against the accounts.',
        'Less debt: every £10k not borrowed is about £2.3k a year of take-home while the loan runs.',
        'A partner or keyholder who takes the second session, so the aperitivo is not the owner\'s twelfth hour.',
      ] },
    ],
  },
]
