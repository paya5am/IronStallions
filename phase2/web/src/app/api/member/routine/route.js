// Routine builder and workout templates.
import { route, int, oneOf, str, optNum, ApiError } from '@/lib/api';
import { pool, query, callProc } from '@/lib/mysql';

export const GET = route(['MEMBER'], async ({ user }) => {
  const templates = await query(`
    SELECT t.template_id, t.template_name, t.source, t.days_per_week, t.created_at, t.is_active, t.for_member_id,
           u.full_name AS created_by_name, u.role AS created_by_role
      FROM workout_templates t JOIN users u ON u.user_id = t.created_by
     WHERE t.for_member_id = ? OR t.for_member_id IS NULL
     ORDER BY t.is_active DESC, (t.source = 'GENERATED') DESC, t.created_at DESC`, [user.user_id]);
  const items = templates.length ? await query(`
    SELECT te.*, x.exercise_name, x.muscle_group, x.measure_type, e.name AS machine_name, e.status AS machine_status
      FROM template_exercises te JOIN exercises x ON x.exercise_id = te.exercise_id
      LEFT JOIN equipment e ON e.equipment_id = te.preferred_equipment_id
     WHERE te.template_id IN (?) ORDER BY te.template_id, te.day_number, te.exercise_order`, [templates.map((t) => t.template_id)]) : [];
  for (const t of templates) t.items = items.filter((i) => i.template_id === t.template_id);
  const me = await query('SELECT training_days_per_week FROM members WHERE member_id = ?', [user.user_id]);
  return { templates, trainingDays: me[0]?.training_days_per_week };
});

export const POST = route(['MEMBER'], async ({ user, body }) => {
  const action = oneOf(body.action, ['generate', 'create', 'toggle', 'copy'], 'Action');
  if (action === 'generate') {
    const days = int(body.days, 'Days');
    const { out } = await callProc('sp_build_routine', [user.user_id, days], ['template_id']);
    return { ok: true, templateId: out.template_id, message: 'New routine generated from your machine ratings and recent performance.' };
  }
  if (action === 'toggle') {
    const res = await query('UPDATE workout_templates SET is_active = ? WHERE template_id = ? AND for_member_id = ?',
      [body.isActive ? 1 : 0, int(body.templateId, 'Template'), user.user_id]);
    if (!res.affectedRows) throw new ApiError(404, 'Template not found.');
    return { ok: true };
  }
  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    let name, days, items;
    if (action === 'copy') {
      const [[src]] = await conn.query('SELECT * FROM workout_templates WHERE template_id = ? AND for_member_id IS NULL', [int(body.templateId, 'Template')]);
      if (!src) throw new ApiError(404, 'Only general templates can be copied.');
      name = `${src.template_name} (my copy)`; days = src.days_per_week;
      [items] = await conn.query('SELECT * FROM template_exercises WHERE template_id = ?', [src.template_id]);
      items = items.map((i) => ({ day: i.day_number, exerciseId: i.exercise_id, sets: i.target_sets, reps: i.target_reps, weight: i.target_weight_kg, duration: i.target_duration_seconds, equipmentId: i.preferred_equipment_id }));
    } else {
      name = str(body.name, 'Name', 100); days = int(body.days, 'Days');
      items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) throw new ApiError(400, 'Add at least one exercise.');
    }
    const [t] = await conn.query("INSERT INTO workout_templates (template_name, created_by, for_member_id, source, days_per_week) VALUES (?, ?, ?, 'MANUAL', ?)",
      [name, user.user_id, user.user_id, days]);
    const order = {};
    for (const it of items) {
      const day = int(it.day, 'Day');
      order[day] = (order[day] || 0) + 1;
      await conn.query(`INSERT INTO template_exercises (template_id, day_number, exercise_order, exercise_id, preferred_equipment_id,
                          target_sets, target_reps, target_weight_kg, target_duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.insertId, day, order[day], int(it.exerciseId, 'Exercise'), it.equipmentId || null, int(it.sets || 3, 'Sets'),
         optNum(it.reps), optNum(it.weight), optNum(it.duration)]);
    }
    await conn.commit();
    return { ok: true, templateId: t.insertId, message: 'Template saved.' };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});
