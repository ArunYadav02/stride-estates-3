import { randomUUID } from 'node:crypto';

export const uuid = () => randomUUID();
export const now = () => new Date().toISOString();

/** Money is stored in pence so nothing is ever 0.30000000000000004. */
export const toPence = (pounds) => Math.round(Number(pounds) * 100);
export const toPounds = (pence) => (Number(pence || 0) / 100);

export const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
};

/** Anything the client sends that should be a list of strings. */
export const asArray = (value) =>
  Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : [];

export const daysBetween = (from, to) =>
  Math.round((new Date(to) - new Date(from)) / 86400000);
