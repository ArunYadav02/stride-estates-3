import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap, validate, notFound } from '../lib/http.js';
import { uuid, now, daysBetween } from '../lib/helpers.js';

const router = Router();

const LABELS = {
  epc: 'EPC',
  gas_safety: 'Gas safety',
  eicr: 'EICR (electrical)',
  right_to_rent: 'Right to Rent',
  deposit_protection: 'Deposit protection',
  insurance: 'Insurance',
};

/**
 * Everything a landlord can be fined for, sorted by how soon it bites.
 * Three buckets, because "expires in 90 days" and "expired last week" are not
 * the same problem and should never sit in the same list.
 */
router.get(
  '/',
  wrap((req, res) => {
    const today = now().slice(0, 10);

    const rows = db.all(
      `SELECT cert.*, p.reference AS property_reference, p.line1, p.postcode,
              p.status AS property_status
         FROM certificates cert
         JOIN properties p ON p.id = cert.property_id
        WHERE cert.agency_id = ?
        ORDER BY cert.expires_on ASC`,
      [req.agencyId]
    );

    const items = rows.map((row) => {
      const days = daysBetween(today, row.expires_on);
      return {
        ...row,
        label: LABELS[row.kind] || row.kind,
        days_remaining: days,
        severity: days < 0 ? 'expired' : days <= 30 ? 'urgent' : days <= 90 ? 'soon' : 'ok',
      };
    });

    res.json({
      summary: {
        expired: items.filter((i) => i.severity === 'expired').length,
        urgent: items.filter((i) => i.severity === 'urgent').length,
        soon: items.filter((i) => i.severity === 'soon').length,
        ok: items.filter((i) => i.severity === 'ok').length,
      },
      items,
    });
  })
);

router.post(
  '/',
  wrap((req, res) => {
    const values = validate(req.body, {
      property_id: { required: true },
      kind: { required: true, oneOf: Object.keys(LABELS) },
      reference: { max: 120 },
      issued_on: { max: 40 },
      expires_on: { required: true, max: 40 },
    });

    const property = db.get('SELECT id FROM properties WHERE id = ? AND agency_id = ?', [
      values.property_id,
      req.agencyId,
    ]);
    if (!property) throw notFound('That property');

    const id = uuid();
    db.run(
      `INSERT INTO certificates
        (id, agency_id, property_id, kind, reference, issued_on, expires_on, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, req.agencyId, values.property_id, values.kind, values.reference ?? null,
       values.issued_on ?? null, values.expires_on, now()]
    );

    res.status(201).json({ certificate: db.get('SELECT * FROM certificates WHERE id = ?', [id]) });
  })
);

export default router;
