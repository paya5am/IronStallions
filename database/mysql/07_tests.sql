-- =====================================================================
-- 07_tests.sql : proves that the database enforces the business rules.
--   mysql -u root -p --execute="source database/mysql/07_tests.sql"
-- Part 1 prints the row count of every table.
-- Part 2 attempts invalid operations; each must be refused by MySQL.
-- Part 3 runs live flows (check-in, QR, machines). These need the current
--        time to be inside opening hours (05:30-22:30) and are skipped otherwise.
-- The tests leave a few harmless rows (a visit, a session). Re-run
-- 00_run_all.sql to reset the demo data.
-- =====================================================================
USE gym_management;

-- ---------------------------------------------------------------- part 1
SELECT 'tiers' AS table_name, COUNT(*) AS row_count FROM tiers
UNION ALL SELECT 'branches', COUNT(*) FROM branches
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'user_devices', COUNT(*) FROM user_devices
UNION ALL SELECT 'user_sessions', COUNT(*) FROM user_sessions
UNION ALL SELECT 'members', COUNT(*) FROM members
UNION ALL SELECT 'trainers', COUNT(*) FROM trainers
UNION ALL SELECT 'staff', COUNT(*) FROM staff
UNION ALL SELECT 'membership_plans', COUNT(*) FROM membership_plans
UNION ALL SELECT 'subscriptions', COUNT(*) FROM subscriptions
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'attendance', COUNT(*) FROM attendance
UNION ALL SELECT 'equipment_categories', COUNT(*) FROM equipment_categories
UNION ALL SELECT 'equipment', COUNT(*) FROM equipment
UNION ALL SELECT 'equipment_maintenance', COUNT(*) FROM equipment_maintenance
UNION ALL SELECT 'equipment_usage_log', COUNT(*) FROM equipment_usage_log
UNION ALL SELECT 'exercises', COUNT(*) FROM exercises
UNION ALL SELECT 'workout_sets', COUNT(*) FROM workout_sets
UNION ALL SELECT 'personal_records', COUNT(*) FROM personal_records
UNION ALL SELECT 'fitness_goals', COUNT(*) FROM fitness_goals
UNION ALL SELECT 'challenges', COUNT(*) FROM challenges
UNION ALL SELECT 'challenge_participants', COUNT(*) FROM challenge_participants
UNION ALL SELECT 'workout_templates', COUNT(*) FROM workout_templates
UNION ALL SELECT 'template_exercises', COUNT(*) FROM template_exercises
UNION ALL SELECT 'trainer_availability', COUNT(*) FROM trainer_availability
UNION ALL SELECT 'training_sessions', COUNT(*) FROM training_sessions
UNION ALL SELECT 'branch_closures', COUNT(*) FROM branch_closures
UNION ALL SELECT 'maintenance_rules', COUNT(*) FROM maintenance_rules
UNION ALL SELECT 'system_settings', COUNT(*) FROM system_settings;

-- ---------------------------------------------------------------- harness
DROP TEMPORARY TABLE IF EXISTS test_results;
CREATE TEMPORARY TABLE test_results (
  test_no INT AUTO_INCREMENT PRIMARY KEY, test_name VARCHAR(120), result VARCHAR(4), detail VARCHAR(255));

DELIMITER $$

-- Runs p_sql and expects MySQL to refuse it with a message containing p_expect.
DROP PROCEDURE IF EXISTS t_expect_error $$
CREATE PROCEDURE t_expect_error(IN p_name VARCHAR(120), IN p_sql TEXT, IN p_expect VARCHAR(120))
BEGIN
  DECLARE v_msg VARCHAR(255) DEFAULT NULL;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION GET DIAGNOSTICS CONDITION 1 v_msg = MESSAGE_TEXT;
  SET @t_sql = p_sql;
  PREPARE t_stmt FROM @t_sql;
  EXECUTE t_stmt;
  DEALLOCATE PREPARE t_stmt;
  IF v_msg IS NULL THEN
    INSERT INTO test_results (test_name, result, detail) VALUES (p_name, 'FAIL', 'Statement was accepted');
  ELSEIF v_msg LIKE CONCAT('%', p_expect, '%') THEN
    INSERT INTO test_results (test_name, result, detail) VALUES (p_name, 'PASS', v_msg);
  ELSE
    INSERT INTO test_results (test_name, result, detail) VALUES (p_name, 'FAIL', CONCAT('Unexpected: ', v_msg));
  END IF;
END $$

DROP PROCEDURE IF EXISTS t_check $$
CREATE PROCEDURE t_check(IN p_name VARCHAR(120), IN p_ok BOOLEAN, IN p_detail VARCHAR(255))
BEGIN
  INSERT INTO test_results (test_name, result, detail) VALUES (p_name, IF(p_ok, 'PASS', 'FAIL'), p_detail);
