// Progression, workout comparison, training volume and muscle-group activity.
import { route } from '@/lib/api';
import { query } from '@/lib/mysql';

export const GET = route(['MEMBER'], async ({ req, user }) => {
  const id = user.user_id;
  const exerciseId = Number(req.nextUrl.searchParams.get('exerciseId')) || null;
  const exercises = await query(`
    SELECT DISTINCT exercise_id, exercise_name FROM v_exercise_progression
     WHERE member_id = ? AND measure_type = 'WEIGHT_REPS' ORDER BY exercise_name`, [id]);
  const chosen = exerciseId || exercises[0]?.exercise_id || null;
  const [progression, comparison, volume, muscles] = await Promise.all([
    chosen ? query(`SELECT week_start, best_weight, best_reps, volume_kg, sets, weight_change, trend FROM v_exercise_progression
                     WHERE member_id = ? AND exercise_id = ? AND week_start >= CURDATE() - INTERVAL 12 WEEK ORDER BY yw`, [id, chosen]) : [],
    query(`SELECT c.* FROM v_workout_comparison c
            JOIN (SELECT MAX(attendance_id) AS last_visit FROM attendance WHERE member_id = ? AND check_out_time IS NOT NULL) l
              ON c.attendance_id = l.last_visit
           WHERE c.member_id = ?`, [id, id]),
    query(`SELECT week_start, muscle_group, volume_kg, sets, minutes FROM v_training_volume
            WHERE member_id = ? AND week_start >= CURDATE() - INTERVAL 8 WEEK ORDER BY yw, muscle_group`, [id]),
    query('SELECT * FROM v_muscle_group_activity WHERE member_id = ? ORDER BY sets_28d DESC', [id]),
  ]);
  return { exercises, chosen, progression, comparison, volume, muscles };
});
