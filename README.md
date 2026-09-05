# Canalside — café business case

A working business case for opening a café in the Shandon / Polwarth /
Merchiston canal corridor of Edinburgh, built as a **React + Vite
single-page app** (same pattern as
[CasaTrova](https://github.com/Bloom79/summerhome)): no backend of our own,
deploys to GitHub Pages, with a small Cloudflare Worker + GitHub Actions
layer that keeps the listings watchlist honest.

## The four tabs

| Tab | What it does |
|-----|--------------|
| **Model** | The live financial model: edit any assumption (covers, prices, COGS %, rent…) and revenue, costs, profit, margin, breakeven and payback recompute instantly. Conservative / Mid / Optimistic presets, saved scenarios side by side, sensitivity tornado. **VAT** (on by default — takings are over the £90k threshold), **funding** (loan amount, rate, term → repayments, cash you put in, cover), and **the owner's line**: what you need to draw, indicative take-home after Scottish income tax and NI, and the first year month by month with the ramp-up and the loan in it. A "trading day" ribbon maps the three revenue streams onto the café's actual day. |
| **Listings** | Businesses-for-sale watchlist with live verification (below): verdict ranking and "call these first", per-listing status badges, **Verify now** / **Analyse** buttons, type and area filters, favourites, compare table. "This week" lists what moved in the last seven days. Each card carries the fair-price check (SDE band, **where to open and where to walk away**), the deal sheet (stage, **next action and date**, call notes, **due-diligence checklist**) and the seller's turnover restated as covers a day at your spend. Data comes from `public/listings.json` fetched at runtime — refreshed by the agent without rebuilds. |
| **Map** | Every listing on one map with the competitor cafés around it; pins open the advert. |
| **Business case** | The nine sections of the written case — concept, market, operations, licensing, costs, risks — readable in-app, with live paragraphs that re-answer themselves from the model. **Export PDF** lays the whole thing out for A4. |
| **Next steps** | **Ready to buy?** — six gates (target seen, accounts verified, licensing, rates, the model pays you, cash holds) read live from the steps and the model — then the action tracker and the licensing runway. |

Everything you edit (model assumptions, favourites, deals, step statuses and
notes) persists in your browser's localStorage — the site itself stays a
fully static deploy. **Sync** shares the workspace under a short code;
**Backup to file / Restore from file** in the same popover keeps a copy you
own. The app installs to a phone's home screen (web manifest).

## Listings verification — how it works

Rightbiz (the main UK business-for-sale portal) sits behind an anti-bot
wall, so dumb scraping can't verify listings. Instead, the CasaTrova
"analizza" pattern runs the check as an **agent on the GitHub Copilot
subscription** — Copilot CLI searches the live web itself and returns a
judgement:

```
app button → Cloudflare Worker → "Verifica:" / "Analizza:" issue
          → GitHub Action → Copilot CLI (web search, default model)
          → report as issue comment + listings.json updated + committed
          → app polls the worker → badge/report appears
```

- **Verify now** — re-checks one listing: still for sale? price changed?
  sold/withdrawn? Updates the card badge and `public/listings.json`.
- **Analyse** — full due-diligence report against our valuation anchors
  (1.5×–2.5× SDE, the £35k–£55k comparable band, £14k rent anchor).
- **Daily run** (`daily-verify.yml`, 06:17 UTC) — verifies every listing;
  discovery of new Edinburgh going-concerns runs **Mondays**.

Discovery reads two kinds of source. **Open portals** are fetched directly
and handed to the model as page text plus the real listing links
(`OPEN_SOURCES` in `scripts/verifica.mjs`, link shapes in `LISTING_PATHS`
in `scripts/lib.mjs`): Daltons (cafés, coffee shops, restaurants, bistros),
**BusinessesForSale** (cafés, coffee shops, restaurants — the category pages
answer a plain fetch even though the listing pages return 403),
**Cornerstone Business Agents** (Scotland's main business-transfer agent,
one page for the whole country), Scottish Business Agency, The Restaurant
Agency, Rightmove Commercial (mostly fitted premises), **Gumtree** (private
sellers — the cheapest cafés, among the dishwashers and kebab shops) and
Altius Group / Bruce & Co. **Walled portals** — Rightbiz, Zoopla and
PrimeLocation (Cloudflare), Christie & Co and Central Business Sales
(JavaScript-rendered), the Scotsman titles — are covered by the model's own
web search in the second set of passes, together with the commercial agents
(Shepherd, DM Hall, Graham + Sibbald, Ryden, Allied, EYCO) for fitted
premises to let. Probed 5 Sept 2026; a portal that starts blocking simply
logs "no page text" and drops to the search pass.

Costs: the subscription's default model spends ~6 Copilot "premium request"
credits per verification (about 9 listings + 1 discovery ≈ 60 credits per
Monday, ~54 other days). Set `VERIFY_MODEL=claude-opus-5` on the workflow
for sharper judgements at ~21 credits a request. Optional
`ANTHROPIC_API_KEY` secret makes the agent fall back to the Anthropic API
(with its server-side web search) if Copilot is unavailable.

## One-time setup (owner)

1. **Repo secret** — add `G_COPILOT` to [repo settings → secrets]
   (same token/secret used by summerhome's analizza workflow). Powers the
   Copilot CLI inside Actions.
2. **Worker** — the in-app buttons need the tiny worker deployed once:
   ```sh
   cd worker
   npx wrangler secret put GITHUB_TOKEN   # fine-grained PAT: Issues R/W on Bloom79/cafeplan
   npx wrangler deploy                     # → https://cafeplan-verify.<subdomain>.workers.dev
   ```
   If the deployed name differs, update `WORKER_URL` in `src/config.js`.
   Redeploy after any change to `worker/worker.js` — it is not built by the
   Pages workflow.
3. **PAT** — create at github.com/settings/tokens (fine-grained, only this
   repo, Issues: read/write). That same token goes to the wrangler secret.

The worker files issues **with the owner's PAT**, so anything that reaches it
passes `verify.yml`'s author gate and spends Actions minutes and Copilot
credits. A static site can hold no real secret, so the endpoint is protected
by an `Origin` allow-list (browser case) plus a hard ceiling of
`MAX_PER_HOUR` agent runs an hour, counted from the repo's own recent issues
(everything else). Over the ceiling the app shows "hourly limit reached".

Without the worker the app still works fully — the buttons explain setup is
pending, and the daily Action keeps the data fresh regardless.

## Model provenance

Defaults mirror the Aug 2026 business case:

- Daytime café: 40 covers/day × £8.50 × 350 days = £119,000
- Aperitivo (Thu–Sun 17:00–20:00): 4 × 52 × 15 covers × £15 = £46,800
- Wine tasting evenings: 12 events × 18 covers ≈ £3,500
- Cost base ~£126k → base case ≈ £169k takings, ~£43k profit before VAT,
  ~2.5 yr payback
- Startup budget (going-concern acquisition): £63,250 low / £106,483 mid /
  £149,815 high

Added Sept 2026, on top of the case (all editable, all in `src/data/model.js`):

- **VAT** — takings over £90k mean compulsory registration; eat-in, hot food
  and hot drinks are standard-rated, so a sixth of that share of takings
  (default 85%) goes to HMRC, less input VAT on the share of costs that
  carry it (default 20%). With the defaults this takes ~£22k off the £43k.
  Untick "VAT-registered" to see the original case.
- **Funding** — £25k borrowed at 6% over 5 years (a Start Up Loan) is
  £483/month; the model shows the annual repayment, how many times profit
  covers it, and the cash you put in yourself.
- **Owner's line** — what you need to draw (default £28k), indicative
  take-home after Scottish income-tax bands and Class 4 NI (2025/26, sole
  trader, no reliefs — confirm with an accountant), and the surplus after
  the loan and the draw.
- **Year one** — month one trades at 70% of the plan and reaches it by
  month 6; the monthly cash view carries that ramp and the loan repayment.

The app recomputes live and **supersedes the static documents** — change an
assumption and the case re-answers itself.

## Tech

- [React 18](https://react.dev) + [Vite 5](https://vite.dev); the Map tab
  (Leaflet) is lazy-loaded, so it stays out of the first paint
- ESLint flat config — `npm run lint`, also gating the deploy
- Worker: plain Cloudflare Worker (`worker/`), no KV
- Fonts: Fraunces (display) · Instrument Sans (UI) · Spline Sans Mono (figures)
- Stream colours validated for CVD separation and dark-surface contrast

## Develop

```sh
npm install
npm run dev        # local dev server
npm run build      # production build to dist/
node scripts/verifica.mjs --dry            # what the agent would do
node scripts/verifica.mjs --test bennitos  # one live verification, locally
```

## Deploy

Pushing to `main` triggers `deploy.yml` (GitHub Pages). The verify agent
commits to `main` itself with `[skip ci]` for pure data changes (the app
fetches `listings.json` at runtime), so data refreshes don't rebuild the
bundle.
