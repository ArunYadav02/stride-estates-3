import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../db/index.js';
import { verifyPassword, signToken } from '../lib/auth.js';
import { wrap, validate, unauthorized } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

router.post(
  '/login',
  loginLimiter,
  wrap((req, res) => {
    const { email, password } = validate(req.body, {
      email: { required: true, max: 200 },
      password: { required: true, max: 200 },
    });

    const user = db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    // Same message either way — do not tell an attacker which emails exist.
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw unauthorized('That email and password do not match.');
    }

    const agency = db.get('SELECT id, name, plan FROM agencies WHERE id = ?', [user.agency_id]);

    res.json({
      token: signToken(user),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      agency,
    });
  })
);

router.get(
  '/me',
  requireAuth,
  wrap((req, res) => {
    const agency = db.get('SELECT id, name, plan FROM agencies WHERE id = ?', [req.agencyId]);
    res.json({ user: req.user, agency });
  })
);

export default router;
