// Trainer marks a session completed / no-show, or cancels it (never charged to the member).
import { route, int, oneOf, clientIp } from '@/lib/api';
import { callProc } from '@/lib/mysql';
import { logActivity } from '@/lib/docs';

export const POST = route(['TRAINER'], async ({ req, user, body }) => {
  const sessionId = int(body.sessionId, 'Session');
  const action = oneOf(body.action, ['complete', 'no_show', 'cancel'], 'Action');
  if (action === 'cancel') {
    const { out } = await callProc('sp_cancel_session', [sessionId, user.user_id, 'UPI'], ['refund', 'charged']);
    await logActivity('PT_CANCELLED', { userId: user.user_id, role: user.role, ip: clientIp(req), details: { training_session_id: sessionId, by: 'trainer', ...out } });
    return { ok: true, message: 'Session cancelled; the member is not charged.' };
  }
  await callProc('sp_complete_session', [sessionId, user.user_id, action === 'complete' ? 'COMPLETED' : 'NO_SHOW']);
  return { ok: true };
});
