import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * Passwords are hashed with scrypt and a per-user salt. Never store or log the
 * plaintext, and never compare hashes with === (timing leaks).
 */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export const signToken = (user) =>
  jwt.sign(
    { sub: user.id, agency: user.agency_id, role: user.role },
    config.jwtSecret,
    { expiresIn: '12h' }
  );

export const readToken = (token) => jwt.verify(token, config.jwtSecret);
