// Builds a member's insight document from MySQL analytics and stores it in MongoDB (member_insights).
import { query, queryOne } from './mysql';
import { collection } from './docs';

export async function generateInsights(memberId) {
  const [ov, streak, plateaus, muscles, recentPrs, volume, goals] = await Promise.all([
    queryOne('SELECT * FROM v_member_overview WHERE member_id = ?', [memberId]),
    queryOne('SELECT * FROM v_member_streaks WHERE member_id = ?', [memberId]),
    query('SELECT exercise_name, best_recent FROM v_plateau_flags WHERE member_id = ?', [memberId]),
    query('SELECT muscle_group, sets_28d, days_28d, last_trained FROM v_muscle_group_activity WHERE member_id = ?', [memberId]),
    query(`SELECT exercise_name, record_type, record_value FROM v_personal_records
            WHERE member_id = ? AND achieved_at >= CURDATE() - INTERVAL 14 DAY ORDER BY achieved_at DESC LIMIT 5`, [memberId]),
    query(`SELECT yw, SUM(volume_kg) AS volume FROM v_training_volume WHERE member_id = ?
            GROUP BY yw ORDER BY yw DESC LIMIT 2`, [memberId]),
    query("SELECT goal_type, exercise_name, target_value, current_value, target_date FROM v_goal_progress WHERE member_id = ? AND status = 'ACTIVE'", [memberId]),
  ]);

  const highlights = []; const warnings = []; const suggestions = [];
  const target = ov?.training_days_per_week || 5;
  const visits30 = Number(streak?.visit_days_last_30 || 0);
  const weekly = Math.round((visits30 / 30) * 7 * 10) / 10;

  if (Number(streak?.current_streak) >= 3) highlights.push(`You are on a ${streak.current_streak}-day streak.`);
  if (recentPrs.length) highlights.push(`${recentPrs.length} new personal record(s) in the last two weeks, including ${recentPrs[0].exercise_name}.`);
  if (volume.length === 2 && Number(volume[1].volume) > 0) {
    const change = Math.round(((Number(volume[0].volume) - Number(volume[1].volume)) / Number(volume[1].volume)) * 100);
    if (change >= 10) highlights.push(`Training volume up ${change}% on the previous week.`);
    if (change <= -25) warnings.push(`Training volume down ${Math.abs(change)}% on the previous week.`);
  }
  if (weekly < target - 1) warnings.push(`You average ${weekly} visits a week against your target of ${target}.`);
  else highlights.push(`You average ${weekly} visits a week (target ${target}).`);
  for (const p of plateaus) {
    warnings.push(`${p.exercise_name} has not improved for several weeks (best ${p.best_recent} kg).`);
    suggestions.push(`For ${p.exercise_name}, try a deload week at 70-80% then add 2.5 kg, or change the rep range.`);
  }
  const neglected = muscles.filter((m) => m.muscle_group !== 'FULL_BODY' && Number(m.days_28d) === 0).map((m) => m.muscle_group.toLowerCase());
  if (neglected.length) suggestions.push(`No ${neglected.join(', ')} work in 4 weeks. Generate a routine to balance your week.`);
  for (const g of goals) {
    const pct = g.current_value ? Math.round((Number(g.current_value) / Number(g.target_value)) * 100) : 0;
    if (pct >= 80 && pct < 100) highlights.push(`Almost there: ${pct}% of your ${g.exercise_name || g.goal_type.toLowerCase().replace('_', ' ')} goal.`);
  }
  if (!ov?.plan_name) warnings.push('No active plan: buy one to keep training.');
  if (!suggestions.length) suggestions.push('Keep the current routine and aim for one more rep or 2.5 kg each week.');

  const doc = {
    member_id: memberId, generated_at: new Date(),
    headline: warnings.length ? 'A few things need attention' : 'You are on track',
    highlights, warnings, suggestions,
    stats: { visits_last_30: visits30, current_streak: Number(streak?.current_streak || 0), plateaus: plateaus.length, recent_records: recentPrs.length },
    muscle_balance: muscles.map((m) => ({ muscle: m.muscle_group, sets_28d: Number(m.sets_28d), days_28d: Number(m.days_28d) })),
  };
  const col = await collection('member_insights');
  await col.replaceOne({ member_id: memberId }, doc, { upsert: true });
  return doc;
}
