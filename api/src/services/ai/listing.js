// ---------------------------------------------------------------------------
// The listing generator: photos + a handful of facts → portal copy, a social
// caption, and an email draft.
//
// Two prompts, not one. Stage 1 only looks: it returns a JSON list of features
// it can actually see. Stage 2 only writes, using nothing but that list and the
// agent's typed facts. Splitting them is what makes the output debuggable — when
// the copy is wrong you can see immediately whether the model mis-saw the room
// or mis-wrote the sentence. A single mega-prompt gives you no such handle.
//
// Stage 2 is also where compliance lives. UK property advertising is governed by
// the CPRs: no invented features, no "must not be missed", no discriminatory
// language. Those constraints are in the system prompt, and enforced again in
// the local writer.
// ---------------------------------------------------------------------------

import { provider, parseModelJson } from './provider.js';
import { toPounds } from '../../lib/helpers.js';

const BANNED = [
  'charming', 'cozy', 'cosy', 'must be seen', 'must not be missed', 'unique opportunity',
  'stunning', 'nestled', 'boasts', 'deceptively spacious',
];

const TONES = {
  balanced: 'Plain, factual and warm. Estate agency house style without the clichés.',
  family: 'Aimed at a family buyer. Emphasise space, storage, schools and safety.',
  luxury: 'Understated and premium. Short sentences. Restraint over adjectives.',
  investor: 'Aimed at a landlord or investor. Lead with yield, condition and demand.',
};

const VISION_SYSTEM = `You are a property photographer's assistant surveying estate agency photographs.
Return ONLY a JSON object, no prose, in this exact shape:
{"features": ["string", ...], "rooms": ["string", ...], "condition": "string", "notes": "string"}

Rules:
- List only what is clearly visible. Never guess at what might be off-camera.
- Features are concrete and checkable: "bay window", "fitted wardrobes", "granite worktop",
  "south-facing garden", "off-street parking", "period fireplace".
- Do not include people, personal belongings, or anything that would identify occupants.
- condition is one of: "newly refurbished", "well presented", "tired", "needs modernisation".
- Maximum 12 features.`;

const COPY_SYSTEM = `You write property marketing copy for a UK estate agency.

HARD RULES — a breach makes the copy legally unusable:
- Use ONLY the facts and features supplied. Never invent a feature, a measurement or a location claim.
- The Consumer Protection from Unfair Trading Regulations apply: no misleading omissions, no exaggeration.
- Never reference the likely occupants' race, religion, sex, age, disability or family status.
- Banned words: ${BANNED.join(', ')}.
- British spelling. Prices exactly as supplied.

Return ONLY a JSON object, no prose:
{"portal": "string", "social": "string", "email_subject": "string", "email": "string"}

- portal: 130–220 words, paragraphs separated by \\n\\n, for Rightmove and the agency site.
- social: under 300 characters, 3–5 relevant hashtags at the end, for Instagram.
- email_subject: under 60 characters.
- email: 90–140 words addressed to registered applicants, ending with a viewing invitation.`;

