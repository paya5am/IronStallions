// One-time passwords and login challenges, stored in MongoDB (otp_requests).
// The TTL index on expires_at deletes each document automatically once it expires.
import crypto from 'node:crypto';
import { collection } from './docs';
import { ApiError } from './api';

const MINUTES = Number(process.env.OTP_VALID_MINUTES || 5);
const secret = () => process.env.APP_SECRET || '';

export function hashOtp(subject, otp) {
  return crypto.createHash('sha256').update(`${subject}:${otp}:${secret()}`).digest('hex');
}

export function newOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

export async function issueOtp({ purpose, subject, userId, extra = {} }) {
  const col = await collection('otp_requests');
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const recent = (await col.find({ subject, purpose }).sort({ created_at: -1 }).limit(10).toArray())
    .filter((d) => d.created_at > since);
  if (recent.length >= 5) throw new ApiError(429, 'Too many codes requested. Wait a few minutes.');
  const otp = newOtp();
  const now = new Date();
  await col.insertOne({
    purpose, subject, user_id: userId, otp_hash: hashOtp(subject, otp), attempts: 0, used: false,
    created_at: now, expires_at: new Date(now.getTime() + MINUTES * 60 * 1000), ...extra,
  });
  return otp;
}

// Checks the newest unused code for this subject; at most 5 wrong attempts.
export async function verifyOtp({ purpose, subject, otp }) {
  const col = await collection('otp_requests');
  const [doc] = await col.find({ subject, purpose, used: false }).sort({ created_at: -1 }).limit(1).toArray();
  if (!doc || doc.expires_at <= new Date()) throw new ApiError(401, 'Code expired. Request a new one.');
  if (doc.attempts >= 5) throw new ApiError(429, 'Too many wrong attempts. Request a new code.');
  if (doc.otp_hash !== hashOtp(subject, String(otp || '').trim())) {
    await col.updateOne({ _id: doc._id }, { $inc: { attempts: 1 } });
    throw new ApiError(401, 'Wrong code.');
  }
  await col.updateOne({ _id: doc._id }, { $set: { used: true } });
  return doc;
}

// A short-lived record of a login that has passed the SMS step.
export async function createChallenge({ userId, step, deviceId = null, emailOtp = null, email = null }) {
  const col = await collection('otp_requests');
  const challengeId = crypto.randomUUID();
  const now = new Date();
  await col.insertOne({
    purpose: 'LOGIN_CHALLENGE', subject: challengeId, user_id: userId, step, device_id: deviceId,
    otp_hash: emailOtp ? hashOtp(email, emailOtp) : null, email, attempts: 0, used: false,
    created_at: now, expires_at: new Date(now.getTime() + MINUTES * 60 * 1000),
  });
  return challengeId;
}

export async function takeChallenge(challengeId, step) {
  const col = await collection('otp_requests');
  const doc = await col.findOne({ purpose: 'LOGIN_CHALLENGE', subject: String(challengeId || '') });
  if (!doc || doc.used || doc.expires_at <= new Date() || doc.step !== step) {
    throw new ApiError(401, 'Login step expired. Start again.');
  }
  return doc;
}

export async function finishChallenge(doc) {
  const col = await collection('otp_requests');
  await col.updateOne({ _id: doc._id }, { $set: { used: true } });
}

export async function failChallenge(doc) {
  const col = await collection('otp_requests');
  await col.updateOne({ _id: doc._id }, { $inc: { attempts: 1 } });
  if ((doc.attempts || 0) + 1 >= 5) await col.updateOne({ _id: doc._id }, { $set: { used: true } });
}

export function mask(value, keepEnd = 2) {
  if (!value) return '';
  if (value.includes('@')) {
    const [name, domain] = value.split('@');
    return `${name.slice(0, 2)}${'*'.repeat(Math.max(name.length - 2, 1))}@${domain}`;
  }
  return '*'.repeat(Math.max(value.length - keepEnd, 0)) + value.slice(-keepEnd);
}
