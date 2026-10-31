-- =====================================================================
-- 08_phase2.sql : Phase 2 database objects (no new tables, no data loss)
-- Run from the project root after 00_run_all.sql:
--   mysql -u root -p --execute="source phase2/database/mysql/08_phase2.sql"
-- Adds: progression, comparison, volume, muscle-group, goal and leaderboard
-- views; the routine builder; goal / challenge / service-alert jobs.
-- To include Phase 2 in every fresh build, also add this line to the end of
-- database/mysql/00_run_all.sql:  source phase2/database/mysql/08_phase2.sql
-- =====================================================================
USE gym_management;

-- ---------------------------------------------------------------------
-- Analytics views
-- ---------------------------------------------------------------------

-- Weekly best weight and volume per member and weighted exercise, with week-on-week change
CREATE OR REPLACE VIEW v_exercise_progression AS
WITH weekly AS (
  SELECT a.member_id, ws.exercise_id, YEARWEEK(ws.performed_at, 3) AS yw,
         MIN(DATE(ws.performed_at)) AS week_start,
         MAX(ws.weight_kg) AS best_weight, MAX(ws.reps) AS best_reps,
         SUM(IFNULL(ws.reps, 0) * IFNULL(ws.weight_kg, 0)) AS volume_kg, COUNT(*) AS sets
  FROM workout_sets ws JOIN attendance a ON a.attendance_id = ws.attendance_id
  GROUP BY a.member_id, ws.exercise_id, YEARWEEK(ws.performed_at, 3)
)
SELECT w.member_id, w.exercise_id, e.exercise_name, e.muscle_group, e.measure_type, w.yw, w.week_start,
       w.best_weight, w.best_reps, w.volume_kg, w.sets,
       w.best_weight - LAG(w.best_weight) OVER (PARTITION BY w.member_id, w.exercise_id ORDER BY w.yw) AS weight_change,
       CASE
         WHEN LAG(w.best_weight) OVER (PARTITION BY w.member_id, w.exercise_id ORDER BY w.yw) IS NULL THEN 'FIRST'
         WHEN w.best_weight > LAG(w.best_weight) OVER (PARTITION BY w.member_id, w.exercise_id ORDER BY w.yw) THEN 'IMPROVED'
         WHEN w.best_weight < LAG(w.best_weight) OVER (PARTITION BY w.member_id, w.exercise_id ORDER BY w.yw) THEN 'REGRESSED'
         ELSE 'SAME'
       END AS trend
FROM weekly w JOIN exercises e ON e.exercise_id = w.exercise_id;

-- Each visit's performance per exercise compared with the previous time the exercise was done
CREATE OR REPLACE VIEW v_workout_comparison AS
WITH per_visit AS (
  SELECT a.member_id, ws.attendance_id, DATE(a.check_in_time) AS visit_date, ws.exercise_id,
         MAX(ws.weight_kg) AS best_weight, SUM(ws.reps) AS total_reps,
         SUM(IFNULL(ws.reps, 0) * IFNULL(ws.weight_kg, 0)) AS volume_kg,
         SUM(IFNULL(ws.duration_seconds, 0)) AS seconds, SUM(IFNULL(ws.distance_m, 0)) AS distance_m, COUNT(*) AS sets
  FROM workout_sets ws JOIN attendance a ON a.attendance_id = ws.attendance_id
  GROUP BY a.member_id, ws.attendance_id, DATE(a.check_in_time), ws.exercise_id
)
SELECT p.*, e.exercise_name, e.measure_type,
       LAG(p.visit_date)  OVER w AS prev_date,
       LAG(p.best_weight) OVER w AS prev_best_weight,
       LAG(p.total_reps)  OVER w AS prev_total_reps,
       LAG(p.volume_kg)   OVER w AS prev_volume_kg,
       LAG(p.seconds)     OVER w AS prev_seconds,
       p.volume_kg - LAG(p.volume_kg) OVER w AS volume_change
