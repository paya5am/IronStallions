'use client';
// Session log editor. Saved to MongoDB (pt_session_logs): the structure varies per session.
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApi, useAction, api, Card, Alert, PageHead, Loading, fmtDate, hhmm } from '@/components/ui';

const blankEx = { name: '', sets: '', reps: '', weight_kg: '', notes: '' };

export default function LogPage({ params }) {
  const { id } = use(params);
  const state = useApi(`/api/trainer/sessions/log?sessionId=${id}`);
  const { msg, setMsg, busy, run } = useAction();
  const [f, setF] = useState(null);

  useEffect(() => {
    if (!state.data || f) return;
    const l = state.data.log || {};
    setF({
      summary: l.summary || '', exercises: l.exercises?.length ? l.exercises.map((e) => ({ ...blankEx, ...e })) : [{ ...blankEx }],
      formNotes: (l.form_notes || []).join('\n'), nextPlan: l.next_session_plan || '', tags: (l.tags || []).join(', '),
      painArea: l.pain_or_injury?.area || '', painSeverity: l.pain_or_injury?.severity || '', painNote: l.pain_or_injury?.note || '',
      bodyWeight: l.measurements?.body_weight_kg ?? '', restingHr: l.measurements?.resting_heart_rate ?? '',
    });
  }, [state.data, f]);

  if (!state.data || !f) return <Loading state={state} />;
  const s = state.data.session;
  const setEx = (i, k, v) => setF({ ...f, exercises: f.exercises.map((e, j) => (j === i ? { ...e, [k]: v } : e)) });

  const save = async (e) => {
    e.preventDefault();
    await run(() => api.put('/api/trainer/sessions/log', {
      sessionId: Number(id), summary: f.summary, exercises: f.exercises, formNotes: f.formNotes, nextPlan: f.nextPlan, tags: f.tags,
      pain: f.painArea ? { area: f.painArea, severity: f.painSeverity, note: f.painNote } : null,
      measurements: { ...(f.bodyWeight !== '' && { body_weight_kg: f.bodyWeight }), ...(f.restingHr !== '' && { resting_heart_rate: f.restingHr }) },
    }), 'Log saved.');
  };

  return (
    <div className="stack">
      <PageHead title={`Session log: ${s.member_name}`} subtitle={`${fmtDate(s.session_date)} ${hhmm(s.start_time)} - stored as a MongoDB document`}>
        <Link href="/trainer"><button>Back</button></Link>
      </PageHead>
      <Alert msg={msg} onClose={() => setMsg(null)} />
      <form onSubmit={save} className="stack">
        <Card title="Summary"><textarea value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} placeholder="What was done, how the member felt" required /></Card>
        <Card title="Exercises covered" actions={<button type="button" className="small" onClick={() => setF({ ...f, exercises: [...f.exercises, { ...blankEx }] })}>Add row</button>}>
          {f.exercises.map((ex, i) => (
            <div className="form" key={i} style={{ marginBottom: 8 }}>
              <label className="field">Exercise<input value={ex.name} onChange={(e) => setEx(i, 'name', e.target.value)} /></label>
              <label className="field">Sets<input type="number" value={ex.sets} onChange={(e) => setEx(i, 'sets', e.target.value)} /></label>
              <label className="field">Reps<input type="number" value={ex.reps} onChange={(e) => setEx(i, 'reps', e.target.value)} /></label>
              <label className="field">kg<input type="number" step="0.5" value={ex.weight_kg} onChange={(e) => setEx(i, 'weight_kg', e.target.value)} /></label>
              <label className="field">Notes<input value={ex.notes} onChange={(e) => setEx(i, 'notes', e.target.value)} /></label>
            </div>
          ))}
        </Card>
        <div className="grid g2">
          <Card title="Form notes (one per line)"><textarea value={f.formNotes} onChange={(e) => setF({ ...f, formNotes: e.target.value })} /></Card>
          <Card title="Plan for next session"><textarea value={f.nextPlan} onChange={(e) => setF({ ...f, nextPlan: e.target.value })} /></Card>
        </div>
        <div className="grid g2">
          <Card title="Pain or injury (optional)">
            <div className="form">
              <label className="field">Area<input value={f.painArea} onChange={(e) => setF({ ...f, painArea: e.target.value })} /></label>
              <label className="field">Severity 1-10<input type="number" min="1" max="10" value={f.painSeverity} onChange={(e) => setF({ ...f, painSeverity: e.target.value })} /></label>
              <label className="field">Note<input value={f.painNote} onChange={(e) => setF({ ...f, painNote: e.target.value })} /></label>
            </div>
          </Card>
          <Card title="Measurements (optional)">
            <div className="form">
              <label className="field">Body weight (kg)<input type="number" step="0.1" value={f.bodyWeight} onChange={(e) => setF({ ...f, bodyWeight: e.target.value })} /></label>
              <label className="field">Resting heart rate<input type="number" value={f.restingHr} onChange={(e) => setF({ ...f, restingHr: e.target.value })} /></label>
              <label className="field">Tags (comma separated)<input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></label>
            </div>
          </Card>
        </div>
        <div><button className="primary" disabled={busy}>Save log</button></div>
      </form>
    </div>
  );
}
