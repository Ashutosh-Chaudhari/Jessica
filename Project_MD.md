# Jessica - The Communicator

## Dynamic AI Speaking Challenge Platform

### Free Cloud Architecture

Version: 3.0 Date: August 2026

------------------------------------------------------------------------

# 1. Executive Decision

Jessica will be designed as a fully cloud-hosted application.

The AI models will NOT run on the user's laptop.

The recommended free-first stack is:

``` text
Frontend       → Cloudflare Pages / Workers Static Assets
Backend        → Cloudflare Workers
Database       → Supabase PostgreSQL
Authentication → Supabase Auth
File Storage   → Supabase Storage
LLM            → Google Gemini API Free Tier
Speech-to-Text → Groq Whisper Free Tier
Embeddings     → Gemini Embeddings Free Tier
Current Topics → Web/news retrieval
Source Cache   → Supabase PostgreSQL
```

The main production architecture is therefore:

``` text
                         USER
                          |
                          v
                 Cloudflare Frontend
                          |
                          v
                 Cloudflare Worker
                          |
          +---------------+----------------+
          |               |                |
          v               v                v
     Supabase          Groq API       Gemini API
      Postgres          Whisper        LLM + Embeddings
          |
          v
     Supabase Storage
```

The user's laptop only runs the browser.

No local AI model is required.

------------------------------------------------------------------------

# 2. Important Cost Requirement

Jessica should be designed around a hard requirement:

> Core functionality must work without requiring the developer to pay
> for hosting or AI APIs during the initial public version.

Free-tier limits are subject to change. The architecture must therefore
keep external providers replaceable.

The application must never assume unlimited free AI inference.

Rate limits, quotas, and fallback behaviour must be implemented from the
beginning.

------------------------------------------------------------------------

# 3. Recommended Cloud Stack

## Frontend

Recommended:

**Cloudflare Pages / Workers Static Assets**

Why:

-   Free hosting
-   Global CDN
-   HTTPS
-   Good integration with Workers
-   Static frontend assets do not incur additional asset storage cost on
    the Workers platform
-   100,000 Worker requests/day on the Free plan

Cloudflare's current documentation lists 100,000 Worker requests per day
on the Free plan. Static asset requests are free and unlimited.
citeturn0search0turn0search10

Official documentation:

urlCloudflare Workershttps://developers.cloudflare.com/workers/

------------------------------------------------------------------------

# 4. Backend

Recommended:

**Cloudflare Workers**

The Worker will handle:

-   Authentication verification
-   Challenge creation
-   Topic generation requests
-   Duplicate checking
-   Audio upload handling
-   Groq API requests
-   Gemini API requests
-   Progress calculation
-   Rate limiting
-   API validation

Cloudflare Workers Free currently provides:

``` text
100,000 requests/day
10 ms CPU/request
50 external subrequests/request
128 MB memory
100 MB maximum request body on Free
```

External network waiting does not count toward the Worker CPU-time
limit. citeturn0search0

This is suitable because Jessica's backend is primarily an API
orchestrator. Heavy AI computation happens outside the Worker.

------------------------------------------------------------------------

# 5. Database

Recommended:

**Supabase PostgreSQL**

Free plan currently includes:

``` text
500 MB database
1 GB file storage
5 GB egress
50,000 monthly active users
500,000 Edge Function invocations
2 free projects
```

The Free plan also includes PostgreSQL, authentication, storage, and
other backend services. citeturn0search2turn0search8

Official:

urlSupabasehttps://supabase.com/

------------------------------------------------------------------------

# 6. Why Supabase Instead of Cloudflare D1

Cloudflare D1 is a strong option for a purely Cloudflare architecture.

Supabase is preferred for Jessica because:

-   PostgreSQL is familiar
-   Authentication is built in
-   Storage is built in
-   SQL is straightforward
-   pgvector support is useful for semantic similarity
-   Easier local development
-   Easier future migration
-   Better fit for relational user history

The application should still keep the database layer abstract enough to
allow migration later.

------------------------------------------------------------------------

# 7. Authentication

Use:

**Supabase Auth**

Flow:

``` text
User
 ↓
Supabase Auth
 ↓
JWT/session
 ↓
Cloudflare Worker
 ↓
Verify user
 ↓
Access Jessica data
```

This avoids building password authentication from scratch.

Supported initial methods:

-   Email/password
-   Email verification

Future:

-   Google login
-   GitHub login

------------------------------------------------------------------------

# 8. AI Architecture

Jessica needs three AI capabilities:

1.  Topic generation
2.  Speech-to-text
3.  Communication evaluation

Recommended cloud providers:

``` text
Topic Generation
      ↓
Google Gemini

Speech-to-Text
      ↓
Groq Whisper

Communication Evaluation
      ↓
Google Gemini

Semantic Embeddings
      ↓
Gemini Embeddings
```

This separation is intentional.

One provider does not become a single point of failure.

