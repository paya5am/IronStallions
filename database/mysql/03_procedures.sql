-- =====================================================================
-- 03_procedures.sql : stored procedures called by the Next.js API layer
-- Each multi-step operation runs in one transaction; on any error the
-- transaction is rolled back and the original error is re-raised.
-- =====================================================================
USE gym_management;

DELIMITER $$

-- ---------------------------------------------------------------------
-- Login and sessions
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_register_device $$
CREATE PROCEDURE sp_register_device(IN p_user INT, IN p_name VARCHAR(100), IN p_public_key TEXT,
                                    OUT p_device_id CHAR(36))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_user AND is_active) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown or disabled account';
  END IF;
  SET p_device_id = UUID();
  INSERT INTO user_devices (device_id, user_id, device_name, public_key, registered_at, is_active)
  VALUES (p_device_id, p_user, p_name, p_public_key, NOW(), TRUE);
END $$

DROP PROCEDURE IF EXISTS sp_create_session $$
CREATE PROCEDURE sp_create_session(IN p_user INT, IN p_device CHAR(36), IN p_info VARCHAR(200),
                                   IN p_ip VARCHAR(45), OUT p_session_id CHAR(36))
BEGIN
  DECLARE EXIT HANDLER FOR 1062
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This account is already logged in on another device. Log out there first.';
  -- sessions past their absolute expiry no longer count as valid
  UPDATE user_sessions SET is_valid = FALSE WHERE user_id = p_user AND is_valid AND expires_at <= NOW();
  SET p_session_id = UUID();
  INSERT INTO user_sessions (session_id, user_id, device_id, device_info, ip_address, login_time, expires_at, last_active, is_valid)
  VALUES (p_session_id, p_user, p_device, p_info, p_ip, NOW(), NOW() + INTERVAL 3 HOUR, NOW(), TRUE);
END $$

-- Returns one row (user_id, role, full_name, expires_at) when the session is usable, else no row.
DROP PROCEDURE IF EXISTS sp_validate_session $$
CREATE PROCEDURE sp_validate_session(IN p_session CHAR(36))
BEGIN
  UPDATE user_sessions SET is_valid = FALSE WHERE session_id = p_session AND is_valid AND expires_at <= NOW();
  UPDATE user_sessions SET last_active = NOW() WHERE session_id = p_session AND is_valid;
  SELECT s.session_id, s.user_id, u.role, u.full_name, s.expires_at
    FROM user_sessions s JOIN users u ON u.user_id = s.user_id
   WHERE s.session_id = p_session AND s.is_valid AND u.is_active;
END $$

DROP PROCEDURE IF EXISTS sp_end_session $$
CREATE PROCEDURE sp_end_session(IN p_session CHAR(36))
BEGIN
  UPDATE user_sessions SET is_valid = FALSE, logout_time = NOW() WHERE session_id = p_session AND is_valid;
END $$

-- ---------------------------------------------------------------------
-- QR code and check-in / check-out
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_generate_qr $$
CREATE PROCEDURE sp_generate_qr(IN p_session CHAR(36), OUT p_token CHAR(64), OUT p_expires DATETIME)
BEGIN
  DECLARE v_user INT;
  SELECT user_id INTO v_user FROM user_sessions WHERE session_id = p_session AND is_valid AND expires_at > NOW();
  IF v_user IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session expired; log in again';
  END IF;
  IF fn_user_role(v_user) <> 'MEMBER' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only members have a check-in QR code';
  END IF;
  IF fn_member_tier_on(v_user, CURDATE()) IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No active plan: buy a plan to get a check-in QR code';
  END IF;
  SET p_token = SHA2(CONCAT(UUID(), RAND(), p_session), 256);
  SET p_expires = NOW() + INTERVAL fn_setting_int('QR_VALID_SECONDS', 30) SECOND;
  UPDATE user_sessions SET qr_token = p_token, qr_expires_at = p_expires, qr_used = FALSE, last_active = NOW()
   WHERE session_id = p_session;
END $$

DROP PROCEDURE IF EXISTS sp_check_in_qr $$
CREATE PROCEDURE sp_check_in_qr(IN p_token CHAR(64), IN p_branch INT,
                                OUT p_attendance INT, OUT p_member INT)
