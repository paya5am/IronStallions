// Chain-wide dashboard for the gym owner.
import { route } from '@/lib/api';
import { query, queryOne } from '@/lib/mysql';

export const GET = route(['ADMIN'], async ({ req }) => {
  const branchId = Number(req.nextUrl.searchParams.get('branchId')) || null;
  const [occupancy, revenue, revenueByBranch, peak, maintenance, kpi, equipment, plateaus, tiers] = await Promise.all([
    query('SELECT * FROM v_live_occupancy ORDER BY branch_name'),
    query(`SELECT month, SUM(collected) AS collected, SUM(refunded) AS refunded, SUM(net_revenue) AS net_revenue,
                  SUM(plan_revenue) AS plan_revenue, SUM(pt_revenue) AS pt_revenue
             FROM v_revenue_by_branch WHERE month >= DATE_FORMAT(CURDATE() - INTERVAL 5 MONTH, '%Y-%m')
            GROUP BY month ORDER BY month`),
    query(`SELECT branch_name, SUM(net_revenue) AS net_revenue FROM v_revenue_by_branch
            WHERE month >= DATE_FORMAT(CURDATE() - INTERVAL 2 MONTH, '%Y-%m') GROUP BY branch_name ORDER BY net_revenue DESC`),
    query(`SELECT hour_of_day, SUM(check_ins) AS check_ins, ROUND(SUM(avg_per_week), 1) AS avg_per_week FROM v_peak_hours
            ${branchId ? 'WHERE branch_id = ?' : ''} GROUP BY hour_of_day ORDER BY hour_of_day`, branchId ? [branchId] : []),
    query(`SELECT month, SUM(jobs) AS jobs, SUM(total_cost) AS total_cost FROM v_maintenance_cost
            WHERE month >= DATE_FORMAT(CURDATE() - INTERVAL 5 MONTH, '%Y-%m') GROUP BY month ORDER BY month`),
    queryOne(`SELECT (SELECT COUNT(*) FROM subscriptions WHERE status = 'ACTIVE') AS active_members,
                     (SELECT COUNT(*) FROM members) AS members_total,
                     (SELECT COUNT(*) FROM attendance WHERE check_out_time IS NULL) AS inside_now,
                     (SELECT COUNT(*) FROM attendance WHERE DATE(check_in_time) = CURDATE()) AS visits_today,
                     (SELECT IFNULL(SUM(balance), 0) FROM v_member_dues WHERE status = 'OVERDUE') AS overdue_amount,
                     (SELECT COUNT(*) FROM invoices WHERE status = 'OVERDUE') AS overdue_invoices,
                     (SELECT COUNT(*) FROM training_sessions WHERE status = 'SCHEDULED') AS pt_upcoming,
                     (SELECT COUNT(*) FROM subscriptions WHERE status = 'ACTIVE' AND end_date <= CURDATE() + INTERVAL 14 DAY) AS expiring_14d`),
    query('SELECT status, COUNT(*) AS n FROM equipment GROUP BY status'),
    query('SELECT member_name, exercise_name, best_before, best_recent FROM v_plateau_flags'),
    query(`SELECT t.tier_name, COUNT(s.subscription_id) AS active FROM tiers t
             LEFT JOIN membership_plans p ON p.tier_id = t.tier_id
             LEFT JOIN subscriptions s ON s.plan_id = p.plan_id AND s.status = 'ACTIVE'
            GROUP BY t.tier_id, t.tier_name ORDER BY t.tier_rank`),
  ]);
  return { occupancy, revenue, revenueByBranch, peak, maintenance, kpi, equipment, plateaus, tiers };
});