------------------------------------------------------------------------

# 9. Primary LLM

Recommended:

**Google Gemini 2.5 Flash**

Model:

``` text
gemini-2.5-flash
```

Why:

-   Strong general reasoning
-   Fast
-   Supports text, image, video and audio input
-   Structured outputs
-   Function calling
-   Search grounding capability
-   Suitable for high-volume processing
-   Free API tier is available

Google describes Gemini 2.5 Flash as a strong price-performance model
intended for low-latency and high-volume workloads. citeturn1search3

Google's current pricing documentation lists free-tier input and output
pricing for supported Gemini API models. citeturn1search2

Official:

urlGoogle AI for Developershttps://ai.google.dev/

------------------------------------------------------------------------

# 10. Why Gemini 2.5 Flash

Jessica does not need an expensive frontier model for every operation.

Most operations are:

``` text
Generate one topic
Evaluate one transcript
Return structured feedback
```

Gemini 2.5 Flash is well suited to these tasks.

Use a larger model only if testing shows a clear quality improvement.

Do not use a large model for simple operations.

------------------------------------------------------------------------

# 11. Speech-to-Text

Recommended:

**Groq Whisper Large V3 Turbo**

Model:

``` text
whisper-large-v3-turbo
```

Groq provides cloud-hosted Whisper speech recognition.

The model supports multilingual transcription and is designed for fast
inference. citeturn1search1turn1search10

Groq's current free-tier rate limits list:

``` text
20 requests/minute
2,000 requests/day
7,200 audio seconds/hour
28,800 audio seconds/day
```

for `whisper-large-v3-turbo`. citeturn1search0

For a 2-minute maximum recording:

``` text
28,800 seconds/day ÷ 120 seconds
≈ 240 maximum 2-minute recordings/day
```

This is a useful starting capacity for a free project.

Official:

urlGroqhttps://groq.com/

------------------------------------------------------------------------

# 12. Why Groq for Speech

Using Gemini for audio is technically possible. Gemini supports audio
input and long audio context. citeturn1search8turn1search12

For Jessica, a dedicated speech-to-text service is cleaner:

``` text
Audio
 ↓
Groq Whisper
 ↓
Transcript
 ↓
Gemini
 ↓
Evaluation
```

This separates transcription from evaluation.

It also gives Jessica a provider-independent transcript.

If Groq changes its free limits later, another STT provider can be
substituted without changing the rest of the system.

------------------------------------------------------------------------

# 13. Alternative Speech Architecture

A second option is:

``` text
Audio
 ↓
Gemini 2.5 Flash
 ↓
Transcript + Evaluation
```

Gemini supports audio input. citeturn1search8

This reduces the number of API calls.

Recommended architecture:

``` text
MVP:
Groq Whisper → Gemini

Experimental:
Gemini audio → Gemini evaluation
```

Compare both during development.

Keep the Groq pipeline as the primary design because transcription and
evaluation remain independently replaceable.

------------------------------------------------------------------------

# 14. Embeddings

Recommended:

**Gemini Embeddings**

Use:

``` text
gemini-embedding-001
```

or the current supported Gemini embedding model.

Google's pricing documentation lists Gemini Embeddings as available on
the free and paid Gemini API tiers. citeturn1search4

The embedding is used for:

``` text
New Topic
    ↓
Embedding
    ↓
Compare with user's completed topics
    ↓
Semantic similarity
```

------------------------------------------------------------------------

# 15. Topic Uniqueness

Do NOT create a giant predefined topic dictionary.

Jessica should dynamically generate topics.

Only store:

``` text
Completed topic
+
Topic embedding
+
User ID
+
Completion timestamp
```

This is enough to prevent practical semantic repetition.

------------------------------------------------------------------------

# 16. Dynamic Topic Engine

``` text
User presses START
        |
        v
Topic Strategy
        |
        +------------------+
        |                  |
        v                  v
Evergreen            Current / Trend
Topics               Topics
        |                  |
        +---------+--------+
                  |
                  v
           Gemini Generator
                  |
                  v
          Quality Validation
                  |
                  v
          Embedding Generation
                  |
                  v
       User History Similarity
                  |
           +------+------+
           |             |
        Duplicate      Unique
           |             |
           v             v
       Regenerate      Accept
                         |
                         v
                      User
```

------------------------------------------------------------------------

# 17. Topic Sources

Jessica should dynamically combine:

``` text
Evergreen knowledge
Historical knowledge
Science
Technology
Engineering
Business
Economics
Psychology
Philosophy
Culture
Geography
Sports
Environment
Current events
Industry trends
Future scenarios
Hypothetical questions
```

------------------------------------------------------------------------

# 18. Current Industry Topics

Current topics should not come from the LLM's memory alone.

Use current information.

Architecture:

``` text
Web / News Sources
       ↓
Current Information
       ↓
Gemini Topic Generator
       ↓
Challenge
```

Possible sources:

