# Canalside — café business case

A working business case for opening a café in the Shandon / Polwarth /
Merchiston canal corridor of Edinburgh, built as a **React + Vite
single-page app** (same pattern as
[CasaTrova](https://github.com/Bloom79/summerhome)): no backend, deploys to
GitHub Pages.

## The four tabs

| Tab | What it does |
|-----|--------------|
| **Model** | The live financial model: edit any assumption (covers, prices, COGS %, rent…) and revenue, costs, profit, margin, breakeven and payback recompute instantly. Conservative / Mid / Optimistic presets. A "trading day" ribbon maps the three revenue streams onto the café's actual day. |
| **Listings** | Businesses-for-sale watchlist, seeded with the Aug 2026 research comparables (Rightbiz / Daltons). Filter by area, save favourites. |
| **Business case** | The nine sections of the written case — concept, market, operations, licensing, costs, risks — readable in-app. |
| **Next steps** | The action tracker: status + notes per step, with progress. |

Everything you edit (model assumptions, favourites, step statuses and
notes) persists in your browser's localStorage — the site itself stays a
fully static deploy.

## Model provenance

Defaults mirror the Aug 2026 business case (the Word/XLSX pair built from
the Brews & Bites case study):

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
- Fonts: Fraunces (display) · Instrument Sans (UI) · Spline Sans Mono (figures)
- Stream colours validated for CVD separation and dark-surface contrast
  (brass `#BF8A2C` daytime · green `#4CA97E` aperitivo · plum `#C06CA8` wine)

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
```

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml` (GitHub Pages,
build → artifact → deploy). Pages must be set to the **GitHub Actions**
source — already configured on this repo.

## Data maintenance

- `src/data/listings.js` — the watchlist snapshots; update when research
  surfaces new comparables (a daily listings agent, CasaTrova-style, is a
  natural future addition).
- `src/data/steps.js` — seed state for the tracker only; live state lives
  in each browser.
- `src/data/businessCase.js` — the nine sections of prose.
