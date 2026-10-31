// Member dashboard: plan, streak, records, plateau warnings, dues, current visit.
import { route } from '@/lib/api';
import { query, queryOne } from '@/lib/mysql';

export const GET = route(['MEMBER'], async ({ user }) => {
  const id = user.user_id;
  const [overview, streak, records, plateaus, dues, visit, nextPt, weeks] = await Promise.all([
    queryOne('SELECT * FROM v_member_overview WHERE member_id = ?', [id]),
    queryOne('SELECT current_streak, longest_streak, visit_days_last_30 FROM v_member_streaks WHERE member_id = ?', [id]),
    query('SELECT exercise_name, record_type, record_value, achieved_at FROM v_personal_records WHERE member_id = ? ORDER BY achieved_at DESC LIMIT 6', [id]),
    query('SELECT exercise_name, best_before, best_recent, recent_weeks, window_weeks FROM v_plateau_flags WHERE member_id = ?', [id]),
    queryOne("SELECT IFNULL(SUM(balance), 0) AS owed, SUM(status = 'OVERDUE') AS overdue FROM v_member_dues WHERE member_id = ? AND status <> 'CANCELLED'", [id]),
    queryOne(`SELECT a.attendance_id, a.check_in_time, b.branch_name, b.branch_id
                FROM attendance a JOIN branches b ON b.branch_id = a.branch_id
               WHERE a.member_id = ? AND a.check_out_time IS NULL`, [id]),
    queryOne(`SELECT trainer_name, branch_name, session_date, start_time, duration_minutes FROM v_training_schedule
               WHERE member_id = ? AND status = 'SCHEDULED' ORDER BY session_date, start_time LIMIT 1`, [id]),
    query(`SELECT YEARWEEK(check_in_time, 3) AS yw, MIN(DATE(check_in_time)) AS week_start, COUNT(DISTINCT DATE(check_in_time)) AS days
             FROM attendance WHERE member_id = ? AND check_in_time >= CURDATE() - INTERVAL 8 WEEK
            GROUP BY YEARWEEK(check_in_time, 3) ORDER BY yw`, [id]),
  ]);
  return { overview, streak, records, plateaus, dues, visit, nextPt, weeks };
});
