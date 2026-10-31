'use client';
// Book personal trainers at any branch your plan covers; cancel; read trainer notes.
import { useMemo, useState } from 'react';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table, fmtDate, hhmm, rupees } from '@/components/ui';

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// next dates (from tomorrow) that fall on the slot's weekday within the booking window
function datesFor(dow, today, daysAhead) {
  const out = [];
  const base = new Date(today + 'T00:00:00');
  for (let i = 1; i <= daysAhead; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i);
    if (DOW[d.getDay()] === dow) out.push(iso(d));
  }
  return out;
}
function startTimes(slot, duration) {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const out = [];
  for (let m = toMin(slot.slot_start); m + duration <= toMin(slot.slot_end); m += 30) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return out;
}

export default function TrainingPage() {
  const state = useApi('/api/member/training');
  const { msg, setMsg, busy, run } = useAction();
  const [pick, setPick] = useState({ trainerId: '', slotId: '', date: '', duration: 60, start: '' });
  const [log, setLog] = useState(null);
  const d = state.data;

  const trainers = useMemo(() => (d ? d.trainers.filter((t) => d.tierRank && t.tier_rank <= d.tierRank) : []), [d]);
  if (!d) return <Loading state={state} />;

  const trainer = trainers.find((t) => String(t.trainer_id) === String(pick.trainerId));
  const slots = d.slots.filter((s) => String(s.trainer_id) === String(pick.trainerId));
  const slot = slots.find((s) => String(s.availability_id) === String(pick.slotId));
  const taken = new Set(d.taken.filter((t) => String(t.availability_id) === String(pick.slotId)).map((t) => t.session_date));
  const dates = slot ? datesFor(slot.day_of_week, d.settings.today, d.settings.days_ahead) : [];
  const times = slot ? startTimes(slot, Number(pick.duration)) : [];

  const book = async (e) => {
    e.preventDefault();
    const r = await run(() => api.post('/api/member/training', { action: 'book', availabilityId: Number(pick.slotId), date: pick.date, start: pick.start, duration: Number(pick.duration) }));
    if (r) { setPick({ ...pick, date: '', start: '' }); state.reload(); }
  };
  const cancel = async (s) => {
    if (!window.confirm(`Cancel the session on ${fmtDate(s.session_date)}? Cancelling less than ${d.settings.cutoff_hours} hours before is still charged.`)) return;
    const r = await run(() => api.post('/api/member/training', { action: 'cancel', sessionId: s.training_session_id }));
    if (r) state.reload();
  };
  const viewLog = async (s) => {
    const r = await run(() => api.get(`/api/member/training/log?sessionId=${s.training_session_id}`), ' ');
    setMsg(null);
    if (r) setLog({ session: s, doc: r.log });
  };

  return (
    <div className="stack">
      <PageHead title="Personal training" subtitle="Book any trainer at a branch your plan covers. Sessions are billed separately." />
      <Alert msg={msg} onClose={() => setMsg(null)} />
      {!d.tierRank && <div className="alert warn">You need an active plan to book personal training.</div>}

      {d.tierRank && (
        <Card title="Book a session">
          <form className="form" onSubmit={book}>
            <label className="field">Trainer
              <select value={pick.trainerId} onChange={(e) => setPick({ trainerId: e.target.value, slotId: '', date: '', duration: 60, start: '' })} required>
                <option value="">Choose...</option>
                {trainers.map((t) => <option key={t.trainer_id} value={t.trainer_id}>{t.full_name} - {t.branch_name} ({rupees(t.hourly_rate)}/h)</option>)}
              </select>
            </label>
            <label className="field">Weekly slot
              <select value={pick.slotId} onChange={(e) => setPick({ ...pick, slotId: e.target.value, date: '', start: '' })} required disabled={!trainer}>
                <option value="">Choose...</option>
                {slots.map((s) => <option key={s.availability_id} value={s.availability_id}>{s.day_of_week} {hhmm(s.slot_start)}-{hhmm(s.slot_end)}</option>)}
              </select>
            </label>
            <label className="field">Date
              <select value={pick.date} onChange={(e) => setPick({ ...pick, date: e.target.value })} required disabled={!slot}>
                <option value="">Choose...</option>
                {dates.map((x) => <option key={x} value={x} disabled={taken.has(x)}>{fmtDate(x)}{taken.has(x) ? ' (booked)' : ''}</option>)}
              </select>
            </label>
            <label className="field">Length
              <select value={pick.duration} onChange={(e) => setPick({ ...pick, duration: e.target.value, start: '' })}>
                {[30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </label>
            <label className="field">Start
              <select value={pick.start} onChange={(e) => setPick({ ...pick, start: e.target.value })} required disabled={!slot}>
                <option value="">Choose...</option>
                {times.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <button className="primary" disabled={busy}>Book{trainer ? ` (${rupees((trainer.hourly_rate * pick.duration) / 60)})` : ''}</button>
          </form>
          {trainer && <p className="small muted" style={{ marginTop: 8 }}>{trainer.full_name}: {trainer.specialization}, {trainer.years_experience} years. Sessions take place at {trainer.branch_name}.</p>}
        </Card>
      )}

      {log && (
        <Card title={`Trainer notes, ${fmtDate(log.session.session_date)}`} actions={<button className="small" onClick={() => setLog(null)}>Close</button>}>
          {!log.doc ? <p className="muted">Your trainer has not written notes for this session yet.</p> : (
            <>
              <p>{log.doc.summary}</p>
              {log.doc.exercises?.length > 0 && <Table rows={log.doc.exercises} columns={[
                { key: 'name', label: 'Exercise' }, { key: 'sets', label: 'Sets', num: true }, { key: 'reps', label: 'Reps', num: true },
                { key: 'weight_kg', label: 'kg', num: true }, { key: 'notes', label: 'Notes' }]} />}
              {log.doc.form_notes?.length > 0 && <><h3 style={{ marginTop: 10 }}>Form notes</h3><ul>{log.doc.form_notes.map((n, i) => <li key={i}>{n}</li>)}</ul></>}
              {log.doc.pain_or_injury && <p><b>Pain:</b> {log.doc.pain_or_injury.area} (severity {log.doc.pain_or_injury.severity}/10) {log.doc.pain_or_injury.note}</p>}
              {log.doc.next_session_plan && <p><b>Next time:</b> {log.doc.next_session_plan}</p>}
            </>
          )}
        </Card>
      )}

      <Card title="Your sessions">
        <Table rows={d.sessions} rowKey={(r) => r.training_session_id} columns={[
          { key: 'session_date', label: 'Date', render: (r) => `${fmtDate(r.session_date)} ${hhmm(r.start_time)}` },
          { key: 'trainer_name', label: 'Trainer' },
          { key: 'branch_name', label: 'Branch' },
          { key: 'duration_minutes', label: 'Min', num: true },
          { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
          { key: 'invoice_status', label: 'Invoice', render: (r) => <Badge value={r.invoice_status} /> },
          { key: 'act', label: '', render: (r) => r.status === 'SCHEDULED'
              ? <button className="small danger" onClick={() => cancel(r)} disabled={busy}>Cancel</button>
              : r.status === 'COMPLETED' ? <button className="small" onClick={() => viewLog(r)}>Notes</button> : null },
        ]} />
      </Card>
    </div>
  );
}
