// Front desk dashboard: who is inside this branch right now, today's numbers, open machine issues.
import { route } from '@/lib/api';
import { query, queryOne } from '@/lib/mysql';
import { staffBranch } from '@/lib/staff';

export const GET = route(['STAFF'], async ({ user }) => {
  const me = await staffBranch(user.user_id);
  const inside = await query(`
    SELECT a.attendance_id, a.member_id, u.full_name, u.phone, a.check_in_time,
           TIMESTAMPDIFF(MINUTE, a.check_in_time, NOW()) AS minutes_inside,
           IF(a.session_id IS NULL, 'Staff', 'QR') AS method, mo.plan_name, mo.tier_name,
           (SELECT e.name FROM equipment_usage_log ul JOIN equipment e ON e.equipment_id = ul.equipment_id
             WHERE ul.attendance_id = a.attendance_id AND ul.end_time IS NULL) AS using_machine
      FROM attendance a JOIN users u ON u.user_id = a.member_id
      LEFT JOIN v_member_overview mo ON mo.member_id = a.member_id
     WHERE a.branch_id = ? AND a.check_out_time IS NULL ORDER BY a.check_in_time`, [me.branch_id]);
  const today = await queryOne(`
    SELECT COUNT(*) AS check_ins, SUM(session_id IS NOT NULL) AS by_qr, SUM(checked_in_by IS NOT NULL) AS by_staff,
           SUM(auto_checked_out) AS auto_closed
      FROM attendance WHERE branch_id = ? AND DATE(check_in_time) = CURDATE()`, [me.branch_id]);
  const equipment = await query('SELECT status, COUNT(*) AS n FROM equipment WHERE branch_id = ? GROUP BY status', [me.branch_id]);
  const hours = await query(`SELECT hour_of_day, SUM(check_ins) AS check_ins FROM v_peak_hours WHERE branch_id = ?
                              GROUP BY hour_of_day ORDER BY hour_of_day`, [me.branch_id]);
  const closures = await query(`SELECT closure_date, reason FROM branch_closures
                                 WHERE (branch_id = ? OR branch_id IS NULL) AND closure_date >= CURDATE() ORDER BY closure_date LIMIT 5`, [me.branch_id]);
  return { me, inside, today, equipment, hours, closures };
});
