# Same Ballots, Different Algorithms

Starting prototype for DATA 31500 Assignment 3: an interactive data story / explorable explanation built with Svelte and D3.

## Concept

This prototype uses the Alaska 2022 special-election ranked-choice cast vote records to explore a simple argument:

> the same ranked ballots can produce different summaries depending on which algorithm reads them.

The app is structured like an interactive article rather than a dashboard. Most of the story copy is intentionally placeholder text so the narrative can be revised later.

## What the prototype currently includes

- A clean article-style Svelte layout.
- A contest dropdown for switching between statewide ranked contests.
- A ranking-depth distribution chart.
- An animated instant-runoff round chart implemented with D3 transitions.
- A transfer table showing where eliminated ballots move.
- A pairwise comparison heatmap with hover tooltip.
- Prototype summary cards for plurality, RCV, Condorcet, and Borda winners.

## Project structure

- `scripts/preprocess-election.js`: local preprocessing pipeline for the raw CVR exports.
- `src/components`: reusable D3-backed chart components.
- `src/lib`: loading and formatting helpers.
- `src/App.svelte`: main interactive article.
- `public/data`: processed JSON files served by Vite.

## Data pipeline

The raw files in `data/CVR_Export` are too large to use directly in the browser, so the app expects preprocessed static JSON.

The preprocessing script:

1. Reads the contest, candidate, and party manifest files.
2. Inspects contest names before selecting prototype contests.
3. Reads all `CvrExport_*.json` files.
4. Preserves ranked marks with `CandidateId` and `Rank` even when `IsVote` is `false`.
5. Filters out ambiguous marks.
6. Builds clean ballot ranking objects.
7. Derives first-choice totals, ranking-depth distribution, instant-runoff rounds, transfer flows, pairwise matrix data, and alternative winner summaries.

For the current version, the script reads the `CVR_Export_20220908084311` source and preprocesses the ranked contest it contains:

- `U.S. Representative (Special General)`

The preprocessing code still supports either a single `CvrExport.json` file or split `CvrExport_*.json` files, so it can be repointed later if needed.

## Install dependencies

```bash
cd "/Users/arnavgurudatt/Data Interaction/assignment3"
npm install
```

## Preprocess the election data

```bash
npm run preprocess
```

This writes processed JSON files into `public/data`.

## Run locally

```bash
npm run dev
```

Then open the local Vite URL in your browser.

## Build for deployment

```bash
npm run build
```

The production build is written to `dist/`.

## Deploy to Netlify

### Option 1: drag-and-drop

1. Run `npm run build`.
2. Go to [Netlify](https://www.netlify.com/).
3. Drag the `dist/` folder into the manual deploy area.

### Option 2: connect a repo

1. Push this project to GitHub.
2. Create a new Netlify site from that repo.
3. Use these settings:
   - Build command: `npm run build`
   - Publish directory: `dist`

## Deploy to Surge

Install Surge globally if you do not already have it:

```bash
npm install --global surge
```

Then deploy the built site:

```bash
npm run build
surge dist
```

## Notes for the next revision

- Replace placeholder paragraphs with the final story text.
- Consider adding a more visual transfer-flow chart.
- Expand preprocessing to district-level ranked contests if needed.
- Add annotations tied to specific rounds or pairwise cells.
- Include the final deployment URL in this README before submission.
