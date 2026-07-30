# Stride Estates

Estate and letting agency software. Agency operations, applicant matching, compliance
tracking and document intelligence.

**v0.2 runs today.** A full design system, eight working modules, photograph management,
explainable matching, document Q&A with page citations, and an AI listing generator that
turns photographs and facts into portal, social and email copy.

Nothing needs an API key or a database server to run.

---

## Run it

You need Node 22 or newer. Nothing else — no database to install, no API keys.

```bash
npm run setup
```

Then two terminals:

```bash
npm run dev:api     # http://localhost:4100
npm run dev:web     # http://localhost:5174
```

Sign in with `owner@strideestates.co.uk` / `stride123`.

To wipe and reseed: `npm run db:reset`.

### If the API will not start

`EADDRINUSE: address already in use :::4100` means an API is already running —
usually one you started earlier in another tab. Nothing is broken.

```bash
lsof -ti:4100 | xargs kill      # stop it
PORT=4200 npm run dev:api       # or just use another port
```

Same for the web app on 5174.

---

## What is built

| Module | State | Notes |
|---|---|---|
| **Design system** | Working | Two-tier tokens, layered CSS, 20+ components, light and dark |
| **Properties** | Working | List, filter, search, create, status pipeline, photograph management |
| **Applicants** | Working | Register with criteria, ranked matches with reasons |
| **Instant matching** | Working | Both directions, explainable — who to call, what to send |
| **Diary & viewings** | Working | Booking with automatic double-booking rejection |
| **Compliance** | Working | Certificate expiry in four severity buckets, sidebar alerting |
| **Maintenance** | Working | Priority ordering, response targets, breach detection |
| **Document search** | Working | Chunking, BM25 retrieval, answers with page citations |
| **Listing studio** | Working | Photos + facts → portal, Instagram and email copy |
| **Lead concierge** | Working | Server-enforced state machine, guardrails, real diary booking |
| **Sales progression** | Working | Whole-chain view, milestone tracking, weakest-link detection |
| **Material information** | Working | Parts A/B/C checked against the record before copy goes out |
| **Command palette** | Working | ⌘K search across properties, applicants and pages |
| **Client portal** | Not started | See ROADMAP — this is the next big piece |
| **Analytics** | Not started | Conversion, time-to-exchange, lead response |
| **Client accounts** | Deliberately not building | Regulated. Integrate Xero instead |

---

## The lead concierge

A portal enquiry that waits until nine in the morning usually belongs to another agent by then. So
this answers in seconds — but answering fast is only safe if the thing answering cannot improvise.

**The state machine lives in code, and the model cannot move it.** That is the whole design:

1. The server decides which question is due, from the state it owns.
2. The model writes one sentence asking it, and *proposes* facts it thinks it heard.
3. The server re-validates every proposed fact with its own parsers and discards anything it
   cannot verify in the enquirer's own words.
4. The server advances one step, and only if the fact that step exists to collect is now present.

Ask a model "what state are we in now?" and it will happily answer BOOK_VIEWING because the
conversation felt like it was going well — then offer a viewing to someone whose budget nobody
established. Here the model is a phrasing engine with no authority over the conversation.

On top of that:

- **Escalation is evaluated in code before the model runs at all.** Eviction, bereavement,
  affordability, a request for a human, a request for advice only a qualified person should give, a
  complaint, or an out-of-area enquiry all hand over immediately. None of it depends on a model
  choosing to notice.
- **Sensitive cases stop automation for good** and get a deliberately human reply.
- **Replies are audited before sending.** Over the word limit, a banned promise, or any money
  figure the server did not supply, and the reply is thrown away, the scripted line goes out
  instead, and the block is recorded on the thread where staff can see it.
- **Viewings are booked against the real diary**, reusing the clash detection. A confirmation that
  is not in the diary is a lie the agent discovers on the doorstep.
- **Every turn is auditable**: state before, state after, and the reason the server moved or held.

With no API key it runs scripted: machine, validation, guardrails and booking all live, only the
wording templated.

## The listing studio

Photographs and a handful of facts become three pieces of marketing copy.

**Stage 1 looks.** A vision model surveys the photographs and returns JSON: only
features that are actually visible.

**Stage 2 writes.** It receives that JSON plus the agent's typed facts and is
forbidden from using anything else. UK advertising rules are in the system prompt
*and* checked again in code afterwards — invented features are a legal problem,
not a bug, and a model should never be trusted to police itself.

**With no API key** the pipeline still runs, using a local rules-based writer that
produces publishable copy from the property record. It cannot analyse photographs,
and the interface says so plainly rather than pretending. Add `AI_API_KEY` to
`api/.env` and the identical pipeline routes to GPT-4o or Claude.

That ordering was deliberate: build the orchestration first, the model second. The
product demos on a laptop with no account, costs nothing to show an agent, and
degrades honestly if a key expires mid-month.

---

## Architecture

```
stride-estates/
├── api/                       Express API
│   └── src/
│       ├── db/                schema.sql, connection, seed, reset
│       ├── lib/               helpers, validation, password hashing
│       ├── middleware/        auth + agency scoping
│       ├── routes/            one file per resource
│       └── services/
│           ├── matching.js    applicant ⇄ property scoring
│           └── retrieval.js   chunking + BM25 + citations
└── web/                       React + Vite
    └── src/
        ├── layout/            app shell, sidebar, topbar
        ├── pages/             one file per screen
        ├── api.js             the only place that calls the API
        ├── auth.jsx           session state
        └── ui.jsx             shared primitives
```

