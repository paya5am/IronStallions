// Log a set (personal records are detected by a MySQL trigger) and list recent workouts.
import { route, int, optNum } from '@/lib/api';
import { query, callProc } from '@/lib/mysql';

export const GET = route(['MEMBER'], async ({ user }) => {
  const sessions = await query(`
    SELECT a.attendance_id, DATE(a.check_in_time) AS day, b.branch_name, COUNT(ws.set_id) AS sets,
           ROUND(SUM(IFNULL(ws.reps, 0) * IFNULL(ws.weight_kg, 0))) AS volume_kg,
           GROUP_CONCAT(DISTINCT x.exercise_name ORDER BY x.exercise_name SEPARATOR ', ') AS exercises
      FROM attendance a JOIN branches b ON b.branch_id = a.branch_id
      LEFT JOIN workout_sets ws ON ws.attendance_id = a.attendance_id
      LEFT JOIN exercises x ON x.exercise_id = ws.exercise_id
     WHERE a.member_id = ? AND a.check_in_time >= CURDATE() - INTERVAL 30 DAY
     GROUP BY a.attendance_id, DATE(a.check_in_time), b.branch_name
     ORDER BY day DESC`, [user.user_id]);
  return { sessions };
});

export const POST = route(['MEMBER'], async ({ user, body }) => {
  const { out } = await callProc('sp_log_set', [
    user.user_id, int(body.exerciseId, 'Exercise'), body.usageId ? int(body.usageId, 'Usage') : null,
    optNum(body.reps), optNum(body.weight), optNum(body.duration), optNum(body.distance),
  ], ['set_id', 'new_records']);
  return { ok: true, setId: out.set_id, newRecords: Number(out.new_records) };
});
