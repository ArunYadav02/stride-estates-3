# Roadmap

## First, the honest part

The Domus feature grid you sent is roughly eight years of work by a funded team. Property
marketing, diary, applicants, sales progression, lettings, client accounts, client portal,
analytics — client accounts alone is a double-entry ledger holding other people's money,
which is regulated, audited, and the single most dangerous thing on that list to get wrong.

You are one person, in your final year, with a dissertation. Trying to match that grid
feature-for-feature is how this project dies at 40% complete in November.

**What actually wins:** be unmistakably better than Domus at one thing an agent feels every
day, and adequate at the rest. Two candidates, and v0.1 has already started both:

1. **Document intelligence.** Domus stores your PDFs. Stride answers questions about them
   with a page citation. No incumbent does this well.
2. **Explainable matching.** Every CRM has "instant match". Almost none tell the negotiator
   *why*, which is why almost none get trusted.

Everything else is table stakes: it has to exist, it does not have to be remarkable.

---

## Phase 1 — finish the operational spine (4–6 weeks)

You need enough for a real agent to run a week of work.

- [ ] **Maintenance tickets UI** — schema and seed exist, screen does not. Small win, do it first.
- [ ] **Landlords and vendors** — the `contacts` table handles them; they need screens
- [ ] **Property media** — photo upload, ordering, a primary image. Needs object storage
      (Supabase Storage or S3). Currently the biggest gap versus any real CRM.
- [ ] **Offers and sales progression** — offer → accepted → memorandum of sale → exchange →
      completion, with a chain view. This is the Domus "Sales" tile.
- [ ] **Tenancies** — link property + tenant + rent + dates; renewals and notice periods
- [ ] **Email out** — match alerts and viewing confirmations. Reuse the nodemailer setup
      from your portfolio API; do not rebuild it.
- [ ] **Tests.** You have none. Start with `services/matching.js` and `services/retrieval.js`,
      because those are the two files where a silent bug is most expensive.

## Phase 2 — the client portal (3–4 weeks)

The thing you described in your CV, and the reason a landlord tolerates the agency's software.

- [ ] Separate auth table and login for clients — never the staff `users` table
- [ ] Applicant view: application status, document upload, book a viewing slot
- [ ] Tenant view: raise maintenance with photos, see the ticket move
- [ ] Landlord view: their properties, viewing feedback, statements, compliance status
- [ ] Magic-link sign-in rather than passwords — clients log in three times a year and will
      forget a password every single time

## Phase 3 — the AI layer (4–6 weeks)

Only now, because AI on top of a workflow nobody uses is a demo, not a product.

- [ ] **Embeddings upgrade.** Replace the scorer inside `answerQuestion` with cosine
      similarity over `text-embedding-3-small`, keep the return shape. Store vectors in the
      `embedding` column already in the schema (needs Postgres + pgvector).
- [ ] **Hybrid retrieval.** Keep BM25 and combine the two rankings. Hybrid beats either
      alone on legal text, where exact terms like "Section 21" matter and embeddings blur them.
- [ ] **OCR ingestion.** Scanned PDFs → text via Tesseract or AWS Textract, feeding the
      chunker you already have. Half of what agencies hold is a photograph of a document.
- [ ] **Listing generator.** Photos + bullet points → MLS description, portal copy, social
      caption. Vision model extracts features as JSON, second call writes the copy from that
      JSON with a strict prompt. Two steps, not one — a single mega-prompt is unfixable when
      it goes wrong.
- [ ] **Lead qualification bot.** Webhook in from portal enquiries, a finite state machine
      (`GREETING → BUDGET → TIMELINE → BOOK`) wrapping the model so it cannot wander, and a
      booking against real diary availability. The FSM is the important part: an unconstrained
      LLM talking to a customer about money is a liability, not a feature.

## Phase 4 — the business (ongoing, start now)

- [ ] **Talk to five agents before Phase 2.** Your own document says it and it is right.
      Hounslow, Feltham, Isleworth — walk in. Ask what the worst part of their computer week
      is. Do not pitch, do not demo. Just listen and write it down.
- [ ] Billing (Stripe), onboarding, per-agency settings
- [ ] Data protection: you would hold identity documents and financial data. Get this right
      before your first paying customer, not after.

## Deliberately not building

- **Client accounts.** Handling client money is regulated. Integrate with Xero instead.
- **Your own portal feeds.** Rightmove and Zoopla have commercial gatekeeping and a
  membership fee. Export a standard feed file and let the agency upload it.
- **A mobile app.** The portal being good on a phone is enough.

---

## If you only do one thing next

Ship the maintenance UI and the photo upload, then take a laptop to three local agencies
and watch them use it for twenty minutes. Whatever they reach for and cannot find is your
actual roadmap — better than this file, and better than the Domus grid.
