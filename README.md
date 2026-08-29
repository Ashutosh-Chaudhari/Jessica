# Jessica — The Communicator

A speaking-practice app that hands you a topic you did not choose, starts a
two-minute clock, and then tells you how clearly you were actually understood.

You cannot prepare for it. That is the point: the skill being trained is
thinking and speaking under pressure, not rehearsing an answer.

**Live: https://jessica.ashutoshc.workers.dev**

---

## How it works

1. **A topic arrives.** Generated on demand, and never one you have completed
   before — not merely a different string, but nothing semantically equivalent
   either.
2. **You talk.** Up to two minutes, recorded in the browser.
3. **You get scored.** Fluency, coherence, vocabulary, relevance and structure,
   with written feedback and the transcript.

Pass or fail is decided by the backend, never by the model. The model supplies
measurements; the application applies the rules — minimum speaking duration
(measured from the audio itself, not self-reported by the browser), minimum
transcript length, minimum relevance.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19 · TypeScript · Vite · Tailwind v4 |
| Backend | Cloudflare Workers · Hono |
| Database | Supabase PostgreSQL · pgvector |
| Auth | Supabase Auth · Row Level Security |
| Speech-to-text | Groq Whisper `large-v3-turbo` |
| Topics + scoring | Groq `qwen3.8-27b` |
| Embeddings | Gemini `gemini-embedding-001` |
| 3D | Three.js (lazy loaded, code split) |

One Cloudflare Worker serves both the API and the built frontend, so production
is a single origin and a single deployment.

## Repository layout

```
apps/web              React frontend
apps/worker           Cloudflare Worker API + static asset host
packages/types        Shared domain types, constants and pure logic
packages/ai           Provider interfaces + Groq and Gemini implementations
packages/database     Supabase data access
supabase/migrations   Schema, RLS policies and RPCs
docs/SPEC.md          The original product and architecture specification
```

## Run it locally

Nothing to configure and no accounts needed — the app runs entirely on
localStorage:

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm test             # domain logic, RSS parser, retry logic (node --test)
npm run typecheck    # every workspace
```

## Connect the real backend

### 1. Database

Create a free [Supabase](https://supabase.com) project, then apply the schema —
either with the CLI:

```bash
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

…or by pasting the files in `supabase/migrations/` into the SQL editor, in
order.

This creates `profiles`, `challenges` (with a 768-dimension pgvector column),
`user_challenges`, `attempts`, `ai_usage` and `topic_sources`; enables Row Level
Security on all of them; adds the trigger that creates a profile on signup; and
installs the `pick_unseen_challenge`, `is_duplicate_for_user`,
`user_progress_totals` and `delete_account` functions.

### 2. Frontend

`apps/web/.env.local`:

```
VITE_USE_MOCKS=false
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=http://localhost:8787
```

`apps/web/.env.production` is committed and overrides `VITE_API_BASE_URL` at
build time, because in production the Worker serves the app and the API from a
single origin.

The Supabase values are deliberately **not** committed, so a build on a machine
without `.env.local` has no backend configured. `vite build` refuses that
combination rather than silently shipping the mock app — a deployed site
running on localStorage looks completely normal while storing every signup in
the visitor's browser. In CI, pass them through the environment:

```bash
VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run deploy
```

### 3. Worker

Set `SUPABASE_URL` in `apps/worker/wrangler.toml`, then supply the secrets. For
local development copy `apps/worker/.dev.vars.example` to
`apps/worker/.dev.vars`. For production:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config apps/worker/wrangler.toml
npx wrangler secret put GEMINI_API_KEY            --config apps/worker/wrangler.toml
npx wrangler secret put GROQ_API_KEY              --config apps/worker/wrangler.toml
```

Keys come from the [Groq console](https://console.groq.com/keys) and
[Google AI Studio](https://aistudio.google.com/apikey). Both have free tiers.

```bash
npm run dev:worker   # http://localhost:8787
npm run dev          # http://localhost:5173, talking to the Worker
```

### 4. Deploy

```bash
npm run deploy
```

The Worker forces HTTPS with a 308 redirect, and every response carries a
Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, a referrer policy,
HSTS, and a Permissions-Policy that grants the microphone only to this origin
and denies camera, geolocation, payment and USB outright. Static assets get the
same set through `apps/web/public/_headers`, because a `_headers` file does not
apply to Worker-generated responses.

`GEMINI_API_KEY`, `GROQ_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must never
reach the frontend bundle. Only `VITE_`-prefixed variables are exposed to the
browser, and the anon key is safe there because Row Level Security is what
actually guards the data.

## API

Every route requires a Supabase session token except `GET /api/health`.

```
GET    /api/health
GET    /api/auth/me
POST   /api/challenges/start        returns the live challenge, or assigns one
GET    /api/challenges/current
POST   /api/challenges/:id/submit   multipart: audio
POST   /api/challenges/:id/retry
POST   /api/challenges/:id/skip
GET    /api/history
GET    /api/history/:id
GET    /api/progress
GET    /api/profile
PATCH  /api/profile
DELETE /api/profile
```

