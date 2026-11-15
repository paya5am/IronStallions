import { route, int, oneOf, str, ApiError } from '@/lib/api';
import { query, callProc } from '@/lib/mysql';

export const GET = route(['ADMIN'], async () => {
  await callProc('sp_finalize_challenges');
  const challenges = await query(`
    SELECT c.*, x.exercise_name, IFNULL(b.branch_name, 'All branches') AS branch_name, u.full_name AS created_by_name,
           (SELECT COUNT(*) FROM challenge_participants p WHERE p.challenge_id = c.challenge_id) AS participants,
           (SELECT l.member_name FROM v_challenge_leaderboard l WHERE l.challenge_id = c.challenge_id ORDER BY l.live_rank LIMIT 1) AS leader
      FROM challenges c LEFT JOIN exercises x ON x.exercise_id = c.exercise_id LEFT JOIN branches b ON b.branch_id = c.branch_id
      JOIN users u ON u.user_id = c.created_by ORDER BY c.end_date DESC`);
  return { challenges };
});

export const POST = route(['ADMIN'], async ({ user, body }) => {
  const metric = oneOf(body.metric, ['TOTAL_VISITS', 'TOTAL_VOLUME', 'LONGEST_STREAK', 'EXERCISE_MAX_WEIGHT'], 'Metric');
  const exerciseId = metric === 'EXERCISE_MAX_WEIGHT' ? int(body.exerciseId, 'Exercise') : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate || '')) throw new ApiError(400, 'Dates must be YYYY-MM-DD.');
  await query(`INSERT INTO challenges (title, description, metric, exercise_id, branch_id, start_date, end_date, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [str(body.title, 'Title', 100), body.description ? str(body.description, 'Description') : null, metric, exerciseId,
     body.branchId ? int(body.branchId, 'Branch') : null, body.startDate, body.endDate, user.user_id]);
  return { ok: true, message: 'Challenge created.' };
});