**Read ARCHITECTURE.md** for the patterns — feature-sliced folders, the two-tier
token system, the CSS layer cascade, and the dependency rule that keeps the design
system extractable.

### Decisions worth knowing about

**Multi-tenant from the first table.** Every row carries an `agency_id`, and every query
filters by `req.agencyId`, which is derived from the signed token and never from anything
the client sends. Retrofitting tenancy onto a single-tenant schema is one of the most
expensive rewrites a SaaS can face.

**Money is stored in pence.** Integers, never floats. Converted to pounds in exactly one
place: `web/src/format.js`.

**Matching is rules, not machine learning.** Two stages: hard filters that disqualify
(wrong tenure, over budget, too few bedrooms), then a weighted score with the reasons
attached. An agent sees *why* someone matched before they pick up the phone. Learning to
rank comes later, once there is real click data to learn from — you cannot train a
ranker on an empty database.

---

## The document search, and why it has no API key

The killer feature is answering "can I keep a dog here?" from a 60-page tenancy pack.
v0.1 does this with **BM25** — classical information retrieval. No embeddings, no model
call, no cost, works offline.

It is genuinely good at this, because the words in the question tend to be the words in
the clause. It returns the sentence that answers the question plus the page and paragraph
it came from, and it is *extractive*: it can only return words that are actually in the
document. For anything legally binding, that is the right trade.

```
Q: Can I keep a dog in the property?
A: The Tenant may keep one domestic cat or one dog at the Property with the prior
   written consent of the Landlord, which shall not be unreasonably withheld.
   → page 3, paragraph 2 (confidence 1.00)
```

`services/retrieval.js` exposes `answerQuestion(chunks, question)`. Phase 2 changes the
body of that one function to use embeddings and cosine similarity, and keeps the return
shape identical. Writing the interface first is the difference between a swap and a rewrite.

---

## Moving to Postgres

SQLite is right for now — zero setup, one file, real SQL. When you need concurrent writes,
hosted backups or `pgvector`:

1. Create a Supabase project (free) and copy the connection string.
2. Run `api/src/db/schema.sql` in the SQL editor, changing `TEXT` timestamps to
   `TIMESTAMPTZ` and `INTEGER` booleans to `BOOLEAN` if you want the nicer types.
3. Swap `api/src/db/index.js` to use `pg`. The queries themselves barely change —
   convert `?` placeholders to `$1, $2, …`.

Every query already lives behind `db.all` / `db.get` / `db.run`, so this is one file.

---

## API

All endpoints except `/api/auth/login` need `Authorization: Bearer <token>`.

```
POST   /api/auth/login              email + password → token
GET    /api/auth/me
GET    /api/dashboard               counts, next viewings, expiring certs, activity
GET    /api/properties              ?q= &status= &listing_type= &min_beds=
POST   /api/properties
GET    /api/properties/:id          property + certificates + viewings + documents
GET    /api/properties/:id/matches  ranked applicants, with reasons
PATCH  /api/properties/:id/status
GET    /api/applicants
POST   /api/applicants              creates contact + requirement together
GET    /api/applicants/:id/matches  ranked properties, with reasons
GET    /api/viewings                ?from= &to=
POST   /api/viewings                rejects double bookings
PATCH  /api/viewings/:id            status, feedback
GET    /api/compliance              certificates bucketed by severity
POST   /api/compliance
GET    /api/documents
POST   /api/documents               text in → chunked and indexed
POST   /api/documents/:id/ask       question → answer + citations
GET    /api/media/:propertyId
POST   /api/media/:propertyId       multipart photographs, max 12, 8MB each
DELETE /api/media/:id
GET    /api/maintenance             tickets with response-target breach flags
POST   /api/maintenance
PATCH  /api/maintenance/:id
GET    /api/listings/options        available tones + which provider is live
POST   /api/listings/generate       property + tone → copy + material information check
GET    /api/concierge               enquiries with live/booked/escalated counts
GET    /api/concierge/:id           thread, state, validated facts, offered slots
POST   /api/concierge               start an enquiry (a portal webhook in production)
POST   /api/concierge/:id/messages  one message in, one audited reply out
POST   /api/concierge/:id/handover  a person takes over; automation stops
GET    /api/sales                   chains assessed, offers, pipeline
POST   /api/sales/offers
PATCH  /api/sales/offers/:id        accepting moves the property to under offer
PATCH  /api/sales/links/:id         move one milestone on one chain link
```

---

## About `npm audit`

Both packages install clean except for one advisory on `react-router`
(GHSA-qwww-vcr4-c8h2, "RSC Mode CSRF Bypass"). It does not apply here: it affects
React Router's server/RSC framework mode with server actions, and this is a
client-side SPA using `BrowserRouter` with no server rendering and no router
actions.

The published fix downgrades to 7.11.0, which reintroduces two *older* advisories,
and the genuinely patched line (react-router 8) requires React 19. When you move
to React 19, take react-router 8 at the same time and it clears.

**Never run `npm audit fix --force` on this project.** It will downgrade the
router and break the build.

## Before this goes anywhere near a real agency

- `JWT_SECRET` must be a long random string in `.env`, not the default
- Add HTTPS, and rate limiting on more than just login
- Real data protection review: you would be holding tenant identity documents,
  which is special-category-adjacent personal data under UK GDPR
- Backups, and a tested restore — not just backups

See ROADMAP.md for what to build next and in what order.
