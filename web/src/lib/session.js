// Creates the MySQL login session and the browser cookie.
import { callProc } from './mysql';
import { json, SESSION_COOKIE, clientIp } from './api';
import { logActivity } from './docs';

export async function startSession(req, user, deviceId, extra = {}) {
  const agent = (req.headers.get('user-agent') || 'browser').slice(0, 200);
  const ip = clientIp(req);
  let out;
  try {
    ({ out } = await callProc('sp_create_session', [user.user_id, deviceId, agent, ip], ['session_id']));
  } catch (err) {
    if (err.sqlState === '45000' && /already logged in/i.test(err.sqlMessage || '')) {
      await logActivity('LOGIN_REFUSED_DUPLICATE', { userId: user.user_id, role: user.role, ip, details: { device_id: deviceId, user_agent: agent } });
    }
    throw err;
  }
  await logActivity('LOGIN_SUCCESS', { userId: user.user_id, role: user.role, ip, details: { device_id: deviceId, user_agent: agent } });
  const res = json({ ok: true, role: user.role, name: user.full_name, home: '/' + user.role.toLowerCase(), ...extra });
  res.cookies.set(SESSION_COOKIE, out.session_id, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3 * 60 * 60,
    secure: process.env.COOKIE_SECURE === 'true',
  });
  return res;
}
