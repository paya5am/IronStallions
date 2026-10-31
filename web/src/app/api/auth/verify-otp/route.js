// Step 2 of login: check the SMS code, then decide the second step:
//  - known device  -> confirm on this device (simulated biometric unlock)
//  - new device    -> email code, then the device is registered
import { route, ApiError, str, clientIp } from '@/lib/api';
import { queryOne } from '@/lib/mysql';
import { verifyOtp, createChallenge, newOtp, mask } from '@/lib/otp';
import { logActivity } from '@/lib/docs';

export const POST = route(null, async ({ req, body }) => {
  const phone = str(body.phone, 'Phone number', 15).replace(/\s+/g, '');
  const sms = await verifyOtp({ purpose: 'LOGIN_SMS', subject: phone, otp: body.otp });
  const user = await queryOne('SELECT user_id, full_name, email, role FROM users WHERE user_id = ? AND is_active', [sms.user_id]);
  if (!user) throw new ApiError(403, 'This account is disabled.');

  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : null;
  const device = deviceId
    ? await queryOne('SELECT device_id, device_name FROM user_devices WHERE device_id = ? AND user_id = ? AND is_active', [deviceId, user.user_id])
    : null;

  if (device) {
    const challengeId = await createChallenge({ userId: user.user_id, step: 'CONFIRM_DEVICE', deviceId: device.device_id });
    return { step: 'CONFIRM_DEVICE', challengeId, deviceName: device.device_name, name: user.full_name };
  }
  const emailOtp = newOtp();
  const challengeId = await createChallenge({ userId: user.user_id, step: 'EMAIL_OTP', emailOtp, email: user.email });
  await logActivity('OTP_SENT', { userId: user.user_id, role: user.role, ip: clientIp(req), details: { channel: 'EMAIL', to: mask(user.email), reason: 'new device' } });
  return {
    step: 'EMAIL_OTP', challengeId, sentTo: mask(user.email), name: user.full_name,
    demoOtp: process.env.DEMO_SHOW_OTP === 'true' ? emailOtp : undefined,
  };
});
