-- ===========================================================================
-- Stride Estates — schema v0.1
--
-- Written in portable SQL: TEXT ids (uuid strings), TEXT timestamps (ISO
-- 8601), INTEGER money in pence, INTEGER 0/1 booleans, TEXT for JSON blobs.
-- The same statements run on Postgres with only the type names changed, so
-- moving to Supabase later is a find-and-replace, not a rewrite.
--
-- Multi-tenant from the first table: every row belongs to an agency. Retro-
-- fitting tenancy onto a single-tenant schema is one of the most expensive
-- mistakes a SaaS can make, so it is here from day one.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS agencies (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  plan          TEXT NOT NULL DEFAULT 'trial',   -- trial | solo | team
  created_at    TEXT NOT NULL
);

-- Staff logins. Client-portal logins are a separate table on purpose: a tenant
-- must never be able to authenticate against a staff role.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'negotiator', -- owner | negotiator | accounts
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- Everyone who is not staff: applicants, tenants, landlords, vendors, buyers.
-- One table because the same human is often two of these at once.
CREATE TABLE IF NOT EXISTS contacts (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id),
  kind          TEXT NOT NULL,                   -- applicant | tenant | landlord | vendor | buyer
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS properties (
  id             TEXT PRIMARY KEY,
  agency_id      TEXT NOT NULL REFERENCES agencies(id),
  reference      TEXT NOT NULL,                  -- agency-facing code, e.g. STR-0114
  listing_type   TEXT NOT NULL,                  -- sale | let
  status         TEXT NOT NULL DEFAULT 'available',
                 -- available | under_offer | let_agreed | sold | withdrawn
  line1          TEXT NOT NULL,
  line2          TEXT,
  city           TEXT NOT NULL,
  area           TEXT,                           -- neighbourhood used for matching
  postcode       TEXT NOT NULL,
  property_type  TEXT NOT NULL,                  -- flat | terraced | semi | detached | studio
  bedrooms       INTEGER NOT NULL DEFAULT 0,
  bathrooms      INTEGER NOT NULL DEFAULT 1,
  price_pence    INTEGER NOT NULL,               -- sale price, or monthly rent for lets
  furnished      TEXT,                           -- furnished | part | unfurnished | null
  pets_allowed   INTEGER NOT NULL DEFAULT 0,
  epc_rating     TEXT,
  features       TEXT NOT NULL DEFAULT '[]',     -- JSON array of strings
  description    TEXT,
  available_from TEXT,
  tenure         TEXT,                           -- freehold | leasehold | share_of_freehold
  council_tax_band TEXT,
  material_info  TEXT NOT NULL DEFAULT '{}',     -- JSON, see services/materialInfo.js
  landlord_id    TEXT REFERENCES contacts(id),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_properties_agency ON properties(agency_id, status);

-- What an applicant is looking for. Separate from the contact because one
-- person can register two very different searches.
CREATE TABLE IF NOT EXISTS requirements (
  id             TEXT PRIMARY KEY,
  agency_id      TEXT NOT NULL REFERENCES agencies(id),
  contact_id     TEXT NOT NULL REFERENCES contacts(id),
  listing_type   TEXT NOT NULL,                  -- sale | let
  min_price_pence INTEGER,
  max_price_pence INTEGER NOT NULL,
  min_bedrooms   INTEGER NOT NULL DEFAULT 0,
  areas          TEXT NOT NULL DEFAULT '[]',     -- JSON array
  property_types TEXT NOT NULL DEFAULT '[]',     -- JSON array
  must_haves     TEXT NOT NULL DEFAULT '[]',     -- JSON array of features
  needs_pets     INTEGER NOT NULL DEFAULT 0,
  furnished_pref TEXT,
  move_by        TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS viewings (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id),
  property_id   TEXT NOT NULL REFERENCES properties(id),
  contact_id    TEXT NOT NULL REFERENCES contacts(id),
  user_id       TEXT REFERENCES users(id),       -- negotiator hosting it
  starts_at     TEXT NOT NULL,
  duration_min  INTEGER NOT NULL DEFAULT 30,
  status        TEXT NOT NULL DEFAULT 'booked',  -- booked | attended | no_show | cancelled
  feedback      TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_viewings_when ON viewings(agency_id, starts_at);

CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id),
  title         TEXT NOT NULL,
  due_at        TEXT,
  done          INTEGER NOT NULL DEFAULT 0,
  property_id   TEXT REFERENCES properties(id),
  contact_id    TEXT REFERENCES contacts(id),
  assigned_to   TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL
);

-- Compliance certificates with expiry dates. This table is the whole reason an
-- agency buys software instead of using a spreadsheet: a lapsed gas safety
-- certificate is a criminal offence, not an inconvenience.
CREATE TABLE IF NOT EXISTS certificates (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id),
  property_id   TEXT NOT NULL REFERENCES properties(id),
  kind          TEXT NOT NULL,                   -- epc | gas_safety | eicr | right_to_rent | deposit_protection | insurance
  reference     TEXT,
  issued_on     TEXT,
  expires_on    TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_certificates_expiry ON certificates(agency_id, expires_on);

CREATE TABLE IF NOT EXISTS maintenance_tickets (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id),
  property_id   TEXT NOT NULL REFERENCES properties(id),
  raised_by     TEXT REFERENCES contacts(id),
  title         TEXT NOT NULL,
  detail        TEXT,
  priority      TEXT NOT NULL DEFAULT 'normal',  -- low | normal | urgent
  status        TEXT NOT NULL DEFAULT 'open',    -- open | assigned | scheduled | resolved
  cost_pence    INTEGER,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- ------------------------- document intelligence --------------------------