BEGIN
  DECLARE v_session CHAR(36); DECLARE v_valid BOOLEAN; DECLARE v_exp DATETIME;
  DECLARE v_qr_exp DATETIME; DECLARE v_used BOOLEAN;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT session_id, user_id, is_valid, expires_at, qr_expires_at, qr_used
    INTO v_session, p_member, v_valid, v_exp, v_qr_exp, v_used
    FROM user_sessions WHERE qr_token = p_token FOR UPDATE;
  IF v_session IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid QR code';
  END IF;
  IF v_used THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This QR code has already been used';
  END IF;
  IF v_qr_exp < NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This QR code has expired; generate a new one';
  END IF;
  IF NOT v_valid OR v_exp <= NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The member''s login session has ended';
  END IF;
  UPDATE user_sessions SET qr_used = TRUE WHERE session_id = v_session;
  INSERT INTO attendance (member_id, branch_id, session_id, check_in_time)
  VALUES (p_member, p_branch, v_session, NOW());
  SET p_attendance = LAST_INSERT_ID();
  COMMIT;
END $$

DROP PROCEDURE IF EXISTS sp_check_in_manual $$
CREATE PROCEDURE sp_check_in_manual(IN p_staff INT, IN p_member INT, OUT p_attendance INT)
BEGIN
  DECLARE v_branch INT;
  SELECT branch_id INTO v_branch FROM staff WHERE staff_id = p_staff;
  IF v_branch IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only staff can check members in manually';
  END IF;
  INSERT INTO attendance (member_id, branch_id, checked_in_by, check_in_time)
  VALUES (p_member, v_branch, p_staff, NOW());
  SET p_attendance = LAST_INSERT_ID();
END $$

DROP PROCEDURE IF EXISTS sp_check_out $$
CREATE PROCEDURE sp_check_out(IN p_member INT, OUT p_attendance INT)
BEGIN
  SELECT attendance_id INTO p_attendance FROM attendance WHERE member_id = p_member AND check_out_time IS NULL;
  IF p_attendance IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Member is not checked in';
  END IF;
  UPDATE attendance SET check_out_time = GREATEST(NOW(), check_in_time + INTERVAL 1 SECOND)
   WHERE attendance_id = p_attendance;
END $$

-- ---------------------------------------------------------------------
-- Plans: buy / renew, upgrade or downgrade, cancel
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_buy_plan $$
CREATE PROCEDURE sp_buy_plan(IN p_member INT, IN p_plan INT, OUT p_subscription INT, OUT p_status VARCHAR(10))
BEGIN
  DECLARE v_active INT; DECLARE v_active_end DATE; DECLARE v_active_tier INT; DECLARE v_new_tier INT;
  DECLARE v_prev INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT tier_id INTO v_new_tier FROM membership_plans WHERE plan_id = p_plan AND is_active;
  IF v_new_tier IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This plan is not on sale';
  END IF;
  SELECT s.subscription_id, s.end_date, p.tier_id INTO v_active, v_active_end, v_active_tier
    FROM subscriptions s JOIN membership_plans p ON p.plan_id = s.plan_id
   WHERE s.member_id = p_member AND s.status = 'ACTIVE' FOR UPDATE;
  IF v_active IS NOT NULL THEN
    IF v_active_tier <> v_new_tier THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You already have a plan of another tier; use upgrade or downgrade';
    END IF;
    IF EXISTS (SELECT 1 FROM subscriptions WHERE member_id = p_member AND status = 'UPCOMING') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A renewal is already queued';
    END IF;
    INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, status, previous_subscription_id)
    VALUES (p_member, p_plan, v_active_end + INTERVAL 1 DAY, v_active_end + INTERVAL 1 DAY, 'UPCOMING', v_active);
    SET p_status = 'UPCOMING';
  ELSE
    -- link to the member's most recent plan that has no successor yet
    SELECT s.subscription_id INTO v_prev FROM subscriptions s
     WHERE s.member_id = p_member
       AND NOT EXISTS (SELECT 1 FROM subscriptions n WHERE n.previous_subscription_id = s.subscription_id)
     ORDER BY s.end_date DESC, s.subscription_id DESC LIMIT 1;
    INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, status, previous_subscription_id)
    VALUES (p_member, p_plan, CURDATE(), CURDATE(), 'ACTIVE', v_prev);
    SET p_status = 'ACTIVE';
  END IF;
  SET p_subscription = LAST_INSERT_ID();
  COMMIT;
