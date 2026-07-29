import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/http.js';
import { now, daysBetween } from '../lib/helpers.js';

const router = Router();

router.get(
  '/',
  wrap((req, res) => {
    const agencyId = req.agencyId;
    const today = now().slice(0, 10);
    const count = (sql, params = []) => db.get(sql, [agencyId, ...params])?.n || 0;

    const stock = db.all(
      'SELECT status, listing_type, COUNT(*) AS n FROM properties WHERE agency_id = ? GROUP BY status, listing_type',
      [agencyId]
    );

    const upcoming = db.all(
      `SELECT v.id, v.starts_at, v.status, p.reference, p.line1, c.first_name, c.last_name
         FROM viewings v
         JOIN properties p ON p.id = v.property_id
         JOIN contacts c ON c.id = v.contact_id
        WHERE v.agency_id = ? AND v.starts_at >= ? AND v.status = 'booked'
        ORDER BY v.starts_at ASC LIMIT 6`,
      [agencyId, now()]
    );

    const certificates = db.all(
      `SELECT cert.kind, cert.reference, cert.expires_on,
              p.reference AS property_reference, p.line1
         FROM certificates cert JOIN properties p ON p.id = cert.property_id
        WHERE cert.agency_id = ? ORDER BY cert.expires_on ASC LIMIT 8`,
      [agencyId]
    ).map((row) => ({ ...row, days_remaining: daysBetween(today, row.expires_on) }));

    const activity = db.all(
      `SELECT a.*, u.name AS user_name FROM activity a
         LEFT JOIN users u ON u.id = a.user_id
        WHERE a.agency_id = ? ORDER BY a.created_at DESC LIMIT 8`,
      [agencyId]
    );

    res.json({
      counts: {
        available: count("SELECT COUNT(*) AS n FROM properties WHERE agency_id = ? AND status = 'available'"),
        under_offer: count("SELECT COUNT(*) AS n FROM properties WHERE agency_id = ? AND status IN ('under_offer','let_agreed')"),
        applicants: count("SELECT COUNT(*) AS n FROM contacts WHERE agency_id = ? AND kind = 'applicant'"),
        viewings_week: count(
          'SELECT COUNT(*) AS n FROM viewings WHERE agency_id = ? AND starts_at >= ? AND starts_at <= ?',
          [now(), new Date(Date.now() + 7 * 86400000).toISOString()]
        ),
        compliance_alerts: certificates.filter((c) => c.days_remaining <= 30).length,
        open_maintenance: count("SELECT COUNT(*) AS n FROM maintenance_tickets WHERE agency_id = ? AND status != 'resolved'"),
      },
      stock,
      upcoming,
      certificates,
      activity,
    });
  })
);

export default router;