-   Google News RSS
-   Public RSS feeds
-   Government feeds
-   Science feeds
-   Technology news feeds
-   Industry publications
-   Other legally accessible public sources

The system should cache retrieved information instead of searching on
every user click.

------------------------------------------------------------------------

# 19. Gemini Search Grounding

Gemini supports search grounding.

Current Gemini pricing documentation shows search-grounding quotas
differ by model and tier. For Gemini 2.5 Flash, Google's developer forum
documentation currently describes a free allowance of 1,500 grounded
prompts per day. citeturn1search13

Treat this quota as a resource.

Do not use search grounding for every request.

Use it primarily for:

``` text
Current trends
Recent events
Recent technology
Industry developments
Scientific developments
```

Evergreen topics should not require live search.

------------------------------------------------------------------------

# 20. Current Topic Strategy

Use three levels.

## Level 1

No web request.

``` text
Evergreen topic generation
```

## Level 2

Use cached current information.

``` text
Cached industry/news information
        ↓
Gemini
```

## Level 3

Perform fresh retrieval when needed.

``` text
Fresh web information
        ↓
Gemini
```

This saves free quota.

------------------------------------------------------------------------

# 21. Topic Generation Distribution

Initial distribution:

``` text
Evergreen              30%
Science/Technology     20%
History                15%
Business/Economics     10%
Culture/Geography      10%
Current Trends         10%
Future Scenarios        5%
```

Jessica should vary the distribution over time.

The user should never see the category percentages.

------------------------------------------------------------------------

# 22. Semantic Duplicate Detection

Example completed topic:

``` text
Explain how the Internet works.
```

New generated topic:

``` text
Describe how the Internet functions.
```

Generate embeddings for both.

If similarity exceeds the configured threshold:

``` text
REJECT
```

Then generate another topic.

------------------------------------------------------------------------

# 23. Duplicate Detection Pipeline

``` text
Generated Topic
       |
       v
Normalize
       |
       v
Exact Text Check
       |
       v
Embedding
       |
       v
Vector Similarity Search
       |
       v
Threshold Check
       |
       +----------+
       |          |
    Similar    Different
       |          |
       v          v
    Reject      Accept
```

------------------------------------------------------------------------

# 24. Vector Database

Use:

``` text
Supabase PostgreSQL
+
pgvector
```

Example:

``` text
completed_challenges

id
user_id
topic_text
embedding
completed_at
```

The vector index searches the user's completed topics.

------------------------------------------------------------------------

# 25. Important Uniqueness Definition

Jessica should define the rule as:

> A successfully completed challenge must not be repeated exactly or
> regenerated as a substantially equivalent challenge for the same user.

This is more technically meaningful than claiming infinite mathematical
uniqueness.

------------------------------------------------------------------------

# 26. Challenge Generation Retry

Example:

``` text
Candidate 1 → duplicate
Candidate 2 → duplicate
Candidate 3 → invalid
Candidate 4 → accepted
```

Set a maximum retry count.

Example:

``` text
MAX_TOPIC_GENERATION_ATTEMPTS = 5
```

If all candidates fail:

``` text
Fallback generation strategy
```

------------------------------------------------------------------------

# 27. Fallback Topic Strategy

If current information retrieval fails:

``` text
Current Topic
     ↓
Unavailable
     ↓
Industry Topic
     ↓
Unavailable
     ↓
Evergreen Topic
```

Jessica must remain functional even if an external information source
fails.

------------------------------------------------------------------------

# 28. Challenge Lifecycle

``` text
NEW
 ↓
ASSIGNED
 ↓
PREPARING
 ↓
RECORDING
 ↓
PROCESSING
 ↓
PASSED / FAILED
 ↓
COMPLETED / RETRY
```

------------------------------------------------------------------------

# 29. Failed Challenge

A failed challenge is not permanently consumed.

``` text
Topic
 ↓
Attempt
 ↓
Failed
 ↓
Retry
 ↓
Same Topic
```

------------------------------------------------------------------------

# 30. Successful Challenge

``` text
Topic
 ↓
Attempt
 ↓
Passed
 ↓
Completed
 ↓
Store embedding
 ↓
Permanent user history
```

------------------------------------------------------------------------

# 31. Refresh Rule

If a user refreshes while a challenge is active:

``` text
Refresh
 ↓
Find active challenge
 ↓
Return same challenge
```

If a challenge is completed:

``` text
Refresh
 ↓
No active challenge
 ↓
Generate new challenge
```

This prevents accidental topic consumption.

------------------------------------------------------------------------

# 32. Recording Architecture

``` text
Browser
   |
   v
Microphone
   |
   v
MediaRecorder API
   |
   v
WebM/Opus audio
   |
   v
Cloudflare Worker
   |
   v
Groq Whisper
```

A 1-2 minute recording should remain well below the free upload limits.

Groq's current free-tier audio upload limit is 25 MB.
citeturn1search1