END $$

DROP PROCEDURE IF EXISTS sp_change_plan $$
CREATE PROCEDURE sp_change_plan(IN p_member INT, IN p_plan INT, IN p_refund_method VARCHAR(10),
                                OUT p_subscription INT, OUT p_refund DECIMAL(10,2), OUT p_kind VARCHAR(10))
BEGIN
  DECLARE v_old INT; DECLARE v_old_end DATE; DECLARE v_old_price DECIMAL(10,2); DECLARE v_old_dur INT;
  DECLARE v_old_rank INT; DECLARE v_new_rank INT; DECLARE v_inv INT; DECLARE v_unused INT; DECLARE v_avail DECIMAL(10,2);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT s.subscription_id, s.end_date, p.price, p.duration_days, t.tier_rank
    INTO v_old, v_old_end, v_old_price, v_old_dur, v_old_rank
    FROM subscriptions s JOIN membership_plans p ON p.plan_id = s.plan_id JOIN tiers t ON t.tier_id = p.tier_id
   WHERE s.member_id = p_member AND s.status = 'ACTIVE' FOR UPDATE;
  IF v_old IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No active plan to change; buy a plan instead';
  END IF;
  SELECT t.tier_rank INTO v_new_rank FROM membership_plans p JOIN tiers t ON t.tier_id = p.tier_id
   WHERE p.plan_id = p_plan AND p.is_active;
  IF v_new_rank IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This plan is not on sale';
  END IF;
  IF v_new_rank = v_old_rank THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Same-tier changes are only allowed as a renewal after the current plan';
  END IF;
  IF EXISTS (SELECT 1 FROM subscriptions WHERE member_id = p_member AND status = 'UPCOMING') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancel the queued renewal before changing tier';
  END IF;
  SELECT invoice_id INTO v_inv FROM invoices WHERE subscription_id = v_old;
  IF fn_invoice_paid(v_inv) < (SELECT amount_due FROM invoices WHERE invoice_id = v_inv) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Clear the dues on the current plan before changing it';
  END IF;

  SET p_kind = IF(v_new_rank > v_old_rank, 'UPGRADED', 'DOWNGRADED');
  SET v_unused = DATEDIFF(v_old_end, CURDATE()) + 1;
  SET v_avail = fn_invoice_paid(v_inv) - fn_invoice_refunded(v_inv);
  SET p_refund = LEAST(ROUND(v_old_price * v_unused / v_old_dur, 2), v_avail);

  UPDATE subscriptions SET status = p_kind, closed_on = CURDATE() WHERE subscription_id = v_old;
  INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, status, previous_subscription_id)
  VALUES (p_member, p_plan, CURDATE(), CURDATE(), 'ACTIVE', v_old);
  SET p_subscription = LAST_INSERT_ID();
  IF p_refund > 0 THEN
    INSERT INTO payments (invoice_id, amount, payment_type, payment_method, paid_at, note)
    VALUES (v_inv, p_refund, 'REFUND', p_refund_method, NOW(),
            CONCAT('Pro-rata refund: ', v_unused, ' unused days (plan ', LOWER(p_kind), ')'));
  END IF;
  COMMIT;
END $$

