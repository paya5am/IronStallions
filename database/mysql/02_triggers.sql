-- =====================================================================
-- 02_triggers.sql : helper functions and every business-rule trigger
-- Rules check the record's own date/time, so historical seed data can be
-- inserted legally. Every refusal raises SQLSTATE 45000 with a readable
-- message that the web app shows to the user.
-- =====================================================================
USE gym_management;

DELIMITER $$

-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS fn_setting_int $$
CREATE FUNCTION fn_setting_int(p_key VARCHAR(50), p_default INT) RETURNS INT
READS SQL DATA
BEGIN
  DECLARE v VARCHAR(100);
  SELECT setting_value INTO v FROM system_settings WHERE setting_key = p_key;
  RETURN IFNULL(CAST(v AS SIGNED), p_default);
END $$

DROP FUNCTION IF EXISTS fn_user_role $$
CREATE FUNCTION fn_user_role(p_user INT) RETURNS VARCHAR(10)
READS SQL DATA
BEGIN
  DECLARE r VARCHAR(10);
  SELECT role INTO r FROM users WHERE user_id = p_user;
  RETURN r;
END $$

DROP FUNCTION IF EXISTS fn_dow $$
CREATE FUNCTION fn_dow(p_date DATE) RETURNS CHAR(3)
DETERMINISTIC NO SQL
BEGIN
  RETURN ELT(WEEKDAY(p_date) + 1, 'MON','TUE','WED','THU','FRI','SAT','SUN');
END $$

-- Highest tier rank a member's plans cover on a given date (NULL = no plan).
-- A plan covers [start_date, end_date], cut short the day it was closed.
DROP FUNCTION IF EXISTS fn_member_tier_on $$
CREATE FUNCTION fn_member_tier_on(p_member INT, p_date DATE) RETURNS INT
READS SQL DATA
BEGIN
  DECLARE r INT;
  SELECT MAX(t.tier_rank) INTO r
  FROM subscriptions s
  JOIN membership_plans p ON p.plan_id = s.plan_id
  JOIN tiers t ON t.tier_id = p.tier_id
  WHERE s.member_id = p_member
    AND p_date >= s.start_date
    AND p_date <= s.end_date
    AND (s.closed_on IS NULL OR p_date < s.closed_on);
  RETURN r;
END $$

DROP FUNCTION IF EXISTS fn_branch_rank $$
CREATE FUNCTION fn_branch_rank(p_branch INT) RETURNS INT
READS SQL DATA
BEGIN
  DECLARE r INT;
  SELECT t.tier_rank INTO r FROM branches b JOIN tiers t ON t.tier_id = b.tier_id WHERE b.branch_id = p_branch;
  RETURN r;
END $$

DROP FUNCTION IF EXISTS fn_branch_closed $$
CREATE FUNCTION fn_branch_closed(p_branch INT, p_date DATE) RETURNS BOOLEAN
READS SQL DATA
BEGIN
  RETURN EXISTS (SELECT 1 FROM branch_closures
                 WHERE closure_date = p_date AND (branch_id = p_branch OR branch_id IS NULL));
END $$

DROP FUNCTION IF EXISTS fn_invoice_paid $$
CREATE FUNCTION fn_invoice_paid(p_invoice INT) RETURNS DECIMAL(10,2)
READS SQL DATA
BEGIN
  RETURN (SELECT IFNULL(SUM(amount), 0) FROM payments WHERE invoice_id = p_invoice AND payment_type = 'PAYMENT');
END $$

DROP FUNCTION IF EXISTS fn_invoice_refunded $$
CREATE FUNCTION fn_invoice_refunded(p_invoice INT) RETURNS DECIMAL(10,2)
READS SQL DATA
BEGIN
  RETURN (SELECT IFNULL(SUM(amount), 0) FROM payments WHERE invoice_id = p_invoice AND payment_type = 'REFUND');
END $$

-- Status is derived from payments; OVERDUE depends on today's date.
DROP FUNCTION IF EXISTS fn_invoice_status $$
CREATE FUNCTION fn_invoice_status(p_invoice INT) RETURNS VARCHAR(10)
READS SQL DATA
BEGIN
  DECLARE v_status VARCHAR(10); DECLARE v_due DECIMAL(10,2); DECLARE v_date DATE; DECLARE v_paid DECIMAL(10,2);
  SELECT status, amount_due, due_date INTO v_status, v_due, v_date FROM invoices WHERE invoice_id = p_invoice;
  IF v_status = 'CANCELLED' THEN RETURN 'CANCELLED'; END IF;
  SET v_paid = fn_invoice_paid(p_invoice);
  IF v_paid >= v_due THEN RETURN 'PAID'; END IF;
  IF v_date < CURDATE() THEN RETURN 'OVERDUE'; END IF;
  IF v_paid > 0 THEN RETURN 'PARTIAL'; END IF;
  RETURN 'PENDING';
END $$

