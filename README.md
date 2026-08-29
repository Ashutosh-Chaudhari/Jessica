# Jessica

Dynamic AI speaking challenge platform. Speak about anything. Think faster. Communicate better.

Full architecture and product spec: see `Project_MD.md`.

## Stack (free-first, spec section 86)

| Component      | Service                                                         |
| -------------- | --------------------------------------------------------------- |
| Frontend       | React + TypeScript + Vite + Tailwind (Cloudflare static assets)  |
| Backend        | Cloudflare Workers + Hono                                        |
| Database       | Supabase PostgreSQL + pgvector                                   |
| Auth           | Supabase Auth                                                    |
| LLM            | Google Gemini 3.6 Flash (free tier)                              |
| Speech-to-Text | Groq Whisper large-v3-turbo (free tier)                          |
| Embeddings     | Gemini Embeddings (free tier)                                    |

## Repository layout

```
apps/web            React frontend
apps/worker         Cloudflare Worker API + static asset host
packages/types      Shared domain types, constants and pure logic
packages/ai         Provider interfaces + Gemini and Groq implementations
packages/database   Supabase data access
supabase/migrations Schema, RLS and RPCs
```

## Run it now (no accounts, no keys)

```bash
npm install
npm run dev        # http://localhost:5173
```

`VITE_USE_MOCKS` defaults to `true`, so the whole app runs on localStorage.
Accounts created this way live in your browser only.

```bash
npm test           # domain logic + RSS parser (node --test, no framework)
npm run typecheck  # every workspace
```

## Wire up the real backend

### 1. Supabase

Create a free project, then apply the schema:

```bash
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

Or paste `supabase/migrations/20260827000000_init.sql` into the SQL editor.

It creates `profiles`, `challenges` (with a 768-dim pgvector column),
`user_challenges`, `attempts`, `ai_usage` and `topic_sources`, turns on Row
Level Security for all of them, adds the signup trigger that creates a profile,
and installs the `pick_unseen_challenge` / `is_duplicate_for_user` /
`delete_account` functions.

### 2. Frontend config

`apps/web/.env.local`, for local development:

```
VITE_USE_MOCKS=false
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=http://localhost:8787   # only while running vite + wrangler separately
```

`apps/web/.env.production` is committed and overrides that at build time.
Vite loads `.env.local` for production builds too, so without it the localhost
API base would be compiled into the deployed bundle. In production the Worker
serves the app and the API from one origin, so the base must be empty.

The Supabase URL and anon key are deliberately *not* committed, so a build on a
machine without `.env.local` (a fresh clone, or CI) has no backend configured.
`vite build` refuses that combination outright rather than falling back to mock
data - a deployed site running on localStorage looks completely normal while
storing every signup in the visitor's browser. Supply the two values through
the environment in CI:

```bash
VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run deploy
```

### 3. Worker config

Set `SUPABASE_URL` in `apps/worker/wrangler.toml` under `[vars]`, then supply
the three secrets. For local development, copy `apps/worker/.dev.vars.example`
to `apps/worker/.dev.vars` and fill it in. For production:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config apps/worker/wrangler.toml
npx wrangler secret put GEMINI_API_KEY            --config apps/worker/wrangler.toml
npx wrangler secret put GROQ_API_KEY              --config apps/worker/wrangler.toml
```

