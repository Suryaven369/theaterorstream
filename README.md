# TheaterOrStream

Should you see it in theaters or wait for streaming? TheaterOrStream gives every film an honest verdict and shows where to watch it.

## Features

- **TOS Rating**: category scores (acting, screenplay, sound, direction, pacing, cinematography, entertainment) and a Theater/Stream verdict
- **Watch**: "Tonight" (3 taps → 3 picks you can stream now) and taste-based recommendations
- **Taste quiz**: films you love/dislike, services, languages and dealbreakers shape every pick
- **Where to stream**: streaming providers by region
- **Parent Guide**: content advisories per title, plus browse pages
- **Coming Soon**: the most anticipated upcoming releases
- **Watchlist, Lists and Diary**: save, organise and log what you watch
- **Feed**: reviews, posts and new trailers from the people you follow
- **Share cards**: share your ratings and reviews as images

## Stack

React + Vite frontend, Vercel serverless API (`api/`), Supabase (auth and Postgres), TMDB data.

## Development

```bash
npm install
npm run dev        # frontend
npm run dev:api    # API via vercel dev
npm run build
```

Copy `.env.example` to `.env` and fill in the Supabase and TMDB keys. Database migrations live in `supabase/migrations/`; older one-off SQL scripts are in `supabase/legacy/`.

## Recommendation engine

TMDB is the source of truth for titles and availability. OpenAI is used only to
embed films and to choose/explain picks **from a shortlist the server built**:
every ID the model returns is validated and anything outside the list is dropped.
All keys stay server-side (`api/`); the client never sees them.

| Stage | Where | What it does |
|---|---|---|
| Taste quiz | `src/views/TasteOnboardingPage.jsx`, `src/lib/tasteQuiz.js` | ≥3 loved films (5 recommended), dislikes, services + region (default IN), viewing pattern, languages, dealbreakers. Validated with zod on both ends. |
| Candidates | `api/_lib/reco/candidates.js` | TMDB recommendations/similar per loved film, shared-keyword discover, on-your-services discover, pgvector neighbours. Hard filters: seen, dealbreakers, runtime, availability. TMDB calls are cached (24h titles / 6h lists) with retry + backoff (`api/_lib/tmdb-server.js`). |
| Scoring | `api/_lib/reco/scoring.js` | `0.45·similarity + 0.45·quality + 0.1·contextFit` (tuned by the eval: hit@20 32.6% → 45.7%). User vector = recency-weighted mean(loved) − 0.5·mean(disliked), normalised. Quality is a Bayesian-shrunk TMDB rating. |
| Tonight | `getTonightPicks` in `api/_lib/recommendation-server.js` | Mood + time + company → hard filters (company/mood clashes, family certification) → top 20 → MMR for variety → OpenAI structured output picks 3 with a one-line why. Falls back to MMR top 3 + template text if the model fails or times out. |
| Feedback | `api/_lib/events-server.js` | Watched / Loved / Meh / Not interested / skipped (weak negative) update the taste vector and suppress titles immediately. |
| Queue | `getQueueByFit` | Watchlist sorted by fit for tonight. |
| TOS verdict | `api/_lib/reco/tos-verdict.js` | Theater / Wait for OTT / Skip from quality, big-screen factor and personal fit. Critic sources are pluggable (OMDb is a TODO). |

**Tuning**: every weight lives in `api/_lib/reco/config.js`; mood/company genre
rules live in `src/constants/tonight.js`.

**Environment**: `GPT_KEY` (or `OPENAI_API_KEY`), `TMDB_API_KEY` or `TMDB_ACCESS_TOKEN`,
`SUPABASE_*`; optional `OPENAI_MODEL`, `OMDB_API_KEY` (TODO), `RECO_DEBUG=1`.

**Scripts**

```bash
npm test                 # unit tests: scoring, filtering, MMR, quiz, TOS verdict
npm run reembed:library  # (re)embed movies_library with OpenAI; resumable
npm run eval:recs        # leave-one-out hit@5/10/20 over scripts/eval-profiles.json
node scripts/eval-recs.mjs --profiles 5   # quick run
```
