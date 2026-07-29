import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap, validate, notFound, badRequest } from '../lib/http.js';
import { uuid, now } from '../lib/helpers.js';

const router = Router();

router.get(
  '/',
  wrap((req, res) => {
    const { from, to } = req.query;
    let sql = `SELECT v.*, p.reference, p.line1, p.postcode,
                      c.first_name, c.last_name, c.phone,
                      u.name AS negotiator
                 FROM viewings v
                 JOIN properties p ON p.id = v.property_id
                 JOIN contacts c ON c.id = v.contact_id
                 LEFT JOIN users u ON u.id = v.user_id
                WHERE v.agency_id = ?`;
    const params = [req.agencyId];

    if (from) {
      sql += ' AND v.starts_at >= ?';
      params.push(from);
    }
    if (to) {
      sql += ' AND v.starts_at <= ?';
      params.push(to);
    }

    sql += ' ORDER BY v.starts_at ASC';
    res.json({ viewings: db.all(sql, params) });
  })
);

router.post(
  '/',
  wrap((req, res) => {
    const values = validate(req.body, {
      property_id: { required: true },
      contact_id: { required: true },
      starts_at: { required: true },
      duration_min: { type: 'number', default: 30 },
      user_id: {},
    });

    const property = db.get('SELECT id FROM properties WHERE id = ? AND agency_id = ?', [
      values.property_id,
      req.agencyId,
    ]);
    if (!property) throw notFound('That property');

    const contact = db.get('SELECT id FROM contacts WHERE id = ? AND agency_id = ?', [
      values.contact_id,
      req.agencyId,
    ]);
    if (!contact) throw notFound('That contact');

    const start = new Date(values.starts_at);
    if (Number.isNaN(start.getTime())) throw badRequest('That is not a valid date and time.', ['starts_at']);

    // Double-booking check: a negotiator cannot be in two houses at once.
    const negotiator = values.user_id || req.user.id;
    const end = new Date(start.getTime() + values.duration_min * 60000);
    const clash = db.all(
      `SELECT id, starts_at, duration_min FROM viewings
        WHERE agency_id = ? AND user_id = ? AND status IN ('booked','attended')`,
      [req.agencyId, negotiator]
    ).find((existing) => {
      const existingStart = new Date(existing.starts_at);
      const existingEnd = new Date(existingStart.getTime() + existing.duration_min * 60000);
      return start < existingEnd && existingStart < end;
    });

    if (clash) {
      throw badRequest(
        `That negotiator already has a viewing at ${new Date(clash.starts_at).toLocaleString('en-GB')}.`,
        ['starts_at']
      );
    }

    const id = uuid();
    db.run(
      `INSERT INTO viewings
        (id, agency_id, property_id, contact_id, user_id, starts_at, duration_min, status, created_at)
       VALUES (?,?,?,?,?,?,?,'booked',?)`,
      [id, req.agencyId, values.property_id, values.contact_id, negotiator,
       start.toISOString(), values.duration_min, now()]
    );

    res.status(201).json({ viewing: db.get('SELECT * FROM viewings WHERE id = ?', [id]) });
  })
);

router.patch(
  '/:id',
  wrap((req, res) => {
    const values = validate(req.body, {
      status: { oneOf: ['booked', 'attended', 'no_show', 'cancelled'] },
      feedback: { max: 2000 },
    });

    const viewing = db.get('SELECT id FROM viewings WHERE id = ? AND agency_id = ?', [
      req.params.id,
      req.agencyId,
    ]);
    if (!viewing) throw notFound('That viewing');

    if (values.status) {
      db.run('UPDATE viewings SET status = ? WHERE id = ?', [values.status, viewing.id]);
    }
    if (values.feedback !== undefined) {
      db.run('UPDATE viewings SET feedback = ? WHERE id = ?', [values.feedback, viewing.id]);
    }

    res.json({ viewing: db.get('SELECT * FROM viewings WHERE id = ?', [viewing.id]) });
  })
);

export default router;
