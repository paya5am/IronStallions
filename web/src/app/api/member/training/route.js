// Personal training for members: trainers they may book, their sessions, booking and cancelling.
import { route, int, oneOf, str, ApiError, clientIp } from '@/lib/api';
import { query, queryOne, callProc } from '@/lib/mysql';
import { logActivity } from '@/lib/docs';

export const GET = route(['MEMBER'], async ({ user }) => {
  const id = user.user_id;
  const tier = await queryOne('SELECT fn_member_tier_on(?, CURDATE()) AS rank_today', [id]);
  const trainers = await query(`
    SELECT tr.trainer_id, u.full_name, tr.specialization, tr.years_experience, tr.hourly_rate,
           b.branch_id, b.branch_name, t.tier_name, t.tier_rank
      FROM trainers tr JOIN users u ON u.user_id = tr.trainer_id JOIN branches b ON b.branch_id = tr.branch_id
      JOIN tiers t ON t.tier_id = b.tier_id
     WHERE u.is_active ORDER BY t.tier_rank, b.branch_name, u.full_name`);
  const slots = await query(`
    SELECT availability_id, trainer_id, day_of_week, slot_start, slot_end
      FROM trainer_availability WHERE is_active
     ORDER BY FIELD(day_of_week,'MON','TUE','WED','THU','FRI','SAT','SUN'), slot_start`);
  // booked (non-cancelled) slot dates in the booking window, to grey them out
  const taken = await query(`
    SELECT availability_id, session_date FROM training_sessions
     WHERE status <> 'CANCELLED' AND session_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 60 DAY`);
  const sessions = await query(
    'SELECT * FROM v_training_schedule WHERE member_id = ? ORDER BY session_date DESC, start_time DESC', [id]);
  const settings = await queryOne(`SELECT fn_setting_int('MAX_PT_BOOKING_DAYS_AHEAD', 30) AS days_ahead,
                                          fn_setting_int('PT_REFUND_CUTOFF_HOURS', 24) AS cutoff_hours, CURDATE() AS today`);
  return { tierRank: tier.rank_today, trainers, slots, taken, sessions, settings };
});

export const POST = route(['MEMBER'], async ({ req, user, body }) => {
  const action = oneOf(body.action, ['book', 'cancel'], 'Action');
  if (action === 'book') {
    const date = str(body.date, 'Date', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, 'Date must be YYYY-MM-DD.');
    const start = str(body.start, 'Start time', 8);
    const duration = oneOf(Number(body.duration), [30, 45, 60, 90], 'Duration');
    const ahead = await queryOne(`SELECT DATEDIFF(?, CURDATE()) AS days, fn_setting_int('MAX_PT_BOOKING_DAYS_AHEAD', 30) AS max_days`, [date]);
    if (ahead.days > ahead.max_days) throw new ApiError(409, `Sessions can be booked at most ${ahead.max_days} days ahead.`);
    const { out } = await callProc('sp_book_session', [user.user_id, int(body.availabilityId, 'Slot'), date, start, duration], ['session_id']);
    await logActivity('PT_BOOKED', { userId: user.user_id, role: user.role, ip: clientIp(req), details: { training_session_id: out.session_id, date, start } });
    return { ok: true, message: 'Session booked. Its invoice is under Billing.', sessionId: out.session_id };
  }
  const { out } = await callProc('sp_cancel_session', [int(body.sessionId, 'Session'), user.user_id, 'UPI'], ['refund', 'charged']);
  await logActivity('PT_CANCELLED', { userId: user.user_id, role: user.role, ip: clientIp(req), details: { training_session_id: body.sessionId, ...out } });
  return {
    ok: true,
    message: Number(out.charged)
      ? 'Session cancelled inside the cut-off window, so it is still charged.'
      : `Session cancelled without charge${Number(out.refund) > 0 ? `; Rs ${Number(out.refund).toFixed(2)} refunded` : ''}.`,
  };
});
