import { route, int, ApiError } from '@/lib/api';
import { query } from '@/lib/mysql';

export const PATCH = route(['MEMBER'], async ({ user, body }) => {
  const days = int(body.trainingDays, 'Training days');
  if (days < 1 || days > 7) throw new ApiError(400, 'Training days must be between 1 and 7.');
  await query('UPDATE members SET training_days_per_week = ? WHERE member_id = ?', [days, user.user_id]);
  return { ok: true };
});