-- A document is a tenancy agreement, HOA pack, or management contract. It is
-- split into chunks so a question can be answered with a citation instead of
-- a summary. `embedding` is null for now — v0.1 retrieves with BM25, which
-- needs no API key. Phase 2 fills this column and switches the scorer.

CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id),
  property_id   TEXT REFERENCES properties(id),
  title         TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'other',   -- tenancy | hoa | management | epc | other
  page_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id),
  document_id   TEXT NOT NULL REFERENCES documents(id),
  page          INTEGER NOT NULL,
  paragraph     INTEGER NOT NULL,
  ordinal       INTEGER NOT NULL,
  content       TEXT NOT NULL,
  token_count   INTEGER NOT NULL DEFAULT 0,
  embedding     TEXT
);

CREATE INDEX IF NOT EXISTS idx_chunks_doc ON document_chunks(document_id, ordinal);

-- Audit trail. Cheap to write, invaluable when a landlord asks who changed a
-- rent figure three weeks ago.
CREATE TABLE IF NOT EXISTS activity (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id),
  user_id       TEXT REFERENCES users(id),
  entity        TEXT NOT NULL,
  entity_id     TEXT,
  action        TEXT NOT NULL,
  detail        TEXT,
  created_at    TEXT NOT NULL
);

-- ===========================================================================
-- v0.2 — media and generated marketing copy
-- ===========================================================================

CREATE TABLE IF NOT EXISTS property_media (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id),
  property_id   TEXT NOT NULL REFERENCES properties(id),
  filename      TEXT NOT NULL,
  url           TEXT NOT NULL,
  caption       TEXT,
  position      INTEGER NOT NULL DEFAULT 0,
  is_primary    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_property ON property_media(property_id, position);

-- One row per generation, so an agent can go back to copy they liked and so
-- you can see which prompts produced text people actually used.
CREATE TABLE IF NOT EXISTS listings (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id),
  property_id   TEXT REFERENCES properties(id),
  user_id       TEXT REFERENCES users(id),
  tone          TEXT NOT NULL DEFAULT 'balanced',
  provider      TEXT NOT NULL,
  features      TEXT NOT NULL DEFAULT '[]',
  portal_copy   TEXT,
  social_copy   TEXT,
  email_copy    TEXT,
  created_at    TEXT NOT NULL
);

-- ===========================================================================
-- v0.3 — lead concierge, sales chains, material information
-- ===========================================================================

-- An out-of-hours enquiry conversation. `state` is owned by the server and is
-- the single source of truth: the model never writes to it directly.
CREATE TABLE IF NOT EXISTS conversations (
  id                TEXT PRIMARY KEY,
  agency_id         TEXT NOT NULL REFERENCES agencies(id),
  property_id       TEXT REFERENCES properties(id),
  contact_id        TEXT REFERENCES contacts(id),
  channel           TEXT NOT NULL DEFAULT 'sms',    -- sms | email | portal
  handle            TEXT NOT NULL,                  -- phone number or email
  display_name      TEXT,
  source            TEXT,                           -- Rightmove | Zoopla | website
  state             TEXT NOT NULL DEFAULT 'GREETING',
  facts             TEXT NOT NULL DEFAULT '{}',     -- JSON, validated server-side
  attempts          INTEGER NOT NULL DEFAULT 0,     -- tries in the current state
  escalated         INTEGER NOT NULL DEFAULT 0,
  escalation_reason TEXT,
  sensitive         INTEGER NOT NULL DEFAULT 0,     -- stop automation entirely
  provider          TEXT NOT NULL DEFAULT 'scripted',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_agency
  ON conversations(agency_id, escalated, updated_at);

-- Every turn, with the state before and after and the reason the server moved
-- or held. This is the audit trail that makes an automated conversation
-- defensible when a customer complains about what it said.
CREATE TABLE IF NOT EXISTS conversation_messages (
  id              TEXT PRIMARY KEY,
  agency_id       TEXT NOT NULL REFERENCES agencies(id),
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role            TEXT NOT NULL,                    -- enquirer | assistant | staff | system
  body            TEXT NOT NULL,
  state_before    TEXT,
  state_after     TEXT,
  reason          TEXT,
  guardrail       TEXT,                             -- JSON: what was blocked, if anything
  provider        TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON conversation_messages(conversation_id, created_at);

-- Sales progression. An offer is a fact; a chain is the thing that actually
-- decides whether the fact becomes money.
CREATE TABLE IF NOT EXISTS offers (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id),
  property_id   TEXT NOT NULL REFERENCES properties(id),
  contact_id    TEXT REFERENCES contacts(id),
  amount_pence  INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',    -- pending | accepted | declined | withdrawn
  position      TEXT,                               -- cash | mortgage_agreed | chain | tenant
  note          TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chains (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id),
  name          TEXT NOT NULL,
  property_id   TEXT REFERENCES properties(id),     -- our instruction in this chain
  target_date   TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chain_links (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id),
  chain_id      TEXT NOT NULL REFERENCES chains(id),
  position      INTEGER NOT NULL,                   -- 0 = bottom of the chain
  address       TEXT NOT NULL,
  party         TEXT NOT NULL,
  role          TEXT,
  is_ours       INTEGER NOT NULL DEFAULT 0,
  property_id   TEXT REFERENCES properties(id),
  milestones    TEXT NOT NULL DEFAULT '{}',         -- JSON: milestone -> done|active|blocked|todo
  stage_note    TEXT,
  agreed_on     TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_links_chain ON chain_links(chain_id, position);
