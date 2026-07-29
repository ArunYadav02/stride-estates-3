import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap, validate, notFound } from '../lib/http.js';
import { uuid, now } from '../lib/helpers.js';

const router = Router();

// Response targets an agency can be held to. Urgent means somebody is cold,
// wet or unsafe tonight.
const TARGET_HOURS = { urgent: 24, normal: 14 * 24, low: 30 * 24 };

router.get(
  '/',
  wrap((req, res) => {
    const rows = db.all(
      `SELECT t.*, p.reference, p.line1, p.postcode,
              c.first_name, c.last_name
         FROM maintenance_tickets t
         JOIN properties p ON p.id = t.property_id
         LEFT JOIN contacts c ON c.id = t.raised_by
        WHERE t.agency_id = ?
        ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
                 t.created_at ASC`,
      [req.agencyId]
    );

    const items = rows.map((row) => {
      const ageHours = (Date.now() - new Date(row.created_at).getTime()) / 3600000;
      const target = TARGET_HOURS[row.priority] || TARGET_HOURS.normal;
      return {
        ...row,
        age_hours: Math.round(ageHours),
        breaching: row.status !== 'resolved' && ageHours > target,
        target_hours: target,
      };
    });

    res.json({
      summary: {
        open: items.filter((i) => i.status !== 'resolved').length,
        urgent: items.filter((i) => i.priority === 'urgent' && i.status !== 'resolved').length,
        breaching: items.filter((i) => i.breaching).length,
        resolved: items.filter((i) => i.status === 'resolved').length,
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
      title: { required: true, max: 200 },
      detail: { max: 4000 },
      priority: { oneOf: ['low', 'normal', 'urgent'], default: 'normal' },
      raised_by: {},
    });

    const property = db.get('SELECT id FROM properties WHERE id = ? AND agency_id = ?', [
      values.property_id,
      req.agencyId,
    ]);
    if (!property) throw notFound('That property');

    const id = uuid();
    const timestamp = now();
    db.run(
      `INSERT INTO maintenance_tickets
        (id, agency_id, property_id, raised_by, title, detail, priority, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,'open',?,?)`,
      [id, req.agencyId, property.id, values.raised_by ?? null, values.title,
       values.detail ?? null, values.priority, timestamp, timestamp]
    );

    res.status(201).json({ ticket: db.get('SELECT * FROM maintenance_tickets WHERE id = ?', [id]) });
  })
);

router.patch(
  '/:id',
  wrap((req, res) => {
    const values = validate(req.body, {
      status: { oneOf: ['open', 'assigned', 'scheduled', 'resolved'] },
      priority: { oneOf: ['low', 'normal', 'urgent'] },
      cost_pence: { type: 'number' },
    });

    const ticket = db.get('SELECT id FROM maintenance_tickets WHERE id = ? AND agency_id = ?', [
      req.params.id,
      req.agencyId,
    ]);
    if (!ticket) throw notFound('That ticket');

    Object.entries(values).forEach(([key, value]) => {
      db.run(`UPDATE maintenance_tickets SET ${key} = ?, updated_at = ? WHERE id = ?`,
        [value, now(), ticket.id]);
    });

    res.json({ ticket: db.get('SELECT * FROM maintenance_tickets WHERE id = ?', [ticket.id]) });
  })
);

export default router;
