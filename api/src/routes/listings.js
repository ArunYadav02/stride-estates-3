import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap, validate, notFound } from '../lib/http.js';
import { uuid, now, parseJson } from '../lib/helpers.js';
import { extractFeatures, writeCopy, auditCopy, TONE_OPTIONS } from '../services/ai/listing.js';
import { provider } from '../services/ai/provider.js';
import { checkMaterialInformation } from '../services/materialInfo.js';

const router = Router();

router.get(
  '/options',
  wrap((req, res) => {
    res.json({
      tones: TONE_OPTIONS,
      provider: provider.name,
      vision: provider.canSeeImages,
    });
  })
);

router.get(
  '/',
  wrap((req, res) => {
    const rows = db.all(
      `SELECT l.*, p.reference, p.line1 FROM listings l
         LEFT JOIN properties p ON p.id = l.property_id
        WHERE l.agency_id = ? ORDER BY l.created_at DESC LIMIT 30`,
      [req.agencyId]
    );
    res.json({ listings: rows.map((row) => ({ ...row, features: parseJson(row.features, []) })) });
  })
);

/** Photos + facts in, three pieces of marketing copy out. */
router.post(
  '/generate',
  wrap(async (req, res) => {
    const values = validate(req.body, {
      property_id: { required: true },
      tone: { oneOf: ['balanced', 'family', 'luxury', 'investor'], default: 'balanced' },
      hints: { type: 'array', default: [] },
    });

    const row = db.get('SELECT * FROM properties WHERE id = ? AND agency_id = ?', [
      values.property_id,
      req.agencyId,
    ]);
    if (!row) throw notFound('That property');

    const property = { ...row, features: parseJson(row.features, []) };
    const media = db.all(
      'SELECT url FROM property_media WHERE property_id = ? ORDER BY position LIMIT 10',
      [property.id]
    );

    // Stage 1 — look.
    const extraction = await extractFeatures({
      imageUrls: media.map((m) => m.url),
      property,
      hints: values.hints,
    });

    // Stage 2 — write.
    const { copy, provider: usedProvider, fellBack } = await writeCopy({
      property,
      features: extraction.features,
      tone: values.tone,
    });

    const breaches = auditCopy(copy);
    const id = uuid();

    db.run(
      `INSERT INTO listings
        (id, agency_id, property_id, user_id, tone, provider, features,
         portal_copy, social_copy, email_copy, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.agencyId, property.id, req.user.id, values.tone, usedProvider,
       JSON.stringify(extraction.features), copy.portal, copy.social, copy.email, now()]
    );

    res.json({
      id,
      copy,
      features: extraction.features,
      photos_analysed: provider.canSeeImages ? media.length : 0,
      extraction_note: extraction.note,
      provider: usedProvider,
      fell_back: Boolean(fellBack),
      compliance: {
        passed: breaches.length === 0,
        breaches,
      },
      // Checked against the record, not the copy: a beautifully written listing
      // with no council tax band is still one a portal will reject.
      material_information: checkMaterialInformation(row),
    });
  })
);

export default router;
