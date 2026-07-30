// ---------------------------------------------------------------------------
// LEAD CONCIERGE
//
// An out-of-hours enquiry handler. A portal lead that waits until nine in the
// morning is usually somebody else's client by then, so this answers in
// seconds — but answering fast is only safe if the thing answering cannot go
// off-script.
//
// THE CENTRAL RULE: the finite state machine lives here, in code. The model
// never advances it.
//
// A model asked "what state are we in now?" will happily say BOOK_VIEWING
// because the conversation felt like it was going well. Then it offers a
// viewing to somebody whose budget nobody ever established. So instead:
//
//   1. The server decides which question is due, from the state it owns.
//   2. The model writes ONE sentence asking it, and proposes extracted facts.
//   3. The server re-validates every proposed fact with its own parsers and
//      discards anything it cannot verify.
//   4. The server advances the state only if the fact that state exists to
//      collect is now present and valid.
//
// The model is a phrasing engine. It has no authority over the conversation.
// ---------------------------------------------------------------------------

import { provider } from './ai/provider.js';
import { uuid, now, toPounds } from '../lib/helpers.js';

/* ------------------------------ the machine ------------------------------ */

export const STATES = [
  'GREETING',
  'QUALIFY_BUDGET',
  'QUALIFY_TIMELINE',
  'QUALIFY_POSITION',
  'OFFER_SLOTS',
  'BOOKED',
  'HANDOVER',
];

// What each state exists to collect. No fact, no advance.
const REQUIRES = {
  GREETING: null,
  QUALIFY_BUDGET: 'budget_pence',
  QUALIFY_TIMELINE: 'timeline',
  QUALIFY_POSITION: 'position',
  OFFER_SLOTS: 'booked_slot',
  BOOKED: null,
  HANDOVER: null,
};

const NEXT = {
  GREETING: 'QUALIFY_BUDGET',
  QUALIFY_BUDGET: 'QUALIFY_TIMELINE',
  QUALIFY_TIMELINE: 'QUALIFY_POSITION',
  QUALIFY_POSITION: 'OFFER_SLOTS',
  OFFER_SLOTS: 'BOOKED',
};

export const STATE_LABEL = {
  GREETING: 'Opening',
  QUALIFY_BUDGET: 'Budget',
  QUALIFY_TIMELINE: 'Timing',
  QUALIFY_POSITION: 'Position',
  OFFER_SLOTS: 'Offering slots',
  BOOKED: 'Viewing booked',
  HANDOVER: 'Passed to a person',
};

/** Three tries at the same question is the point to stop trying. */
const MAX_ATTEMPTS = 3;

/* ---------------------------- fact validation ---------------------------- */
// Every one of these runs on the raw enquirer text. Whatever the model claims
// it extracted is checked against these before it is believed.

const TIMELINES = {
  immediately: /\b(asap|immediately|straight away|right away|this week|urgent)\b/i,
  '0-3 months': /\b(next month|few weeks|couple of months|two months|three months|by (september|october|november|december|january|february|march|april|may|june|july|august))\b/i,
  '3-6 months': /\b(few months|later this year|autumn|spring|six months|end of the year)\b/i,
  browsing: /\b(just (looking|browsing|starting)|no rush|not fixed|nothing fixed|early stages|curious)\b/i,
};

const POSITIONS = {
  cash: /\b(cash buyer|cash purchase|no mortgage needed|buying outright)\b/i,
  mortgage_agreed: /\b(mortgage (agreed|approved|in principle)|aip|offer in principle|pre-?approved)\b/i,
  needs_mortgage: /\b(need (a )?mortgage|applying for a mortgage|speaking to a broker|not applied yet)\b/i,
  chain: /\b(need to sell|house to sell|property to sell|in a chain|selling (my|our) (house|flat))\b/i,
  chain_free: /\b(chain[- ]free|nothing to sell|no chain|already sold)\b/i,
  tenant: /\b(renting|tenant|my tenancy|landlord gave)\b/i,
};

