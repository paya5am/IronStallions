// Shared plumbing for every API route: session check, role check, error handling.
import { NextResponse } from 'next/server';
import { callProc } from './mysql';

export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || 'gym_session';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

export function clientIp(req) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || '127.0.0.1';
}

// Returns {session_id, user_id, role, full_name, expires_at} or null.
export async function currentUser(req) {
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sid || !/^[0-9a-f-]{36}$/i.test(sid)) return null;
  const { rows } = await callProc('sp_validate_session', [sid]);
  return rows[0] || null;
}

function errorResponse(err) {
  if (err instanceof ApiError) return json({ error: err.message }, err.status);
  // business rules raised by MySQL triggers / procedures (SIGNAL SQLSTATE '45000')
  if (err && err.sqlState === '45000') return json({ error: err.sqlMessage || err.message }, 409);
  if (err && err.code === 'ER_DUP_ENTRY') return json({ error: 'That value already exists.' }, 409);
  if (err && err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') return json({ error: 'Invalid value: ' + (err.sqlMessage || '') }, 400);
  if (err && err.code === 'ER_ROW_IS_REFERENCED_2') return json({ error: 'This record is in use and cannot be deleted.' }, 409);
  if (err && (err.code === 'ECONNREFUSED' || err.name === 'MongoServerSelectionError')) {
    console.error(err);
    return json({ error: 'Database is not reachable. Check that MySQL and MongoDB are running.' }, 503);
  }
  console.error(err);
  return json({ error: 'Unexpected server error. See the terminal running npm run dev.' }, 500);
}

// Wraps a route handler.
//   roles: null for public routes, or an array such as ['MEMBER']
//   fn   : async ({ req, user, body, params }) => data
export function route(roles, fn) {
  return async (req, ctx) => {
    try {
      let user = null;
      if (roles) {
        user = await currentUser(req);
        if (!user) throw new ApiError(401, 'Please log in.');
        if (!roles.includes(user.role)) throw new ApiError(403, 'Your role cannot do this.');
      }
      let body = {};
      if (req.method !== 'GET' && req.method !== 'DELETE') {
        try { body = await req.json(); } catch { body = {}; }
      }
      const params = ctx?.params ? await ctx.params : {};
      const result = await fn({ req, user, body, params });
      if (result instanceof Response) return result;
      return json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

// Small input helpers
export function int(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new ApiError(400, `${name} must be a whole number.`);
  return n;
}
export function num(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ApiError(400, `${name} must be a number.`);
  return n;
}
export function optNum(value) {
  return value === undefined || value === null || value === '' ? null : Number(value);
}
export function str(value, name, max = 255) {
  const s = String(value ?? '').trim();
  if (!s) throw new ApiError(400, `${name} is required.`);
  if (s.length > max) throw new ApiError(400, `${name} is too long.`);
  return s;
}
export function oneOf(value, allowed, name) {
  if (!allowed.includes(value)) throw new ApiError(400, `${name} must be one of ${allowed.join(', ')}.`);
  return value;
}
