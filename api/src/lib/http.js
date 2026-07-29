/** Thrown anywhere in a route; turned into a clean JSON response. */
export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const badRequest = (message, fields) => new ApiError(400, message, fields);
export const unauthorized = (message = 'Not signed in.') => new ApiError(401, message);
export const forbidden = (message = 'Not allowed.') => new ApiError(403, message);
export const notFound = (what = 'That') => new ApiError(404, `${what} was not found.`);

/** Lets route handlers be async without a try/catch in every one. */
export const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

/** Small validation helper — returns cleaned values or throws with field names. */
export function validate(body, rules) {
  const values = {};
  const fields = [];

  for (const [key, rule] of Object.entries(rules)) {
    const raw = body?.[key];
    const missing = raw === undefined || raw === null || raw === '';

    if (missing) {
      if (rule.required) fields.push(key);
      else if (rule.default !== undefined) values[key] = rule.default;
      continue;
    }

    if (rule.type === 'number') {
      const n = Number(raw);
      if (Number.isNaN(n)) fields.push(key);
      else values[key] = n;
    } else if (rule.type === 'boolean') {
      values[key] = raw === true || raw === 'true' || raw === 1 ? 1 : 0;
    } else if (rule.type === 'array') {
      values[key] = Array.isArray(raw) ? raw : [];
    } else {
      const s = String(raw).trim();
      if (rule.oneOf && !rule.oneOf.includes(s)) fields.push(key);
      else if (rule.max && s.length > rule.max) fields.push(key);
      else values[key] = s;
    }
  }

  if (fields.length) throw badRequest('Some fields need another look.', fields);
  return values;
}