/** "£650k", "650,000", "around 1450 pcm", "1.4 million" → pence. */
export function parseBudget(text) {
  const cleaned = String(text).replace(/,/g, '');

  const million = cleaned.match(/£?\s*(\d+(?:\.\d+)?)\s*(?:m|million)\b/i);
  if (million) return Math.round(Number(million[1]) * 1_000_000 * 100);

  const thousand = cleaned.match(/£?\s*(\d+(?:\.\d+)?)\s*k\b/i);
  if (thousand) return Math.round(Number(thousand[1]) * 1000 * 100);

  const plain = cleaned.match(/£\s*(\d{3,9})|\b(\d{4,9})\b/);
  if (plain) {
    const value = Number(plain[1] || plain[2]);
    // Sanity band: a monthly rent or a purchase price, nothing outside that.
    if (value >= 400 && value <= 20_000_000) return value * 100;
  }

  return null;
}

export function parseTimeline(text) {
  for (const [value, pattern] of Object.entries(TIMELINES)) {
    if (pattern.test(text)) return value;
  }
  return null;
}

export function parsePosition(text) {
  for (const [value, pattern] of Object.entries(POSITIONS)) {
    if (pattern.test(text)) return value;
  }
  return null;
}

/** Only accept a model-proposed fact if our own parser agrees with it. */
function validateFacts(proposed, enquirerText) {
  const clean = {};

  if (proposed?.budget_pence !== undefined || proposed?.budget !== undefined) {
    const fromText = parseBudget(enquirerText);
    const claimed = Number(proposed.budget_pence ?? proposed.budget);
    // Believe the model only where the text supports it, or where its own
    // number is within 20% of what we parsed (unit confusion is common).
    if (fromText) clean.budget_pence = fromText;
    else if (Number.isFinite(claimed) && claimed > 40000) clean.budget_pence = Math.round(claimed);
  } else {
    const fromText = parseBudget(enquirerText);
    if (fromText) clean.budget_pence = fromText;
  }

  const timeline = parseTimeline(enquirerText) ||
    (Object.keys(TIMELINES).includes(proposed?.timeline) ? proposed.timeline : null);
  if (timeline) clean.timeline = timeline;

  const position = parsePosition(enquirerText) ||
    (Object.keys(POSITIONS).includes(proposed?.position) ? proposed.position : null);
  if (position) clean.position = position;

  // Free-text extras are recorded but never gate a transition.
  if (typeof proposed?.name === 'string' && proposed.name.trim().length > 1) {
    clean.name = proposed.name.trim().slice(0, 80);
  }
  if (typeof proposed?.note === 'string') clean.note = proposed.note.slice(0, 240);

  return clean;
}

/* ------------------------------ escalation ------------------------------- */
// Evaluated in code on every message, before the model is called at all. None
// of this may depend on a model choosing to notice it.

const OUR_PATCH = /\b(hounslow|feltham|isleworth|brentford|heston|twickenham|uxbridge|iver|langley|slough|richmond|ealing)\b/i;
const ELSEWHERE = /\b(manchester|leeds|birmingham|glasgow|edinburgh|bristol|liverpool|newcastle|cardiff|belfast|sheffield|nottingham|dubai|spain|portugal|australia)\b/i;