Get the keys from [Google AI Studio](https://aistudio.google.com/apikey) and
the [Groq console](https://console.groq.com/keys). Both have free tiers.

```bash
npm run dev:worker   # http://localhost:8787
npm run dev          # http://localhost:5173, talking to the Worker
```

### 4. Deploy

One Worker serves the API and the built frontend:

```bash
npm run deploy
```

Never expose `GEMINI_API_KEY`, `GROQ_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
to the frontend bundle (spec section 52).

## API

All routes require a Supabase session token except `GET /api/health`.

```
GET    /api/health
GET    /api/auth/me
POST   /api/challenges/start          returns the live challenge, or assigns one
GET    /api/challenges/current
POST   /api/challenges/:id/submit     multipart: audio
POST   /api/challenges/:id/retry
POST   /api/challenges/:id/skip
GET    /api/history
GET    /api/history/:id
GET    /api/progress
GET    /api/profile
PATCH  /api/profile
DELETE /api/profile
```

## How a challenge is chosen

Cheapest path first, so free AI quota is only spent when it has to be:

1. Reuse an unseen topic from the shared pool that is not semantically close to
   anything this user has passed (`pick_unseen_challenge`, no AI call).
2. Generate with Gemini against a weighted category roll, validate the text,
   embed it, reject semantic duplicates, retry up to 5 times.
3. Fall back to the static pool in `packages/types` so Jessica still works when
   Gemini is unreachable.

Current-trend topics additionally go through the three-level strategy in spec
section 20: no web call at all for every other category, cached headlines from
`topic_sources` when they are still fresh, and only then a live fetch from
public RSS. A dead or slow feed degrades to a topic generated without current
context rather than failing the request.

Pass/fail is decided by the backend, never the model: minimum duration measured
from the audio itself by Whisper, minimum transcript length, minimum relevance.

## Four numbers that were calibrated, not guessed

**`SIMILARITY_THRESHOLD = 0.91`.** Measured against real `gemini-embedding-001`
output at 768 dimensions: paraphrases of an already-completed topic score
0.956-1.000, genuinely different angles on the same subject score 0.699-0.872.
The spec's suggested 0.85 sat inside the *accept* band and rejected its own
test 3 ("Explain how GPS works" vs "Why was GPS originally developed?", 0.8656).

**`GEMINI_MODEL = gemini-3.6-flash`.** The spec specifies `gemini-2.5-flash`,
which Google has since retired for new API keys - it returns 404. Only the
config value changed; no code did, which is why it was a config value.

**`GEMINI_THINKING_LEVEL = low`.** Gemini 3 reasons before answering by default.
Measured on the evaluation call: 495 thinking tokens against 0, for identical
scores (relevance 98/98, overall 95/95). On a free tier where quota is the
binding constraint, that was most of the budget spent on deliberation these
tasks do not need. Also a config value, because the field is generation
specific - 2.5 wanted `thinkingBudget`, 3.x wants `thinkingLevel`, and sending
the wrong one is a 400.

**`GEMINI_EVAL_MODEL = gemini-flash-lite-latest`.** Evaluation deliberately runs
on a different model from topic generation. Measured against the same
transcripts, flash-lite scored a strong on-topic answer 95 where the larger
model scored 98, still collapsed an off-topic answer to relevance 0, and still
caught 8 filler words in a deliberately weak one - while answering in ~1.4s
instead of ~7s. The quota argument below is the bigger reason.

## Free-tier reality

The Gemini free tier is the tightest constraint in the whole stack, and it is
tighter than it looks. Measured from a real 429:

```
quotaId:    GenerateRequestsPerDayPerProjectPerModel-FreeTier
quotaValue: 20
```

Twenty `generateContent` requests **per day, per model**. Not per minute. That
single fact drives several decisions:

- **Pool reuse is not an optimisation, it is what makes the product possible.**
  A topic generated once is served to every future user, so topic generation is
  amortised across the whole user base instead of costing a call per challenge.
- **Evaluation runs on its own model**, because the cap is per model. Splitting
  scoring onto `gemini-flash-lite-latest` doubles the daily budget rather than
  sharing one pool of 20.
- **Thinking is off**, because thinking tokens were most of the spend.
- **Embeddings are a separate model** with a separate quota, which is why
  duplicate detection keeps working even when topic generation is rate limited.

Every provider call is recorded in `ai_usage` with its success flag, so you can
see exactly where the budget went.

When the quota does run out, Jessica keeps working: challenges come from the
pool or the static fallback list, and submissions return a controlled
"temporarily busy" error without marking anyone's attempt failed. That is
verified against a real outage, not simulated.

A 429 also carries `RetryInfo.retryDelay`, and the retry logic honours it -
waiting the ~1.7s the provider asks for after a mild overage, but declining to
sit on a 40s hint with a user waiting, and falling back instead.

## Not built yet

- Deployment to Cloudflare (phase 9). Everything runs locally; nothing is live.
- Saving recordings to Supabase Storage (audio is transcribed and discarded).
- Account deletion has an endpoint but no UI.
- Gemini search grounding as a second current-information source. Grounded
  requests return 429 on the free tier, so RSS is the only route for now.
