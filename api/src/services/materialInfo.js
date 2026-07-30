// ---------------------------------------------------------------------------
// MATERIAL INFORMATION (UK)
//
// National Trading Standards requires three tiers of information on a property
// advert. Part A must be on every listing from day one; Part B applies to all
// property; Part C is the set of things that need investigating and disclosing
// where they apply.
//
// Portals now enforce parts of this, and an omission is a Consumer Protection
// Regulations problem, not a tidiness problem. So the listing studio checks the
// record before copy goes out and says plainly what is still missing — which is
// far more useful to an agent than a model that quietly writes around the gap.
// ---------------------------------------------------------------------------

import { parseJson } from '../lib/helpers.js';

const CHECKS = [
  // --- Part A: required on every listing, no exceptions -------------------
  { part: 'A', key: 'price', label: 'Price or rent', from: (p) => p.price_pence > 0 },
  { part: 'A', key: 'tenure', label: 'Tenure', from: (p) => p.tenure,
    hint: 'Freehold, leasehold or share of freehold. Leasehold also needs term, ground rent and service charge.' },
  { part: 'A', key: 'council_tax_band', label: 'Council tax band', from: (p) => p.council_tax_band,
    hint: 'Band letter for sales; for lets, the band or the amount payable.' },

  // --- Part B: applies to all property ------------------------------------
  { part: 'B', key: 'property_type', label: 'Property type', from: (p) => p.property_type },
  { part: 'B', key: 'rooms', label: 'Number and type of rooms', from: (p) => p.bedrooms >= 0 && p.bathrooms > 0 },
  { part: 'B', key: 'construction', label: 'Construction materials', from: (p, extra) => extra.construction,
    hint: 'Standard brick and tile, timber frame, non-standard construction, cladding.' },
  { part: 'B', key: 'utilities', label: 'Utilities and supplies', from: (p, extra) => extra.utilities,
    hint: 'Electricity, water, heating, sewerage, broadband and mobile coverage.' },
  { part: 'B', key: 'parking', label: 'Parking', from: (p, extra) => extra.parking ||
      parseJson(p.features, []).some((f) => /park|garage|driveway/i.test(f)),
    hint: 'Allocated, permit, on-street, garage, or none.' },
  { part: 'B', key: 'epc', label: 'EPC rating', from: (p) => p.epc_rating },

  // --- Part C: needs investigation where it applies -----------------------
  { part: 'C', key: 'flood_risk', label: 'Flood risk', from: (p, extra) => extra.flood_risk,
    hint: 'Check the Environment Agency map and record the answer, even if it is "very low".' },
  { part: 'C', key: 'restrictions', label: 'Restrictive covenants and rights of way', from: (p, extra) => extra.restrictions,
    hint: 'Ask the seller and confirm against the title.' },
  { part: 'C', key: 'accessibility', label: 'Accessibility', from: (p, extra) => extra.accessibility,
    hint: 'Step-free access, level thresholds, wet room, lift.' },
  { part: 'C', key: 'building_safety', label: 'Building safety', from: (p, extra) => extra.building_safety,
    hint: 'Relevant to flats above 11 metres: cladding, EWS1, remediation.' },
  { part: 'C', key: 'planning', label: 'Planning and alterations', from: (p, extra) => extra.planning,
    hint: 'Extensions, loft conversions, and whether consents and certificates exist.' },
];

/**
 * @returns items with an honest present/missing status, plus a headline count
 *          so the studio can refuse to look finished when Part A is incomplete.
 */
export function checkMaterialInformation(property) {
  const extra = parseJson(property.material_info, {});

  const items = CHECKS.map((check) => {
    const value = check.from(property, extra);
    return {
      part: check.part,
      key: check.key,
      label: check.label,
      status: value ? 'present' : 'missing',
      value: typeof value === 'string' ? value : undefined,
      hint: value ? undefined : check.hint,
    };
  });

  const missing = items.filter((item) => item.status === 'missing');
  const missingA = missing.filter((item) => item.part === 'A');

  return {
    items,
    counts: {
      total: items.length,
      present: items.length - missing.length,
      missing: missing.length,
      missing_part_a: missingA.length,
    },
    // Portals reject Part A gaps. Everything else is a warning.
    publishable: missingA.length === 0,
    headline: missingA.length
      ? `${missingA.length} Part A item${missingA.length > 1 ? 's' : ''} missing — portals will reject this listing.`
      : missing.length
        ? `${missing.length} item${missing.length > 1 ? 's' : ''} still to record before this is fully compliant.`
        : 'All material information recorded.',
  };
}