## How a topic is chosen

Cheapest path first, so AI quota is only spent when it has to be:

1. **Reuse.** Take an unseen topic from the shared pool that is not
   semantically close to anything this user has passed. No AI call at all.
2. **Generate.** Roll a weighted category, generate, validate the text, embed
   it, reject semantic duplicates, retry up to five times.
3. **Fall back.** Use a small static pool so the app still works when a
   provider is unavailable.

Current-affairs topics add a three-level retrieval strategy: no web call for
any other category, cached headlines from `topic_sources` while they are still
fresh, and only then a live RSS fetch. A dead or slow feed degrades to a topic
generated without current context rather than failing the request.

A provider outage is treated as a system failure, never a user failure. The
challenge stays available, no failed attempt is recorded, and the response is a
controlled "temporarily busy" message rather than a stack trace.

## Engineering notes

A few constants were measured against the live APIs rather than guessed.

**Similarity threshold — 0.91.** Measured on real `gemini-embedding-001` output
at 768 dimensions: paraphrases of an already-completed topic score 0.956–1.000,
while genuinely different angles on the same subject score 0.699–0.872. The
value originally specified (0.85) sat inside the *accept* band and rejected the
specification's own test case — "Explain how GPS works" versus "Why was GPS
originally developed?", which scores 0.8656 and should be allowed through.

**Groq for topics and scoring.** Measured on identical transcripts:

| | requests/day | latency | on topic | off topic |
| --- | --- | --- | --- | --- |
| Groq `qwen3.8-27b` | 1000 | ~600 ms | relevance 100 | relevance 0 |
| Gemini `3.6-flash` | 20 | 5–10 s | relevance 98 | relevance 0 |

Same discrimination, fifty times the daily budget, an order of magnitude
faster. `AI_TEXT_PROVIDER` switches back to Gemini without a code change, and
both providers share one prompt file so they cannot drift into scoring the same
answer differently.

**Gemini is kept for embeddings only.** Groq publishes no embedding model, and
without embeddings there is no semantic duplicate detection — the feature that
stops the app handing you a paraphrase of a topic you already completed.

**No vector index.** PostgreSQL can only use an HNSW index for
`ORDER BY embedding <=> $1 LIMIT k`. Both consumers here use the operator as a
`WHERE` predicate, which no vector index can serve, so an index would cost
write time on every insert and never be read. Assignment cost is bounded
instead by shortlisting candidates before any vectors are compared.

**Accessibility.** Every text colour in both themes is solved for a contrast
ratio of at least 7:1 (WCAG AAA) rather than the 4.5:1 AA floor. Fill colours
and text colours are separate design tokens, because a saturated red that reads
well as a 10-pixel indicator is unreadable as a sentence.

## Free-tier limits

The app is built to run at zero cost, which means treating quota as a real
engineering constraint:

- Groq allows 1000 requests per day; Gemini's free tier allows 20 per model.
- Topic reuse amortises generation across every user rather than costing one
  call per challenge.
- Embeddings bill against a separate quota from text generation.
- Every provider call is recorded in `ai_usage` with its success flag, so it is
  possible to see exactly where the budget went.
- **A global daily cap (`DAILY_AI_BUDGET`, default 800) stops the app before a
  provider does.** Per-user hourly limits stop one person hammering the app;
  they do nothing about a hundred people each behaving reasonably. Once the
  day's budget is spent, starting a challenge and submitting one both return a
  plain "come back tomorrow" — reading history and progress still work, because
  they cost nothing. Without it the first symptom of popularity is a provider
  429 and an app that looks broken. Set it to `0` to remove the ceiling.

## Owner notifications

Set the optional `NOTIFY_WEBHOOK_URL` secret to a Discord or Slack incoming
webhook and the owner is pinged the first time each new person uses the site:

```
**Ada** just started using Jessica.
12 people have signed up in total.
30 attempts today · 400/800 AI calls used today (50%)
```

Each ping doubles as a status report, which is the point — it says how close
the day is to its budget, not just that somebody arrived.

Exactly one notification is sent per person, ever. That is enforced by a single
conditional update (`set notified_at = now() where id = $1 and notified_at is
null`), so concurrent requests cannot both claim it and no locking is needed.
The webhook fires after the response with `waitUntil`, so nobody waits on it,
and every failure is swallowed — a broken webhook must never break a signup.

Leave the secret unset and no notification code runs at all.

## Not built yet

- Saving recordings to storage — audio is transcribed and then discarded.
- Per-dimension score charts beyond the current trend deltas.
- Social sign-in; email and password only for now.

## Background

The concept was inspired by a short video I came across online. Everything
here — the architecture, the code, the interface and the copy — is written
from scratch.

## Licence

[MIT](LICENSE). Use it, change it, ship it; just keep the copyright notice.
