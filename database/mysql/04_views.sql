-- =====================================================================
-- 04_views.sql : live-status and analytics views used by the dashboards
-- =====================================================================
USE gym_management;

-- Members inside each branch right now
CREATE OR REPLACE VIEW v_live_occupancy AS
SELECT b.branch_id, b.branch_name, t.tier_name,
       COUNT(a.attendance_id) AS inside_now
FROM branches b
JOIN tiers t ON t.tier_id = b.tier_id
LEFT JOIN attendance a ON a.branch_id = b.branch_id AND a.check_out_time IS NULL
WHERE b.is_active
GROUP BY b.branch_id, b.branch_name, t.tier_name;

-- Average check-ins per weekday and hour over the last 8 weeks
CREATE OR REPLACE VIEW v_peak_hours AS
SELECT a.branch_id, b.branch_name,
       WEEKDAY(a.check_in_time) AS weekday_index,
       DAYNAME(a.check_in_time) AS weekday_name,
       HOUR(a.check_in_time)    AS hour_of_day,
       COUNT(*)                 AS check_ins,
       ROUND(COUNT(*) / 8, 2)   AS avg_per_week
FROM attendance a
JOIN branches b ON b.branch_id = a.branch_id
WHERE a.check_in_time >= CURDATE() - INTERVAL 56 DAY
GROUP BY a.branch_id, b.branch_name, WEEKDAY(a.check_in_time), DAYNAME(a.check_in_time), HOUR(a.check_in_time);

-- Every machine with its live status and current user
CREATE OR REPLACE VIEW v_equipment_live AS
SELECT e.equipment_id, e.name, e.branch_id, b.branch_name, c.category_id, c.category_name, c.category_group,
       e.muscle_group, e.status,
       u.member_id AS in_use_by_member_id, us.full_name AS in_use_by, u.start_time AS in_use_since,
       (SELECT m.reported_issue FROM equipment_maintenance m
         WHERE m.equipment_id = e.equipment_id AND m.status <> 'RESOLVED'
         ORDER BY m.reported_date DESC LIMIT 1) AS open_issue
FROM equipment e
JOIN branches b ON b.branch_id = e.branch_id
JOIN equipment_categories c ON c.category_id = e.category_id
LEFT JOIN equipment_usage_log u ON u.equipment_id = e.equipment_id AND u.end_time IS NULL
LEFT JOIN users us ON us.user_id = u.member_id;

-- Invoices with what has been paid, refunded and is still owed
CREATE OR REPLACE VIEW v_member_dues AS
SELECT i.invoice_id, i.member_id, mu.full_name AS member_name,
       IF(i.subscription_id IS NOT NULL, 'PLAN', 'PERSONAL_TRAINING') AS invoice_type,
       COALESCE(p.plan_name, CONCAT('PT with ', tu.full_name, ' on ', DATE_FORMAT(ts.session_date, '%d %b %Y'))) AS description,
       i.amount_due, i.issue_date, i.due_date, i.status,
       fn_invoice_paid(i.invoice_id) AS paid,
       fn_invoice_refunded(i.invoice_id) AS refunded,
       IF(i.status = 'CANCELLED', 0, GREATEST(i.amount_due - fn_invoice_paid(i.invoice_id), 0)) AS balance
FROM invoices i
JOIN users mu ON mu.user_id = i.member_id
LEFT JOIN subscriptions s ON s.subscription_id = i.subscription_id
LEFT JOIN membership_plans p ON p.plan_id = s.plan_id
LEFT JOIN training_sessions ts ON ts.training_session_id = i.training_session_id
LEFT JOIN users tu ON tu.user_id = ts.trainer_id;

-- Net money collected per month, by the member's home branch
CREATE OR REPLACE VIEW v_revenue_by_branch AS
SELECT DATE_FORMAT(pay.paid_at, '%Y-%m') AS month, b.branch_id, b.branch_name,
       SUM(IF(pay.payment_type = 'PAYMENT', pay.amount, 0)) AS collected,
       SUM(IF(pay.payment_type = 'REFUND',  pay.amount, 0)) AS refunded,
       SUM(IF(pay.payment_type = 'PAYMENT', pay.amount, -pay.amount)) AS net_revenue,
       SUM(IF(pay.payment_type = 'PAYMENT' AND i.subscription_id IS NOT NULL, pay.amount, 0)) AS plan_revenue,
       SUM(IF(pay.payment_type = 'PAYMENT' AND i.training_session_id IS NOT NULL, pay.amount, 0)) AS pt_revenue
FROM payments pay
JOIN invoices i ON i.invoice_id = pay.invoice_id
JOIN members m ON m.member_id = i.member_id
JOIN branches b ON b.branch_id = m.branch_id
GROUP BY DATE_FORMAT(pay.paid_at, '%Y-%m'), b.branch_id, b.branch_name;

-- Workout streaks: consecutive days with a visit (gaps-and-islands)
CREATE OR REPLACE VIEW v_member_streaks AS
WITH days AS (
  SELECT DISTINCT member_id, DATE(check_in_time) AS d FROM attendance
),
islands AS (
  SELECT member_id, d,
         DATE_SUB(d, INTERVAL ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY d) DAY) AS grp
  FROM days
),
runs AS (
  SELECT member_id, MIN(d) AS run_start, MAX(d) AS run_end, COUNT(*) AS run_length
  FROM islands GROUP BY member_id, grp
)
SELECT m.member_id,
       IFNULL(MAX(IF(r.run_end >= CURDATE() - INTERVAL 1 DAY, r.run_length, NULL)), 0) AS current_streak,
       IFNULL(MAX(r.run_length), 0) AS longest_streak,
       (SELECT COUNT(DISTINCT DATE(a.check_in_time)) FROM attendance a
         WHERE a.member_id = m.member_id AND a.check_in_time >= CURDATE() - INTERVAL 30 DAY) AS visit_days_last_30
