// Step 3a: the registered phone approves the login (biometric unlock is simulated).
import { route, ApiError } from '@/lib/api';
import { queryOne } from '@/lib/mysql';
import { takeChallenge, finishChallenge } from '@/lib/otp';
import { startSession } from '@/lib/session';

export const POST = route(null, async ({ req, body }) => {
  const ch = await takeChallenge(body.challengeId, 'CONFIRM_DEVICE');
  if (body.deviceId !== ch.device_id) throw new ApiError(401, 'This device is not the one that started the login.');
  const user = await queryOne('SELECT user_id, full_name, role FROM users WHERE user_id = ?', [ch.user_id]);
  const res = await startSession(req, user, ch.device_id);
  await finishChallenge(ch);
  return res;
});
