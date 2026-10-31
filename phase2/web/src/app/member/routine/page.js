'use client';
// Personalised routine builder + workout templates.
import { useState } from 'react';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table } from '@/components/ui';

function TemplateView({ t }) {
  const days = [...new Set(t.items.map((i) => i.day_number))];
  return (
    <div className="grid g3">
      {days.map((d) => (
        <div key={d} className="card tight">
          <h3>Day {d}</h3>
          {t.items.filter((i) => i.day_number === d).map((i) => (
            <div key={i.exercise_order} style={{ marginBottom: 6 }}>
              <b>{i.exercise_name}</b> <Badge value={i.muscle_group} tone="" />
              <div className="small muted">
                {i.measure_type === 'TIME_DISTANCE' ? `${Math.round(i.target_duration_seconds / 60)} min`
                  : `${i.target_sets} x ${i.target_reps}${i.target_weight_kg ? ` @ ${i.target_weight_kg} kg` : ''}`}
                {i.machine_name && <> on {i.machine_name} {i.machine_status !== 'AVAILABLE' && <Badge value={i.machine_status} />}</>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function RoutinePage() {
  const state = useApi('/api/member/routine');
  const exercises = useApi('/api/exercises');
  const { msg, setMsg, busy, run } = useAction();
  const [days, setDays] = useState('');
  const [f, setF] = useState(null);
  if (!state.data || !exercises.data) return <Loading state={state.data ? exercises : state} />;

  const active = state.data.templates.filter((t) => t.for_member_id && t.is_active);
  const generated = active.find((t) => t.source === 'GENERATED');
  const others = state.data.templates.filter((t) => t !== generated);

  const generate = async () => { const r = await run(() => api.post('/api/member/routine', { action: 'generate', days: Number(days || state.data.trainingDays) })); if (r) state.reload(); };
  const toggle = async (t) => { const r = await run(() => api.post('/api/member/routine', { action: 'toggle', templateId: t.template_id, isActive: !t.is_active }), 'Updated.'); if (r) state.reload(); };
  const copy = async (t) => { const r = await run(() => api.post('/api/member/routine', { action: 'copy', templateId: t.template_id })); if (r) state.reload(); };
  const save = async (e) => {
    e.preventDefault();
    const r = await run(() => api.post('/api/member/routine', { action: 'create', name: f.name, days: Number(f.days), items: f.items }));
    if (r) { setF(null); state.reload(); }
  };
  const setItem = (i, k, v) => setF({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });

  return (
    <div className="stack">
      <PageHead title="My routine" subtitle="Built from your machine comfort ratings, the machines at your home branch and your recent weights." />
      <Alert msg={msg} onClose={() => setMsg(null)} />
      <Card title="Generate a weekly routine">
        <div className="row">
          <select value={days || state.data.trainingDays} onChange={(e) => setDays(e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} days a week</option>)}
          </select>
          <button className="primary" onClick={generate} disabled={busy}>Generate</button>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>Covers every muscle group across your days, picks the exercises on machines you rated most comfortable, and sets weights at about 90% of your recent best.</p>
      </Card>
      {generated && <Card title={generated.template_name}><TemplateView t={generated} /></Card>}

      <Card title="Templates" actions={<button className="small" onClick={() => setF(f ? null : { name: '', days: '3', items: [{ day: '1', exerciseId: '', sets: '3', reps: '10', weight: '', duration: '' }] })}>{f ? 'Close' : 'New template'}</button>}>
        {f && (
          <form onSubmit={save} style={{ marginBottom: 16 }}>
            <div className="form">
              <label className="field">Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
              <label className="field">Days a week<select value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })}>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n}>{n}</option>)}</select></label>
            </div>
            {f.items.map((it, i) => {
              const ex = exercises.data.exercises.find((x) => String(x.exercise_id) === String(it.exerciseId));
              return (
                <div className="form" key={i} style={{ marginTop: 8 }}>
                  <label className="field">Day<select value={it.day} onChange={(e) => setItem(i, 'day', e.target.value)}>{Array.from({ length: Number(f.days) }, (_, k) => <option key={k + 1}>{k + 1}</option>)}</select></label>
                  <label className="field">Exercise<select value={it.exerciseId} onChange={(e) => setItem(i, 'exerciseId', e.target.value)} required>
                    <option value="">Choose...</option>{exercises.data.exercises.map((x) => <option key={x.exercise_id} value={x.exercise_id}>{x.exercise_name}</option>)}</select></label>
                  <label className="field">Sets<input type="number" min="1" value={it.sets} onChange={(e) => setItem(i, 'sets', e.target.value)} /></label>
                  {ex?.measure_type === 'TIME_DISTANCE'
                    ? <label className="field">Seconds<input type="number" min="1" value={it.duration} onChange={(e) => setItem(i, 'duration', e.target.value)} required /></label>
                    : <label className="field">Reps<input type="number" min="1" value={it.reps} onChange={(e) => setItem(i, 'reps', e.target.value)} required /></label>}
                  {ex?.measure_type === 'WEIGHT_REPS' && <label className="field">kg<input type="number" step="0.5" value={it.weight} onChange={(e) => setItem(i, 'weight', e.target.value)} /></label>}
                </div>
              );
            })}
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" onClick={() => setF({ ...f, items: [...f.items, { day: '1', exerciseId: '', sets: '3', reps: '10', weight: '', duration: '' }] })}>Add exercise</button>
              <button className="primary" disabled={busy}>Save template</button>
            </div>
          </form>
        )}
        <Table rows={others} rowKey={(r) => r.template_id} columns={[
          { key: 'template_name', label: 'Template', render: (t) => <details><summary>{t.template_name}</summary><div style={{ marginTop: 8 }}><TemplateView t={t} /></div></details> },
          { key: 'source', label: 'Made by', render: (t) => (t.source === 'GENERATED' ? 'Routine builder' : `${t.created_by_name} (${t.created_by_role.toLowerCase()})`) },
          { key: 'days_per_week', label: 'Days', num: true },
          { key: 'status', label: '', render: (t) => (t.for_member_id
            ? <button className="small" disabled={busy} onClick={() => toggle(t)}>{t.is_active ? 'Archive' : 'Restore'}</button>
            : <button className="small" disabled={busy} onClick={() => copy(t)}>Copy to mine</button>) },
        ]} />
      </Card>
    </div>
  );
}
