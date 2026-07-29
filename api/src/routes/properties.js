import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap, validate, notFound } from '../lib/http.js';
import { uuid, now, parseJson } from '../lib/helpers.js';
import { matchApplicants } from '../services/matching.js';

const router = Router();

const shape = (row) => ({
  ...row,
  features: parseJson(row.features, []),
  pets_allowed: Boolean(row.pets_allowed),
});

router.get(
  '/',
  wrap((req, res) => {
    const { status, listing_type: listingType, q, min_beds: minBeds } = req.query;

    let sql = 'SELECT * FROM properties WHERE agency_id = ?';
    const params = [req.agencyId];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (listingType) {
      sql += ' AND listing_type = ?';
      params.push(listingType);
    }
    if (minBeds) {
      sql += ' AND bedrooms >= ?';
      params.push(Number(minBeds));
    }
    if (q) {
      sql += ' AND (line1 LIKE ? OR postcode LIKE ? OR area LIKE ? OR reference LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    sql += ' ORDER BY created_at DESC';
    res.json({ properties: db.all(sql, params).map(shape) });
  })
);

router.get(
  '/:id',
  wrap((req, res) => {
    const property = db.get('SELECT * FROM properties WHERE id = ? AND agency_id = ?', [
      req.params.id,
      req.agencyId,
    ]);
    if (!property) throw notFound('That property');

    const certificates = db.all(
      'SELECT * FROM certificates WHERE property_id = ? ORDER BY expires_on ASC',
      [property.id]
    );
    const viewings = db.all(
      `SELECT v.*, c.first_name, c.last_name
         FROM viewings v JOIN contacts c ON c.id = v.contact_id
        WHERE v.property_id = ? ORDER BY v.starts_at DESC LIMIT 20`,
      [property.id]
    );
    const documents = db.all(
      'SELECT id, title, kind, page_count FROM documents WHERE property_id = ?',
      [property.id]
    );

    res.json({ property: shape(property), certificates, viewings, documents });
  })
);

/** Who should I call about this property? Ranked, with reasons. */
router.get(
  '/:id/matches',
  wrap((req, res) => {
    const property = db.get('SELECT * FROM properties WHERE id = ? AND agency_id = ?', [
      req.params.id,
      req.agencyId,
    ]);
    if (!property) throw notFound('That property');

    const requirements = db.all(
      `SELECT r.*, c.first_name, c.last_name, c.email, c.phone
         FROM requirements r JOIN contacts c ON c.id = r.contact_id
        WHERE r.agency_id = ? AND r.active = 1`,
      [req.agencyId]
    );

    const matches = matchApplicants(requirements, property).map((match) => ({
      score: match.score,
      reasons: match.reasons,
      applicant: {
        contact_id: match.requirement.contact_id,
        name: `${match.requirement.first_name} ${match.requirement.last_name}`,
        email: match.requirement.email,
        phone: match.requirement.phone,
        max_price_pence: match.requirement.max_price_pence,
        min_bedrooms: match.requirement.min_bedrooms,
      },
    }));

    res.json({ property: shape(property), matches });
  })
);

router.post(
  '/',
  wrap((req, res) => {
    const values = validate(req.body, {
      listing_type: { required: true, oneOf: ['sale', 'let'] },
      line1: { required: true, max: 200 },
      line2: { max: 200 },
      city: { required: true, max: 120 },
      area: { max: 120 },
      postcode: { required: true, max: 12 },
      property_type: { required: true, oneOf: ['flat', 'terraced', 'semi', 'detached', 'studio'] },
      bedrooms: { required: true, type: 'number' },
      bathrooms: { type: 'number', default: 1 },
      price_pence: { required: true, type: 'number' },
      furnished: { oneOf: ['furnished', 'part', 'unfurnished'] },
      pets_allowed: { type: 'boolean', default: 0 },
      epc_rating: { max: 2 },
      description: { max: 4000 },
      available_from: { max: 40 },
      features: { type: 'array', default: [] },
    });

    const count = db.get('SELECT COUNT(*) AS n FROM properties WHERE agency_id = ?', [req.agencyId]);
    const reference = `STR-${String((count?.n || 0) + 1).padStart(4, '0')}`;
    const id = uuid();
    const timestamp = now();

    db.run(
      `INSERT INTO properties
        (id, agency_id, reference, listing_type, status, line1, line2, city, area, postcode,
         property_type, bedrooms, bathrooms, price_pence, furnished, pets_allowed, epc_rating,
         features, description, available_from, created_at, updated_at)
       VALUES (?,?,?,?,'available',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, req.agencyId, reference, values.listing_type,
        values.line1, values.line2 ?? null, values.city, values.area ?? null, values.postcode.toUpperCase(),
        values.property_type, values.bedrooms, values.bathrooms, values.price_pence,
        values.furnished ?? null, values.pets_allowed, values.epc_rating ?? null,
        JSON.stringify(values.features), values.description ?? null, values.available_from ?? null,
        timestamp, timestamp,
      ]
    );

    db.run(
      `INSERT INTO activity (id, agency_id, user_id, entity, entity_id, action, detail, created_at)
       VALUES (?,?,?,'property',?,'created',?,?)`,
      [uuid(), req.agencyId, req.user.id, id, `${reference} — ${values.line1}`, timestamp]
    );

    res.status(201).json({ property: shape(db.get('SELECT * FROM properties WHERE id = ?', [id])) });
  })
);

router.patch(
  '/:id/status',
  wrap((req, res) => {
    const { status } = validate(req.body, {
      status: {
        required: true,
        oneOf: ['available', 'under_offer', 'let_agreed', 'sold', 'withdrawn'],
      },
    });

    const property = db.get('SELECT id, reference FROM properties WHERE id = ? AND agency_id = ?', [
      req.params.id,
      req.agencyId,
    ]);
    if (!property) throw notFound('That property');

    db.run('UPDATE properties SET status = ?, updated_at = ? WHERE id = ?', [
      status,
      now(),
      property.id,
    ]);
    db.run(
      `INSERT INTO activity (id, agency_id, user_id, entity, entity_id, action, detail, created_at)
       VALUES (?,?,?,'property',?,'status',?,?)`,
      [uuid(), req.agencyId, req.user.id, property.id, status, now()]
    );

    res.json({ ok: true, status });
  })
);

export default router;