-- Recomputes a machine's status from its usage and maintenance rows.
-- The only code allowed to change equipment.status (besides RETIRED).
DROP PROCEDURE IF EXISTS sp_refresh_equipment $$
CREATE PROCEDURE sp_refresh_equipment(IN p_equipment INT)
BEGIN
  DECLARE v_old VARCHAR(12); DECLARE v_new VARCHAR(12);
  SELECT status INTO v_old FROM equipment WHERE equipment_id = p_equipment;
  IF v_old <> 'RETIRED' THEN
    IF EXISTS (SELECT 1 FROM equipment_maintenance
               WHERE equipment_id = p_equipment AND status <> 'RESOLVED'
                 AND (maintenance_type = 'FAULT' OR status = 'IN_PROGRESS')) THEN
      SET v_new = 'MAINTENANCE';
    ELSEIF EXISTS (SELECT 1 FROM equipment_usage_log WHERE equipment_id = p_equipment AND end_time IS NULL) THEN
      SET v_new = 'OCCUPIED';
    ELSE
      SET v_new = 'AVAILABLE';
    END IF;
    IF v_new <> v_old THEN
      SET @gym_internal = 1;
      UPDATE equipment SET status = v_new WHERE equipment_id = p_equipment;
      SET @gym_internal = 0;
    END IF;
  END IF;
END $$

-- Inserts a new personal record if p_value beats the current one.
DROP PROCEDURE IF EXISTS sp_pr_check $$
CREATE PROCEDURE sp_pr_check(IN p_member INT, IN p_exercise INT, IN p_type VARCHAR(12),
                             IN p_value DECIMAL(10,2), IN p_set INT, IN p_at DATETIME)
BEGIN
  DECLARE v_cur DECIMAL(10,2) DEFAULT NULL;
  IF p_value IS NOT NULL AND p_value > 0 THEN
    SELECT record_value INTO v_cur FROM personal_records
     WHERE member_id = p_member AND exercise_id = p_exercise AND record_type = p_type AND is_current = TRUE;
    IF v_cur IS NULL OR p_value > v_cur THEN
      UPDATE personal_records SET is_current = FALSE
       WHERE member_id = p_member AND exercise_id = p_exercise AND record_type = p_type AND is_current = TRUE;
      INSERT INTO personal_records (member_id, exercise_id, record_type, record_value, set_id, achieved_at, is_current)
      VALUES (p_member, p_exercise, p_type, p_value, p_set, p_at, TRUE);
    END IF;
  END IF;
END $$

-- ---------------------------------------------------------------------
-- users and role subtypes
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_users_bu $$
CREATE TRIGGER trg_users_bu BEFORE UPDATE ON users FOR EACH ROW
BEGIN
  IF NEW.role <> OLD.role AND (
       EXISTS (SELECT 1 FROM members  WHERE member_id  = OLD.user_id) OR
       EXISTS (SELECT 1 FROM trainers WHERE trainer_id = OLD.user_id) OR
       EXISTS (SELECT 1 FROM staff    WHERE staff_id   = OLD.user_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Role cannot be changed while a member, trainer or staff profile exists';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_members_bi $$
CREATE TRIGGER trg_members_bi BEFORE INSERT ON members FOR EACH ROW
BEGIN
  IF IFNULL(fn_user_role(NEW.member_id), '') <> 'MEMBER' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A member profile requires a user with role MEMBER';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_trainers_bi $$
CREATE TRIGGER trg_trainers_bi BEFORE INSERT ON trainers FOR EACH ROW
BEGIN
  IF IFNULL(fn_user_role(NEW.trainer_id), '') <> 'TRAINER' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A trainer profile requires a user with role TRAINER';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_staff_bi $$
CREATE TRIGGER trg_staff_bi BEFORE INSERT ON staff FOR EACH ROW
BEGIN
  IF IFNULL(fn_user_role(NEW.staff_id), '') <> 'STAFF' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A staff profile requires a user with role STAFF';
  END IF;
END $$

-- ---------------------------------------------------------------------
-- user_sessions: one valid login per user, absolute expiry
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_sessions_bi $$
CREATE TRIGGER trg_sessions_bi BEFORE INSERT ON user_sessions FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = NEW.user_id AND is_active) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This account is disabled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM user_devices WHERE device_id = NEW.device_id AND user_id = NEW.user_id AND is_active) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Login must be approved from a registered, active device of this user';
  END IF;
  SET NEW.expires_at = NEW.login_time + INTERVAL fn_setting_int('SESSION_HOURS', 3) HOUR;
  IF NEW.last_active IS NULL OR NEW.last_active < NEW.login_time THEN
    SET NEW.last_active = NEW.login_time;
  END IF;
  IF NEW.qr_token IS NOT NULL AND fn_user_role(NEW.user_id) <> 'MEMBER' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only members can hold a check-in QR code';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_sessions_bu $$
CREATE TRIGGER trg_sessions_bu BEFORE UPDATE ON user_sessions FOR EACH ROW
BEGIN
  IF NEW.user_id <> OLD.user_id OR NEW.login_time <> OLD.login_time OR NEW.device_id <> OLD.device_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session owner, device and login time cannot be changed';
  END IF;
  IF OLD.is_valid = FALSE AND NEW.is_valid = TRUE THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An ended session cannot be reopened; log in again';
  END IF;
  SET NEW.expires_at = OLD.expires_at;
  IF OLD.is_valid = TRUE AND NEW.is_valid = FALSE AND NEW.logout_time IS NULL THEN
    SET NEW.logout_time = LEAST(NOW(), OLD.expires_at);
  END IF;
  IF NEW.qr_token IS NOT NULL AND NOT (NEW.qr_token <=> OLD.qr_token) AND fn_user_role(NEW.user_id) <> 'MEMBER' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only members can hold a check-in QR code';
  END IF;
END $$

