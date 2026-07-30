import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap, validate, notFound, badRequest } from '../lib/http.js';
import { uuid, now, parseJson } from '../lib/helpers.js';
import { takeTurn, openingMessage, messageRow, STATES, STATE_LABEL } from '../services/concierge.js';
import { freeSlots, matchSlot } from '../services/slots.js';
import { provider } from '../services/ai/provider.js';

const router = Router();

const hydrate = (row) => ({
  ...row,
  facts: parseJson(row.facts, {}),
  escalated: Boolean(row.escalated),
  sensitive: Boolean(row.sensitive),
});

const insertMessage = (row) =>
  db.run(
    `INSERT INTO conversation_messages
      (id, agency_id, conversation_id, role, body, state_before, state_after, reason, guardrail, provider, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [row.id, row.agency_id, row.conversation_id, row.role, row.body,
     row.state_before, row.state_after, row.reason, row.guardrail, row.provider, row.created_at]
  );

router.get(
  '/meta',
  wrap((req, res) => {
    res.json({
      states: STATES.map((state) => ({ id: state, label: STATE_LABEL[state] })),
      provider: provider.name,
    });
  })
);

router.get(
  '/',
  wrap((req, res) => {
    const rows = db.all(
      `SELECT c.*, p.reference, p.line1,
              (SELECT body FROM conversation_messages
                WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
              (SELECT COUNT(*) FROM conversation_messages WHERE conversation_id = c.id) AS turns
         FROM conversations c
         LEFT JOIN properties p ON p.id = c.property_id
        WHERE c.agency_id = ?
        ORDER BY c.escalated DESC, c.updated_at DESC`,
      [req.agencyId]
    );

    res.json({
      summary: {
        live: rows.filter((r) => !r.escalated && r.state !== 'BOOKED').length,
        booked: rows.filter((r) => r.state === 'BOOKED').length,
        escalated: rows.filter((r) => r.escalated).length,
        sensitive: rows.filter((r) => r.sensitive).length,
      },
      conversations: rows.map(hydrate),
    });
  })
);

router.get(
  '/:id',
  wrap((req, res) => {
    const conversation = db.get('SELECT * FROM conversations WHERE id = ? AND agency_id = ?', [
      req.params.id,
      req.agencyId,
    ]);
    if (!conversation) throw notFound('That conversation');

    const messages = db.all(
      'SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [conversation.id]
    ).map((row) => ({ ...row, guardrail: parseJson(row.guardrail, null) }));

    const property = conversation.property_id
      ? db.get('SELECT * FROM properties WHERE id = ?', [conversation.property_id])
      : null;

    res.json({
      conversation: hydrate(conversation),
      property,
      messages,
      slots: conversation.state === 'OFFER_SLOTS' ? freeSlots(req.agencyId) : [],
    });
  })
);

/** Start a new enquiry. In production this is a portal webhook, not a button. */
router.post(
  '/',
  wrap((req, res) => {
    const values = validate(req.body, {
      handle: { required: true, max: 60 },
      property_id: {},
      source: { max: 60, default: 'Portal enquiry' },
      display_name: { max: 80 },
      message: { max: 1000 },
    });

    const property = values.property_id
      ? db.get('SELECT * FROM properties WHERE id = ? AND agency_id = ?', [values.property_id, req.agencyId])
      : null;

    const id = uuid();
    const timestamp = now();

    db.run(
      `INSERT INTO conversations
        (id, agency_id, property_id, channel, handle, display_name, source, state, facts,
         attempts, escalated, sensitive, provider, created_at, updated_at)
       VALUES (?,?,?,'sms',?,?,?,'GREETING','{}',0,0,0,?,?,?)`,
      [id, req.agencyId, property?.id ?? null, values.handle, values.display_name ?? null,
       values.source, provider.name, timestamp, timestamp]
    );

    if (values.message) {
      insertMessage(messageRow({
        agencyId: req.agencyId, conversationId: id, role: 'enquirer', body: values.message,
      }));
    }

    const opening = openingMessage({ property });
    insertMessage(messageRow({
      agencyId: req.agencyId, conversationId: id, role: 'assistant', body: opening,
      stateBefore: 'GREETING', stateAfter: 'GREETING',
      reason: 'Opening message; nothing to qualify yet', provider: 'scripted',
    }));

    res.status(201).json({ conversation_id: id });
  })
);

/** One inbound message from the enquirer, one reply out. */
router.post(
  '/:id/messages',
  wrap(async (req, res) => {
    const { body } = validate(req.body, { body: { required: true, max: 2000 } });

    const row = db.get('SELECT * FROM conversations WHERE id = ? AND agency_id = ?', [
      req.params.id,
      req.agencyId,
    ]);
    if (!row) throw notFound('That conversation');
    const conversation = hydrate(row);

    const property = conversation.property_id
      ? db.get('SELECT * FROM properties WHERE id = ?', [conversation.property_id])
      : null;
    const history = db.all(
      'SELECT role, body FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [conversation.id]
    );
    const slots = freeSlots(req.agencyId);

    insertMessage(messageRow({
      agencyId: req.agencyId, conversationId: conversation.id, role: 'enquirer', body,
    }));

    const turn = await takeTurn({ conversation, property, history, slots, enquirerText: body });

    // If they picked a slot, book it for real — a confirmation that is not in
    // the diary is a lie the agent finds out about on the doorstep.
    let booking = null;
    if (conversation.state === 'OFFER_SLOTS') {
      const chosen = matchSlot(body, slots);
      if (chosen) {
        turn.facts.booked_slot = chosen.label;
        turn.state = 'BOOKED';
        turn.reason = `Advanced to Viewing booked: matched "${chosen.label}" in the live diary`;
        booking = chosen;
        turn.reply = `That is booked in for ${chosen.label}. Someone from the office will meet you there — you will get a confirmation shortly.`;
      }
    }

    db.run(
      `UPDATE conversations SET state = ?, facts = ?, attempts = ?, escalated = ?,
              escalation_reason = ?, sensitive = ?, updated_at = ? WHERE id = ?`,
      [turn.state, JSON.stringify(turn.facts), turn.attempts, turn.escalated,
       turn.escalationReason ?? null, turn.sensitive ?? 0, now(), conversation.id]
    );

    // A null reply means the machine deliberately stayed silent.
    insertMessage(messageRow({
      agencyId: req.agencyId, conversationId: conversation.id,
      role: turn.reply ? 'assistant' : 'system',
      body: turn.reply || 'No automated reply sent — a person owns this conversation.',
      stateBefore: conversation.state, stateAfter: turn.state,
      reason: turn.reason, guardrail: turn.guardrail, provider: turn.provider,
    }));

    // Booking creates a real contact and a real viewing.
    if (booking) {
      let contactId = conversation.contact_id;
      if (!contactId) {
        contactId = uuid();
        const name = (turn.facts.name || conversation.display_name || 'Portal enquiry').split(' ');
        db.run(
          `INSERT INTO contacts (id, agency_id, kind, first_name, last_name, phone, notes, created_at)
           VALUES (?,?,'applicant',?,?,?,?,?)`,
          [contactId, req.agencyId, name[0], name.slice(1).join(' ') || '—',
           conversation.handle, `Qualified by the concierge: ${JSON.stringify(turn.facts)}`, now()]
        );
        db.run('UPDATE conversations SET contact_id = ? WHERE id = ?', [contactId, conversation.id]);
      }

      if (conversation.property_id) {
        db.run(
          `INSERT INTO viewings
            (id, agency_id, property_id, contact_id, user_id, starts_at, duration_min, status, created_at)
           VALUES (?,?,?,?,?,?,30,'booked',?)`,
          [uuid(), req.agencyId, conversation.property_id, contactId, req.user.id,
           booking.iso, now()]
        );
      }

      db.run(
        `INSERT INTO activity (id, agency_id, user_id, entity, entity_id, action, detail, created_at)
         VALUES (?,?,?,'conversation',?,'booked',?,?)`,
        [uuid(), req.agencyId, req.user.id, conversation.id,
         `Concierge booked a viewing for ${booking.label}`, now()]
      );
    }

    res.json({
      reply: turn.reply,
      state: turn.state,
      state_label: STATE_LABEL[turn.state],
      reason: turn.reason,
      facts: turn.facts,
      guardrail: turn.guardrail,
      provider: turn.provider,
      escalated: Boolean(turn.escalated),
      sensitive: Boolean(turn.sensitive),
      booked: booking,
    });
  })
);

/** A person takes over. Automation stops for good on this thread. */
router.post(
  '/:id/handover',
  wrap((req, res) => {
    const { note } = validate(req.body, { note: { max: 400 } });
    const conversation = db.get('SELECT id FROM conversations WHERE id = ? AND agency_id = ?', [
      req.params.id,
      req.agencyId,
    ]);
    if (!conversation) throw notFound('That conversation');

    db.run(
      `UPDATE conversations SET state = 'HANDOVER', escalated = 1, escalation_reason = ?, updated_at = ?
        WHERE id = ?`,
      [note || `Taken over by ${req.user.name}`, now(), conversation.id]
    );

    insertMessage(messageRow({
      agencyId: req.agencyId, conversationId: conversation.id, role: 'system',
      body: `${req.user.name} took over this conversation.`,
      stateAfter: 'HANDOVER', reason: note || 'Manual handover', provider: 'staff',
    }));

    res.json({ ok: true });
  })
);

export default router;
