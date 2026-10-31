// Step 3b: new device. The email code proves ownership, then the device is registered.
import { route, ApiError } from '@/lib/api';
import { queryOne, callProc } from '@/lib/mysql';
import { takeChallenge, finishChallenge, failChallenge, hashOtp } from '@/lib/otp';
import { startSession } from '@/lib/session';

export const POST = route(null, async ({ req, body }) => {
  const ch = await takeChallenge(body.challengeId, 'EMAIL_OTP');
  if ((ch.attempts || 0) >= 5) throw new ApiError(429, 'Too many wrong attempts. Start again.');
  if (ch.otp_hash !== hashOtp(ch.email, String(body.otp || '').trim())) {
    await failChallenge(ch);
    throw new ApiError(401, 'Wrong email code.');
  }
  const name = String(body.deviceName || 'Web browser').slice(0, 100);
  const publicKey = String(body.publicKey || 'demo-key').slice(0, 500);
  const { out } = await callProc('sp_register_device', [ch.user_id, name, publicKey], ['device_id']);
  const user = await queryOne('SELECT user_id, full_name, role FROM users WHERE user_id = ?', [ch.user_id]);
  // the browser keeps deviceId and presents it on its next login
  const res = await startSession(req, user, out.device_id, { deviceId: out.device_id });
  await finishChallenge(ch);
  return res;
});