DROP PROCEDURE IF EXISTS sp_cancel_plan $$
CREATE PROCEDURE sp_cancel_plan(IN p_member INT, IN p_refund_method VARCHAR(10), OUT p_refund DECIMAL(10,2))
BEGIN
  DECLARE v_sub INT; DECLARE v_end DATE; DECLARE v_price DECIMAL(10,2); DECLARE v_dur INT;
  DECLARE v_inv INT; DECLARE v_avail DECIMAL(10,2); DECLARE v_amt DECIMAL(10,2); DECLARE v_unused INT;
  DECLARE v_up INT; DECLARE v_up_start DATE; DECLARE v_up_inv INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SET p_refund = 0;
  SELECT subscription_id, start_date INTO v_up, v_up_start FROM subscriptions
   WHERE member_id = p_member AND status = 'UPCOMING' FOR UPDATE;
  SELECT s.subscription_id, s.end_date, p.price, p.duration_days INTO v_sub, v_end, v_price, v_dur
    FROM subscriptions s JOIN membership_plans p ON p.plan_id = s.plan_id
   WHERE s.member_id = p_member AND s.status = 'ACTIVE' FOR UPDATE;
  IF v_sub IS NULL AND v_up IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No plan to cancel';
  END IF;

  -- a queued renewal is cancelled with a full refund of whatever was paid
  IF v_up IS NOT NULL THEN
    SELECT invoice_id INTO v_up_inv FROM invoices WHERE subscription_id = v_up;
    UPDATE subscriptions SET status = 'CANCELLED', closed_on = v_up_start WHERE subscription_id = v_up;
    SET v_amt = fn_invoice_paid(v_up_inv) - fn_invoice_refunded(v_up_inv);
    IF v_amt > 0 THEN
      INSERT INTO payments (invoice_id, amount, payment_type, payment_method, paid_at, note)
      VALUES (v_up_inv, v_amt, 'REFUND', p_refund_method, NOW(), 'Full refund: queued renewal cancelled');
      SET p_refund = p_refund + v_amt;
    END IF;
    UPDATE invoices SET status = 'CANCELLED' WHERE invoice_id = v_up_inv;
  END IF;

  -- the current plan is cancelled with a pro-rata refund of what was paid
  IF v_sub IS NOT NULL THEN
    SELECT invoice_id INTO v_inv FROM invoices WHERE subscription_id = v_sub;
    SET v_unused = DATEDIFF(v_end, CURDATE()) + 1;
    SET v_avail = fn_invoice_paid(v_inv) - fn_invoice_refunded(v_inv);
    SET v_amt = LEAST(ROUND(v_price * v_unused / v_dur, 2), v_avail);
    UPDATE subscriptions SET status = 'CANCELLED', closed_on = CURDATE() WHERE subscription_id = v_sub;
    IF v_amt > 0 THEN
      INSERT INTO payments (invoice_id, amount, payment_type, payment_method, paid_at, note)
      VALUES (v_inv, v_amt, 'REFUND', p_refund_method, NOW(), CONCAT('Pro-rata refund: ', v_unused, ' unused days (plan cancelled)'));
      SET p_refund = p_refund + v_amt;
    END IF;
    IF fn_invoice_paid(v_inv) = 0 THEN
      UPDATE invoices SET status = 'CANCELLED' WHERE invoice_id = v_inv;
    END IF;
  END IF;
  COMMIT;
END $$

-- ---------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_record_payment $$
CREATE PROCEDURE sp_record_payment(IN p_invoice INT, IN p_amount DECIMAL(10,2), IN p_method VARCHAR(10),
                                   IN p_recorded_by INT, IN p_note VARCHAR(255),
                                   OUT p_payment INT, OUT p_status VARCHAR(10))
BEGIN
  INSERT INTO payments (invoice_id, amount, payment_type, payment_method, paid_at, recorded_by, note)
  VALUES (p_invoice, p_amount, 'PAYMENT', p_method, NOW(), p_recorded_by, p_note);
  SET p_payment = LAST_INSERT_ID();
  SELECT status INTO p_status FROM invoices WHERE invoice_id = p_invoice;
END $$

-- ---------------------------------------------------------------------
-- Personal training
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_book_session $$
CREATE PROCEDURE sp_book_session(IN p_member INT, IN p_availability INT, IN p_date DATE, IN p_start TIME,
                                 IN p_duration INT, OUT p_session INT)
BEGIN
  DECLARE EXIT HANDLER FOR 1062
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This slot is already booked on that date';
  IF p_date < CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot book a session in the past';
  END IF;
  INSERT INTO training_sessions (member_id, trainer_id, availability_id, session_date, start_time,
                                 duration_minutes, status, booked_at)
  SELECT p_member, trainer_id, p_availability, p_date, p_start, p_duration, 'SCHEDULED', NOW()
    FROM trainer_availability WHERE availability_id = p_availability;
  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown trainer slot';
  END IF;
  SET p_session = LAST_INSERT_ID();
END $$