------------------------------------------------------------------------

# 33. Audio Storage

Do not permanently store audio in the MVP.

Recommended:

``` text
Audio
 ↓
Temporary processing
 ↓
Whisper
 ↓
Transcript
 ↓
Delete audio
```

Store:

``` text
Transcript
Evaluation
Duration
Score
```

Optional future feature:

``` text
Save Recording
```

If users explicitly choose to save recordings:

``` text
Supabase Storage
```

Supabase Free currently includes 1 GB storage and 50 MB maximum file
upload size. citeturn0search2

------------------------------------------------------------------------

# 34. Speech-to-Text Flow

``` text
User records
      ↓
Audio upload
      ↓
Cloudflare Worker
      ↓
Groq Whisper
      ↓
Transcript
      ↓
Store transcript temporarily
```

------------------------------------------------------------------------

# 35. AI Evaluation Flow

``` text
Topic
 +
Transcript
      |
      v
Gemini 2.5 Flash
      |
      v
Structured JSON
      |
      v
Backend validation
      |
      v
Database
```

------------------------------------------------------------------------

# 36. Evaluation Output

Example:

``` json
{
  "overall": 82,
  "fluency": 78,
  "coherence": 86,
  "vocabulary": 74,
  "relevance": 91,
  "structure": 83,
  "filler_count": 7,
  "feedback": [
    "Good topic focus.",
    "Reduce filler words.",
    "Use a clearer conclusion."
  ],
  "passed": true
}
```

------------------------------------------------------------------------

# 37. Evaluation Criteria

Jessica evaluates:

``` text
Fluency
Coherence
Vocabulary
Relevance
Structure
Filler words
Speaking duration
```

The AI should not judge the user's accent or personality.

The system should focus on communication quality.

------------------------------------------------------------------------

# 38. Pass / Fail Logic

Use a combination of deterministic rules and AI evaluation.

Example:

``` text
Minimum duration:
45 seconds

Minimum relevance:
50

Minimum transcript length:
configured word threshold
```

The final pass decision should be calculated by the backend.

Do not let the LLM alone decide completion.

Example:

``` text
Audio duration >= 45 sec
AND
Transcript is valid
AND
Relevance >= 50
```

Then:

``` text
PASSED
```

------------------------------------------------------------------------

# 39. Why Backend Decides Pass/Fail

LLMs sometimes return inconsistent results.

The backend should enforce:

``` text
Duration
Transcript existence
Evaluation schema
Relevance threshold
```

The LLM provides measurements.

The backend applies the product rules.

------------------------------------------------------------------------

# 40. Dashboard

Display:

``` text
Completed Topics
47

Average Score
78

Speaking Time
1h 18m

Current Streak
6 days

Best Score
94
```

Button:

``` text
START CHALLENGE
```

------------------------------------------------------------------------

# 41. History

Each successful challenge becomes a permanent history entry.

Example:

``` text
Why did the Roman Empire build roads?

25 August 2026

Score: 82
Duration: 1:42

Transcript:
...
```

------------------------------------------------------------------------

# 42. Progress Analytics

Track:

``` text
Total attempts
Completed topics
Speaking time
Average score
Current streak
Longest streak
Best score
Fluency trend
Coherence trend
Vocabulary trend
```

------------------------------------------------------------------------

# 43. Frontend Stack

Recommended:

``` text
React
TypeScript
Vite
Tailwind CSS
React Router
```

Browser APIs:

``` text
MediaRecorder
Web Audio API
```

------------------------------------------------------------------------

# 44. Backend Stack

Recommended:

``` text
Cloudflare Workers
TypeScript
Hono
```

Hono is recommended because it is lightweight and works well with
Cloudflare Workers.

------------------------------------------------------------------------

# 45. Database Stack

``` text
Supabase
PostgreSQL
pgvector
Supabase Auth
Supabase Storage
```

------------------------------------------------------------------------

# 46. Cloud Architecture

``` text
                    INTERNET
                       |
                       v
              Cloudflare CDN
                       |
                       v
               React Frontend
                       |
                       v
              Cloudflare Worker
                       |
        +--------------+--------------+
        |              |              |
        v              v              v
   Supabase         Groq API       Gemini API
   PostgreSQL       Whisper        LLM
        |
        |
        +------> pgvector
        |
        +------> Auth
        |
        +------> Storage
```

------------------------------------------------------------------------

# 47. Request Flow: Start Challenge

``` text
POST /api/challenges/start
            |
            v
      Verify Supabase user
            |
            v
      Check active challenge
            |
       +----+----+
       |         |
      Yes        No
       |         |
       v         v
    Return    Generate
    current    topic
                |
                v
         Duplicate check
                |
                v
             Accept
                |
                v
          Save assignment
                |
                v
          Return topic
```

------------------------------------------------------------------------

# 48. Request Flow: Submit Recording

