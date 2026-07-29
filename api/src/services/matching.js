// ---------------------------------------------------------------------------
// Applicant ⇄ property matching.
//
// Two stages, deliberately separated:
//   1. HARD FILTERS — a mismatch here is disqualifying. Never "nearly" match
//      someone into a property that is out of budget or the wrong tenure.
//   2. SCORING — everything left gets 0–100 with the reasons attached, so a
//      negotiator can see *why* before they phone anyone. An unexplained
//      ranking is a ranking nobody trusts.
//
// No machine learning here on purpose. The rules are legible, cheap and
// correct. Learn to rank later, once there is real click data to learn from.
// ---------------------------------------------------------------------------

import { parseJson, toPounds } from '../lib/helpers.js';

const WEIGHTS = {
  budgetFit: 30,
  bedrooms: 20,
  area: 20,
  mustHaves: 15,
  practical: 10,
  freshness: 5,
};

/** Nothing below this is worth showing a negotiator. */
export const MATCH_FLOOR = 45;

function hardFilters(property, requirement) {
  if (property.listing_type !== requirement.listing_type) return 'different tenure';
  if (!['available', 'under_offer'].includes(property.status)) return 'not on the market';
  if (property.price_pence > requirement.max_price_pence) return 'over budget';
  if (requirement.min_price_pence && property.price_pence < requirement.min_price_pence) {
    return 'below their price range';
  }
  if (property.bedrooms < requirement.min_bedrooms) return 'too few bedrooms';
  if (requirement.needs_pets && !property.pets_allowed) return 'pets not allowed';

  const types = parseJson(requirement.property_types, []);
  if (types.length && !types.includes(property.property_type)) return 'wrong property type';

  return null;
}

export function scoreMatch(property, requirement) {
  const blocked = hardFilters(property, requirement);
  if (blocked) return { score: 0, blocked, reasons: [] };

  const reasons = [];
  let score = 0;

  // --- budget fit: reward headroom, but not so much that it looks cheap ---
  const max = requirement.max_price_pence;
  const min = requirement.min_price_pence || max * 0.6;
  const span = Math.max(1, max - min);
  const position = (property.price_pence - min) / span; // 0 = cheapest, 1 = at ceiling
  // Best fit sits around 75% of budget: affordable without feeling like a compromise.
  const budgetFit = 1 - Math.min(1, Math.abs(position - 0.75) / 0.75);
  score += budgetFit * WEIGHTS.budgetFit;
  if (position <= 0.85) {
    reasons.push(`£${toPounds(max - property.price_pence).toLocaleString()} under their ceiling`);
  }

  // --- bedrooms: exact is ideal, one spare is a bonus, more is wasted rent ---
  const extra = property.bedrooms - requirement.min_bedrooms;
  const bedroomFit = extra === 0 ? 1 : extra === 1 ? 0.85 : 0.5;
  score += bedroomFit * WEIGHTS.bedrooms;
  if (extra === 0) reasons.push('exactly the bedrooms they asked for');
  if (extra === 1) reasons.push('one bedroom more than they need');

  // --- area ---
  const areas = parseJson(requirement.areas, []).map((a) => a.toLowerCase());
  const propertyArea = (property.area || '').toLowerCase();
  const propertyCity = (property.city || '').toLowerCase();
  if (!areas.length) {
    score += WEIGHTS.area * 0.6; // no preference stated, so no penalty either
  } else if (areas.includes(propertyArea)) {
    score += WEIGHTS.area;
    reasons.push(`in ${property.area}, on their list`);
  } else if (areas.includes(propertyCity)) {
    score += WEIGHTS.area * 0.7;
    reasons.push(`in ${property.city}`);
  }

  // --- must-have features ---
  const wanted = parseJson(requirement.must_haves, []).map((f) => f.toLowerCase());
  const has = parseJson(property.features, []).map((f) => f.toLowerCase());
  if (!wanted.length) {
    score += WEIGHTS.mustHaves * 0.6;
  } else {
    const hits = wanted.filter((w) => has.some((h) => h.includes(w)));
    score += (hits.length / wanted.length) * WEIGHTS.mustHaves;
    if (hits.length) reasons.push(`has ${hits.join(', ')}`);
    const missed = wanted.filter((w) => !has.some((h) => h.includes(w)));
    if (missed.length) reasons.push(`missing ${missed.join(', ')}`);
  }

  // --- practical: furnishing and availability against their move date ---
  let practical = 0.5;
  if (requirement.furnished_pref && property.furnished === requirement.furnished_pref) {
    practical = 1;
    reasons.push(`${property.furnished} as requested`);
  } else if (!requirement.furnished_pref) {
    practical = 0.75;
  }
  if (requirement.move_by && property.available_from) {
    if (new Date(property.available_from) <= new Date(requirement.move_by)) {
      reasons.push('available before they need to move');
    } else {
      practical *= 0.5;
      reasons.push('available after their move date');
    }
  }
  score += practical * WEIGHTS.practical;

  // --- freshness: a new instruction is a better call than a stale one ---
  const ageDays = (Date.now() - new Date(property.created_at).getTime()) / 86400000;
  const freshness = ageDays <= 7 ? 1 : ageDays <= 30 ? 0.6 : 0.25;
  score += freshness * WEIGHTS.freshness;
  if (ageDays <= 7) reasons.push('new to the market');

  return { score: Math.round(score), blocked: null, reasons };
}

/** Rank every property against one applicant requirement. */
export function matchProperties(properties, requirement, { floor = MATCH_FLOOR } = {}) {
  return properties
    .map((property) => ({ property, ...scoreMatch(property, requirement) }))
    .filter((m) => !m.blocked && m.score >= floor)
    .sort((a, b) => b.score - a.score);
}

/** Rank every applicant against one property — the "who do I call?" view. */
export function matchApplicants(requirements, property, { floor = MATCH_FLOOR } = {}) {
  return requirements
    .map((requirement) => ({ requirement, ...scoreMatch(property, requirement) }))
    .filter((m) => !m.blocked && m.score >= floor)
    .sort((a, b) => b.score - a.score);
}