-- Members cancelling inside the cut-off are still charged; cancellations by
-- the trainer, staff or admin are never charged.
DROP PROCEDURE IF EXISTS sp_cancel_session $$
CREATE PROCEDURE sp_cancel_session(IN p_session INT, IN p_user INT, IN p_refund_method VARCHAR(10),
                                   OUT p_refund DECIMAL(10,2), OUT p_charged BOOLEAN)
BEGIN
  DECLARE v_member INT; DECLARE v_trainer INT; DECLARE v_status VARCHAR(10); DECLARE v_start DATETIME;
  DECLARE v_role VARCHAR(10); DECLARE v_inv INT; DECLARE v_amt DECIMAL(10,2);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT member_id, trainer_id, status, TIMESTAMP(session_date, start_time)
    INTO v_member, v_trainer, v_status, v_start
    FROM training_sessions WHERE training_session_id = p_session FOR UPDATE;
  IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown session'; END IF;
  IF v_status <> 'SCHEDULED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only a scheduled session can be cancelled'; END IF;
  SET v_role = fn_user_role(p_user);
  IF NOT (p_user = v_member OR p_user = v_trainer OR v_role IN ('STAFF','ADMIN')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot cancel this session';
  END IF;
  SET p_charged = (p_user = v_member AND NOW() > v_start - INTERVAL fn_setting_int('PT_REFUND_CUTOFF_HOURS', 24) HOUR);
  SET p_refund = 0;
  UPDATE training_sessions SET status = 'CANCELLED', cancelled_at = NOW() WHERE training_session_id = p_session;
  IF NOT p_charged THEN
    SELECT invoice_id INTO v_inv FROM invoices WHERE training_session_id = p_session;
    SET v_amt = fn_invoice_paid(v_inv) - fn_invoice_refunded(v_inv);
    IF v_amt > 0 THEN
      INSERT INTO payments (invoice_id, amount, payment_type, payment_method, paid_at, note)
      VALUES (v_inv, v_amt, 'REFUND', p_refund_method, NOW(), 'Full refund: session cancelled in time');
      SET p_refund = v_amt;
    END IF;
    UPDATE invoices SET status = 'CANCELLED' WHERE invoice_id = v_inv;
  END IF;
  COMMIT;
END $$

DROP PROCEDURE IF EXISTS sp_complete_session $$
CREATE PROCEDURE sp_complete_session(IN p_session INT, IN p_trainer INT, IN p_status VARCHAR(10))
BEGIN
  IF p_status NOT IN ('COMPLETED','NO_SHOW') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Status must be COMPLETED or NO_SHOW';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM training_sessions WHERE training_session_id = p_session AND trainer_id = p_trainer) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This session belongs to another trainer';
  END IF;
  UPDATE training_sessions SET status = p_status WHERE training_session_id = p_session;
END $$

-- ---------------------------------------------------------------------
-- Equipment usage, substitution and maintenance
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_start_usage $$
CREATE PROCEDURE sp_start_usage(IN p_member INT, IN p_equipment INT, OUT p_usage INT)
BEGIN
  DECLARE v_att INT;
  DECLARE EXIT HANDLER FOR 1062
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Machine is busy, or you are already using another machine';
  SELECT attendance_id INTO v_att FROM attendance WHERE member_id = p_member AND check_out_time IS NULL;
  IF v_att IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Check in at the branch first';
  END IF;
  INSERT INTO equipment_usage_log (equipment_id, member_id, attendance_id, start_time)
  VALUES (p_equipment, p_member, v_att, NOW());
  SET p_usage = LAST_INSERT_ID();
END $$

DROP PROCEDURE IF EXISTS sp_end_usage $$
CREATE PROCEDURE sp_end_usage(IN p_usage INT, IN p_member INT, IN p_difficulty TINYINT, IN p_comfort TINYINT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM equipment_usage_log WHERE usage_id = p_usage AND member_id = p_member AND end_time IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No open usage to end';
  END IF;
  UPDATE equipment_usage_log
     SET end_time = GREATEST(NOW(), start_time + INTERVAL 1 SECOND),
         difficulty_rating = p_difficulty, comfort_rating = p_comfort
   WHERE usage_id = p_usage;
END $$

-- Available machines at the member's current branch that can replace p_equipment:
-- same machine type first, then same muscle group; ties broken by the member's own
-- comfort ratings for that machine type.
DROP PROCEDURE IF EXISTS sp_suggest_substitutes $$
CREATE PROCEDURE sp_suggest_substitutes(IN p_member INT, IN p_equipment INT)
BEGIN
  DECLARE v_branch INT; DECLARE v_cat INT; DECLARE v_muscle VARCHAR(12);
  SELECT branch_id INTO v_branch FROM attendance WHERE member_id = p_member AND check_out_time IS NULL;
  SELECT category_id, muscle_group INTO v_cat, v_muscle FROM equipment WHERE equipment_id = p_equipment;
  IF v_branch IS NULL THEN
    SELECT branch_id INTO v_branch FROM equipment WHERE equipment_id = p_equipment;
  END IF;
  SELECT e.equipment_id, e.name, c.category_name, e.muscle_group,
         IF(e.category_id = v_cat, 'Same machine type', 'Same muscle group') AS reason,
         (SELECT ROUND(AVG(u.comfort_rating), 1) FROM equipment_usage_log u JOIN equipment e2 ON e2.equipment_id = u.equipment_id
           WHERE u.member_id = p_member AND e2.category_id = e.category_id AND u.comfort_rating IS NOT NULL) AS your_comfort
    FROM equipment e JOIN equipment_categories c ON c.category_id = e.category_id
   WHERE e.branch_id = v_branch AND e.status = 'AVAILABLE' AND e.equipment_id <> p_equipment
     AND (e.category_id = v_cat OR e.muscle_group = v_muscle)
   ORDER BY (e.category_id = v_cat) DESC, your_comfort DESC, e.name
   LIMIT 5;
END $$

DROP PROCEDURE IF EXISTS sp_report_fault $$
CREATE PROCEDURE sp_report_fault(IN p_equipment INT, IN p_user INT, IN p_issue VARCHAR(255), OUT p_maintenance INT)
BEGIN
  INSERT INTO equipment_maintenance (equipment_id, maintenance_type, reported_issue, reported_by, reported_date, status)
  VALUES (p_equipment, 'FAULT', p_issue, p_user, CURDATE(), 'REPORTED');
  SET p_maintenance = LAST_INSERT_ID();
END $$

DROP PROCEDURE IF EXISTS sp_update_maintenance $$
CREATE PROCEDURE sp_update_maintenance(IN p_maintenance INT, IN p_status VARCHAR(12), IN p_cost DECIMAL(10,2))
BEGIN
  IF p_status = 'RESOLVED' AND p_cost IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Enter the repair cost to resolve';
  END IF;
  UPDATE equipment_maintenance SET status = p_status, cost = IFNULL(p_cost, cost) WHERE maintenance_id = p_maintenance;
  IF ROW_COUNT() = 0 AND NOT EXISTS (SELECT 1 FROM equipment_maintenance WHERE maintenance_id = p_maintenance) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown maintenance record';
  END IF;
END $$

-- ---------------------------------------------------------------------
-- Workout logging (personal records are detected by trigger)
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_log_set $$
CREATE PROCEDURE sp_log_set(IN p_member INT, IN p_exercise INT, IN p_usage INT, IN p_reps SMALLINT,
                            IN p_weight DECIMAL(5,2), IN p_duration INT, IN p_distance INT,
                            OUT p_set INT, OUT p_new_records INT)
BEGIN
  DECLARE v_att INT; DECLARE v_num INT;
  SELECT attendance_id INTO v_att FROM attendance WHERE member_id = p_member AND check_out_time IS NULL;
  IF v_att IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Check in at the branch first';
  END IF;
  SELECT IFNULL(MAX(set_number), 0) + 1 INTO v_num FROM workout_sets WHERE attendance_id = v_att AND exercise_id = p_exercise;
  INSERT INTO workout_sets (attendance_id, exercise_id, usage_id, set_number, reps, weight_kg, duration_seconds, distance_m, performed_at)
  VALUES (v_att, p_exercise, p_usage, v_num, p_reps, p_weight, p_duration, p_distance, NOW());
  SET p_set = LAST_INSERT_ID();
  SELECT COUNT(*) INTO p_new_records FROM personal_records WHERE set_id = p_set;
END $$

DELIMITER ;
