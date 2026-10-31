-- =====================================================================
-- Gym Management and Fitness Tracking System
-- 01_schema.sql : database and all 30 tables
-- MySQL 8.0 / 8.4, InnoDB, utf8mb4. All names lowercase (Mac/Windows safe).
-- Re-running this file DROPS and recreates the database.
-- =====================================================================

DROP DATABASE IF EXISTS gym_management;
CREATE DATABASE gym_management CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE gym_management;

-- ---------------------------------------------------------------------
-- Group A: tiers, branches and people
-- ---------------------------------------------------------------------

CREATE TABLE tiers (
  tier_id    INT AUTO_INCREMENT PRIMARY KEY,
  tier_name  VARCHAR(20) NOT NULL,
  tier_rank  TINYINT     NOT NULL,
  CONSTRAINT uk_tiers_name UNIQUE (tier_name),
  CONSTRAINT uk_tiers_rank UNIQUE (tier_rank),
  CONSTRAINT ck_tiers_rank CHECK (tier_rank >= 1)
) ENGINE=InnoDB;

CREATE TABLE branches (
  branch_id     INT AUTO_INCREMENT PRIMARY KEY,
  branch_name   VARCHAR(80)  NOT NULL,
  tier_id       INT          NOT NULL,
  address       VARCHAR(200) NOT NULL,
  city          VARCHAR(60)  NOT NULL,
  phone         VARCHAR(15)  NOT NULL,
  opening_time  TIME         NOT NULL,
  closing_time  TIME         NOT NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT uk_branches_name UNIQUE (branch_name),
  CONSTRAINT fk_branches_tier FOREIGN KEY (tier_id) REFERENCES tiers (tier_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_branches_hours CHECK (closing_time > opening_time)
) ENGINE=InnoDB;

CREATE TABLE users (
  user_id     INT AUTO_INCREMENT PRIMARY KEY,
  full_name   VARCHAR(100) NOT NULL,
  phone       VARCHAR(15)  NOT NULL,
  email       VARCHAR(120) NOT NULL,
  role        ENUM('MEMBER','TRAINER','STAFF','ADMIN') NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT uk_users_phone UNIQUE (phone),
  CONSTRAINT uk_users_email UNIQUE (email)
) ENGINE=InnoDB;

CREATE TABLE user_devices (
  device_id      CHAR(36)     NOT NULL PRIMARY KEY,
  user_id        INT          NOT NULL,
  device_name    VARCHAR(100) NOT NULL,
  public_key     TEXT         NOT NULL,
  registered_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE user_sessions (
  session_id      CHAR(36)     NOT NULL PRIMARY KEY,
  user_id         INT          NOT NULL,
  device_id       CHAR(36)     NOT NULL,
  device_info     VARCHAR(200) NULL,
  ip_address      VARCHAR(45)  NULL,
  login_time      DATETIME     NOT NULL,
  expires_at      DATETIME     NOT NULL,
  last_active     DATETIME     NOT NULL,
  logout_time     DATETIME     NULL,
  is_valid        BOOLEAN      NOT NULL DEFAULT TRUE,
  qr_token        CHAR(64)     NULL,
  qr_expires_at   DATETIME     NULL,
  qr_used         BOOLEAN      NOT NULL DEFAULT FALSE,
  -- equals user_id only while the session is valid; UNIQUE => one valid session per user
  active_user_id  INT GENERATED ALWAYS AS (IF(is_valid, user_id, NULL)) STORED,
  CONSTRAINT uk_sessions_qr UNIQUE (qr_token),
  CONSTRAINT uk_sessions_active_user UNIQUE (active_user_id),
  CONSTRAINT fk_sessions_user   FOREIGN KEY (user_id)   REFERENCES users (user_id)          ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sessions_device FOREIGN KEY (device_id) REFERENCES user_devices (device_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_sessions_expiry CHECK (expires_at > login_time),
  CONSTRAINT ck_sessions_logout CHECK (logout_time IS NULL OR logout_time >= login_time),
  CONSTRAINT ck_sessions_qr     CHECK ((qr_token IS NULL) = (qr_expires_at IS NULL))
) ENGINE=InnoDB;

CREATE TABLE members (
  member_id               INT          NOT NULL PRIMARY KEY,
  branch_id               INT          NOT NULL,
  date_of_birth           DATE         NOT NULL,
  gender                  ENUM('MALE','FEMALE','OTHER') NOT NULL,
  join_date               DATE         NOT NULL,
  emergency_contact       VARCHAR(15)  NOT NULL,
  training_days_per_week  TINYINT      NOT NULL DEFAULT 5,
  CONSTRAINT fk_members_user   FOREIGN KEY (member_id) REFERENCES users (user_id)       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_members_branch FOREIGN KEY (branch_id) REFERENCES branches (branch_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_members_days CHECK (training_days_per_week BETWEEN 1 AND 7)
) ENGINE=InnoDB;

CREATE TABLE trainers (
  trainer_id        INT          NOT NULL PRIMARY KEY,
  branch_id         INT          NOT NULL,
  specialization    VARCHAR(100) NOT NULL,
  years_experience  INT          NOT NULL,
  hourly_rate       DECIMAL(8,2) NOT NULL,
  CONSTRAINT fk_trainers_user   FOREIGN KEY (trainer_id) REFERENCES users (user_id)       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_trainers_branch FOREIGN KEY (branch_id)  REFERENCES branches (branch_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_trainers_exp  CHECK (years_experience >= 0),
  CONSTRAINT ck_trainers_rate CHECK (hourly_rate > 0)
) ENGINE=InnoDB;

CREATE TABLE staff (
  staff_id     INT         NOT NULL PRIMARY KEY,
  branch_id    INT         NOT NULL,
  designation  VARCHAR(60) NOT NULL,
  shift_start  TIME        NOT NULL,
  shift_end    TIME        NOT NULL,
  CONSTRAINT fk_staff_user   FOREIGN KEY (staff_id)  REFERENCES users (user_id)       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_staff_branch FOREIGN KEY (branch_id) REFERENCES branches (branch_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Group B: plans and billing
-- ---------------------------------------------------------------------

CREATE TABLE membership_plans (
  plan_id        INT AUTO_INCREMENT PRIMARY KEY,
  plan_name      VARCHAR(60)   NOT NULL,
  tier_id        INT           NOT NULL,
  duration_days  INT           NOT NULL,
  price          DECIMAL(10,2) NOT NULL,
  description    VARCHAR(255)  NULL,
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  CONSTRAINT uk_plans_name UNIQUE (plan_name),
  CONSTRAINT uk_plans_tier_duration UNIQUE (tier_id, duration_days),
  CONSTRAINT fk_plans_tier FOREIGN KEY (tier_id) REFERENCES tiers (tier_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_plans_duration CHECK (duration_days > 0),
  CONSTRAINT ck_plans_price    CHECK (price >= 0)
) ENGINE=InnoDB;

CREATE TABLE subscriptions (
  subscription_id           INT AUTO_INCREMENT PRIMARY KEY,
  member_id                 INT  NOT NULL,
  plan_id                   INT  NOT NULL,
  start_date                DATE NOT NULL,
  end_date                  DATE NOT NULL,
  status   ENUM('UPCOMING','ACTIVE','EXPIRED','CANCELLED','UPGRADED','DOWNGRADED') NOT NULL,
  closed_on                 DATE NULL,
  previous_subscription_id  INT  NULL,
  active_member_id    INT GENERATED ALWAYS AS (IF(status = 'ACTIVE',   member_id, NULL)) STORED,
  upcoming_member_id  INT GENERATED ALWAYS AS (IF(status = 'UPCOMING', member_id, NULL)) STORED,
  CONSTRAINT uk_subs_previous UNIQUE (previous_subscription_id),
  CONSTRAINT uk_subs_active   UNIQUE (active_member_id),
  CONSTRAINT uk_subs_upcoming UNIQUE (upcoming_member_id),
  CONSTRAINT fk_subs_member   FOREIGN KEY (member_id) REFERENCES members (member_id)        ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_subs_plan     FOREIGN KEY (plan_id)   REFERENCES membership_plans (plan_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_subs_previous FOREIGN KEY (previous_subscription_id) REFERENCES subscriptions (subscription_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_subs_dates  CHECK (end_date >= start_date),
  CONSTRAINT ck_subs_closed CHECK (closed_on IS NULL OR closed_on >= start_date),
  CONSTRAINT ck_subs_closed_status CHECK ((status IN ('CANCELLED','UPGRADED','DOWNGRADED')) = (closed_on IS NOT NULL))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Group E (needed before invoices): personal training
-- ---------------------------------------------------------------------

CREATE TABLE trainer_availability (
  availability_id  INT AUTO_INCREMENT PRIMARY KEY,
  trainer_id       INT  NOT NULL,
  day_of_week      ENUM('MON','TUE','WED','THU','FRI','SAT','SUN') NOT NULL,
  slot_start       TIME NOT NULL,
  slot_end         TIME NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uk_avail_slot UNIQUE (trainer_id, day_of_week, slot_start),
  CONSTRAINT fk_avail_trainer FOREIGN KEY (trainer_id) REFERENCES trainers (trainer_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_avail_times CHECK (slot_end > slot_start)
) ENGINE=InnoDB;

CREATE TABLE training_sessions (
  training_session_id  INT AUTO_INCREMENT PRIMARY KEY,
  member_id         INT  NOT NULL,
  trainer_id        INT  NOT NULL,
  availability_id   INT  NOT NULL,
  session_date      DATE NOT NULL,
  start_time        TIME NOT NULL,
  duration_minutes  INT  NOT NULL,
  status   ENUM('SCHEDULED','COMPLETED','CANCELLED','NO_SHOW') NOT NULL DEFAULT 'SCHEDULED',
  booked_at         DATETIME NOT NULL,
  cancelled_at      DATETIME NULL,
  -- NULL for cancelled bookings, so a cancelled slot can be booked again
  active_slot_id    INT GENERATED ALWAYS AS (IF(status <> 'CANCELLED', availability_id, NULL)) STORED,
  CONSTRAINT uk_ts_slot_date UNIQUE (active_slot_id, session_date),
  CONSTRAINT fk_ts_member  FOREIGN KEY (member_id)       REFERENCES members (member_id)                  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ts_trainer FOREIGN KEY (trainer_id)      REFERENCES trainers (trainer_id)                ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ts_avail   FOREIGN KEY (availability_id) REFERENCES trainer_availability (availability_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_ts_duration  CHECK (duration_minutes > 0),
  CONSTRAINT ck_ts_cancelled CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE invoices (
  invoice_id           INT AUTO_INCREMENT PRIMARY KEY,
  member_id            INT  NOT NULL,
  subscription_id      INT  NULL,
  training_session_id  INT  NULL,
  amount_due           DECIMAL(10,2) NOT NULL,
  issue_date           DATE NOT NULL,
  due_date             DATE NOT NULL,
  status   ENUM('PENDING','PARTIAL','PAID','OVERDUE','CANCELLED') NOT NULL DEFAULT 'PENDING',
  CONSTRAINT uk_inv_subscription UNIQUE (subscription_id),
  CONSTRAINT uk_inv_session      UNIQUE (training_session_id),
  CONSTRAINT fk_inv_member  FOREIGN KEY (member_id)           REFERENCES members (member_id)                    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_inv_sub     FOREIGN KEY (subscription_id)     REFERENCES subscriptions (subscription_id)        ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_inv_session FOREIGN KEY (training_session_id) REFERENCES training_sessions (training_session_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_inv_one_source CHECK ((subscription_id IS NULL) <> (training_session_id IS NULL)),
  CONSTRAINT ck_inv_amount CHECK (amount_due >= 0),
  CONSTRAINT ck_inv_dates  CHECK (due_date >= issue_date)
) ENGINE=InnoDB;

CREATE TABLE payments (
  payment_id      INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id      INT NOT NULL,
  amount          DECIMAL(10,2) NOT NULL,
  payment_type    ENUM('PAYMENT','REFUND') NOT NULL,
  payment_method  ENUM('CASH','CARD','UPI','NETBANKING') NOT NULL,
  paid_at         DATETIME NOT NULL,
  recorded_by     INT NULL,
  note            VARCHAR(255) NULL,
  CONSTRAINT fk_pay_invoice FOREIGN KEY (invoice_id)  REFERENCES invoices (invoice_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_pay_user    FOREIGN KEY (recorded_by) REFERENCES users (user_id)       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_pay_amount CHECK (amount > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Group C: attendance and equipment
-- ---------------------------------------------------------------------

CREATE TABLE equipment_categories (
  category_id     INT AUTO_INCREMENT PRIMARY KEY,
  category_name   VARCHAR(60)  NOT NULL,
  category_group  ENUM('CARDIO','STRENGTH_MACHINE','FREE_WEIGHT','FUNCTIONAL') NOT NULL,
  description     VARCHAR(200) NULL,
  CONSTRAINT uk_cat_name UNIQUE (category_name)
) ENGINE=InnoDB;

CREATE TABLE equipment (
  equipment_id   INT AUTO_INCREMENT PRIMARY KEY,
  branch_id      INT          NOT NULL,
  category_id    INT          NOT NULL,
  name           VARCHAR(100) NOT NULL,
  muscle_group   ENUM('CHEST','BACK','SHOULDERS','ARMS','LEGS','CORE','FULL_BODY','CARDIO') NOT NULL,
  purchase_date  DATE         NOT NULL,
  status         ENUM('AVAILABLE','OCCUPIED','MAINTENANCE','RETIRED') NOT NULL DEFAULT 'AVAILABLE',
  CONSTRAINT fk_eq_branch   FOREIGN KEY (branch_id)   REFERENCES branches (branch_id)               ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_eq_category FOREIGN KEY (category_id) REFERENCES equipment_categories (category_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE attendance (
  attendance_id     INT AUTO_INCREMENT PRIMARY KEY,
  member_id         INT      NOT NULL,
  branch_id         INT      NOT NULL,
  session_id        CHAR(36) NULL,
  checked_in_by     INT      NULL,
  check_in_time     DATETIME NOT NULL,
  check_out_time    DATETIME NULL,
  auto_checked_out  BOOLEAN  NOT NULL DEFAULT FALSE,
  open_member_id    INT GENERATED ALWAYS AS (IF(check_out_time IS NULL, member_id, NULL)) STORED,
  CONSTRAINT uk_att_open UNIQUE (open_member_id),
  CONSTRAINT fk_att_member  FOREIGN KEY (member_id)     REFERENCES members (member_id)        ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_att_branch  FOREIGN KEY (branch_id)     REFERENCES branches (branch_id)       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_att_session FOREIGN KEY (session_id)    REFERENCES user_sessions (session_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_att_staff   FOREIGN KEY (checked_in_by) REFERENCES staff (staff_id)           ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_att_one_method CHECK ((session_id IS NULL) <> (checked_in_by IS NULL)),
  CONSTRAINT ck_att_times CHECK (check_out_time IS NULL OR check_out_time > check_in_time)
) ENGINE=InnoDB;

CREATE TABLE equipment_maintenance (
  maintenance_id    INT AUTO_INCREMENT PRIMARY KEY,
  equipment_id      INT  NOT NULL,
  maintenance_type  ENUM('FAULT','SCHEDULED_SERVICE') NOT NULL,
  reported_issue    VARCHAR(255) NOT NULL,
  reported_by       INT  NULL,
  reported_date     DATE NOT NULL,
  started_date      DATE NULL,
  resolved_date     DATE NULL,
  cost              DECIMAL(10,2) NULL,
  status            ENUM('REPORTED','IN_PROGRESS','RESOLVED') NOT NULL DEFAULT 'REPORTED',
  CONSTRAINT fk_maint_equipment FOREIGN KEY (equipment_id) REFERENCES equipment (equipment_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_maint_user      FOREIGN KEY (reported_by)  REFERENCES users (user_id)          ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_maint_started  CHECK (status = 'REPORTED' OR started_date IS NOT NULL),
  CONSTRAINT ck_maint_resolved CHECK ((status = 'RESOLVED') = (resolved_date IS NOT NULL)),
  CONSTRAINT ck_maint_cost     CHECK (status <> 'RESOLVED' OR cost IS NOT NULL),
  CONSTRAINT ck_maint_cost_pos CHECK (cost IS NULL OR cost >= 0),
  CONSTRAINT ck_maint_order1   CHECK (started_date IS NULL OR started_date >= reported_date),
  CONSTRAINT ck_maint_order2   CHECK (resolved_date IS NULL OR resolved_date >= COALESCE(started_date, reported_date))
) ENGINE=InnoDB;

CREATE TABLE equipment_usage_log (
  usage_id           INT AUTO_INCREMENT PRIMARY KEY,
  equipment_id       INT      NOT NULL,
  member_id          INT      NOT NULL,
  attendance_id      INT      NOT NULL,
  start_time         DATETIME NOT NULL,
  end_time           DATETIME NULL,
  difficulty_rating  TINYINT  NULL,
  comfort_rating     TINYINT  NULL,
  open_equipment_id  INT GENERATED ALWAYS AS (IF(end_time IS NULL, equipment_id, NULL)) STORED,
  open_member_id     INT GENERATED ALWAYS AS (IF(end_time IS NULL, member_id, NULL)) STORED,
  CONSTRAINT uk_usage_open_eq     UNIQUE (open_equipment_id),
  CONSTRAINT uk_usage_open_member UNIQUE (open_member_id),
  CONSTRAINT fk_usage_equipment  FOREIGN KEY (equipment_id)  REFERENCES equipment (equipment_id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_usage_member     FOREIGN KEY (member_id)     REFERENCES members (member_id)        ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_usage_attendance FOREIGN KEY (attendance_id) REFERENCES attendance (attendance_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_usage_times      CHECK (end_time IS NULL OR end_time > start_time),
  CONSTRAINT ck_usage_difficulty CHECK (difficulty_rating IS NULL OR difficulty_rating BETWEEN 1 AND 5),
  CONSTRAINT ck_usage_comfort    CHECK (comfort_rating IS NULL OR comfort_rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Group D: workouts and progress
-- ---------------------------------------------------------------------

CREATE TABLE exercises (
  exercise_id    INT AUTO_INCREMENT PRIMARY KEY,
  exercise_name  VARCHAR(80) NOT NULL,
  muscle_group   ENUM('CHEST','BACK','SHOULDERS','ARMS','LEGS','CORE','FULL_BODY','CARDIO') NOT NULL,
  category_id    INT NULL,
  measure_type   ENUM('WEIGHT_REPS','REPS_ONLY','TIME_DISTANCE') NOT NULL,
  CONSTRAINT uk_ex_name UNIQUE (exercise_name),
  CONSTRAINT fk_ex_category FOREIGN KEY (category_id) REFERENCES equipment_categories (category_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE workout_sets (
  set_id            INT AUTO_INCREMENT PRIMARY KEY,
  attendance_id     INT      NOT NULL,
  exercise_id       INT      NOT NULL,
  usage_id          INT      NULL,
  set_number        TINYINT  NOT NULL,
  reps              SMALLINT NULL,
  weight_kg         DECIMAL(5,2) NULL,
  duration_seconds  INT      NULL,
  distance_m        INT      NULL,
  performed_at      DATETIME NOT NULL,
  CONSTRAINT uk_sets_number UNIQUE (attendance_id, exercise_id, set_number),
  CONSTRAINT fk_sets_attendance FOREIGN KEY (attendance_id) REFERENCES attendance (attendance_id)    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sets_exercise   FOREIGN KEY (exercise_id)   REFERENCES exercises (exercise_id)      ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sets_usage      FOREIGN KEY (usage_id)      REFERENCES equipment_usage_log (usage_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_sets_metric   CHECK (reps IS NOT NULL OR duration_seconds IS NOT NULL),
  CONSTRAINT ck_sets_number   CHECK (set_number > 0),
  CONSTRAINT ck_sets_reps     CHECK (reps IS NULL OR reps > 0),
  CONSTRAINT ck_sets_weight   CHECK (weight_kg IS NULL OR weight_kg > 0),
  CONSTRAINT ck_sets_duration CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  CONSTRAINT ck_sets_distance CHECK (distance_m IS NULL OR distance_m > 0)
) ENGINE=InnoDB;

CREATE TABLE personal_records (
  record_id     INT AUTO_INCREMENT PRIMARY KEY,
  member_id     INT NOT NULL,
  exercise_id   INT NOT NULL,
  record_type   ENUM('MAX_WEIGHT','MAX_REPS','MAX_VOLUME','MAX_DURATION','MAX_DISTANCE') NOT NULL,
  record_value  DECIMAL(10,2) NOT NULL,
  set_id        INT NOT NULL,
  achieved_at   DATETIME NOT NULL,
  is_current    BOOLEAN NOT NULL DEFAULT TRUE,
  current_flag  TINYINT GENERATED ALWAYS AS (IF(is_current, 1, NULL)) STORED,
  CONSTRAINT uk_pr_current UNIQUE (member_id, exercise_id, record_type, current_flag),
  CONSTRAINT fk_pr_member   FOREIGN KEY (member_id)   REFERENCES members (member_id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_pr_exercise FOREIGN KEY (exercise_id) REFERENCES exercises (exercise_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_pr_set      FOREIGN KEY (set_id)      REFERENCES workout_sets (set_id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_pr_value CHECK (record_value > 0)
) ENGINE=InnoDB;

CREATE TABLE fitness_goals (
  goal_id       INT AUTO_INCREMENT PRIMARY KEY,
  member_id     INT  NOT NULL,
  goal_type     ENUM('EXERCISE_WEIGHT','EXERCISE_REPS','MONTHLY_VISITS','WORKOUT_STREAK') NOT NULL,
  exercise_id   INT  NULL,
  target_value  DECIMAL(10,2) NOT NULL,
  start_date    DATE NOT NULL,
  target_date   DATE NOT NULL,
  status        ENUM('ACTIVE','ACHIEVED','EXPIRED','ABANDONED') NOT NULL DEFAULT 'ACTIVE',
  achieved_on   DATE NULL,
  CONSTRAINT fk_goal_member   FOREIGN KEY (member_id)   REFERENCES members (member_id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_goal_exercise FOREIGN KEY (exercise_id) REFERENCES exercises (exercise_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_goal_exercise CHECK ((goal_type IN ('EXERCISE_WEIGHT','EXERCISE_REPS')) = (exercise_id IS NOT NULL)),
  CONSTRAINT ck_goal_target   CHECK (target_value > 0),
  CONSTRAINT ck_goal_dates    CHECK (target_date > start_date),
  CONSTRAINT ck_goal_achieved CHECK ((status = 'ACHIEVED') = (achieved_on IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE challenges (
  challenge_id  INT AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(100) NOT NULL,
  description   VARCHAR(255) NULL,
  metric        ENUM('TOTAL_VISITS','TOTAL_VOLUME','LONGEST_STREAK','EXERCISE_MAX_WEIGHT') NOT NULL,
  exercise_id   INT  NULL,
  branch_id     INT  NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  created_by    INT  NOT NULL,
  CONSTRAINT fk_ch_exercise FOREIGN KEY (exercise_id) REFERENCES exercises (exercise_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ch_branch   FOREIGN KEY (branch_id)   REFERENCES branches (branch_id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ch_creator  FOREIGN KEY (created_by)  REFERENCES users (user_id)        ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_ch_dates    CHECK (end_date > start_date),
  CONSTRAINT ck_ch_exercise CHECK ((metric = 'EXERCISE_MAX_WEIGHT') = (exercise_id IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE challenge_participants (
  challenge_id  INT      NOT NULL,
  member_id     INT      NOT NULL,
  joined_at     DATETIME NOT NULL,
  final_score   DECIMAL(12,2) NULL,
  final_rank    INT      NULL,
  PRIMARY KEY (challenge_id, member_id),
  CONSTRAINT fk_cp_challenge FOREIGN KEY (challenge_id) REFERENCES challenges (challenge_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cp_member    FOREIGN KEY (member_id)    REFERENCES members (member_id)       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_cp_rank CHECK (final_rank IS NULL OR final_rank > 0)
) ENGINE=InnoDB;

CREATE TABLE workout_templates (
  template_id    INT AUTO_INCREMENT PRIMARY KEY,
  template_name  VARCHAR(100) NOT NULL,
  created_by     INT      NOT NULL,
  for_member_id  INT      NULL,
  source         ENUM('MANUAL','GENERATED') NOT NULL DEFAULT 'MANUAL',
  days_per_week  TINYINT  NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active      BOOLEAN  NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_tpl_creator FOREIGN KEY (created_by)    REFERENCES users (user_id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tpl_member  FOREIGN KEY (for_member_id) REFERENCES members (member_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_tpl_days CHECK (days_per_week BETWEEN 1 AND 7)
) ENGINE=InnoDB;

CREATE TABLE template_exercises (
  template_id              INT      NOT NULL,
  day_number               TINYINT  NOT NULL,
  exercise_order           TINYINT  NOT NULL,
  exercise_id              INT      NOT NULL,
  preferred_equipment_id   INT      NULL,
  target_sets              TINYINT  NOT NULL,
  target_reps              SMALLINT NULL,
  target_weight_kg         DECIMAL(5,2) NULL,
  target_duration_seconds  INT      NULL,
  PRIMARY KEY (template_id, day_number, exercise_order),
  CONSTRAINT fk_te_template  FOREIGN KEY (template_id)            REFERENCES workout_templates (template_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_te_exercise  FOREIGN KEY (exercise_id)            REFERENCES exercises (exercise_id)         ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_te_equipment FOREIGN KEY (preferred_equipment_id) REFERENCES equipment (equipment_id)        ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_te_sets  CHECK (target_sets > 0),
  CONSTRAINT ck_te_day   CHECK (day_number BETWEEN 1 AND 7),
  CONSTRAINT ck_te_order CHECK (exercise_order > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Group F: admin rules
-- ---------------------------------------------------------------------

CREATE TABLE branch_closures (
  closure_id    INT AUTO_INCREMENT PRIMARY KEY,
  branch_id     INT  NULL,          -- NULL = all branches
  closure_date  DATE NOT NULL,
  reason        VARCHAR(200) NOT NULL,
  created_by    INT  NOT NULL,
  CONSTRAINT uk_closure UNIQUE (branch_id, closure_date),
  CONSTRAINT fk_closure_branch  FOREIGN KEY (branch_id)  REFERENCES branches (branch_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_closure_creator FOREIGN KEY (created_by) REFERENCES users (user_id)       ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE maintenance_rules (
  rule_id                 INT AUTO_INCREMENT PRIMARY KEY,
  category_id             INT NOT NULL,
  service_interval_hours  INT NOT NULL,
  created_by              INT NOT NULL,
  CONSTRAINT uk_rule_category UNIQUE (category_id),
  CONSTRAINT fk_rule_category FOREIGN KEY (category_id) REFERENCES equipment_categories (category_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rule_creator  FOREIGN KEY (created_by)  REFERENCES users (user_id)                    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_rule_interval CHECK (service_interval_hours > 0)
) ENGINE=InnoDB;

CREATE TABLE system_settings (
  setting_key    VARCHAR(50)  NOT NULL PRIMARY KEY,
  setting_value  VARCHAR(100) NOT NULL,
  description    VARCHAR(200) NOT NULL,
  updated_by     INT          NOT NULL,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- Helpful secondary indexes for frequent lookups
CREATE INDEX ix_att_member_time   ON attendance (member_id, check_in_time);
CREATE INDEX ix_att_branch_time   ON attendance (branch_id, check_in_time);
CREATE INDEX ix_usage_eq_time     ON equipment_usage_log (equipment_id, start_time);
CREATE INDEX ix_sets_exercise     ON workout_sets (exercise_id, performed_at);
CREATE INDEX ix_subs_member_dates ON subscriptions (member_id, start_date, end_date);
CREATE INDEX ix_ts_member_date    ON training_sessions (member_id, session_date);