``` text
POST /api/challenges/:id/submit
            |
            v
       Authenticate
            |
            v
       Validate audio
            |
            v
         Groq Whisper
            |
            v
         Transcript
            |
            v
      Gemini evaluation
            |
            v
      Validate JSON
            |
            v
       Pass/fail rules
            |
      +-----+-----+
      |           |
    Failed      Passed
      |           |
      v           v
    Retry     Mark complete
                  |
                  v
            Save embedding
                  |
                  v
            Update progress
```

------------------------------------------------------------------------

# 49. API Endpoints

## Authentication

Supabase handles authentication.

Application API:

``` text
GET /api/auth/me
```

------------------------------------------------------------------------

## Challenge

``` text
POST /api/challenges/start
GET  /api/challenges/current
POST /api/challenges/:id/submit
POST /api/challenges/:id/retry
```

------------------------------------------------------------------------

## History

``` text
GET /api/history
GET /api/history/:id
```

------------------------------------------------------------------------

## Progress

``` text
GET /api/progress
```

------------------------------------------------------------------------

## Profile

``` text
GET /api/profile
PATCH /api/profile
```

------------------------------------------------------------------------

# 50. Database Tables

## profiles

``` text
id
display_name
created_at
updated_at
```

The ID corresponds to the Supabase Auth user.

------------------------------------------------------------------------

## challenges

``` text
id
topic_text
category
difficulty
source_type
embedding
created_at
```

------------------------------------------------------------------------

## user_challenges

``` text
id
user_id
challenge_id
status
assigned_at
completed_at
```

Constraint:

``` text
UNIQUE(user_id, challenge_id)
```

------------------------------------------------------------------------

## attempts

``` text
id
user_id
challenge_id
duration_seconds
transcript
overall_score
fluency_score
coherence_score
vocabulary_score
relevance_score
structure_score
filler_count
status
created_at
```

------------------------------------------------------------------------

# 51. Current Topic Cache

Table:

``` text
topic_sources

id
source_url
source_title
source_text
source_type
published_at
fetched_at
expires_at
```

Use this for:

``` text
Current news
Industry trends
Recent science
Technology updates
```

This avoids repeatedly fetching the same information.

------------------------------------------------------------------------

# 52. Environment Variables

Cloudflare Worker secrets:

``` text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
```

Never expose these values in the frontend.

The frontend must never contain:

``` text
GEMINI_API_KEY
GROQ_API_KEY
SUPABASE_SERVICE_ROLE_KEY
```

------------------------------------------------------------------------

# 53. Security

Required:

-   Supabase Auth
-   Row Level Security
-   Backend authentication
-   Rate limiting
-   Input validation
-   Audio size validation
-   Recording duration validation
-   CORS configuration
-   Secure secrets
-   Server-side pass/fail logic
-   AI output schema validation

------------------------------------------------------------------------

# 54. Supabase Row Level Security

Users should only access their own:

``` text
profiles
user_challenges
attempts
progress
```

Example rule:

``` text
auth.uid() = user_id
```

Do not expose unrestricted database access to the frontend.

------------------------------------------------------------------------

# 55. AI Rate Limiting

Jessica should implement its own application limits.

Example:

``` text
Start challenge:
10 requests/hour/user

Submit recording:
10 requests/hour/user

Retry:
10 requests/hour/user
```

These are initial values and should be adjusted after testing.

This protects the free AI quotas.

------------------------------------------------------------------------

# 56. Free Quota Management

The backend should track provider usage.

Example:

``` text
AI_USAGE

provider
model
user_id
request_type
tokens/audio_seconds
created_at
```

This allows:

``` text
Daily usage
Provider usage
User abuse detection
Fallback activation
```

------------------------------------------------------------------------

# 57. Provider Fallback

Do not make Jessica depend on one AI provider.

Example:

``` text
Primary STT
    ↓
Groq Whisper
    ↓
Unavailable?
    ↓
Secondary STT provider
```

For evaluation:

``` text
Gemini
    ↓
Unavailable?
    ↓
Secondary model/provider
```

The initial deployment can have only the primary providers.

The abstraction should exist from the beginning.

------------------------------------------------------------------------

# 58. AI Service Interfaces

Use interfaces:

``` text
TopicGenerator
SpeechToTextProvider
EmbeddingProvider
EvaluationProvider
```

Example:

``` text
EvaluationProvider
       |
   +---+---+
   |       |
Gemini   Other
```

This allows future migration.

------------------------------------------------------------------------

# 59. Free Hosting Capacity

Cloudflare Workers Free currently provides:

``` text
100,000 requests/day
```

and static assets are free and unlimited under the documented static
asset model. citeturn0search0turn0search10

Supabase Free currently provides:

``` text
500 MB PostgreSQL
1 GB storage
50,000 MAU
500,000 Edge Function invocations
```

citeturn0search2turn0search8

For a student project, portfolio project, prototype, or small early user
base, this is a strong starting architecture.

------------------------------------------------------------------------

