import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap, validate, notFound } from '../lib/http.js';
import { uuid, now } from '../lib/helpers.js';
import { chunkDocument, answerQuestion } from '../services/retrieval.js';

const router = Router();

router.get(
  '/',
  wrap((req, res) => {
    const documents = db.all(
      `SELECT d.*, p.reference, p.line1,
              (SELECT COUNT(*) FROM document_chunks WHERE document_id = d.id) AS chunk_count
         FROM documents d
         LEFT JOIN properties p ON p.id = d.property_id
        WHERE d.agency_id = ?
        ORDER BY d.created_at DESC`,
      [req.agencyId]
    );
    res.json({ documents });
  })
);

/**
 * Ingest. Text in, chunks out, indexed and ready to answer questions.
 * Phase 2 puts OCR in front of this so a scanned PDF arrives as text; the
 * chunking and retrieval below do not change.
 */
router.post(
  '/',
  wrap((req, res) => {
    const values = validate(req.body, {
      title: { required: true, max: 200 },
      kind: { oneOf: ['tenancy', 'hoa', 'management', 'epc', 'other'], default: 'other' },
      property_id: {},
      text: { required: true, max: 400000 },
    });

    const chunks = chunkDocument(values.text);
    const pageCount = chunks.reduce((max, c) => Math.max(max, c.page), 0);
    const id = uuid();
    const timestamp = now();

    db.transaction(() => {
      db.run(
        `INSERT INTO documents (id, agency_id, property_id, title, kind, page_count, created_at)
         VALUES (?,?,?,?,?,?,?)`,
        [id, req.agencyId, values.property_id ?? null, values.title, values.kind, pageCount, timestamp]
      );

      chunks.forEach((chunk) => {
        db.run(
          `INSERT INTO document_chunks
            (id, agency_id, document_id, page, paragraph, ordinal, content, token_count)
           VALUES (?,?,?,?,?,?,?,?)`,
          [chunk.id, req.agencyId, id, chunk.page, chunk.paragraph, chunk.ordinal,
           chunk.content, chunk.token_count]
        );
      });
    });

    res.status(201).json({ document_id: id, chunks: chunks.length, pages: pageCount });
  })
);

/** Ask a question. Returns an extractive answer plus page-level citations. */
router.post(
  '/:id/ask',
  wrap((req, res) => {
    const { question } = validate(req.body, { question: { required: true, max: 500 } });

    const document = db.get('SELECT * FROM documents WHERE id = ? AND agency_id = ?', [
      req.params.id,
      req.agencyId,
    ]);
    if (!document) throw notFound('That document');

    const chunks = db.all(
      'SELECT id, page, paragraph, ordinal, content FROM document_chunks WHERE document_id = ? ORDER BY ordinal',
      [document.id]
    );

    const result = answerQuestion(chunks, question);

    res.json({
      document: { id: document.id, title: document.title, pages: document.page_count },
      question,
      ...result,
    });
  })
);

export default router;
