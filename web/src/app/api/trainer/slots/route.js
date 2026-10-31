// Trainers publish weekly slots; overlaps and opening hours are checked by triggers.
import { route, int, oneOf, ApiError } from '@/lib/api';
import { query } from '@/lib/mysql';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const time = (v, name) => {
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(String(v || ''))) throw new ApiError(400, `${name} must be HH:MM.`);
  return v.length === 5 ? v + ':00' : v;
};

export const POST = route(['TRAINER'], async ({ user, body }) => {
  const day = oneOf(body.day, DAYS, 'Day');
  const res = await query('INSERT INTO trainer_availability (trainer_id, day_of_week, slot_start, slot_end) VALUES (?, ?, ?, ?)',
    [user.user_id, day, time(body.start, 'Start'), time(body.end, 'End')]);
  return { ok: true, availabilityId: res.insertId };
});

export const PATCH = route(['TRAINER'], async ({ user, body }) => {
  const res = await query('UPDATE trainer_availability SET is_active = ? WHERE availability_id = ? AND trainer_id = ?',
    [body.isActive ? 1 : 0, int(body.availabilityId, 'Slot'), user.user_id]);
  if (!res.affectedRows) throw new ApiError(404, 'Slot not found.');
  return { ok: true };
});