# 60. Important Free-Tier Reality

"Free" does not mean unlimited.

Jessica must treat quotas as hard engineering constraints.

Potential limits:

``` text
Cloudflare request quota
Supabase database size
Supabase storage
Gemini API quota
Groq audio quota
External web retrieval quota
```

The UI should show a friendly error if an AI provider reaches its quota.

Example:

``` text
Jessica is temporarily busy.

Please try again later.
```

Do not expose API provider errors to the user.

------------------------------------------------------------------------

# 61. Data Retention

MVP:

``` text
Audio:
Temporary

Transcript:
Permanent until user deletes history

Evaluation:
Permanent until user deletes history

Completed challenge:
Permanent while account exists
```

If the user deletes their account:

``` text
Delete user profile
Delete attempts
Delete completed challenge records
Delete stored files
```

------------------------------------------------------------------------

# 62. Privacy Warning for Free AI APIs

Before public launch, review each provider's current data-use terms.

Google's current Gemini pricing documentation marks free-tier requests
as "Used to improve our products: Yes", while paid-tier requests are
marked "No". citeturn1search2

This matters because Jessica processes user speech and transcripts.

Therefore the application should clearly disclose external AI
processing.

For a public production product handling sensitive voice data, provider
privacy terms should be reviewed again before launch.

------------------------------------------------------------------------

# 63. Recommended MVP Privacy Model

The MVP should display:

``` text
Your voice is sent to our cloud speech
service for transcription.

Your transcript is sent to our AI
evaluation service for communication analysis.

Audio is not permanently stored by default.
```

Obtain user consent where required.

------------------------------------------------------------------------

# 64. Topic Generation Cost Optimization

Do not generate topics continuously.

Generate only when needed.

Use:

``` text
User request
      ↓
Generate one candidate
      ↓
Validate
      ↓
Accept
```

If the same generated topic is useful for another user, Jessica can
reuse the global challenge record.

The user-specific uniqueness layer still prevents repetition.

------------------------------------------------------------------------

# 65. Challenge Reuse

A generated challenge can be reused globally.

Example:

``` text
Challenge 1001

"Why did the Roman Empire build roads?"
```

User A:

``` text
completed
```

User B:

``` text
available
```

User C:

``` text
available
```

User A:

``` text
never intentionally receives it again
```

This gives the system a hybrid model:

``` text
Dynamic generation
+
Reusable challenge pool
+
Per-user semantic history
```

This is more efficient than generating a unique challenge for every
user.

------------------------------------------------------------------------

# 66. Rolling Topic Pool

Jessica can maintain a rolling pool:

``` text
             New Topics
                  |
                  v
           Quality Check
                  |
                  v
            Global Pool
                  |
        +---------+---------+
        |         |         |
        v         v         v
      User A    User B    User C
```

The pool does not need to contain every possible topic.

It continuously changes.

------------------------------------------------------------------------

# 67. Topic Expiration

Some current topics become stale.

Each challenge can have:

``` text
expires_at
```

For example:

``` text
Current AI release
expires after configured period
```

Evergreen topics:

``` text
expires_at = NULL
```

This keeps Jessica's current-topic pool fresh.

------------------------------------------------------------------------

# 68. Current Topic Lifecycle

``` text
Retrieve current information
        ↓
Generate topic
        ↓
Validate
        ↓
Store
        ↓
Active
        ↓
Expiration
        ↓
Archive
```

Archived current topics should not be used as current-event questions.

They can still be converted into historical topics later.

------------------------------------------------------------------------

# 69. Future Topics

Future topics do not require current factual information.

Example:

``` text
What might software development look like in 2040?
```

The LLM should clearly identify these as hypothetical.

------------------------------------------------------------------------

# 70. Topic Safety

The generator should reject:

-   Illegal instructions
-   Dangerous instructions
-   Explicit sexual content
-   Hate content
-   Personal data requests
-   Highly sensitive personal topics
-   Medical diagnosis prompts
-   Other inappropriate challenge content

The topic generator should produce safe general-knowledge challenges.

------------------------------------------------------------------------

# 71. Frontend Design

Recommended visual direction:

``` text
Minimal
Modern
Clean
Fast
Focused
```

Landing page:

``` text
------------------------------------------------

                    JESSICA

               THE COMMUNICATOR

          Speak about anything.
          Think faster.
          Communicate better.

                 [ START ]

------------------------------------------------
```

------------------------------------------------------------------------

# 72. Challenge Screen

``` text
------------------------------------------------

                  YOUR CHALLENGE

       Why did the Roman Empire
       build such an extensive
       road network?

                 02:00

             [ START SPEAKING ]

------------------------------------------------
```

During recording:

``` text
------------------------------------------------

       Why did the Roman Empire
       build such an extensive
       road network?

                 01:27

              ● Recording

                [ FINISH ]

------------------------------------------------
```

------------------------------------------------------------------------

