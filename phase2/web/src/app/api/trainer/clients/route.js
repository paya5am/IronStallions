// A trainer's clients (anyone they have trained) with progress signals.
import { route } from '@/lib/api';
import { query } from '@/lib/mysql';

export const GET = route(['TRAINER'], async ({ user }) => {
  const clients = await query(`
    SELECT mo.member_id, mo.full_name, mo.plan_name, mo.tier_name, s.current_streak, s.visit_days_last_30,
           COUNT(ts.training_session_id) AS sessions_with_me, MAX(ts.session_date) AS last_session,
           (SELECT COUNT(*) FROM v_plateau_flags f WHERE f.member_id = mo.member_id) AS plateaus,
           (SELECT ROUND(SUM(v.volume_kg)) FROM v_training_volume v WHERE v.member_id = mo.member_id AND v.week_start >= CURDATE() - INTERVAL 4 WEEK) AS volume_4w
      FROM training_sessions ts
      JOIN v_member_overview mo ON mo.member_id = ts.member_id
      LEFT JOIN v_member_streaks s ON s.member_id = ts.member_id
     WHERE ts.trainer_id = ? AND ts.status IN ('COMPLETED','SCHEDULED','NO_SHOW')
     GROUP BY mo.member_id, mo.full_name, mo.plan_name, mo.tier_name, s.current_streak, s.visit_days_last_30
     ORDER BY last_session DESC`, [user.user_id]);
  const ids = clients.map((c) => c.member_id);
  const [plateaus, goals, muscles] = ids.length ? await Promise.all([
    query('SELECT member_id, exercise_name, best_before, best_recent FROM v_plateau_flags WHERE member_id IN (?)', [ids]),
    query("SELECT member_id, goal_type, exercise_name, target_value, current_value, target_date FROM v_goal_progress WHERE member_id IN (?) AND status = 'ACTIVE'", [ids]),
    query('SELECT member_id, muscle_group, sets_28d FROM v_muscle_group_activity WHERE member_id IN (?)', [ids]),
  ]) : [[], [], []];
  for (const c of clients) {
    c.plateau_list = plateaus.filter((p) => p.member_id === c.member_id);
    c.goals = goals.filter((g) => g.member_id === c.member_id);
    c.muscles = muscles.filter((m) => m.member_id === c.member_id);
  }
  return { clients };
});