END $$

DROP PROCEDURE IF EXISTS t_run_all $$
CREATE PROCEDURE t_run_all()
BEGIN
  DECLARE v_open BOOLEAN;
  SET @A  = (SELECT user_id FROM users WHERE phone = '9000001001');   -- Gold, active
  SET @B  = (SELECT user_id FROM users WHERE phone = '9000001002');   -- plan expired
  SET @C  = (SELECT user_id FROM users WHERE phone = '9000001003');   -- Silver, active
  SET @X  = (SELECT user_id FROM users WHERE phone = '9000001013');   -- Silver, active (test member)
  SET @S1 = (SELECT user_id FROM users WHERE phone = '9000000011');   -- staff, Jayanagar (Silver)
  SET @S2 = (SELECT user_id FROM users WHERE phone = '9000000012');   -- staff, Koramangala (Gold)
  SET @T  = (SELECT user_id FROM users WHERE phone = '9000000101');   -- trainer, Koramangala
  SET @AD = (SELECT user_id FROM users WHERE phone = '9000000001');   -- admin

  -- ---------------------------------------------------------- part 2: refusals
  -- one valid login per user
  CALL sp_create_session(@X, (SELECT device_id FROM user_devices WHERE user_id = @X LIMIT 1), 'test', '127.0.0.1', @sess1);
  CALL t_expect_error('Duplicate login is refused',
    CONCAT('CALL sp_create_session(', @X, ', (SELECT device_id FROM user_devices WHERE user_id = ', @X, ' LIMIT 1), ''test2'', ''127.0.0.1'', @s2)'),
    'already logged in');
  CALL t_expect_error('Login from an unregistered device is refused',
    CONCAT('CALL sp_create_session(', @A, ', ''00000000-0000-0000-0000-000000000000'', ''x'', ''127.0.0.1'', @s3)'),
    'registered');

  -- plans
  CALL t_expect_error('Second ACTIVE plan for a member is refused',
    CONCAT('INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, status) VALUES (', @A, ', 1, CURDATE(), CURDATE(), ''ACTIVE'')'),
    'overlaps');
  CALL t_expect_error('Same-tier mid-plan change is refused',
    CONCAT('CALL sp_change_plan(', @A, ', (SELECT plan_id FROM membership_plans WHERE plan_name = ''Gold Monthly''), ''UPI'', @ns, @rf, @k)'),
    'Same-tier');
  CALL t_expect_error('Buying a different tier while a plan is active is refused',
    CONCAT('CALL sp_buy_plan(', @A, ', (SELECT plan_id FROM membership_plans WHERE plan_name = ''Silver Monthly''), @ns, @st)'),
    'another tier');

  -- payments
  CALL t_expect_error('Paying more than the amount due is refused',
    CONCAT('CALL sp_record_payment((SELECT i.invoice_id FROM invoices i JOIN subscriptions s ON s.subscription_id = i.subscription_id ',
           'WHERE s.member_id = ', @A, ' AND s.status = ''ACTIVE''), 1.00, ''UPI'', NULL, NULL, @p, @ps)'),
    'exceeds');
  CALL t_expect_error('Refund larger than the amount paid is refused',
    CONCAT('INSERT INTO payments (invoice_id, amount, payment_type, payment_method, paid_at) SELECT i.invoice_id, 999999, ''REFUND'', ''UPI'', NOW() ',
           'FROM invoices i JOIN subscriptions s ON s.subscription_id = i.subscription_id WHERE s.member_id = ', @A, ' AND s.status = ''ACTIVE'''),
    'Refund exceeds');
  CALL t_expect_error('Editing a payment is refused',
    'UPDATE payments SET amount = amount + 1 WHERE payment_id = 1', 'cannot be edited');
  CALL t_expect_error('Payment recorded by a member is refused',
    CONCAT('INSERT INTO payments (invoice_id, amount, payment_type, payment_method, paid_at, recorded_by) VALUES (1, 1, ''PAYMENT'', ''CASH'', NOW(), ', @C, ')'),
    'staff or admin');

  -- attendance rules checked against the visit's own timestamp
  CALL t_expect_error('Check-in without an active plan is refused',
    CONCAT('INSERT INTO attendance (member_id, branch_id, checked_in_by, check_in_time) VALUES (', @B, ', 1, ', @S1, ', TIMESTAMP(CURDATE() - INTERVAL 1 DAY, ''10:00:00''))'),
    'no active plan');
  CALL t_expect_error('Silver plan at a Gold branch is refused',
    CONCAT('INSERT INTO attendance (member_id, branch_id, checked_in_by, check_in_time) VALUES (', @C, ', 6, ', @S2, ', TIMESTAMP(CURDATE() - INTERVAL 1 DAY, ''10:00:00''))'),
    'tier does not cover');
  CALL t_expect_error('Check-in outside opening hours is refused',
    CONCAT('INSERT INTO attendance (member_id, branch_id, checked_in_by, check_in_time) VALUES (', @A, ', 1, ', @S1, ', TIMESTAMP(CURDATE() - INTERVAL 1 DAY, ''03:00:00''))'),
    'opening hours');
  CALL t_expect_error('Check-in on a branch close day is refused',
    CONCAT('INSERT INTO attendance (member_id, branch_id, checked_in_by, check_in_time) SELECT ', @A, ', 3, ',
           (SELECT staff_id FROM staff WHERE branch_id = 3 LIMIT 1), ', TIMESTAMP(closure_date, ''10:00:00'') FROM branch_closures ',
           'WHERE branch_id = 3 AND closure_date < CURDATE() LIMIT 1'),
    'closed');
  CALL t_expect_error('Staff checking a member in at another branch is refused',
    CONCAT('INSERT INTO attendance (member_id, branch_id, checked_in_by, check_in_time) VALUES (', @A, ', 6, ', @S1, ', TIMESTAMP(CURDATE() - INTERVAL 1 DAY, ''12:00:00''))'),
    'own branch');
  CALL t_expect_error('Future check-in is refused',
    CONCAT('INSERT INTO attendance (member_id, branch_id, checked_in_by, check_in_time) VALUES (', @A, ', 1, ', @S1, ', NOW() + INTERVAL 1 DAY)'),
    'future');

  -- personal training
  CALL t_expect_error('Double booking a trainer slot is refused',
    'CALL sp_book_session((SELECT member_id FROM members WHERE member_id <> (SELECT member_id FROM training_sessions WHERE status = ''SCHEDULED'' ORDER BY session_date LIMIT 1) AND fn_member_tier_on(member_id, CURDATE()) = 3 LIMIT 1), (SELECT availability_id FROM training_sessions WHERE status = ''SCHEDULED'' ORDER BY session_date LIMIT 1), (SELECT session_date FROM training_sessions WHERE status = ''SCHEDULED'' ORDER BY session_date LIMIT 1), (SELECT start_time FROM training_sessions WHERE status = ''SCHEDULED'' ORDER BY session_date LIMIT 1), 60, @ts)',
    'already booked');
  CALL t_expect_error('Booking on the wrong weekday is refused',
    CONCAT('CALL sp_book_session(', @A, ', (SELECT availability_id FROM trainer_availability WHERE trainer_id = ', @T,
           ' AND day_of_week = ''MON'' LIMIT 1), (CURDATE() + INTERVAL ((8 - WEEKDAY(CURDATE())) % 7) DAY) + INTERVAL 7 DAY + INTERVAL 1 DAY, ''07:00:00'', 60, @ts)'),
    'weekday');
  CALL t_expect_error('Silver member booking a Gold-branch trainer is refused',
    CONCAT('CALL sp_book_session(', @C, ', (SELECT availability_id FROM trainer_availability WHERE trainer_id = ', @T,
           ' AND day_of_week = ''MON'' LIMIT 1), CURDATE() + INTERVAL ((7 - WEEKDAY(CURDATE())) % 7) DAY + INTERVAL 7 DAY, ''07:00:00'', 60, @ts)'),
    'tier does not cover');
  CALL t_expect_error('Session longer than the slot is refused',
    CONCAT('CALL sp_book_session(', @A, ', (SELECT availability_id FROM trainer_availability WHERE trainer_id = ', @T,
           ' AND day_of_week = ''MON'' LIMIT 1), CURDATE() + INTERVAL ((7 - WEEKDAY(CURDATE())) % 7) DAY + INTERVAL 7 DAY, ''08:30:00'', 60, @ts)'),
    'fit inside');
  CALL t_expect_error('Completing a future session is refused',
    CONCAT('CALL sp_complete_session((SELECT training_session_id FROM training_sessions WHERE trainer_id = ', @T,
           ' AND status = ''SCHEDULED'' LIMIT 1), ', @T, ', ''COMPLETED'')'),
    'only after it has started');
  CALL t_expect_error('Overlapping trainer slot is refused',
    CONCAT('INSERT INTO trainer_availability (trainer_id, day_of_week, slot_start, slot_end) VALUES (', @T, ', ''MON'', ''08:00:00'', ''09:30:00'')'),
    'overlaps');

  -- equipment
  CALL t_expect_error('Setting equipment status by hand is refused',
    'UPDATE equipment SET status = ''AVAILABLE'' WHERE status = ''MAINTENANCE'' LIMIT 1', 'set automatically');

  -- roles and admin rules
  CALL t_expect_error('Trainer profile for a MEMBER user is refused',
    CONCAT('INSERT INTO trainers (trainer_id, branch_id, specialization, years_experience, hourly_rate) VALUES (', @C, ', 1, ''x'', 1, 100)'),
    'role TRAINER');
  CALL t_expect_error('Close day declared by staff is refused',
    CONCAT('INSERT INTO branch_closures (branch_id, closure_date, reason, created_by) VALUES (1, CURDATE() + INTERVAL 90 DAY, ''x'', ', @S1, ')'),
    'Only an admin');
  CALL t_expect_error('System setting changed by staff is refused',
    CONCAT('UPDATE system_settings SET setting_value = ''5'', updated_by = ', @S1, ' WHERE setting_key = ''SESSION_HOURS'''),
    'Only an admin');
  CALL t_expect_error('Changing an invoice amount after payment is refused',
    'UPDATE invoices SET amount_due = amount_due + 1 WHERE status = ''PAID'' LIMIT 1', 'after payments');

  -- ---------------------------------------------------------- part 3: live flows
  SET v_open = CURTIME() >= '05:30:00' AND CURTIME() < '22:25:00';
  IF NOT v_open THEN
    CALL t_check('Live flows (check-in, QR, machines)', TRUE, 'SKIPPED: current time is outside opening hours');
  ELSE
    -- QR: generate, scan once (accepted), scan again (refused)
    CALL sp_generate_qr(@sess1, @tok, @texp);
    CALL sp_check_in_qr(@tok, (SELECT branch_id FROM members WHERE member_id = @X), @att, @mem);
    CALL t_check('QR check-in is accepted', @att IS NOT NULL AND @mem = @X, CONCAT('attendance_id ', IFNULL(@att, 'NULL')));
    CALL t_expect_error('Re-using a QR code is refused', CONCAT('CALL sp_check_in_qr(''', @tok, ''', 5, @a, @m)'), 'already been used');
    CALL t_expect_error('Second check-in while inside is refused',
      CONCAT('CALL sp_check_in_manual(', (SELECT staff_id FROM staff WHERE branch_id = (SELECT branch_id FROM members WHERE member_id = @X) LIMIT 1), ', ', @X, ', @a)'),
      'already checked in');

    -- machines: start, try a second machine, try a broken machine, log a set, check out
    SET @eq1 = (SELECT equipment_id FROM equipment WHERE branch_id = (SELECT branch_id FROM members WHERE member_id = @X)
                AND category_id = 12 AND status = 'AVAILABLE' LIMIT 1);
    CALL sp_start_usage(@X, @eq1, @u1);
    CALL t_check('Starting a machine marks it OCCUPIED', (SELECT status FROM equipment WHERE equipment_id = @eq1) = 'OCCUPIED', CONCAT('equipment ', @eq1));
    CALL t_expect_error('Using two machines at once is refused',
      CONCAT('CALL sp_start_usage(', @X, ', (SELECT equipment_id FROM equipment WHERE branch_id = (SELECT branch_id FROM members WHERE member_id = ', @X,
             ') AND status = ''AVAILABLE'' LIMIT 1), @u2)'), 'already using');
    CALL t_expect_error('Logging a weighted exercise without weight is refused',
      CONCAT('CALL sp_log_set(', @X, ', 13, ', @u1, ', 10, NULL, NULL, NULL, @set, @pr)'), 'reps and weight');
    CALL sp_log_set(@X, 13, @u1, 5, 150.00, NULL, NULL, @set, @pr);
    CALL t_check('A record-breaking set creates a personal record', @pr > 0, CONCAT(@pr, ' new record(s)'));
    CALL sp_check_out(@X, @att);
    CALL t_check('Checking out ends machine use and frees the machine',
      (SELECT status FROM equipment WHERE equipment_id = @eq1) = 'AVAILABLE'
      AND (SELECT end_time FROM equipment_usage_log WHERE usage_id = @u1) IS NOT NULL, 'machine AVAILABLE again');
  END IF;

  CALL sp_end_session(@sess1);
  CALL t_check('Logging out allows a new login', (SELECT is_valid FROM user_sessions WHERE session_id = @sess1) = FALSE, 'session ended');
END $$

DELIMITER ;

CALL t_run_all();

SELECT test_no, result, test_name, detail FROM test_results ORDER BY test_no;
SELECT SUM(result = 'PASS') AS passed, SUM(result = 'FAIL') AS failed FROM test_results;

DROP PROCEDURE IF EXISTS t_run_all;
DROP PROCEDURE IF EXISTS t_expect_error;
DROP PROCEDURE IF EXISTS t_check;