FROM per_visit p JOIN exercises e ON e.exercise_id = p.exercise_id
WINDOW w AS (PARTITION BY p.member_id, p.exercise_id ORDER BY p.visit_date, p.attendance_id);

-- Weekly training volume per muscle group
CREATE OR REPLACE VIEW v_training_volume AS
SELECT a.member_id, YEARWEEK(ws.performed_at, 3) AS yw, MIN(DATE(ws.performed_at)) AS week_start, e.muscle_group,
       COUNT(*) AS sets, SUM(IFNULL(ws.reps, 0)) AS reps,
       SUM(IFNULL(ws.reps, 0) * IFNULL(ws.weight_kg, 0)) AS volume_kg,
       ROUND(SUM(IFNULL(ws.duration_seconds, 0)) / 60) AS minutes
FROM workout_sets ws
JOIN attendance a ON a.attendance_id = ws.attendance_id
JOIN exercises e ON e.exercise_id = ws.exercise_id
GROUP BY a.member_id, YEARWEEK(ws.performed_at, 3), e.muscle_group;

-- How often and how hard each muscle group was trained in the last 28 days
CREATE OR REPLACE VIEW v_muscle_group_activity AS
SELECT m.member_id, g.muscle_group,
       COUNT(x.set_id) AS sets_28d,
       COUNT(DISTINCT x.day) AS days_28d,
       IFNULL(SUM(x.volume), 0) AS volume_28d,
       (SELECT MAX(DATE(ws2.performed_at)) FROM workout_sets ws2 JOIN attendance a2 ON a2.attendance_id = ws2.attendance_id
          JOIN exercises e2 ON e2.exercise_id = ws2.exercise_id
         WHERE a2.member_id = m.member_id AND e2.muscle_group = g.muscle_group) AS last_trained
FROM members m
CROSS JOIN (SELECT 'CHEST' AS muscle_group UNION ALL SELECT 'BACK' UNION ALL SELECT 'SHOULDERS' UNION ALL SELECT 'ARMS'
            UNION ALL SELECT 'LEGS' UNION ALL SELECT 'CORE' UNION ALL SELECT 'FULL_BODY' UNION ALL SELECT 'CARDIO') g
LEFT JOIN (
  SELECT a.member_id, e.muscle_group, ws.set_id, DATE(ws.performed_at) AS day, IFNULL(ws.reps, 0) * IFNULL(ws.weight_kg, 0) AS volume
  FROM workout_sets ws JOIN attendance a ON a.attendance_id = ws.attendance_id JOIN exercises e ON e.exercise_id = ws.exercise_id
  WHERE ws.performed_at >= CURDATE() - INTERVAL 28 DAY
) x ON x.member_id = m.member_id AND x.muscle_group = g.muscle_group
GROUP BY m.member_id, g.muscle_group;

-- Goals with the current value measured from the logged data
CREATE OR REPLACE VIEW v_goal_progress AS
SELECT g.goal_id, g.member_id, g.goal_type, g.exercise_id, x.exercise_name, g.target_value, g.start_date, g.target_date,
       g.status, g.achieved_on,
       CASE g.goal_type
         WHEN 'EXERCISE_WEIGHT' THEN (SELECT MAX(ws.weight_kg) FROM workout_sets ws JOIN attendance a ON a.attendance_id = ws.attendance_id
                                       WHERE a.member_id = g.member_id AND ws.exercise_id = g.exercise_id AND DATE(ws.performed_at) >= g.start_date)
         WHEN 'EXERCISE_REPS'   THEN (SELECT MAX(ws.reps) FROM workout_sets ws JOIN attendance a ON a.attendance_id = ws.attendance_id
                                       WHERE a.member_id = g.member_id AND ws.exercise_id = g.exercise_id AND DATE(ws.performed_at) >= g.start_date)
         WHEN 'MONTHLY_VISITS'  THEN (SELECT COUNT(DISTINCT DATE(a.check_in_time)) FROM attendance a
                                       WHERE a.member_id = g.member_id AND a.check_in_time >= DATE_FORMAT(CURDATE(), '%Y-%m-01'))
         WHEN 'WORKOUT_STREAK'  THEN (SELECT current_streak FROM v_member_streaks s WHERE s.member_id = g.member_id)
       END AS current_value
