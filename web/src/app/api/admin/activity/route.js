// Activity log viewer (MongoDB activity_logs).
import { route } from '@/lib/api';
import { collection } from '@/lib/docs';
import { query } from '@/lib/mysql';

export const GET = route(['ADMIN'], async ({ req }) => {
  const p = req.nextUrl.searchParams;
  const filter = {};
  if (p.get('event')) filter.event = p.get('event');
  if (p.get('userId')) filter.user_id = Number(p.get('userId'));
  const limit = Math.min(Number(p.get('limit')) || 100, 500);
  const col = await collection('activity_logs');
  const logs = await col.find(filter).sort({ at: -1 }).limit(limit).toArray();
  const ids = [...new Set(logs.map((l) => l.user_id).filter(Boolean))];
  const names = ids.length ? await query('SELECT user_id, full_name FROM users WHERE user_id IN (?)', [ids]) : [];
  const nameOf = Object.fromEntries(names.map((n) => [n.user_id, n.full_name]));
  return {
    logs: logs.map((l) => ({ ...l, _id: String(l._id), user_name: nameOf[l.user_id] || null })),
    events: ['LOGIN_SUCCESS', 'LOGIN_REFUSED_DUPLICATE', 'LOGOUT', 'OTP_SENT', 'QR_GENERATED', 'QR_SCANNED', 'CHECK_IN_MANUAL',
             'CHECK_OUT', 'PLAN_BUY', 'PLAN_CHANGE', 'PLAN_CANCEL', 'PAYMENT', 'PT_BOOKED', 'PT_CANCELLED', 'PT_LOG_SAVED',
             'FAULT_REPORTED', 'MEMBER_REGISTERED', 'ACCOUNT_STATUS_CHANGED'],
  };
});
