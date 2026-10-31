// PT session logs live in MongoDB: nested, and different for every session.
import { route, int, ApiError } from '@/lib/api';
import { queryOne } from '@/lib/mysql';
import { collection, logActivity } from '@/lib/docs';

async function ownSession(id, trainerId) {
  const s = await queryOne(`SELECT ts.training_session_id, ts.member_id, ts.trainer_id, ts.session_date, ts.start_time, ts.status,
                                   u.full_name AS member_name
                              FROM training_sessions ts JOIN users u ON u.user_id = ts.member_id
                             WHERE ts.training_session_id = ?`, [id]);
  if (!s || s.trainer_id !== trainerId) throw new ApiError(404, 'Session not found.');
  return s;
}

export const GET = route(['TRAINER'], async ({ req, user }) => {
  const s = await ownSession(int(req.nextUrl.searchParams.get('sessionId'), 'Session'), user.user_id);
  const col = await collection('pt_session_logs');
  const log = await col.findOne({ training_session_id: s.training_session_id });
  return { session: s, log };
});

export const PUT = route(['TRAINER'], async ({ user, body }) => {
  const s = await ownSession(int(body.sessionId, 'Session'), user.user_id);
  if (s.status !== 'COMPLETED') throw new ApiError(409, 'Mark the session completed before writing its log.');
  const text = (v, max = 2000) => String(v ?? '').slice(0, max).trim();
  const exercises = (Array.isArray(body.exercises) ? body.exercises : []).slice(0, 30)
    .filter((e) => e && text(e.name, 80))
    .map((e) => {
      const item = { name: text(e.name, 80) };
      for (const k of ['sets', 'reps', 'weight_kg', 'duration_min']) if (e[k] !== '' && e[k] != null && Number.isFinite(Number(e[k]))) item[k] = Number(e[k]);
      if (text(e.notes)) item.notes = text(e.notes, 300);
      return item;
    });
  const doc = {
    training_session_id: s.training_session_id, member_id: s.member_id, trainer_id: s.trainer_id,
    session_date: s.session_date, written_at: new Date(),
    summary: text(body.summary), exercises,
    form_notes: (Array.isArray(body.formNotes) ? body.formNotes : String(body.formNotes || '').split('\n')).map((x) => text(x, 300)).filter(Boolean),
    next_session_plan: text(body.nextPlan),
    tags: (Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(',')).map((x) => text(x, 30).toLowerCase()).filter(Boolean),
  };
  if (body.pain && text(body.pain.area, 60)) {
    doc.pain_or_injury = { area: text(body.pain.area, 60), severity: Math.min(10, Math.max(1, Number(body.pain.severity) || 1)), note: text(body.pain.note, 300) };
  }
  if (body.measurements && Object.keys(body.measurements).length) {
    doc.measurements = {};
    for (const [k, v] of Object.entries(body.measurements)) if (Number.isFinite(Number(v)) && v !== '') doc.measurements[k.slice(0, 30)] = Number(v);
  }
  if (!doc.summary) throw new ApiError(400, 'Write a short summary.');
  const col = await collection('pt_session_logs');
  await col.replaceOne({ training_session_id: s.training_session_id }, doc, { upsert: true });
  await logActivity('PT_LOG_SAVED', { userId: user.user_id, role: user.role, details: { training_session_id: s.training_session_id } });
  return { ok: true };
});
