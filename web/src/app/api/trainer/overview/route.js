// Trainer dashboard: slots, schedule, clients' plateau flags, earnings.
import { route } from '@/lib/api';
import { query, queryOne } from '@/lib/mysql';
import { collection } from '@/lib/docs';

export const GET = route(['TRAINER'], async ({ user }) => {
  const id = user.user_id;
  const me = await queryOne(`
    SELECT tr.*, b.branch_name, t.tier_name FROM trainers tr JOIN branches b ON b.branch_id = tr.branch_id
      JOIN tiers t ON t.tier_id = b.tier_id WHERE tr.trainer_id = ?`, [id]);
  const slots = await query(`SELECT * FROM trainer_availability WHERE trainer_id = ?
                              ORDER BY is_active DESC, FIELD(day_of_week,'MON','TUE','WED','THU','FRI','SAT','SUN'), slot_start`, [id]);
  const sessions = await query(`SELECT * FROM v_training_schedule WHERE trainer_id = ?
                                 AND session_date >= CURDATE() - INTERVAL 60 DAY ORDER BY session_date DESC, start_time DESC`, [id]);
  const clientPlateaus = await query(`
    SELECT DISTINCT f.member_id, f.member_name, f.exercise_name, f.best_before, f.best_recent, f.recent_weeks
      FROM v_plateau_flags f JOIN training_sessions ts ON ts.member_id = f.member_id AND ts.trainer_id = ?`, [id]);
  const stats = await queryOne(`
    SELECT SUM(ts.status = 'COMPLETED' AND ts.session_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS completed_this_month,
           SUM(ts.status = 'SCHEDULED') AS upcoming,
           SUM(ts.status = 'NO_SHOW') AS no_shows,
           IFNULL(SUM(IF(ts.status IN ('COMPLETED','NO_SHOW') AND i.status = 'PAID', i.amount_due, 0)), 0) AS earned_total
      FROM training_sessions ts LEFT JOIN invoices i ON i.training_session_id = ts.training_session_id
     WHERE ts.trainer_id = ?`, [id]);
  const col = await collection('pt_session_logs');
  const logged = await col.find({ trainer_id: id }).limit(500).toArray();
  const loggedIds = new Set(logged.map((d) => d.training_session_id));
  for (const s of sessions) s.has_log = loggedIds.has(s.training_session_id);
  return { me, slots, sessions, clientPlateaus, stats };
});
