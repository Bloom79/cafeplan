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
| **Model** | The live financial model: edit any assumption (covers, prices, COGS %, rent…) and revenue, costs, profit, margin, breakeven and payback recompute instantly. Conservative / Mid / Optimistic presets. A "trading day" ribbon maps the three revenue streams onto the café's actual day. |
| **Listings** | Businesses-for-sale watchlist with live verification (below): per-listing status badges, **Verify now** / **Analyse** buttons, area filters, favourites. Data comes from `public/listings.json` fetched at runtime — refreshed by the agent without rebuilds. |
| **Business case** | The nine sections of the written case — concept, market, operations, licensing, costs, risks — readable in-app. |
| **Next steps** | The action tracker: status + notes per step, with progress. |

Everything you edit (model assumptions, favourites, step statuses and
notes) persists in your browser's localStorage — the site itself stays a
fully static deploy.

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
3. **PAT** — create at github.com/settings/tokens (fine-grained, only this
   repo, Issues: read/write). That same token goes to the wrangler secret.

Without the worker the app still works fully — the buttons explain setup is
pending, and the daily Action keeps the data fresh regardless.

## Model provenance

Defaults mirror the Aug 2026 business case:

- Daytime café: 40 covers/day × £8.50 × 350 days = £119,000
- Aperitivo (Thu–Sun 17:00–20:00): 4 × 52 × 15 covers × £15 = £46,800
- Wine tasting evenings: 12 events × 18 covers ≈ £3,500
- Cost base ~£126k → base case ≈ £169k revenue, ~£43k profit, ~2.5 yr payback
- Startup budget (going-concern acquisition): £63,250 low / £106,483 mid /
  £149,815 high

The app recomputes live and **supersedes the static documents** — change an
assumption and the case re-answers itself.

## Tech

- [React 18](https://react.dev) + [Vite 5](https://vite.dev)
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