-- ---------------------------------------------------------------------
-- subscriptions: dates, overlaps, status transitions, automatic invoice
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_subs_bi $$
CREATE TRIGGER trg_subs_bi BEFORE INSERT ON subscriptions FOR EACH ROW
BEGIN
  DECLARE v_dur INT; DECLARE v_new_end DATE;
  SELECT duration_days INTO v_dur FROM membership_plans WHERE plan_id = NEW.plan_id;
  IF v_dur IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown membership plan';
  END IF;
  SET NEW.end_date = NEW.start_date + INTERVAL (v_dur - 1) DAY;

  IF NEW.status = 'ACTIVE'   AND NOT (NEW.start_date <= CURDATE() AND NEW.end_date >= CURDATE()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An ACTIVE plan must cover today';
  END IF;
  IF NEW.status = 'UPCOMING' AND NEW.start_date <= CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An UPCOMING plan must start after today';
  END IF;
  IF NEW.status = 'EXPIRED'  AND NEW.end_date >= CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An EXPIRED plan must have ended before today';
  END IF;

  IF NEW.previous_subscription_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM subscriptions WHERE subscription_id = NEW.previous_subscription_id AND member_id = NEW.member_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The previous subscription must belong to the same member';
  END IF;

  -- effective coverage of the new row: [start, end] cut at closed_on
  SET v_new_end = IF(NEW.closed_on IS NULL, NEW.end_date, NEW.closed_on - INTERVAL 1 DAY);
  IF v_new_end >= NEW.start_date AND EXISTS (
       SELECT 1 FROM subscriptions s
       WHERE s.member_id = NEW.member_id
         AND s.start_date <= v_new_end
         AND IF(s.closed_on IS NULL, s.end_date, s.closed_on - INTERVAL 1 DAY) >= NEW.start_date
         AND IF(s.closed_on IS NULL, s.end_date, s.closed_on - INTERVAL 1 DAY) >= s.start_date) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This plan overlaps another plan of the same member';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_subs_bu $$
CREATE TRIGGER trg_subs_bu BEFORE UPDATE ON subscriptions FOR EACH ROW
BEGIN
  IF NEW.member_id <> OLD.member_id OR NEW.plan_id <> OLD.plan_id OR NEW.start_date <> OLD.start_date THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Member, plan and start date of a subscription cannot be changed';
  END IF;
  SET NEW.end_date = OLD.end_date;
  IF OLD.status IN ('EXPIRED','CANCELLED','UPGRADED','DOWNGRADED') AND NEW.status <> OLD.status THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A closed subscription cannot change status';
  END IF;
  IF OLD.status = 'ACTIVE' AND NEW.status = 'UPCOMING' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An ACTIVE plan cannot go back to UPCOMING';
  END IF;
  IF NEW.status IN ('UPGRADED','DOWNGRADED') AND OLD.status <> 'ACTIVE' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only an ACTIVE plan can be upgraded or downgraded';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_subs_ai $$
CREATE TRIGGER trg_subs_ai AFTER INSERT ON subscriptions FOR EACH ROW
BEGIN
  DECLARE v_price DECIMAL(10,2); DECLARE v_issue DATE;
  SELECT price INTO v_price FROM membership_plans WHERE plan_id = NEW.plan_id;
  SET v_issue = LEAST(NEW.start_date, CURDATE());
  INSERT INTO invoices (member_id, subscription_id, amount_due, issue_date, due_date, status)
  VALUES (NEW.member_id, NEW.subscription_id, v_price, v_issue,
          v_issue + INTERVAL fn_setting_int('INVOICE_DUE_DAYS', 7) DAY, 'PENDING');
END $$

-- ---------------------------------------------------------------------
-- invoices and payments
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_invoices_bi $$
CREATE TRIGGER trg_invoices_bi BEFORE INSERT ON invoices FOR EACH ROW
BEGIN
  DECLARE v_member INT;
  IF NEW.subscription_id IS NOT NULL THEN
    SELECT member_id INTO v_member FROM subscriptions WHERE subscription_id = NEW.subscription_id;
  ELSE
    SELECT member_id INTO v_member FROM training_sessions WHERE training_session_id = NEW.training_session_id;
  END IF;
  IF v_member IS NULL OR v_member <> NEW.member_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invoice member must match the subscription or session member';
  END IF;
  IF NEW.status <> 'CANCELLED' THEN
    SET NEW.status = IF(NEW.due_date < CURDATE() AND NEW.amount_due > 0, 'OVERDUE', IF(NEW.amount_due = 0, 'PAID', 'PENDING'));
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_invoices_bu $$
CREATE TRIGGER trg_invoices_bu BEFORE UPDATE ON invoices FOR EACH ROW
BEGIN
  IF NEW.member_id <> OLD.member_id OR NOT (NEW.subscription_id <=> OLD.subscription_id)
     OR NOT (NEW.training_session_id <=> OLD.training_session_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invoice owner and source cannot be changed';
  END IF;
  IF NEW.amount_due <> OLD.amount_due AND EXISTS (SELECT 1 FROM payments WHERE invoice_id = OLD.invoice_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Amount cannot change after payments were made';
  END IF;
  IF OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A cancelled invoice cannot be reopened';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_payments_bi $$
CREATE TRIGGER trg_payments_bi BEFORE INSERT ON payments FOR EACH ROW
BEGIN
  DECLARE v_due DECIMAL(10,2); DECLARE v_status VARCHAR(10); DECLARE v_issue DATE;
  SELECT amount_due, status, issue_date INTO v_due, v_status, v_issue FROM invoices WHERE invoice_id = NEW.invoice_id;
  IF NEW.recorded_by IS NOT NULL AND fn_user_role(NEW.recorded_by) NOT IN ('STAFF','ADMIN') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payments can only be recorded by staff or admin';
  END IF;
  IF DATE(NEW.paid_at) < v_issue THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A payment cannot be dated before the invoice was issued';
  END IF;
  IF NEW.payment_type = 'PAYMENT' THEN
    IF v_status = 'CANCELLED' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot pay a cancelled invoice';
    END IF;
    IF fn_invoice_paid(NEW.invoice_id) + NEW.amount > v_due THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment exceeds the amount still due on this invoice';
    END IF;
  ELSE
    IF fn_invoice_refunded(NEW.invoice_id) + NEW.amount > fn_invoice_paid(NEW.invoice_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refund exceeds the amount paid on this invoice';
    END IF;
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_payments_ai $$
CREATE TRIGGER trg_payments_ai AFTER INSERT ON payments FOR EACH ROW
BEGIN
  UPDATE invoices SET status = fn_invoice_status(NEW.invoice_id) WHERE invoice_id = NEW.invoice_id;
END $$

DROP TRIGGER IF EXISTS trg_payments_bu $$
CREATE TRIGGER trg_payments_bu BEFORE UPDATE ON payments FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payments cannot be edited; record a refund instead';
END $$

DROP TRIGGER IF EXISTS trg_payments_bd $$
CREATE TRIGGER trg_payments_bd BEFORE DELETE ON payments FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payments cannot be deleted; record a refund instead';
END $$

-- ---------------------------------------------------------------------
-- trainer availability and training sessions
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_avail_bi $$
CREATE TRIGGER trg_avail_bi BEFORE INSERT ON trainer_availability FOR EACH ROW
BEGIN
  DECLARE v_open TIME; DECLARE v_close TIME;
  SELECT b.opening_time, b.closing_time INTO v_open, v_close
  FROM trainers t JOIN branches b ON b.branch_id = t.branch_id WHERE t.trainer_id = NEW.trainer_id;
  IF NEW.slot_start < v_open OR NEW.slot_end > v_close THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Slot must lie within the opening hours of the trainer''s branch';
  END IF;
  IF NEW.is_active AND EXISTS (SELECT 1 FROM trainer_availability
       WHERE trainer_id = NEW.trainer_id AND day_of_week = NEW.day_of_week AND is_active
         AND slot_start < NEW.slot_end AND NEW.slot_start < slot_end) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This slot overlaps another slot of the same trainer';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_avail_bu $$
CREATE TRIGGER trg_avail_bu BEFORE UPDATE ON trainer_availability FOR EACH ROW
BEGIN
  DECLARE v_open TIME; DECLARE v_close TIME;
  IF NEW.trainer_id <> OLD.trainer_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A slot cannot be moved to another trainer';
  END IF;
  SELECT b.opening_time, b.closing_time INTO v_open, v_close
  FROM trainers t JOIN branches b ON b.branch_id = t.branch_id WHERE t.trainer_id = NEW.trainer_id;
  IF NEW.slot_start < v_open OR NEW.slot_end > v_close THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Slot must lie within the opening hours of the trainer''s branch';
  END IF;
  IF NEW.is_active AND EXISTS (SELECT 1 FROM trainer_availability
       WHERE trainer_id = NEW.trainer_id AND day_of_week = NEW.day_of_week AND is_active
         AND availability_id <> OLD.availability_id
         AND slot_start < NEW.slot_end AND NEW.slot_start < slot_end) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This slot overlaps another slot of the same trainer';
  END IF;
  IF (NEW.day_of_week <> OLD.day_of_week OR NEW.slot_start <> OLD.slot_start OR NEW.slot_end <> OLD.slot_end)
     AND EXISTS (SELECT 1 FROM training_sessions WHERE availability_id = OLD.availability_id
                 AND status = 'SCHEDULED') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Slot times cannot change while sessions are scheduled; deactivate it instead';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_ts_bi $$
CREATE TRIGGER trg_ts_bi BEFORE INSERT ON training_sessions FOR EACH ROW
BEGIN
  DECLARE v_trainer INT; DECLARE v_dow CHAR(3); DECLARE v_s TIME; DECLARE v_e TIME; DECLARE v_active BOOLEAN;
  DECLARE v_branch INT; DECLARE v_rank INT; DECLARE v_end TIME;
  SELECT trainer_id, day_of_week, slot_start, slot_end, is_active
    INTO v_trainer, v_dow, v_s, v_e, v_active
    FROM trainer_availability WHERE availability_id = NEW.availability_id;
  IF v_trainer IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown trainer slot';
  END IF;
  IF NEW.trainer_id IS NULL THEN SET NEW.trainer_id = v_trainer; END IF;
  IF NEW.trainer_id <> v_trainer THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session trainer must be the trainer who owns the slot';
  END IF;
  IF NOT v_active THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This slot is no longer offered';
  END IF;
  IF fn_dow(NEW.session_date) <> v_dow THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session date does not fall on the slot''s weekday';
  END IF;
  SET v_end = ADDTIME(NEW.start_time, SEC_TO_TIME(NEW.duration_minutes * 60));
  IF NEW.start_time < v_s OR v_end > v_e THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Session must fit inside the slot';
  END IF;
  IF NEW.booked_at >= TIMESTAMP(NEW.session_date, NEW.start_time) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A session must be booked before it starts';
  END IF;
  SELECT branch_id INTO v_branch FROM trainers WHERE trainer_id = NEW.trainer_id;
  IF fn_branch_closed(v_branch, NEW.session_date) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The trainer''s branch is closed on that date';
  END IF;
  SET v_rank = fn_member_tier_on(NEW.member_id, NEW.session_date);
  IF v_rank IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Member has no plan covering the session date';
  END IF;
  IF v_rank < fn_branch_rank(v_branch) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Member''s plan tier does not cover the trainer''s branch';
  END IF;
  IF EXISTS (SELECT 1 FROM training_sessions
             WHERE member_id = NEW.member_id AND session_date = NEW.session_date AND status <> 'CANCELLED'
               AND start_time < v_end
               AND NEW.start_time < ADDTIME(start_time, SEC_TO_TIME(duration_minutes * 60))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Member already has an overlapping session';
  END IF;
  IF NEW.status IN ('COMPLETED','NO_SHOW') AND TIMESTAMP(NEW.session_date, NEW.start_time) > NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A future session cannot be completed or marked no-show';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_ts_bu $$
CREATE TRIGGER trg_ts_bu BEFORE UPDATE ON training_sessions FOR EACH ROW
BEGIN
  IF NEW.member_id <> OLD.member_id OR NEW.trainer_id <> OLD.trainer_id OR NEW.availability_id <> OLD.availability_id
     OR NEW.session_date <> OLD.session_date OR NEW.start_time <> OLD.start_time
     OR NEW.duration_minutes <> OLD.duration_minutes OR NEW.booked_at <> OLD.booked_at THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Booked sessions cannot be edited; cancel and book again';
  END IF;
  IF OLD.status <> 'SCHEDULED' AND NEW.status <> OLD.status THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only a scheduled session can change status';
  END IF;
  IF NEW.status IN ('COMPLETED','NO_SHOW') AND OLD.status = 'SCHEDULED'
     AND TIMESTAMP(NEW.session_date, NEW.start_time) > NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A session can be completed only after it has started';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_ts_ai $$
CREATE TRIGGER trg_ts_ai AFTER INSERT ON training_sessions FOR EACH ROW
BEGIN
  DECLARE v_rate DECIMAL(8,2);
  SELECT hourly_rate INTO v_rate FROM trainers WHERE trainer_id = NEW.trainer_id;
  INSERT INTO invoices (member_id, training_session_id, amount_due, issue_date, due_date, status)
  VALUES (NEW.member_id, NEW.training_session_id, ROUND(v_rate * NEW.duration_minutes / 60, 2),
          DATE(NEW.booked_at), NEW.session_date, 'PENDING');
END $$

-- ---------------------------------------------------------------------
-- attendance: plan, tier, closures, opening hours, method
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_att_bi $$
CREATE TRIGGER trg_att_bi BEFORE INSERT ON attendance FOR EACH ROW
BEGIN
  DECLARE v_open TIME; DECLARE v_close TIME; DECLARE v_active BOOLEAN; DECLARE v_rank INT;
  DECLARE v_suser INT; DECLARE v_login DATETIME; DECLARE v_exp DATETIME; DECLARE v_staff_branch INT;
  IF NEW.check_in_time > NOW() + INTERVAL 1 MINUTE THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Check-in time cannot be in the future';
  END IF;
  SELECT opening_time, closing_time, is_active INTO v_open, v_close, v_active FROM branches WHERE branch_id = NEW.branch_id;
  IF NOT v_active THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This branch is not operating';
  END IF;
  IF fn_branch_closed(NEW.branch_id, DATE(NEW.check_in_time)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The branch is closed today';
  END IF;
  IF TIME(NEW.check_in_time) < v_open OR TIME(NEW.check_in_time) >= v_close THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Check-in is outside the branch opening hours';
  END IF;
  SET v_rank = fn_member_tier_on(NEW.member_id, DATE(NEW.check_in_time));
  IF v_rank IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Check-in refused: no active plan';
  END IF;
  IF v_rank < fn_branch_rank(NEW.branch_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Check-in refused: plan tier does not cover this branch';
  END IF;
  IF NEW.checked_in_by IS NOT NULL THEN
    SELECT branch_id INTO v_staff_branch FROM staff WHERE staff_id = NEW.checked_in_by;
    IF v_staff_branch IS NULL OR v_staff_branch <> NEW.branch_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Staff can only check members in at their own branch';
    END IF;
  END IF;
  IF NEW.session_id IS NOT NULL THEN
    SELECT user_id, login_time, expires_at INTO v_suser, v_login, v_exp FROM user_sessions WHERE session_id = NEW.session_id;
    IF v_suser IS NULL OR v_suser <> NEW.member_id OR NEW.check_in_time < v_login OR NEW.check_in_time > v_exp THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'QR check-in must use a login session of the same member';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM attendance
             WHERE member_id = NEW.member_id
               AND check_in_time < IFNULL(NEW.check_out_time, '9999-12-31')
               AND NEW.check_in_time < IFNULL(check_out_time, '9999-12-31')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Member is already checked in';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_att_bu $$
CREATE TRIGGER trg_att_bu BEFORE UPDATE ON attendance FOR EACH ROW
BEGIN
  IF NEW.member_id <> OLD.member_id OR NEW.branch_id <> OLD.branch_id OR NEW.check_in_time <> OLD.check_in_time
     OR NOT (NEW.session_id <=> OLD.session_id) OR NOT (NEW.checked_in_by <=> OLD.checked_in_by) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only the check-out of a visit can be recorded';
  END IF;
  IF OLD.check_out_time IS NOT NULL AND NOT (NEW.check_out_time <=> OLD.check_out_time) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This visit is already checked out';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_att_au $$
CREATE TRIGGER trg_att_au AFTER UPDATE ON attendance FOR EACH ROW
BEGIN
  IF OLD.check_out_time IS NULL AND NEW.check_out_time IS NOT NULL THEN
    -- leaving the gym ends any machine still in use
    UPDATE equipment_usage_log
       SET end_time = GREATEST(NEW.check_out_time, start_time + INTERVAL 1 SECOND)
     WHERE attendance_id = NEW.attendance_id AND end_time IS NULL;
  END IF;
END $$

-- ---------------------------------------------------------------------
-- equipment: status is owned by the triggers (except RETIRED)
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_eq_bi $$
CREATE TRIGGER trg_eq_bi BEFORE INSERT ON equipment FOR EACH ROW
BEGIN
  IF NEW.status NOT IN ('AVAILABLE','RETIRED') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'New equipment must be AVAILABLE or RETIRED';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_eq_bu $$
CREATE TRIGGER trg_eq_bu BEFORE UPDATE ON equipment FOR EACH ROW
BEGIN
  IF NEW.status <> OLD.status AND IFNULL(@gym_internal, 0) = 0 THEN
    IF NEW.status <> 'RETIRED' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Equipment status is set automatically; only RETIRED can be set by hand';
    END IF;
    IF EXISTS (SELECT 1 FROM equipment_usage_log WHERE equipment_id = OLD.equipment_id AND end_time IS NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot retire a machine that is in use';
    END IF;
  END IF;
  IF NEW.branch_id <> OLD.branch_id AND EXISTS (SELECT 1 FROM equipment_usage_log
       WHERE equipment_id = OLD.equipment_id AND end_time IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot move a machine that is in use';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_maint_bi $$
CREATE TRIGGER trg_maint_bi BEFORE INSERT ON equipment_maintenance FOR EACH ROW
BEGIN
  IF (SELECT status FROM equipment WHERE equipment_id = NEW.equipment_id) = 'RETIRED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Retired equipment cannot be serviced';
  END IF;
  IF NEW.reported_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reported date cannot be in the future';
  END IF;
  IF NEW.maintenance_type = 'FAULT' AND NEW.reported_by IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A fault must name the user who reported it';
  END IF;
  IF NEW.status <> 'REPORTED' AND NEW.started_date IS NULL THEN SET NEW.started_date = NEW.reported_date; END IF;
END $$

DROP TRIGGER IF EXISTS trg_maint_bu $$
CREATE TRIGGER trg_maint_bu BEFORE UPDATE ON equipment_maintenance FOR EACH ROW
BEGIN
  IF NEW.equipment_id <> OLD.equipment_id OR NEW.maintenance_type <> OLD.maintenance_type THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Machine and type of a maintenance record cannot change';
  END IF;
  IF OLD.status = 'RESOLVED' AND NEW.status <> 'RESOLVED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A resolved maintenance record cannot be reopened';
  END IF;
  IF NEW.status IN ('IN_PROGRESS','RESOLVED') AND NEW.started_date IS NULL THEN
    SET NEW.started_date = GREATEST(CURDATE(), NEW.reported_date);
  END IF;
  IF NEW.status = 'RESOLVED' AND NEW.resolved_date IS NULL THEN
    SET NEW.resolved_date = GREATEST(CURDATE(), NEW.started_date);
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_maint_ai $$
CREATE TRIGGER trg_maint_ai AFTER INSERT ON equipment_maintenance FOR EACH ROW
BEGIN
  CALL sp_refresh_equipment(NEW.equipment_id);
END $$

DROP TRIGGER IF EXISTS trg_maint_au $$
CREATE TRIGGER trg_maint_au AFTER UPDATE ON equipment_maintenance FOR EACH ROW
BEGIN
  CALL sp_refresh_equipment(NEW.equipment_id);
END $$

-- ---------------------------------------------------------------------
-- equipment usage: machine free, member inside the right branch
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_usage_bi $$
CREATE TRIGGER trg_usage_bi BEFORE INSERT ON equipment_usage_log FOR EACH ROW
BEGIN
  DECLARE v_eq_branch INT; DECLARE v_eq_status VARCHAR(12);
  DECLARE v_att_member INT; DECLARE v_att_branch INT; DECLARE v_in DATETIME; DECLARE v_out DATETIME;
  SELECT branch_id, status INTO v_eq_branch, v_eq_status FROM equipment WHERE equipment_id = NEW.equipment_id;
  SELECT member_id, branch_id, check_in_time, check_out_time INTO v_att_member, v_att_branch, v_in, v_out
    FROM attendance WHERE attendance_id = NEW.attendance_id;
  IF v_eq_status = 'RETIRED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This machine is retired';
  END IF;
  IF v_att_member IS NULL OR v_att_member <> NEW.member_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Usage must belong to the member''s own visit';
  END IF;
  IF v_att_branch <> v_eq_branch THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Member is not checked in at this machine''s branch';
  END IF;
  IF NEW.start_time < v_in OR (v_out IS NOT NULL AND (NEW.end_time IS NULL OR NEW.end_time > v_out)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Machine usage must fall within the member''s visit';
  END IF;
  IF NEW.end_time IS NULL THEN
    IF v_eq_status <> 'AVAILABLE' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Machine is not available';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM equipment_usage_log WHERE equipment_id = NEW.equipment_id
                 AND start_time < NEW.end_time AND NEW.start_time < IFNULL(end_time, '9999-12-31')) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Machine was already in use at that time';
    END IF;
    IF EXISTS (SELECT 1 FROM equipment_usage_log WHERE member_id = NEW.member_id
                 AND start_time < NEW.end_time AND NEW.start_time < IFNULL(end_time, '9999-12-31')) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Member was already using another machine at that time';
    END IF;
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_usage_ai $$
CREATE TRIGGER trg_usage_ai AFTER INSERT ON equipment_usage_log FOR EACH ROW
BEGIN
  IF NEW.end_time IS NULL THEN CALL sp_refresh_equipment(NEW.equipment_id); END IF;
END $$

DROP TRIGGER IF EXISTS trg_usage_bu $$
CREATE TRIGGER trg_usage_bu BEFORE UPDATE ON equipment_usage_log FOR EACH ROW
BEGIN
  IF NEW.equipment_id <> OLD.equipment_id OR NEW.member_id <> OLD.member_id
     OR NEW.attendance_id <> OLD.attendance_id OR NEW.start_time <> OLD.start_time THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only end time and ratings of a usage can change';
  END IF;
  IF OLD.end_time IS NOT NULL AND NOT (NEW.end_time <=> OLD.end_time) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This usage has already ended';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_usage_au $$
CREATE TRIGGER trg_usage_au AFTER UPDATE ON equipment_usage_log FOR EACH ROW
BEGIN
  IF OLD.end_time IS NULL AND NEW.end_time IS NOT NULL THEN CALL sp_refresh_equipment(NEW.equipment_id); END IF;
END $$

-- ---------------------------------------------------------------------
-- workout sets and automatic personal records
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_sets_bi $$
CREATE TRIGGER trg_sets_bi BEFORE INSERT ON workout_sets FOR EACH ROW
BEGIN
  DECLARE v_in DATETIME; DECLARE v_out DATETIME; DECLARE v_member INT;
  DECLARE v_measure VARCHAR(15); DECLARE v_cat INT;
  DECLARE v_u_att INT; DECLARE v_u_start DATETIME; DECLARE v_u_end DATETIME; DECLARE v_u_cat INT;
  SELECT check_in_time, check_out_time, member_id INTO v_in, v_out, v_member FROM attendance WHERE attendance_id = NEW.attendance_id;
  IF NEW.performed_at < v_in OR NEW.performed_at > IFNULL(v_out, NOW() + INTERVAL 1 MINUTE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A set must be performed during the visit';
  END IF;
  SELECT measure_type, category_id INTO v_measure, v_cat FROM exercises WHERE exercise_id = NEW.exercise_id;
  IF v_measure = 'WEIGHT_REPS' AND (NEW.reps IS NULL OR NEW.weight_kg IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This exercise needs reps and weight';
  END IF;
  IF v_measure = 'REPS_ONLY' AND (NEW.reps IS NULL OR NEW.weight_kg IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This exercise needs reps only';
  END IF;
  IF v_measure = 'TIME_DISTANCE' AND (NEW.duration_seconds IS NULL OR NEW.reps IS NOT NULL OR NEW.weight_kg IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This exercise needs duration (and optionally distance)';
  END IF;
  IF NEW.usage_id IS NOT NULL THEN
    SELECT u.attendance_id, u.start_time, u.end_time, e.category_id INTO v_u_att, v_u_start, v_u_end, v_u_cat
      FROM equipment_usage_log u JOIN equipment e ON e.equipment_id = u.equipment_id WHERE u.usage_id = NEW.usage_id;
    IF v_u_att <> NEW.attendance_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Machine usage belongs to a different visit';
    END IF;
    IF v_cat IS NULL OR v_u_cat <> v_cat THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This exercise is not done on that type of machine';
    END IF;
    IF NEW.performed_at < v_u_start OR (v_u_end IS NOT NULL AND NEW.performed_at > v_u_end) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Set must be performed while the machine was in use';
    END IF;
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_sets_ai $$
CREATE TRIGGER trg_sets_ai AFTER INSERT ON workout_sets FOR EACH ROW
BEGIN
  DECLARE v_member INT; DECLARE v_measure VARCHAR(15);
  SELECT member_id INTO v_member FROM attendance WHERE attendance_id = NEW.attendance_id;
  SELECT measure_type INTO v_measure FROM exercises WHERE exercise_id = NEW.exercise_id;
  IF v_measure = 'WEIGHT_REPS' THEN
    CALL sp_pr_check(v_member, NEW.exercise_id, 'MAX_WEIGHT', NEW.weight_kg, NEW.set_id, NEW.performed_at);
    CALL sp_pr_check(v_member, NEW.exercise_id, 'MAX_VOLUME', NEW.weight_kg * NEW.reps, NEW.set_id, NEW.performed_at);
  ELSEIF v_measure = 'REPS_ONLY' THEN
    CALL sp_pr_check(v_member, NEW.exercise_id, 'MAX_REPS', NEW.reps, NEW.set_id, NEW.performed_at);
  ELSE
    CALL sp_pr_check(v_member, NEW.exercise_id, 'MAX_DURATION', NEW.duration_seconds, NEW.set_id, NEW.performed_at);
    CALL sp_pr_check(v_member, NEW.exercise_id, 'MAX_DISTANCE', NEW.distance_m, NEW.set_id, NEW.performed_at);
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_sets_bu $$
CREATE TRIGGER trg_sets_bu BEFORE UPDATE ON workout_sets FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Logged sets cannot be edited';
END $$

-- ---------------------------------------------------------------------
-- goals, challenges, templates
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_goals_bi $$
CREATE TRIGGER trg_goals_bi BEFORE INSERT ON fitness_goals FOR EACH ROW
BEGIN
  DECLARE v_measure VARCHAR(15);
  IF NEW.exercise_id IS NOT NULL THEN
    SELECT measure_type INTO v_measure FROM exercises WHERE exercise_id = NEW.exercise_id;
    IF NEW.goal_type = 'EXERCISE_WEIGHT' AND v_measure <> 'WEIGHT_REPS' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A weight goal needs a weighted exercise';
    END IF;
    IF NEW.goal_type = 'EXERCISE_REPS' AND v_measure = 'TIME_DISTANCE' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A reps goal needs an exercise measured in reps';
    END IF;
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_ch_bi $$
CREATE TRIGGER trg_ch_bi BEFORE INSERT ON challenges FOR EACH ROW
BEGIN
  DECLARE v_role VARCHAR(10);
  SET v_role = fn_user_role(NEW.created_by);
  IF v_role NOT IN ('STAFF','ADMIN') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Challenges can only be created by staff or admin';
  END IF;
  IF v_role = 'STAFF' AND NOT (NEW.branch_id <=> (SELECT branch_id FROM staff WHERE staff_id = NEW.created_by)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Staff can only create challenges for their own branch';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_cp_bi $$
CREATE TRIGGER trg_cp_bi BEFORE INSERT ON challenge_participants FOR EACH ROW
BEGIN
  IF DATE(NEW.joined_at) > (SELECT end_date FROM challenges WHERE challenge_id = NEW.challenge_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This challenge has already ended';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_tpl_bi $$
CREATE TRIGGER trg_tpl_bi BEFORE INSERT ON workout_templates FOR EACH ROW
BEGIN
  DECLARE v_role VARCHAR(10);
  SET v_role = fn_user_role(NEW.created_by);
  IF v_role NOT IN ('MEMBER','TRAINER') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Templates are created by members or trainers';
  END IF;
  IF v_role = 'MEMBER' THEN
    IF NEW.for_member_id IS NULL THEN SET NEW.for_member_id = NEW.created_by; END IF;
    IF NEW.for_member_id <> NEW.created_by THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Members can only create templates for themselves';
    END IF;
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_te_bi $$
CREATE TRIGGER trg_te_bi BEFORE INSERT ON template_exercises FOR EACH ROW
BEGIN
  DECLARE v_days INT; DECLARE v_cat INT; DECLARE v_measure VARCHAR(15);
  SELECT days_per_week INTO v_days FROM workout_templates WHERE template_id = NEW.template_id;
  IF NEW.day_number > v_days THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Day number exceeds the template''s days per week';
  END IF;
  SELECT category_id, measure_type INTO v_cat, v_measure FROM exercises WHERE exercise_id = NEW.exercise_id;
  IF NEW.preferred_equipment_id IS NOT NULL AND
     (v_cat IS NULL OR v_cat <> (SELECT category_id FROM equipment WHERE equipment_id = NEW.preferred_equipment_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Preferred machine does not match the exercise';
  END IF;
  IF v_measure = 'TIME_DISTANCE' AND NEW.target_duration_seconds IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A timed exercise needs a target duration';
  END IF;
  IF v_measure <> 'TIME_DISTANCE' AND NEW.target_reps IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This exercise needs target reps';
  END IF;
END $$

-- ---------------------------------------------------------------------
-- admin-only tables
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_closure_bi $$
CREATE TRIGGER trg_closure_bi BEFORE INSERT ON branch_closures FOR EACH ROW
BEGIN
  IF IFNULL(fn_user_role(NEW.created_by), '') <> 'ADMIN' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only an admin can declare close days';
  END IF;
  IF NEW.branch_id IS NULL AND EXISTS (SELECT 1 FROM branch_closures WHERE branch_id IS NULL AND closure_date = NEW.closure_date) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'All branches are already closed on that date';
  END IF;
  IF EXISTS (SELECT 1 FROM training_sessions ts JOIN trainers t ON t.trainer_id = ts.trainer_id
             WHERE ts.session_date = NEW.closure_date AND ts.status = 'SCHEDULED'
               AND (NEW.branch_id IS NULL OR t.branch_id = NEW.branch_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Training sessions are booked on that date; cancel them first';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_rules_bi $$
CREATE TRIGGER trg_rules_bi BEFORE INSERT ON maintenance_rules FOR EACH ROW
BEGIN
  IF IFNULL(fn_user_role(NEW.created_by), '') <> 'ADMIN' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only an admin can set maintenance rules';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_rules_bu $$
CREATE TRIGGER trg_rules_bu BEFORE UPDATE ON maintenance_rules FOR EACH ROW
BEGIN
  IF IFNULL(fn_user_role(NEW.created_by), '') <> 'ADMIN' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only an admin can set maintenance rules';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_settings_bi $$
CREATE TRIGGER trg_settings_bi BEFORE INSERT ON system_settings FOR EACH ROW
BEGIN
  IF IFNULL(fn_user_role(NEW.updated_by), '') <> 'ADMIN' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only an admin can change system settings';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_settings_bu $$
CREATE TRIGGER trg_settings_bu BEFORE UPDATE ON system_settings FOR EACH ROW
BEGIN
  IF IFNULL(fn_user_role(NEW.updated_by), '') <> 'ADMIN' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only an admin can change system settings';
  END IF;
  SET NEW.updated_at = NOW();
END $$

DELIMITER ;
