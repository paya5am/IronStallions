-- =====================================================================
-- 06_events.sql : scheduled jobs (MySQL event scheduler must be ON)
-- Jobs are idempotent and run often, so a laptop that was asleep at
-- midnight catches up within the hour.
-- =====================================================================
USE gym_management;
SET GLOBAL event_scheduler = ON;

DELIMITER $$

-- Logins are valid for SESSION_HOURS after login, no matter what.
DROP EVENT IF EXISTS ev_expire_sessions $$
CREATE EVENT ev_expire_sessions
ON SCHEDULE EVERY 1 MINUTE STARTS CURRENT_TIMESTAMP
DO
  UPDATE user_sessions SET is_valid = FALSE
   WHERE is_valid AND expires_at <= NOW() $$

-- Visits still open after AUTO_CHECKOUT_HOURS are closed and flagged.
-- Closing a visit also ends any machine still in use (trigger on attendance).
DROP EVENT IF EXISTS ev_auto_checkout $$
CREATE EVENT ev_auto_checkout
ON SCHEDULE EVERY 5 MINUTE STARTS CURRENT_TIMESTAMP
DO
BEGIN
  DECLARE v_hours INT DEFAULT fn_setting_int('AUTO_CHECKOUT_HOURS', 3);
  UPDATE attendance
     SET check_out_time = check_in_time + INTERVAL v_hours HOUR, auto_checked_out = TRUE
   WHERE check_out_time IS NULL AND check_in_time <= NOW() - INTERVAL v_hours HOUR;
END $$

-- Plans: ACTIVE -> EXPIRED after the end date, then queued renewals become ACTIVE.
DROP EVENT IF EXISTS ev_subscription_status $$
CREATE EVENT ev_subscription_status
ON SCHEDULE EVERY 1 HOUR STARTS CURRENT_TIMESTAMP
DO
BEGIN
  UPDATE subscriptions SET status = 'EXPIRED'
   WHERE status = 'ACTIVE' AND end_date < CURDATE();
  UPDATE subscriptions SET status = 'ACTIVE'
   WHERE status = 'UPCOMING' AND start_date <= CURDATE() AND end_date >= CURDATE();
END $$

-- Unpaid invoices past their due date become OVERDUE.
DROP EVENT IF EXISTS ev_invoice_overdue $$
CREATE EVENT ev_invoice_overdue
ON SCHEDULE EVERY 1 HOUR STARTS CURRENT_TIMESTAMP
DO
  UPDATE invoices SET status = fn_invoice_status(invoice_id)
   WHERE status IN ('PENDING','PARTIAL') AND due_date < CURDATE() $$

DELIMITER ;
