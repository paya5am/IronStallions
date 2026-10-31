// Generates the 30-second, single-use check-in code for this login session.
import { route, clientIp } from '@/lib/api';
import { callProc, queryOne } from '@/lib/mysql';
import { logActivity } from '@/lib/docs';

export const POST = route(['MEMBER'], async ({ req, user }) => {
  const { out } = await callProc('sp_generate_qr', [user.session_id], ['token', 'expires_at']);
  // seconds left measured by the database clock, so browser and server clocks do not matter
  const { seconds } = await queryOne('SELECT TIMESTAMPDIFF(SECOND, NOW(), ?) AS seconds', [out.expires_at]);
  await logActivity('QR_GENERATED', { userId: user.user_id, role: user.role, ip: clientIp(req), details: { expires_at: out.expires_at } });
  return { token: out.token, secondsLeft: Number(seconds) };
});