/** Describe the property in the flat, factual way both a model and a template can use. */
function factSheet(property) {
  const price = property.listing_type === 'let'
    ? `£${toPounds(property.price_pence).toLocaleString('en-GB')} per calendar month`
    : `£${toPounds(property.price_pence).toLocaleString('en-GB')}`;

  return [
    `Tenure: ${property.listing_type === 'let' ? 'to let' : 'for sale'}`,
    `Price: ${price}`,
    `Type: ${property.property_type}`,
    `Bedrooms: ${property.bedrooms || 'studio'}`,
    `Bathrooms: ${property.bathrooms}`,
    `Location: ${[property.area, property.city, property.postcode].filter(Boolean).join(', ')}`,
    property.furnished ? `Furnishing: ${property.furnished}` : null,
    property.epc_rating ? `EPC rating: ${property.epc_rating}` : null,
    property.available_from ? `Available from: ${property.available_from}` : null,
    property.pets_allowed ? 'Pets considered' : null,
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Local writer — used when no API key is configured. Not a placeholder: it
// produces publishable copy from the same structured input, it just cannot see
// the photographs.
// ---------------------------------------------------------------------------

const list = (items) => {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
};

function writeLocally(property, features, tone) {
  const area = property.area || property.city;
  const price = property.listing_type === 'let'
    ? `£${toPounds(property.price_pence).toLocaleString('en-GB')} pcm`
    : `£${toPounds(property.price_pence).toLocaleString('en-GB')}`;
  const beds = property.bedrooms ? `${property.bedrooms}-bedroom` : 'studio';
  const type = property.property_type === 'semi' ? 'semi-detached house' :
               property.property_type === 'terraced' ? 'terraced house' :
               property.property_type === 'detached' ? 'detached house' :
               property.property_type;

  const opening = {
    balanced: `A ${beds} ${type} in ${area}, available at ${price}.`,
    family: `A ${beds} ${type} in ${area} with room for a family to grow, at ${price}.`,
    luxury: `A ${beds} ${type} in ${area}. ${price}.`,
    investor: `A ${beds} ${type} in ${area} at ${price}, suited to a landlord looking for steady demand.`,
  }[tone] || `A ${beds} ${type} in ${area}, available at ${price}.`;

  const featureLine = features.length
    ? `The property offers ${list(features.slice(0, 6))}.`
    : '';

  const practical = [
    property.bathrooms > 1 ? `There ${property.bathrooms === 2 ? 'are two bathrooms' : `are ${property.bathrooms} bathrooms`}` : null,
    property.furnished ? `it is offered ${property.furnished === 'part' ? 'part furnished' : property.furnished}` : null,
    property.epc_rating ? `the EPC rating is ${property.epc_rating}` : null,
    property.available_from ? `it is available from ${new Date(property.available_from).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : null,
  ].filter(Boolean);

  const practicalLine = practical.length
    ? `${practical.join(', ').replace(/^./, (c) => c.toUpperCase())}.`
    : '';

  const closing = property.listing_type === 'let'
    ? 'Viewings are available now through our lettings team.'
    : 'Viewings are available now by appointment.';

  const portal = [
    opening,
    [featureLine, practicalLine].filter(Boolean).join(' '),
    property.description ? property.description : '',
    closing,
  ].filter(Boolean).join('\n\n');

  const tags = ['#' + (property.city || 'London').replace(/\s+/g, ''),
                property.listing_type === 'let' ? '#ToLet' : '#ForSale',
                `#${property.bedrooms || 0}Bed`, '#StrideEstates', '#PropertyUK'];

  const social = `${opening} ${features.length ? list(features.slice(0, 3)) + '.' : ''} ${tags.join(' ')}`.trim();

  return {
    portal,
    social: social.slice(0, 300),
    email_subject: `New instruction: ${beds} ${type} in ${area}`.slice(0, 60),
    email: [
      `We have just listed a ${beds} ${type} in ${area} at ${price}, and it matches what you told us you are looking for.`,
      featureLine || practicalLine,
      'Reply to this email or call the office and we will get a viewing in the diary this week.',
    ].filter(Boolean).join('\n\n'),
  };
}

/** Copy is unusable if it contains a banned term — check whoever wrote it. */
export function auditCopy(copy) {
  const text = Object.values(copy).join(' ').toLowerCase();
  return BANNED.filter((word) => text.includes(word));
}

// ---------------------------------------------------------------------------
// Stage 1 — look at the photographs
// ---------------------------------------------------------------------------

export async function extractFeatures({ imageUrls = [], property, hints = [] }) {
  const known = [...new Set([...(property.features || []), ...hints])].filter(Boolean);

  if (!provider.canSeeImages || imageUrls.length === 0) {
    return {
      features: known,
      condition: null,
      source: known.length ? 'agent-supplied' : 'none',
      note: provider.canSeeImages
        ? 'No photographs supplied, so the copy uses only your typed facts.'
        : 'No vision model configured, so features come from the property record rather than the photographs.',
    };
  }

  const raw = await provider.complete({
    kind: 'vision',
    system: VISION_SYSTEM,
    user: `Survey these ${imageUrls.length} photographs of ${property.line1}, ${property.postcode}. Return the JSON object only.`,
    images: imageUrls,
  });

  const parsed = parseModelJson(raw, { features: [] });
  const seen = Array.isArray(parsed.features) ? parsed.features.slice(0, 12) : [];

  return {
    features: [...new Set([...seen, ...known])],
    condition: parsed.condition || null,
    rooms: parsed.rooms || [],
    source: 'vision',
    note: `${seen.length} features identified from ${imageUrls.length} photographs.`,
  };
}

// ---------------------------------------------------------------------------
// Stage 2 — write the copy
// ---------------------------------------------------------------------------

export async function writeCopy({ property, features, tone = 'balanced' }) {
  if (provider.name === 'local') {
    return { copy: writeLocally(property, features, tone), provider: 'local' };
  }

  const raw = await provider.complete({
    kind: 'text',
    system: COPY_SYSTEM,
    user: [
      `Tone: ${TONES[tone] || TONES.balanced}`,
      '',
      'FACTS:',
      factSheet(property),
      '',
      `FEATURES (use only these): ${features.join(', ') || 'none supplied'}`,
      property.description ? `\nAGENT NOTES: ${property.description}` : '',
      '',
      'Return the JSON object only.',
    ].join('\n'),
  });

  const parsed = parseModelJson(raw, null);
  if (!parsed?.portal) {
    // The model returned something unusable. Fall back rather than fail —
    // an agent with adequate copy is better off than an agent with an error.
    return { copy: writeLocally(property, features, tone), provider: 'local', fellBack: true };
  }

  return { copy: parsed, provider: provider.name };
}

export const TONE_OPTIONS = Object.entries(TONES).map(([id, description]) => ({ id, description }));