FROM members m
LEFT JOIN runs r ON r.member_id = m.member_id
GROUP BY m.member_id;

-- Current personal records with names
CREATE OR REPLACE VIEW v_personal_records AS
SELECT pr.record_id, pr.member_id, pr.exercise_id, e.exercise_name, e.muscle_group,
       pr.record_type, pr.record_value, pr.achieved_at
FROM personal_records pr
JOIN exercises e ON e.exercise_id = pr.exercise_id
WHERE pr.is_current;

-- Plateau detection: a weighted exercise trained in at least 3 different weeks
-- of the recent window (PLATEAU_WEEKS, default 4) whose best weight in that
-- window does not beat the best weight from before the window.
CREATE OR REPLACE VIEW v_plateau_flags AS
WITH cfg AS (
  SELECT IFNULL((SELECT CAST(setting_value AS SIGNED) FROM system_settings WHERE setting_key = 'PLATEAU_WEEKS'), 4) AS weeks
),
sets AS (
  SELECT a.member_id, ws.exercise_id, ws.weight_kg, ws.performed_at
  FROM workout_sets ws
  JOIN attendance a ON a.attendance_id = ws.attendance_id
  JOIN exercises e ON e.exercise_id = ws.exercise_id
  WHERE e.measure_type = 'WEIGHT_REPS'
),
agg AS (
  SELECT s.member_id, s.exercise_id,
         MAX(IF(s.performed_at <  CURDATE() - INTERVAL cfg.weeks * 7 DAY, s.weight_kg, NULL)) AS best_before,
         MAX(IF(s.performed_at >= CURDATE() - INTERVAL cfg.weeks * 7 DAY, s.weight_kg, NULL)) AS best_recent,
         COUNT(DISTINCT IF(s.performed_at >= CURDATE() - INTERVAL cfg.weeks * 7 DAY, YEARWEEK(s.performed_at, 3), NULL)) AS recent_weeks,
         MAX(cfg.weeks) AS window_weeks
  FROM sets s CROSS JOIN cfg
  GROUP BY s.member_id, s.exercise_id
)
SELECT agg.member_id, u.full_name AS member_name, agg.exercise_id, e.exercise_name,
       agg.best_before, agg.best_recent, agg.recent_weeks, agg.window_weeks
FROM agg
JOIN exercises e ON e.exercise_id = agg.exercise_id
JOIN users u ON u.user_id = agg.member_id
WHERE agg.best_before IS NOT NULL
  AND agg.recent_weeks >= 3
  AND agg.best_recent <= agg.best_before;

-- Trainer schedule with member names and payment state
CREATE OR REPLACE VIEW v_training_schedule AS
SELECT ts.training_session_id, ts.trainer_id, tu.full_name AS trainer_name, t.branch_id, b.branch_name,
       ts.member_id, mu.full_name AS member_name, ts.session_date, ts.start_time, ts.duration_minutes,
       ts.status, ts.booked_at, ts.cancelled_at, i.invoice_id, i.amount_due, i.status AS invoice_status
FROM training_sessions ts
JOIN trainers t ON t.trainer_id = ts.trainer_id
JOIN branches b ON b.branch_id = t.branch_id
JOIN users tu ON tu.user_id = ts.trainer_id
JOIN users mu ON mu.user_id = ts.member_id
LEFT JOIN invoices i ON i.training_session_id = ts.training_session_id;

-- Each member's current plan, tier and home branch
CREATE OR REPLACE VIEW v_member_overview AS
SELECT m.member_id, u.full_name, u.phone, u.email, m.branch_id AS home_branch_id, hb.branch_name AS home_branch,
       m.training_days_per_week, s.subscription_id, p.plan_name, t.tier_name, t.tier_rank,
       s.start_date, s.end_date, s.status AS plan_status,
       (SELECT up.plan_name FROM subscriptions s2 JOIN membership_plans up ON up.plan_id = s2.plan_id
         WHERE s2.member_id = m.member_id AND s2.status = 'UPCOMING') AS queued_renewal,
       EXISTS (SELECT 1 FROM attendance a WHERE a.member_id = m.member_id AND a.check_out_time IS NULL) AS is_inside
FROM members m
JOIN users u ON u.user_id = m.member_id
JOIN branches hb ON hb.branch_id = m.branch_id
LEFT JOIN subscriptions s ON s.member_id = m.member_id AND s.status = 'ACTIVE'
LEFT JOIN membership_plans p ON p.plan_id = s.plan_id
LEFT JOIN tiers t ON t.tier_id = p.tier_id;

-- Maintenance cost per branch and month
CREATE OR REPLACE VIEW v_maintenance_cost AS
SELECT DATE_FORMAT(m.resolved_date, '%Y-%m') AS month, e.branch_id, b.branch_name,
       COUNT(*) AS jobs, SUM(m.cost) AS total_cost
FROM equipment_maintenance m
JOIN equipment e ON e.equipment_id = m.equipment_id
JOIN branches b ON b.branch_id = e.branch_id
WHERE m.status = 'RESOLVED'
GROUP BY DATE_FORMAT(m.resolved_date, '%Y-%m'), e.branch_id, b.branch_name;
