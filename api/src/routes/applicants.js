import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap, validate, notFound } from '../lib/http.js';
import { uuid, now, parseJson } from '../lib/helpers.js';
import { matchProperties } from '../services/matching.js';

const router = Router();

const shapeRequirement = (row) => ({
  ...row,
  areas: parseJson(row.areas, []),
  property_types: parseJson(row.property_types, []),
  must_haves: parseJson(row.must_haves, []),
  needs_pets: Boolean(row.needs_pets),
  active: Boolean(row.active),
});

router.get(
  '/',
  wrap((req, res) => {
    const rows = db.all(
      `SELECT c.id AS contact_id, c.first_name, c.last_name, c.email, c.phone, c.created_at,
              r.id AS requirement_id, r.listing_type, r.max_price_pence, r.min_price_pence,
              r.min_bedrooms, r.areas, r.property_types, r.must_haves, r.needs_pets,
              r.furnished_pref, r.move_by, r.active
         FROM contacts c
         LEFT JOIN requirements r ON r.contact_id = c.id
        WHERE c.agency_id = ? AND c.kind = 'applicant'
        ORDER BY c.created_at DESC`,
      [req.agencyId]
    );
    res.json({ applicants: rows.map(shapeRequirement) });
  })
);

/** What should I send this applicant? Ranked, with reasons. */
router.get(
  '/:contactId/matches',
  wrap((req, res) => {
    const requirement = db.get(
      `SELECT r.*, c.first_name, c.last_name
         FROM requirements r JOIN contacts c ON c.id = r.contact_id
        WHERE r.contact_id = ? AND r.agency_id = ?
        ORDER BY r.created_at DESC LIMIT 1`,
      [req.params.contactId, req.agencyId]
    );
    if (!requirement) throw notFound('That applicant');

    const properties = db.all(
      "SELECT * FROM properties WHERE agency_id = ? AND status IN ('available','under_offer')",
      [req.agencyId]
    );

    const matches = matchProperties(properties, requirement).map((match) => ({
      score: match.score,
      reasons: match.reasons,
      property: {
        id: match.property.id,
        reference: match.property.reference,
        line1: match.property.line1,
        area: match.property.area,
        city: match.property.city,
        postcode: match.property.postcode,
        bedrooms: match.property.bedrooms,
        price_pence: match.property.price_pence,
        listing_type: match.property.listing_type,
        status: match.property.status,
      },
    }));

    res.json({
      applicant: {
        contact_id: requirement.contact_id,
        name: `${requirement.first_name} ${requirement.last_name}`,
      },
      requirement: shapeRequirement(requirement),
      matches,
    });
  })
);

router.post(
  '/',
  wrap((req, res) => {
    const values = validate(req.body, {
      first_name: { required: true, max: 80 },
      last_name: { required: true, max: 80 },
      email: { max: 200 },
      phone: { max: 40 },
      listing_type: { required: true, oneOf: ['sale', 'let'] },
      max_price_pence: { required: true, type: 'number' },
      min_price_pence: { type: 'number' },
      min_bedrooms: { type: 'number', default: 1 },
      areas: { type: 'array', default: [] },
      property_types: { type: 'array', default: [] },
      must_haves: { type: 'array', default: [] },
      needs_pets: { type: 'boolean', default: 0 },
      furnished_pref: { oneOf: ['furnished', 'part', 'unfurnished'] },
      move_by: { max: 40 },
    });

    const contactId = uuid();
    const timestamp = now();

    db.transaction(() => {
      db.run(
        `INSERT INTO contacts (id, agency_id, kind, first_name, last_name, email, phone, created_at)
         VALUES (?,?,'applicant',?,?,?,?,?)`,
        [contactId, req.agencyId, values.first_name, values.last_name,
         values.email ?? null, values.phone ?? null, timestamp]
      );

      db.run(
        `INSERT INTO requirements
          (id, agency_id, contact_id, listing_type, min_price_pence, max_price_pence, min_bedrooms,
           areas, property_types, must_haves, needs_pets, furnished_pref, move_by, active, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`,
        [uuid(), req.agencyId, contactId, values.listing_type,
         values.min_price_pence ?? null, values.max_price_pence, values.min_bedrooms,
         JSON.stringify(values.areas), JSON.stringify(values.property_types),
         JSON.stringify(values.must_haves), values.needs_pets,
         values.furnished_pref ?? null, values.move_by ?? null, timestamp]
      );
    });

    res.status(201).json({ contact_id: contactId });
  })
);

export default router;
