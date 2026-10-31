// Step 1 of login: phone number -> one-time password by SMS (shown on screen in the demo).
import { route, ApiError, str, clientIp } from '@/lib/api';
import { queryOne } from '@/lib/mysql';
import { issueOtp, mask } from '@/lib/otp';
import { logActivity } from '@/lib/docs';

export const POST = route(null, async ({ req, body }) => {
  const phone = str(body.phone, 'Phone number', 15).replace(/\s+/g, '');
  const user = await queryOne('SELECT user_id, full_name, role, is_active FROM users WHERE phone = ?', [phone]);
  if (!user) throw new ApiError(404, 'No account uses this phone number.');
  if (!user.is_active) throw new ApiError(403, 'This account is disabled.');
  const otp = await issueOtp({ purpose: 'LOGIN_SMS', subject: phone, userId: user.user_id });
  await logActivity('OTP_SENT', { userId: user.user_id, role: user.role, ip: clientIp(req), details: { channel: 'SMS', to: mask(phone) } });
  return {
    ok: true, sentTo: mask(phone),
    demoOtp: process.env.DEMO_SHOW_OTP === 'true' ? otp : undefined,
  };
});