FROM fitness_goals g LEFT JOIN exercises x ON x.exercise_id = g.exercise_id;

-- Live leaderboard for every challenge (score depends on the challenge metric)
CREATE OR REPLACE VIEW v_challenge_leaderboard AS
WITH visits AS (
  SELECT cp.challenge_id, cp.member_id, DATE(a.check_in_time) AS d
  FROM challenge_participants cp
  JOIN challenges c ON c.challenge_id = cp.challenge_id
  JOIN attendance a ON a.member_id = cp.member_id
   AND DATE(a.check_in_time) BETWEEN c.start_date AND c.end_date
   AND (c.branch_id IS NULL OR a.branch_id = c.branch_id)
  GROUP BY cp.challenge_id, cp.member_id, DATE(a.check_in_time)
),
runs AS (
  SELECT challenge_id, member_id, COUNT(*) AS len
  FROM (SELECT challenge_id, member_id, d,
               DATE_SUB(d, INTERVAL ROW_NUMBER() OVER (PARTITION BY challenge_id, member_id ORDER BY d) DAY) AS grp
          FROM visits) t
  GROUP BY challenge_id, member_id, grp
),
scores AS (
  SELECT c.challenge_id, cp.member_id,
         CASE c.metric
           WHEN 'TOTAL_VISITS' THEN (SELECT COUNT(*) FROM visits v WHERE v.challenge_id = c.challenge_id AND v.member_id = cp.member_id)
           WHEN 'LONGEST_STREAK' THEN (SELECT IFNULL(MAX(len), 0) FROM runs r WHERE r.challenge_id = c.challenge_id AND r.member_id = cp.member_id)
           WHEN 'TOTAL_VOLUME' THEN (SELECT IFNULL(SUM(IFNULL(ws.reps, 0) * IFNULL(ws.weight_kg, 0)), 0)
                                       FROM workout_sets ws JOIN attendance a ON a.attendance_id = ws.attendance_id
                                      WHERE a.member_id = cp.member_id AND DATE(ws.performed_at) BETWEEN c.start_date AND c.end_date
                                        AND (c.branch_id IS NULL OR a.branch_id = c.branch_id))
           WHEN 'EXERCISE_MAX_WEIGHT' THEN (SELECT IFNULL(MAX(ws.weight_kg), 0)
                                       FROM workout_sets ws JOIN attendance a ON a.attendance_id = ws.attendance_id
                                      WHERE a.member_id = cp.member_id AND ws.exercise_id = c.exercise_id
                                        AND DATE(ws.performed_at) BETWEEN c.start_date AND c.end_date
                                        AND (c.branch_id IS NULL OR a.branch_id = c.branch_id))
         END AS score
  FROM challenges c JOIN challenge_participants cp ON cp.challenge_id = c.challenge_id
)
SELECT s.challenge_id, s.member_id, u.full_name AS member_name, s.score,
       RANK() OVER (PARTITION BY s.challenge_id ORDER BY s.score DESC) AS live_rank
FROM scores s JOIN users u ON u.user_id = s.member_id;

-- Machine hours since the last completed service, against the rule for its type
CREATE OR REPLACE VIEW v_service_due AS
SELECT e.equipment_id, e.name, e.branch_id, b.branch_name, c.category_name, r.service_interval_hours,
       (SELECT MAX(m.resolved_date) FROM equipment_maintenance m
         WHERE m.equipment_id = e.equipment_id AND m.maintenance_type = 'SCHEDULED_SERVICE' AND m.status = 'RESOLVED') AS last_service,
       ROUND(IFNULL((SELECT SUM(TIMESTAMPDIFF(MINUTE, u.start_time, IFNULL(u.end_time, NOW()))) FROM equipment_usage_log u
         WHERE u.equipment_id = e.equipment_id
           AND u.start_time >= IFNULL((SELECT MAX(m.resolved_date) FROM equipment_maintenance m
                                        WHERE m.equipment_id = e.equipment_id AND m.maintenance_type = 'SCHEDULED_SERVICE' AND m.status = 'RESOLVED'),
                                      e.purchase_date)), 0) / 60, 1) AS hours_since_service,
       EXISTS (SELECT 1 FROM equipment_maintenance m WHERE m.equipment_id = e.equipment_id
                 AND m.maintenance_type = 'SCHEDULED_SERVICE' AND m.status <> 'RESOLVED') AS service_open
