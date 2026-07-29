import { readToken } from '../lib/auth.js';
import { unauthorized, forbidden } from '../lib/http.js';
import { db } from '../db/index.js';

/**
 * Attaches req.user and req.agencyId. Every query downstream filters by
 * req.agencyId — that single habit is what keeps one agency's data out of
 * another's, and it is never optional.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());

  try {
    const claims = readToken(token);
    const user = db.get(
      'SELECT id, agency_id, email, name, role FROM users WHERE id = ?',
      [claims.sub]
    );
    if (!user) return next(unauthorized('That account no longer exists.'));
    req.user = user;
    req.agencyId = user.agency_id;
    return next();
  } catch (error) {
    return next(unauthorized('Your session has expired. Sign in again.'));
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : next(forbidden('Your role cannot do that.'));
