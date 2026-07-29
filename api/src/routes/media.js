import { Router } from 'express';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { wrap, notFound, badRequest } from '../lib/http.js';
import { uuid, now } from '../lib/helpers.js';

const router = Router();
const directory = resolve(process.cwd(), config.uploadDir);
mkdirSync(directory, { recursive: true });

const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, directory),
    filename: (req, file, cb) => cb(null, `${uuid()}${extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
  fileFilter: (req, file, cb) => {
    // Trust the extension and the mime type, and only accept both.
    const ok = ALLOWED.has(extname(file.originalname).toLowerCase()) &&
      file.mimetype.startsWith('image/');
    cb(ok ? null : new Error('Only JPEG, PNG, WebP or AVIF images are accepted.'), ok);
  },
});

router.get(
  '/:propertyId',
  wrap((req, res) => {
    res.json({
      media: db.all(
        'SELECT * FROM property_media WHERE property_id = ? AND agency_id = ? ORDER BY position, created_at',
        [req.params.propertyId, req.agencyId]
      ),
    });
  })
);

/**
 * Multer throws for the wrong file type or an oversized upload. Left alone
 * those surface as a 500, which tells the agent nothing. Translate them.
 */
const receivePhotos = (req, res, next) =>
  upload.array('photos', 12)(req, res, (error) => {
    if (!error) return next();
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Each photograph must be under 8MB.'
      : error.code === 'LIMIT_FILE_COUNT'
        ? 'Twelve photographs at a time is the limit.'
        : error.message || 'That file could not be accepted.';
    return next(badRequest(message, ['photos']));
  });

router.post(
  '/:propertyId',
  receivePhotos,
  wrap((req, res) => {
    const property = db.get('SELECT id FROM properties WHERE id = ? AND agency_id = ?', [
      req.params.propertyId,
      req.agencyId,
    ]);
    if (!property) throw notFound('That property');
    if (!req.files?.length) throw badRequest('No photographs were uploaded.', ['photos']);

    const existing = db.get(
      'SELECT COUNT(*) AS n FROM property_media WHERE property_id = ?',
      [property.id]
    );
    let position = existing?.n || 0;

    const saved = req.files.map((file) => {
      const id = uuid();
      const url = `${config.publicUrl}/uploads/${file.filename}`;
      db.run(
        `INSERT INTO property_media
          (id, agency_id, property_id, filename, url, position, is_primary, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [id, req.agencyId, property.id, file.filename, url, position,
         position === 0 ? 1 : 0, now()]
      );
      position += 1;
      return { id, url, filename: file.filename };
    });

    res.status(201).json({ media: saved });
  })
);

router.delete(
  '/:id',
  wrap((req, res) => {
    const media = db.get('SELECT id FROM property_media WHERE id = ? AND agency_id = ?', [
      req.params.id,
      req.agencyId,
    ]);
    if (!media) throw notFound('That photograph');
    db.run('DELETE FROM property_media WHERE id = ?', [media.id]);
    res.json({ ok: true });
  })
);

export default router;
