import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap, validate, notFound } from '../lib/http.js';
import { uuid, now, parseJson } from '../lib/helpers.js';
import { assessChain, MILESTONES } from '../services/chain.js';

const router = Router();

router.get(
  '/',
  wrap((req, res) => {
    const chains = db.all('SELECT * FROM chains WHERE agency_id = ? ORDER BY created_at DESC', [req.agencyId]);

    const assessed = chains.map((chain) => {
      const links = db.all('SELECT * FROM chain_links WHERE chain_id = ? ORDER BY position', [chain.id]);
      return assessChain(chain, links);
    });

    const offers = db.all(
      `SELECT o.*, p.reference, p.line1, p.price_pence AS asking_pence,
              c.first_name, c.last_name
         FROM offers o
         JOIN properties p ON p.id = o.property_id
         LEFT JOIN contacts c ON c.id = o.contact_id
        WHERE o.agency_id = ?
        ORDER BY o.created_at DESC`,
      [req.agencyId]
    );

    const accepted = offers.filter((offer) => offer.status === 'accepted');

    res.json({
      milestones: MILESTONES,
      summary: {
        agreed: accepted.length,
        pipeline_pence: accepted.reduce((sum, offer) => sum + offer.amount_pence, 0),
        chains_at_risk: assessed.filter((chain) => chain.at_risk).length,
        ready_to_exchange: assessed.filter((chain) => chain.ready_to_exchange).length,
        longest_days: Math.max(0, ...assessed.map((chain) => chain.oldest_days)),
      },
      chains: assessed,
      offers,
    });
  })
);

router.post(
  '/offers',
  wrap((req, res) => {
    const values = validate(req.body, {
      property_id: { required: true },
      contact_id: {},
      amount_pence: { required: true, type: 'number' },
      position: { oneOf: ['cash', 'mortgage_agreed', 'needs_mortgage', 'chain', 'chain_free', 'tenant'] },
      note: { max: 500 },
    });

    const property = db.get('SELECT id, reference FROM properties WHERE id = ? AND agency_id = ?', [
      values.property_id,
      req.agencyId,
    ]);
    if (!property) throw notFound('That property');

    const id = uuid();
    const timestamp = now();
    db.run(
      `INSERT INTO offers
        (id, agency_id, property_id, contact_id, amount_pence, status, position, note, created_at, updated_at)
       VALUES (?,?,?,?,?,'pending',?,?,?,?)`,
      [id, req.agencyId, values.property_id, values.contact_id ?? null, values.amount_pence,
       values.position ?? null, values.note ?? null, timestamp, timestamp]
    );

    res.status(201).json({ offer: db.get('SELECT * FROM offers WHERE id = ?', [id]) });
  })
);

router.patch(
  '/offers/:id',
  wrap((req, res) => {
    const { status } = validate(req.body, {
      status: { required: true, oneOf: ['pending', 'accepted', 'declined', 'withdrawn'] },
    });

    const offer = db.get('SELECT * FROM offers WHERE id = ? AND agency_id = ?', [req.params.id, req.agencyId]);
    if (!offer) throw notFound('That offer');

    db.run('UPDATE offers SET status = ?, updated_at = ? WHERE id = ?', [status, now(), offer.id]);

    // Accepting an offer moves the property, because leaving it "available"
    // after an accepted offer is how two buyers end up viewing the same house.
    if (status === 'accepted') {
      db.run("UPDATE properties SET status = 'under_offer', updated_at = ? WHERE id = ?",
        [now(), offer.property_id]);
    }

    db.run(
      `INSERT INTO activity (id, agency_id, user_id, entity, entity_id, action, detail, created_at)
       VALUES (?,?,?,'offer',?,?,?,?)`,
      [uuid(), req.agencyId, req.user.id, offer.id, status,
       `£${(offer.amount_pence / 100).toLocaleString('en-GB')}`, now()]
    );

    res.json({ ok: true, status });
  })
);

/** Move one milestone on one link. This is the whole progression workflow. */
router.patch(
  '/links/:id',
  wrap((req, res) => {
    const values = validate(req.body, {
      milestone: { required: true, oneOf: MILESTONES.map((m) => m.id) },
      status: { required: true, oneOf: ['todo', 'active', 'blocked', 'done'] },
      stage_note: { max: 300 },
    });

    const link = db.get('SELECT * FROM chain_links WHERE id = ? AND agency_id = ?', [
      req.params.id,
      req.agencyId,
    ]);
    if (!link) throw notFound('That chain link');

    const milestones = parseJson(link.milestones, {});
    milestones[values.milestone] = values.status;

    db.run(
      'UPDATE chain_links SET milestones = ?, stage_note = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(milestones), values.stage_note ?? link.stage_note, now(), link.id]
    );

    res.json({ ok: true, milestones });
  })
);

export default router;
