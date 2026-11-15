import { route, int, num, oneOf, str, ApiError } from '@/lib/api';
import { query, callProc } from '@/lib/mysql';

export const GET = route(['MEMBER'], async ({ user }) => {
  await callProc('sp_update_goals');
  const goals = await query('SELECT * FROM v_goal_progress WHERE member_id = ? ORDER BY status, target_date', [user.user_id]);
  return { goals };
});

export const POST = route(['MEMBER'], async ({ user, body }) => {
  const type = oneOf(body.goalType, ['EXERCISE_WEIGHT', 'EXERCISE_REPS', 'MONTHLY_VISITS', 'WORKOUT_STREAK'], 'Goal type');
  const exerciseId = type.startsWith('EXERCISE') ? int(body.exerciseId, 'Exercise') : null;
  const targetDate = str(body.targetDate, 'Target date', 10);
  await query(`INSERT INTO fitness_goals (member_id, goal_type, exercise_id, target_value, start_date, target_date)
               VALUES (?, ?, ?, ?, CURDATE(), ?)`, [user.user_id, type, exerciseId, num(body.targetValue, 'Target'), targetDate]);
  return { ok: true, message: 'Goal added.' };
});

export const PATCH = route(['MEMBER'], async ({ user, body }) => {
  const res = await query("UPDATE fitness_goals SET status = 'ABANDONED' WHERE goal_id = ? AND member_id = ? AND status = 'ACTIVE'",
    [int(body.goalId, 'Goal'), user.user_id]);
  if (!res.affectedRows) throw new ApiError(404, 'Active goal not found.');
  return { ok: true };
});
