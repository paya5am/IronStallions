// The member's current visit: machines in use and sets logged; check-out.
import { route, clientIp } from '@/lib/api';
import { query, queryOne, callProc } from '@/lib/mysql';
import { logActivity } from '@/lib/docs';

export const GET = route(['MEMBER'], async ({ user }) => {
  const visit = await queryOne(`
    SELECT a.attendance_id, a.check_in_time, a.branch_id, b.branch_name, b.closing_time
      FROM attendance a JOIN branches b ON b.branch_id = a.branch_id
     WHERE a.member_id = ? AND a.check_out_time IS NULL`, [user.user_id]);
  if (!visit) return { visit: null, usages: [], sets: [] };
  const usages = await query(`
    SELECT u.usage_id, u.equipment_id, e.name, c.category_id, c.category_name, u.start_time, u.end_time, u.difficulty_rating, u.comfort_rating
      FROM equipment_usage_log u JOIN equipment e ON e.equipment_id = u.equipment_id
      JOIN equipment_categories c ON c.category_id = e.category_id
     WHERE u.attendance_id = ? ORDER BY u.start_time DESC`, [visit.attendance_id]);
  const sets = await query(`
    SELECT ws.set_id, ws.exercise_id, x.exercise_name, ws.set_number, ws.reps, ws.weight_kg, ws.duration_seconds, ws.distance_m, ws.performed_at,
           (SELECT COUNT(*) FROM personal_records pr WHERE pr.set_id = ws.set_id) AS records
      FROM workout_sets ws JOIN exercises x ON x.exercise_id = ws.exercise_id
     WHERE ws.attendance_id = ? ORDER BY ws.performed_at DESC`, [visit.attendance_id]);
  return { visit, usages, sets };
});

export const POST = route(['MEMBER'], async ({ req, user }) => {
  const { out } = await callProc('sp_check_out', [user.user_id], ['attendance_id']);
  await logActivity('CHECK_OUT', { userId: user.user_id, role: user.role, ip: clientIp(req), details: out });
  return { ok: true };
});
