-- =====================================================================
-- 00_run_all.sql : builds the whole MySQL side from scratch.
-- Run from the project root (the gym-management folder):
--   mysql -u root -p --execute="source database/mysql/00_run_all.sql"
-- WARNING: drops and recreates the gym_management database.
-- =====================================================================
SELECT 'Step 1/6: schema' AS progress;
source database/mysql/01_schema.sql
SELECT 'Step 2/6: triggers and helper functions' AS progress;
source database/mysql/02_triggers.sql
SELECT 'Step 3/6: stored procedures' AS progress;
source database/mysql/03_procedures.sql
SELECT 'Step 4/6: views' AS progress;
source database/mysql/04_views.sql
SELECT 'Step 5/6: seed data (about 20-60 seconds)' AS progress;
source database/mysql/05_seed.sql
SELECT 'Step 6/6: scheduled events' AS progress;
source database/mysql/06_events.sql
SELECT 'Done. Next: create the gym_app user once (guide section 8), then run 07_tests.sql' AS progress;