# 73. Result Screen

``` text
------------------------------------------------

                 YOUR RESULT

                    82

Fluency             78
Coherence           86
Vocabulary          74
Relevance           91
Structure           83

Good:
You stayed focused.

Improve:
Use fewer filler words.

             [ VIEW TRANSCRIPT ]

             [ NEXT CHALLENGE ]

------------------------------------------------
```

------------------------------------------------------------------------

# 74. Repository Structure

``` text
jessica/
│
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── services/
│   │   │   ├── types/
│   │   │   └── utils/
│   │   └── package.json
│   │
│   └── worker/
│       ├── src/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── middleware/
│       │   ├── validators/
│       │   └── utils/
│       └── wrangler.toml
│
├── packages/
│   ├── types/
│   ├── ai/
│   └── database/
│
├── supabase/
│   ├── migrations/
│   └── seed/
│
├── docs/
│
├── .env.example
├── package.json
└── README.md
```

------------------------------------------------------------------------

# 75. Development Phases

## Phase 1

Frontend prototype.

Build:

-   Landing page
-   Login
-   Signup
-   Dashboard
-   Challenge screen
-   Recording screen
-   Result screen
-   History

Use fake data.

------------------------------------------------------------------------

## Phase 2

Supabase.

Build:

-   Auth
-   PostgreSQL
-   RLS
-   User profiles
-   Attempts
-   Challenge records

------------------------------------------------------------------------

## Phase 3

Cloudflare Worker.

Build:

-   API
-   Authentication verification
-   Challenge endpoints
-   Submission endpoint
-   Rate limiting
-   AI service abstraction

------------------------------------------------------------------------

## Phase 4

Dynamic Topic Engine.

Build:

-   Gemini topic generation
-   Topic categories
-   Topic formats
-   Exact duplicate detection
-   Embeddings
-   pgvector similarity
-   User history filtering

------------------------------------------------------------------------

## Phase 5

Cloud Speech.

Build:

``` text
Browser
 ↓
Cloudflare Worker
 ↓
Groq Whisper
 ↓
Transcript
```

------------------------------------------------------------------------

## Phase 6

AI Evaluation.

Build:

``` text
Topic
+
Transcript
 ↓
Gemini
 ↓
Structured evaluation
 ↓
Backend rules
```

------------------------------------------------------------------------

## Phase 7

Current Topics.

Build:

-   RSS/news retrieval
-   Caching
-   Industry trend extraction
-   Current topic generation
-   Expiration

------------------------------------------------------------------------

## Phase 8

Progress.

Build:

-   Scores
-   Streaks
-   Speaking time
-   History
-   Analytics

------------------------------------------------------------------------

## Phase 9

Deployment.

Deploy:

``` text
Frontend → Cloudflare
Backend → Cloudflare Workers
Database → Supabase
Auth → Supabase
Storage → Supabase
STT → Groq
LLM → Gemini
```

------------------------------------------------------------------------

# 76. Testing

## Test 1: Exact Duplicate

Complete:

``` text
How does GPS work?
```

Generate:

``` text
How does GPS work?
```

Expected:

``` text
REJECT
```

------------------------------------------------------------------------

## Test 2: Semantic Duplicate

Complete:

``` text
Explain how the Internet works.
```

Generate:

``` text
Describe how the Internet functions.
```

Expected:

``` text
REJECT
```

------------------------------------------------------------------------

## Test 3: Related But Different

Complete:

``` text
Explain how GPS works.
```

Generate:

``` text
Why was GPS originally developed?
```

Expected:

``` text
Potentially accepted.
```

------------------------------------------------------------------------

## Test 4: Failed Attempt

User fails.

Expected:

``` text
Topic remains available.
```

------------------------------------------------------------------------

## Test 5: Successful Attempt

User passes.

Expected:

``` text
Topic permanently enters user history.
```

------------------------------------------------------------------------

## Test 6: Refresh

Active challenge exists.

Expected:

``` text
Same challenge.
```

------------------------------------------------------------------------

## Test 7: Completed Challenge

Challenge completed.

Refresh.

Expected:

``` text
New challenge.
```

------------------------------------------------------------------------

# 77. AI Failure Handling

If Gemini fails:

``` text
Retry once
 ↓
Fallback provider if configured
 ↓
Return controlled error
```

If Groq fails:

``` text
Retry once
 ↓
Fallback STT provider
 ↓
Controlled error
```

Do not mark a challenge failed because an AI provider failed.

Provider failure is a system error, not a user failure.

------------------------------------------------------------------------

# 78. User Failure vs System Failure

These must be separate.

## User failure

``` text
Insufficient speaking
Low relevance
Invalid response
```

Result:

``` text
RETRY
```

## System failure

``` text
Gemini unavailable
Groq unavailable
Database unavailable
Network failure
```

Result:

``` text
PROCESSING ERROR
```

Do not punish the user.

------------------------------------------------------------------------