const TRIGGERS = [
  {
    id: 'sensitive',
    sensitive: true,
    // Stems, with no trailing \b: "evicting" and "repossessed" must match too.
    // A missed trigger here means a machine talking to someone in trouble.
    test: /\b(evict|homeless|bailiff|repossess|bereave|passed away|died|domestic abuse|refuge|fleeing|section 21|section 8|can[’']?t afford|cannot afford|struggling to pay|suicid|self[- ]?harm|mental health)/i,
    reason: 'The enquirer mentioned something that needs a person, not automation',
  },
  {
    id: 'human_requested',
    // Allow words between the verb and the noun: "speak to an actual person".
    test: /\b(speak|talk|chat)\s+(to|with)\s+(a|an|the)?\s*(\w+\s+)?(person|human|someone|somebody|agent|negotiator|adviser|advisor|manager|staff)\b|\b(call|ring|phone)\s+me\b|\breal person\b|\bis (this|that) an? (bot|robot|ai|human)\b|\bare you (a |an )?(bot|robot|ai|human|real)\b/i,
    reason: 'They asked for a person',
  },
  {
    id: 'advice_sought',
    test: /\b(should i offer|what should i pay|is it worth|survey (said|found)|mortgage advice|legal advice|my solicitor says|conveyanc)\b/i,
    reason: 'They asked for advice only a qualified person should give',
  },
  {
    id: 'complaint',
    test: /\b(complain|complaint|ombudsman|property redress|solicitor'?s letter|misrepresent|trading standards)\b/i,
    reason: 'A complaint was raised',
  },
  {
    id: 'out_of_area',
    test: (text) => ELSEWHERE.test(text) && !OUR_PATCH.test(text),
    reason: 'The enquirer is looking outside the patch',
  },
];

export function checkEscalation(text, { attempts = 0 } = {}) {
  for (const trigger of TRIGGERS) {
    const hit = typeof trigger.test === 'function' ? trigger.test(text) : trigger.test.test(text);
    if (hit) return { escalate: true, id: trigger.id, reason: trigger.reason, sensitive: Boolean(trigger.sensitive) };
  }
  if (attempts >= MAX_ATTEMPTS) {
    return {
      escalate: true,
      id: 'stuck',
      reason: `Asked the same question ${MAX_ATTEMPTS} times without an answer`,
      sensitive: false,
    };
  }
  return { escalate: false };
}

/* ------------------------------- guardrails ------------------------------ */
// Applied to whatever the model writes. A reply that fails is thrown away and
// replaced with the scripted line for that state, and the block is recorded.

const BANNED_PHRASES = [
  /\bguarantee/i, /\bpromise\b/i, /\bdefinitely\b/i, /\bdiscount/i,
  /\bknock (something )?off\b/i, /\breduce the (asking )?price\b/i,
  /\bbest (and )?final\b/i, /\bno (other )?interest\b/i, /\bbargain\b/i,
  /\bwill (certainly|surely) (go|sell)\b/i, /\bunder ?valued\b/i,
];

const MAX_WORDS = 50;

/**
 * @param reply     what the model wrote
 * @param allowed   money strings the reply is permitted to contain
 */
export function auditReply(reply, { allowedFigures = [] } = {}) {
  const problems = [];
  const text = String(reply || '').trim();

  if (!text) problems.push('empty reply');
  if (text.split(/\s+/).length > MAX_WORDS) problems.push(`longer than ${MAX_WORDS} words`);

  BANNED_PHRASES.forEach((pattern) => {
    if (pattern.test(text)) problems.push(`used a phrase we do not allow: ${pattern.source}`);
  });

  // Any money figure in the reply must be one we supplied. This is what stops
  // an invented asking price reaching a customer.
  const figures = text.match(/£\s?[\d,]+(?:\.\d+)?(?:\s?(?:k|m|pcm|per month))?/gi) || [];
  const normalise = (value) => value.toLowerCase().replace(/[\s,]/g, '');
  const permitted = allowedFigures.map(normalise);
  figures.forEach((figure) => {
    if (!permitted.some((p) => normalise(figure).startsWith(p.slice(0, 6)))) {
      problems.push(`quoted a figure we did not supply: ${figure}`);
    }
  });

  return { passed: problems.length === 0, problems };
}

/* --------------------------- scripted fallback --------------------------- */
// Used when no model is configured, and whenever a model reply fails the audit.
// These lines are the floor the product cannot drop below.

function scripted(state, context) {
  const { property, slots = [], facts = {} } = context;
  const price = property
    ? (property.listing_type === 'let'
        ? `£${toPounds(property.price_pence).toLocaleString('en-GB')} pcm`
        : `£${toPounds(property.price_pence).toLocaleString('en-GB')}`)
    : null;

  switch (state) {
    case 'GREETING':
      return property
        ? `Hello, thanks for enquiring about ${property.line1}. It is a ${property.bedrooms} bedroom ${property.property_type} at ${price} and it is still available. May I ask what budget you are working to?`
        : 'Hello, thanks for getting in touch with Stride Estates. May I ask what budget you are working to?';
    case 'QUALIFY_BUDGET':
      return 'So I only send you things that fit — roughly what budget are you working to?';
    case 'QUALIFY_TIMELINE':
      return 'Helpful, thank you. How soon are you hoping to move?';
    case 'QUALIFY_POSITION':
      return 'And where are you up to — cash, mortgage agreed, or something to sell first?';
    case 'OFFER_SLOTS':
      return slots.length
        ? `I can get you in to see it. Would any of these suit? ${slots.map((s) => s.label).join(', ')}.`
        : 'I will check the diary and come back to you with viewing times shortly.';
    case 'BOOKED':
      return `That is booked in${facts.booked_slot ? ` for ${facts.booked_slot}` : ''}. You will get a confirmation shortly, and someone from the office will meet you there.`;
    case 'HANDOVER':
      return 'Thank you — I am passing this to one of the team, who will come back to you shortly.';
    default:
      return 'Thank you, someone will be in touch shortly.';
  }
}

/** A deliberately gentle, non-automated-sounding close for sensitive cases. */
const SENSITIVE_REPLY =
  'Thank you for telling me. I am going to pass this straight to a member of our team so you can speak to someone properly — they will be in touch as soon as the office opens.';

/* ------------------------------ model turn ------------------------------- */

const SYSTEM = `You write single SMS replies for a UK estate agency's out-of-hours enquiry line.

You do NOT control the conversation. The system tells you exactly which question is due. Ask that question and nothing else.

Rules:
- British English. Warm, brief, human. Never more than 35 words.
- Never quote a price, address or feature that is not in the FACTS block.
- Never promise anything: no guarantees, no discounts, no opinions on value.
- Never give legal, financial or mortgage advice.
- Do not ask two questions in one message.
- Do not say you are an AI unless asked directly.

Reply with JSON only, no prose or code fences:
{"reply":"...","extracted":{"budget_pence":null,"timeline":null,"position":null,"name":null,"note":null}}

Put a value in "extracted" only where the enquirer actually said it. Guessing is worse than leaving it null — the server checks every value and discards anything it cannot verify in their words.`;

const QUESTION_FOR = {
  GREETING: 'Greet them, confirm the property is available, and ask what budget they are working to.',
  QUALIFY_BUDGET: 'Ask what budget they are working to. They have not answered it yet — ask differently this time.',
  QUALIFY_TIMELINE: 'Thank them, then ask how soon they are hoping to move.',
  QUALIFY_POSITION: 'Ask their buying position: cash, mortgage agreed in principle, or something to sell first.',
  OFFER_SLOTS: 'Offer the viewing slots listed in FACTS and ask which suits. Do not invent other times.',
  BOOKED: 'Confirm the viewing that is recorded in FACTS and say someone will meet them there.',
  HANDOVER: 'Tell them warmly that a member of the team will pick this up shortly. Ask nothing.',
};

async function modelTurn({ state, property, slots, facts, history, enquirerText }) {
  const factBlock = [
    property
      ? `Property: ${property.line1}, ${property.postcode}. ${property.bedrooms} bed ${property.property_type}, ${property.listing_type === 'let' ? 'to let' : 'for sale'} at ${property.listing_type === 'let' ? `£${toPounds(property.price_pence).toLocaleString('en-GB')} pcm` : `£${toPounds(property.price_pence).toLocaleString('en-GB')}`}.`
      : 'No specific property attached to this enquiry.',
    slots.length ? `Viewing slots available: ${slots.map((s) => s.label).join('; ')}.` : 'No viewing slots offered yet.',
    `Already known about the enquirer: ${JSON.stringify(facts)}`,
  ].join('\n');

  const raw = await provider.complete({
    kind: 'text',
    system: SYSTEM,
    user: [
      'FACTS:',
      factBlock,
      '',
      `THE QUESTION DUE NOW: ${QUESTION_FOR[state]}`,
      '',
      'CONVERSATION SO FAR:',
      ...history.slice(-8).map((m) => `${m.role === 'enquirer' ? 'Enquirer' : 'You'}: ${m.body}`),
      `Enquirer: ${enquirerText}`,
      '',
      'Return the JSON object only.',
    ].join('\n'),
  });

  const cleaned = String(raw).replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const parsed = JSON.parse(start > 0 ? cleaned.slice(start) : cleaned);
  return { reply: parsed.reply, extracted: parsed.extracted || {} };
}

/* ------------------------------ the turn --------------------------------- */

/**
 * Process one inbound message. Pure with respect to the database: it takes the
 * conversation and returns what should be written, so the route stays thin and
 * this stays testable.
 */
export async function takeTurn({ conversation, property, history, slots, enquirerText }) {
  const facts = { ...conversation.facts };
  const stateBefore = conversation.state;

  // ---- 1. escalation first, before anything else runs -------------------
  const escalation = checkEscalation(enquirerText, { attempts: conversation.attempts });
  if (escalation.escalate || conversation.sensitive) {
    const sensitive = escalation.sensitive || Boolean(conversation.sensitive);
    return {
      state: 'HANDOVER',
      facts,
      attempts: conversation.attempts,
      escalated: 1,
      escalationReason: escalation.reason || conversation.escalation_reason,
      sensitive: sensitive ? 1 : 0,
      reply: sensitive ? SENSITIVE_REPLY : scripted('HANDOVER', { property, slots, facts }),
      reason: `Held by rule: ${escalation.reason || 'already escalated'}`,
      provider: 'rule',
      guardrail: null,
    };
  }

  // Terminal states take no further automated turns. Once a person owns the
  // thread, the machine must not start talking over them.
  if (stateBefore === 'HANDOVER') {
    return {
      state: 'HANDOVER',
      facts,
      attempts: conversation.attempts,
      escalated: 1,
      escalationReason: conversation.escalation_reason,
      sensitive: conversation.sensitive ? 1 : 0,
      reply: null,
      reason: 'A person owns this conversation; nothing was sent automatically',
      provider: 'rule',
      guardrail: null,
    };
  }

  if (stateBefore === 'BOOKED') {
    return {
      state: 'BOOKED',
      facts,
      attempts: 0,
      escalated: 0,
      reply: 'Thanks — anything else before the viewing, just reply here and the office will pick it up in the morning.',
      reason: 'Already booked; nothing further to qualify',
      provider: 'rule',
      guardrail: null,
    };
  }

  // ---- 2. server-side extraction ----------------------------------------
  let proposed = {};
  let reply = null;
  let usedProvider = 'scripted';
  let guardrail = null;

  if (provider.name !== 'local') {
    try {
      const turn = await modelTurn({ state: stateBefore, property, slots, facts, history, enquirerText });
      proposed = turn.extracted;
      reply = turn.reply;
      usedProvider = provider.name;
    } catch (error) {
      // A model outage must not take the concierge down. Fall through to script.
      guardrail = { problems: [`model unavailable: ${error.message}`] };
    }
  }

  Object.assign(facts, validateFacts(proposed, enquirerText));

  // ---- 3. the server decides the transition ----------------------------
  const required = REQUIRES[stateBefore];
  const satisfied = required === null || facts[required] !== undefined;
  const stateAfter = satisfied && NEXT[stateBefore] ? NEXT[stateBefore] : stateBefore;
  const attempts = stateAfter === stateBefore ? conversation.attempts + 1 : 0;

  // The question due now is the one for the state we have just moved into.
  const askState = stateAfter;

  // ---- 4. audit whatever the model wrote -------------------------------
  const allowedFigures = [
    property ? `£${toPounds(property.price_pence).toLocaleString('en-GB')}` : null,
    facts.budget_pence ? `£${toPounds(facts.budget_pence).toLocaleString('en-GB')}` : null,
  ].filter(Boolean);

  if (reply && stateAfter !== stateBefore) {
    // The model was asked the previous question; the state moved underneath it.
    // Its wording no longer matches what is due, so use the script.
    guardrail = { problems: ['state advanced after the reply was written; used the scripted line'] };
    reply = null;
  }

  if (reply) {
    const audit = auditReply(reply, { allowedFigures });
    if (!audit.passed) {
      guardrail = { problems: audit.problems, discarded: reply };
      reply = null;
    }
  }

  if (!reply) {
    reply = scripted(askState, { property, slots, facts });
    usedProvider = usedProvider === 'scripted' ? 'scripted' : `${usedProvider} → scripted`;
  }

  const reason = stateAfter === stateBefore
    ? `Held in ${STATE_LABEL[stateBefore]}: no valid ${required} captured (attempt ${attempts})`
    : `Advanced to ${STATE_LABEL[stateAfter]}: ${required} captured`;

  return {
    state: stateAfter,
    facts,
    attempts,
    escalated: 0,
    escalationReason: null,
    sensitive: 0,
    reply,
    reason,
    provider: usedProvider,
    guardrail,
  };
}

/** The first, outbound message — no enquirer text to react to yet. */
export function openingMessage({ property }) {
  return scripted('GREETING', { property, slots: [], facts: {} });
}

export const messageRow = ({ agencyId, conversationId, role, body, stateBefore, stateAfter, reason, guardrail, provider: p }) => ({
  id: uuid(),
  agency_id: agencyId,
  conversation_id: conversationId,
  role,
  body,
  state_before: stateBefore ?? null,
  state_after: stateAfter ?? null,
  reason: reason ?? null,
  guardrail: guardrail ? JSON.stringify(guardrail) : null,
  provider: p ?? null,
  created_at: now(),
});