FROM equipment e
JOIN maintenance_rules r ON r.category_id = e.category_id
JOIN equipment_categories c ON c.category_id = e.category_id
JOIN branches b ON b.branch_id = e.branch_id
WHERE e.status <> 'RETIRED';

DELIMITER $$

-- ---------------------------------------------------------------------
-- Routine builder (distinguishing feature)
-- Builds a weekly routine over the member's training days, covering all
-- muscle groups, preferring the exercises on machines the member rated
-- most comfortable, with targets from recent performance.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_build_routine $$
CREATE PROCEDURE sp_build_routine(IN p_member INT, IN p_days TINYINT, OUT p_template INT)
BEGIN
  DECLARE v_days TINYINT; DECLARE v_home INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SELECT branch_id, IFNULL(NULLIF(p_days, 0), training_days_per_week) INTO v_home, v_days FROM members WHERE member_id = p_member;
  IF v_home IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown member'; END IF;
  IF v_days < 1 OR v_days > 7 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Training days must be between 1 and 7'; END IF;

  -- which muscle groups go on which day (slots = number of exercises)
  DROP TEMPORARY TABLE IF EXISTS tmp_split;
  -- occ = how many earlier days already train this muscle (so later days pick different exercises)
  CREATE TEMPORARY TABLE tmp_split (day_number TINYINT, muscle_group VARCHAR(12), slots TINYINT, ord TINYINT, occ TINYINT DEFAULT 0);
  CASE v_days
    WHEN 1 THEN INSERT INTO tmp_split VALUES (1,'LEGS',1,1,0),(1,'CHEST',1,2,0),(1,'BACK',1,3,0),(1,'SHOULDERS',1,4,0),(1,'CORE',1,5,0),(1,'CARDIO',1,6,0);
    WHEN 2 THEN INSERT INTO tmp_split VALUES (1,'CHEST',1,1,0),(1,'BACK',1,2,0),(1,'SHOULDERS',1,3,0),(1,'ARMS',1,4,0),(2,'LEGS',2,1,0),(2,'CORE',1,2,0),(2,'CARDIO',1,3,0);
    WHEN 3 THEN INSERT INTO tmp_split VALUES (1,'CHEST',2,1,0),(1,'SHOULDERS',1,2,0),(1,'ARMS',1,3,0),(2,'BACK',2,1,0),(2,'ARMS',1,2,1),(2,'CORE',1,3,0),(3,'LEGS',2,1,0),(3,'CORE',1,2,1),(3,'CARDIO',1,3,0);
    WHEN 4 THEN INSERT INTO tmp_split VALUES (1,'CHEST',2,1,0),(1,'ARMS',1,2,0),(2,'BACK',2,1,0),(2,'CORE',1,2,0),(3,'LEGS',3,1,0),(4,'SHOULDERS',2,1,0),(4,'CARDIO',1,2,0);
    WHEN 5 THEN INSERT INTO tmp_split VALUES (1,'CHEST',2,1,0),(1,'CARDIO',1,2,0),(2,'BACK',2,1,0),(2,'CORE',1,2,0),(3,'LEGS',3,1,0),(4,'SHOULDERS',2,1,0),(4,'ARMS',1,2,0),(5,'CORE',1,1,1),(5,'CARDIO',1,2,1),(5,'ARMS',1,3,1);
    WHEN 6 THEN INSERT INTO tmp_split VALUES (1,'CHEST',2,1,0),(2,'BACK',2,1,0),(3,'LEGS',3,1,0),(4,'SHOULDERS',2,1,0),(5,'ARMS',2,1,0),(6,'CORE',2,1,0),(6,'CARDIO',1,2,0);
    ELSE INSERT INTO tmp_split VALUES (1,'CHEST',2,1,0),(2,'BACK',2,1,0),(3,'LEGS',3,1,0),(4,'SHOULDERS',2,1,0),(5,'ARMS',2,1,0),(6,'CORE',2,1,0),(7,'CARDIO',2,1,0);
  END CASE;

  -- every exercise scored for this member: own average comfort on that machine type
  -- (3 if never rated; body-weight exercises count as 3), then how often it was done
  DROP TEMPORARY TABLE IF EXISTS tmp_scores;
  CREATE TEMPORARY TABLE tmp_scores AS
  SELECT x.exercise_id, x.muscle_group, x.category_id, x.measure_type,
         IFNULL((SELECT AVG(u.comfort_rating) FROM equipment_usage_log u JOIN equipment eq ON eq.equipment_id = u.equipment_id
                  WHERE u.member_id = p_member AND eq.category_id = x.category_id AND u.comfort_rating IS NOT NULL), 3) AS comfort,
         (SELECT COUNT(*) FROM workout_sets ws JOIN attendance a ON a.attendance_id = ws.attendance_id
           WHERE a.member_id = p_member AND ws.exercise_id = x.exercise_id) AS times_done,
         (SELECT MAX(ws.weight_kg) FROM workout_sets ws JOIN attendance a ON a.attendance_id = ws.attendance_id
           WHERE a.member_id = p_member AND ws.exercise_id = x.exercise_id AND ws.performed_at >= CURDATE() - INTERVAL 8 WEEK) AS recent_weight,
         (SELECT MAX(ws.reps) FROM workout_sets ws JOIN attendance a ON a.attendance_id = ws.attendance_id
           WHERE a.member_id = p_member AND ws.exercise_id = x.exercise_id AND ws.performed_at >= CURDATE() - INTERVAL 8 WEEK) AS recent_reps,
         -- a machine of this type at the home branch that is not retired (the member's most comfortable one first)
         (SELECT eq.equipment_id FROM equipment eq
           WHERE eq.branch_id = v_home AND eq.category_id = x.category_id AND eq.status <> 'RETIRED'
           ORDER BY (SELECT IFNULL(AVG(u.comfort_rating), 0) FROM equipment_usage_log u WHERE u.equipment_id = eq.equipment_id AND u.member_id = p_member) DESC,
                    eq.equipment_id LIMIT 1) AS machine
  FROM exercises x;
  -- exercises whose machine type does not exist at the home branch cannot be used
  DELETE FROM tmp_scores WHERE category_id IS NOT NULL AND machine IS NULL;

  START TRANSACTION;
  UPDATE workout_templates SET is_active = FALSE WHERE for_member_id = p_member AND source = 'GENERATED' AND is_active;
  INSERT INTO workout_templates (template_name, created_by, for_member_id, source, days_per_week, created_at)
  VALUES (CONCAT('Personal routine (', v_days, ' days) - ', DATE_FORMAT(CURDATE(), '%d %b %Y')), p_member, p_member, 'GENERATED', v_days, NOW());
  SET p_template = LAST_INSERT_ID();

  INSERT INTO template_exercises (template_id, day_number, exercise_order, exercise_id, preferred_equipment_id,
                                  target_sets, target_reps, target_weight_kg, target_duration_seconds)
  SELECT p_template, picked.day_number,
         ROW_NUMBER() OVER (PARTITION BY picked.day_number ORDER BY picked.ord, picked.pick_rank),
         picked.exercise_id, picked.machine,
         IF(picked.measure_type = 'TIME_DISTANCE', 1, 3),
         CASE picked.measure_type WHEN 'TIME_DISTANCE' THEN NULL
              WHEN 'REPS_ONLY' THEN IFNULL(picked.recent_reps, 12) ELSE 10 END,
         IF(picked.measure_type = 'WEIGHT_REPS' AND picked.recent_weight IS NOT NULL,
            GREATEST(ROUND(picked.recent_weight * 0.9 / 2.5) * 2.5, 2.5), NULL),
         CASE WHEN picked.measure_type <> 'TIME_DISTANCE' THEN NULL
              WHEN picked.muscle_group = 'CORE' THEN 60 ELSE 1200 END
  FROM (
    SELECT sp.day_number, sp.ord, sc.*,
           ROW_NUMBER() OVER (PARTITION BY sp.day_number, sp.muscle_group
                              ORDER BY sc.comfort DESC, sc.times_done DESC, sc.exercise_id) AS pick_rank,
           COUNT(*) OVER (PARTITION BY sp.day_number, sp.muscle_group) AS candidates,
           sp.slots, sp.occ
    FROM tmp_split sp JOIN tmp_scores sc ON sc.muscle_group = sp.muscle_group
  ) picked
  -- first occurrence takes the best-rated exercises, a later day for the same muscle takes the next ones
  WHERE MOD(CAST(picked.pick_rank AS SIGNED) - 1 - picked.occ * picked.slots + 100 * CAST(picked.candidates AS SIGNED),
            CAST(picked.candidates AS SIGNED)) < LEAST(picked.slots, picked.candidates);
  COMMIT;
  DROP TEMPORARY TABLE IF EXISTS tmp_split;
  DROP TEMPORARY TABLE IF EXISTS tmp_scores;
END $$

-- Goals: ACTIVE -> ACHIEVED when the measured value reaches the target, -> EXPIRED after the deadline
DROP PROCEDURE IF EXISTS sp_update_goals $$
CREATE PROCEDURE sp_update_goals()
BEGIN
  UPDATE fitness_goals g JOIN v_goal_progress p ON p.goal_id = g.goal_id
     SET g.status = 'ACHIEVED', g.achieved_on = CURDATE()
   WHERE g.status = 'ACTIVE' AND p.current_value >= g.target_value;
  UPDATE fitness_goals SET status = 'EXPIRED'
   WHERE status = 'ACTIVE' AND target_date < CURDATE();
END $$

-- Challenges that have ended get their final score and rank stored once
DROP PROCEDURE IF EXISTS sp_finalize_challenges $$
CREATE PROCEDURE sp_finalize_challenges()
BEGIN
  UPDATE challenge_participants cp
    JOIN challenges c ON c.challenge_id = cp.challenge_id
    JOIN v_challenge_leaderboard l ON l.challenge_id = cp.challenge_id AND l.member_id = cp.member_id
     SET cp.final_score = l.score, cp.final_rank = l.live_rank
   WHERE c.end_date < CURDATE() AND cp.final_rank IS NULL;
END $$

-- Machines past their service interval get a SCHEDULED_SERVICE record (once)
DROP PROCEDURE IF EXISTS sp_generate_service_alerts $$
CREATE PROCEDURE sp_generate_service_alerts(OUT p_created INT)
BEGIN
  INSERT INTO equipment_maintenance (equipment_id, maintenance_type, reported_issue, reported_by, reported_date, status)
  SELECT equipment_id, 'SCHEDULED_SERVICE',
         CONCAT('Service due: ', ROUND(hours_since_service), ' hours of use (rule: every ', service_interval_hours, ' hours)'),
         NULL, CURDATE(), 'REPORTED'
    FROM v_service_due
   WHERE hours_since_service >= service_interval_hours AND NOT service_open;
  SET p_created = ROW_COUNT();
END $$

DROP EVENT IF EXISTS ev_phase2_jobs $$
CREATE EVENT ev_phase2_jobs
ON SCHEDULE EVERY 1 HOUR STARTS CURRENT_TIMESTAMP
DO
BEGIN
  CALL sp_update_goals();
  CALL sp_finalize_challenges();
  CALL sp_generate_service_alerts(@ignored);
END $$

DELIMITER ;

-- run the jobs once now so the demo data is up to date
CALL sp_update_goals();
CALL sp_finalize_challenges();
SELECT 'Phase 2 database objects installed' AS status;