# 79. Metrics

Track:

``` text
Daily active users
Challenges started
Challenges completed
Completion rate
Retry rate
Average speaking duration
Average score
Topic generation failures
Semantic duplicate rate
AI failures
Provider quota usage
Current topic usage
```

------------------------------------------------------------------------

# 80. Most Important Product Metrics

The most important early metrics are:

``` text
Challenge completion rate
Average speaking duration
Average score
Retry rate
7-day retention
30-day retention
```

Also track:

``` text
Unique-topic success rate
```

This measures whether dynamic topic generation is working.

------------------------------------------------------------------------

# 81. Free Architecture Summary

``` text
COMPONENT             SERVICE

Frontend              Cloudflare
Backend               Cloudflare Workers
Database              Supabase PostgreSQL
Authentication        Supabase Auth
Storage               Supabase Storage
LLM                   Gemini 2.5 Flash
Speech-to-text        Groq Whisper Large V3 Turbo
Embeddings            Gemini Embeddings
Current information   RSS/Web retrieval + Gemini
Vector search         pgvector
```

------------------------------------------------------------------------

# 82. Why This Architecture

The architecture separates the application into:

``` text
Hosting
Database
Authentication
AI
Speech
Content retrieval
Vector search
```

No single provider handles everything.

This makes Jessica easier to maintain and migrate.

------------------------------------------------------------------------

# 83. Expected User Experience

The user should experience:

``` text
Open Jessica
      ↓
Press Start
      ↓
Short buffering
      ↓
Unexpected topic
      ↓
Prepare
      ↓
Speak
      ↓
Jessica listens
      ↓
Transcript
      ↓
Score
      ↓
Feedback
      ↓
Progress updated
      ↓
Next unexpected topic
```

The user should never need to know:

-   Which AI model was used
-   Where the backend runs
-   Where transcription happens
-   Which database stores history

The technical complexity stays behind the interface.

------------------------------------------------------------------------

# 84. Core Differentiator

Jessica is not:

``` text
A chatbot
```

Jessica is not:

``` text
A fixed question bank
```

Jessica is:

``` text
A dynamic speaking challenge engine
```

The system continuously combines:

``` text
Dynamic topics
+
Current information
+
Evergreen knowledge
+
Future scenarios
+
Semantic memory
+
Cloud speech recognition
+
Cloud AI evaluation
+
Progress tracking
```

------------------------------------------------------------------------

# 85. Final MVP Definition

Jessica MVP is complete when a user can:

1.  Create an account.
2.  Log in.
3.  Open the dashboard.
4.  Start a challenge.
5.  Receive a dynamically generated topic.
6.  Receive topics from different domains.
7.  Receive current topics when relevant.
8.  Receive future/hypothetical topics.
9.  Record their response.
10. Send the recording to cloud speech recognition.
11. Receive a transcript.
12. Receive AI communication evaluation.
13. Receive a pass/fail result.
14. Retry failed challenges.
15. Complete successful challenges.
16. View transcript and feedback.
17. Track progress.
18. Refresh without losing an active challenge.
19. Never intentionally receive the same or substantially equivalent
    completed challenge again.
20. Continue receiving new dynamically generated challenges.
21. Run the complete application without requiring AI models on the
    user's laptop.
22. Deploy the initial application using free cloud tiers.

------------------------------------------------------------------------

# 86. Final Technology Decision

Use this stack for Version 1:

``` text
Frontend
React + TypeScript + Vite + Tailwind
            |
            v
Cloudflare Pages / Workers Static Assets
            |
            v
Cloudflare Worker + Hono
            |
      +-----+-----+
      |           |
      v           v
Supabase       External AI
PostgreSQL        |
pgvector      +---+--------+
Auth          |            |
Storage       v            v
           Gemini        Groq
         2.5 Flash      Whisper
```

The user's computer is only the client.

AI inference happens in the cloud.

------------------------------------------------------------------------

# 87. Final Architecture Principle

The most important architectural decision is:

> Jessica should store memory about the user, not a fixed universe of
> future questions.

The system stores:

``` text
What the user completed
What the user attempted
How the user performed
What topics are semantically similar
```

The system does not need to know every future topic.

This allows the topic space to remain dynamic.

Current events can enter.

Old topics can disappear.

New industries can appear.

Future scenarios can be generated.

The user's completed history remains the protection against repetition.

------------------------------------------------------------------------

# 88. Final Free-First Principle

The target is:

``` text
$0/month
```

during the initial development and small-user phase, subject to provider
free-tier quotas and policy changes.

The architecture is therefore built around:

``` text
Cloudflare Free
+
Supabase Free
+
Gemini Free Tier
+
Groq Free Tier
```

The application should monitor quotas and provide fallback behaviour
instead of silently assuming unlimited free usage.

For larger public usage, paid infrastructure will eventually be
required. The codebase should be structured so providers can be upgraded
or replaced without rewriting Jessica.
