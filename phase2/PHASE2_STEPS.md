# Phase 2 (the remaining ~25%) - how to add it

Phase 2 adds the personalisation and analytics layer. It adds **no tables**, so the ER diagrams and
the table list in the relational schema stay the same. Everything here was tested together with Phase 1.

| Feature | Database (08_phase2.sql) | MongoDB | Pages |
|---|---|---|---|
| Personalised routine builder | `sp_build_routine` | - | `/member/routine` |
| Workout templates (create, reuse, copy) | `workout_templates`, `template_exercises` (existing tables) | - | `/member/routine` |
| Exercise progression, workout comparison | `v_exercise_progression`, `v_workout_comparison` | - | `/member/progress` |
| Training volume, muscle-group activity | `v_training_volume`, `v_muscle_group_activity` | - | `/member/progress` |
| Fitness goals with auto-achievement | `v_goal_progress`, `sp_update_goals` | - | `/member/goals` |
| Challenges and leaderboards | `v_challenge_leaderboard`, `sp_finalize_challenges` | - | `/member/challenges`, `/admin/challenges` |
| Usage-based service alerts | `v_service_due`, `sp_generate_service_alerts` | - | `/admin/maintenance-rules` |
| Personalised insights | reads the views above | `member_insights` | member dashboard |
| Trainer view of clients | the views above | - | `/trainer/clients` |
| Hourly jobs for goals, challenges, services | event `ev_phase2_jobs` | - | - |

## Steps

Do this on a separate Git branch so the half-review version stays safe:

```
git checkout -b phase2
```

1. Database objects (run from the project root; no data is deleted):

```
mysql -u root -p --execute="source phase2/database/mysql/08_phase2.sql"
```

2. Make every future rebuild include Phase 2: open `database/mysql/00_run_all.sql` and add this as the
   last line:

```
source phase2/database/mysql/08_phase2.sql
```

3. MongoDB collection for insights:

```
mongosh "mongodb://127.0.0.1:27017/gym_management_docs" phase2/database/mongodb/phase2.js
```

4. Web files: new pages are added and two files are replaced (`web/src/lib/nav.js` adds the menu
   entries, `web/src/app/member/page.js` adds the insights card).

Mac (Terminal):

```
cp -R phase2/web/src/. web/src/
```

Windows (PowerShell):

```
Copy-Item -Recurse -Force phase2\web\src\* web\src\
```

5. Restart the app (`Control+C`, then `npm run dev` inside `web`).

6. Check it (app running, project root, fresh data from step 1 of the main guide plus step 1 here):

```
node phase2/api_smoke_test_phase2.mjs
```

Expected: `15 passed, 0 failed`. The service-alert check only passes the first time on fresh data,
because the alerts it creates are not created twice.

7. Click through: log in as 9000001001 and open My routine (Generate), Progress, Goals, Challenges and the
   dashboard insights card; as 9000000101 open Clients; as 9000000001 open Service rules (set Treadmill to
   5 hours, then "Check machines now") and Challenges.

8. Commit and merge:

```
git add .
git commit -m "Phase 2: routine builder, progress, goals, challenges, insights, service rules"
git checkout main
git merge phase2
```

## For the final report

* Relational schema document: add the Phase 2 views and procedures to the list of database objects.
  Tables, columns and ER diagrams do not change.
* MongoDB: add `member_insights` to the justification (generated summary, different sections per member,
  rebuilt from MySQL and read in one request).
* Screenshots of the new pages.

## Demo talking points

* **Routine builder**: it spreads the muscle groups over the member's chosen number of days, ranks the
  exercises by the member's own comfort ratings of each machine type (from the usage log), only uses
  machine types that exist at the member's home branch, and sets the target weight at about 90% of the
  member's best in the last 8 weeks. It is one stored procedure inside one transaction.
* **Goals** are marked ACHIEVED by the database when the measured value reaches the target.
* **Leaderboards** are a view with window functions (`RANK() OVER`), and the gaps-and-islands technique
  for streaks; final ranks are stored once a challenge ends.
* **Service alerts** add machine hours from the usage log since the last completed service.
