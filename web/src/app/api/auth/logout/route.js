import { route, json, SESSION_COOKIE, currentUser, clientIp } from '@/lib/api';
import { callProc } from '@/lib/mysql';
import { logActivity } from '@/lib/docs';

export const POST = route(null, async ({ req }) => {
  const user = await currentUser(req);
  if (user) {
    await callProc('sp_end_session', [user.session_id]);
    await logActivity('LOGOUT', { userId: user.user_id, role: user.role, ip: clientIp(req) });
  }
  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
});
