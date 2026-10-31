'use client';
// Log sets during a visit; personal records are detected by the database.
import { useMemo, useState } from 'react';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table, fmtDate, fmtDateTime, recordLabel } from '@/components/ui';

export default function WorkoutsPage() {
  const visit = useApi('/api/member/visit');
  const exercises = useApi('/api/exercises');
  const history = useApi('/api/member/sets');
  const records = useApi('/api/member/records');
  const { msg, setMsg, busy, run } = useAction();
  const [form, setForm] = useState({ exerciseId: '', reps: '', weight: '', duration: '', distance: '' });

  const list = exercises.data?.exercises || [];
  const ex = list.find((e) => String(e.exercise_id) === String(form.exerciseId));
  const current = visit.data?.usages.find((u) => !u.end_time);
  const options = useMemo(() => {
    // exercises for the machine in use first, then body-weight and the rest
    if (!current) return list;
    return [...list].sort((a, b) => (b.category_id === current.category_id) - (a.category_id === current.category_id));
  }, [list, current]);

  if (!visit.data || !exercises.data) return <Loading state={visit.data ? exercises : visit} />;
  const v = visit.data.visit;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const log = async (e) => {
    e.preventDefault();
    const usageId = current && ex?.category_id === current.category_id ? current.usage_id : null;
    const body = { exerciseId: Number(form.exerciseId), usageId };
    if (ex.measure_type === 'TIME_DISTANCE') { body.duration = Number(form.duration) * 60; if (form.distance) body.distance = Number(form.distance); }
    else { body.reps = Number(form.reps); if (ex.measure_type === 'WEIGHT_REPS') body.weight = Number(form.weight); }
    const r = await run(() => api.post('/api/member/sets', body));
    if (r) {
      setMsg({ kind: 'ok', text: r.newRecords > 0 ? `New personal record! (${r.newRecords})` : 'Set logged.' });
      visit.reload(); records.reload(); history.reload();
    }
  };

  return (
    <div className="stack">
      <PageHead title="Workouts" subtitle="Every set is stored; new bests are detected automatically by the database." />
      <Alert msg={msg} onClose={() => setMsg(null)} />

      {v ? (
        <Card title={`Log a set at ${v.branch_name}`}>
          {current && <p className="small muted">Using <b>{current.name}</b>: sets for {current.category_name} exercises are linked to it.</p>}
          <form className="form" onSubmit={log}>
            <label className="field">Exercise
              <select value={form.exerciseId} onChange={set('exerciseId')} required>
                <option value="">Choose...</option>
                {options.map((e) => <option key={e.exercise_id} value={e.exercise_id}>{e.exercise_name}{e.category_name ? ` (${e.category_name})` : ' (body weight)'}</option>)}
              </select>
            </label>
            {ex && ex.measure_type !== 'TIME_DISTANCE' && <label className="field">Reps<input type="number" min="1" value={form.reps} onChange={set('reps')} required /></label>}
            {ex && ex.measure_type === 'WEIGHT_REPS' && <label className="field">Weight (kg)<input type="number" min="0.5" step="0.5" value={form.weight} onChange={set('weight')} required /></label>}
            {ex && ex.measure_type === 'TIME_DISTANCE' && <>
              <label className="field">Minutes<input type="number" min="0.5" step="0.5" value={form.duration} onChange={set('duration')} required /></label>
              <label className="field">Distance (m, optional)<input type="number" min="1" value={form.distance} onChange={set('distance')} /></label>
            </>}
            <button className="primary" disabled={busy || !ex}>Log set</button>
          </form>
          <h3 style={{ marginTop: 16 }}>This visit</h3>
          <Table rows={visit.data.sets} empty="No sets yet." columns={[
            { key: 'performed_at', label: 'Time', render: (r) => fmtDateTime(r.performed_at) },
            { key: 'exercise_name', label: 'Exercise' },
            { key: 'set_number', label: 'Set', num: true },
            { key: 'detail', label: 'Result', render: (r) => (r.duration_seconds ? `${Math.round(r.duration_seconds / 60)} min${r.distance_m ? `, ${r.distance_m} m` : ''}` : `${r.reps} reps${r.weight_kg ? ` x ${r.weight_kg} kg` : ''}`) },
            { key: 'records', label: '', render: (r) => (r.records > 0 ? <span className="pr">PR</span> : null) },
          ]} />
        </Card>
      ) : <div className="alert info">Check in at a branch to log sets.</div>}

      <div className="grid g2">
        <Card title="Last 30 days">
          {!history.data ? <Loading state={history} /> : (
            <Table rows={history.data.sessions} columns={[
              { key: 'day', label: 'Day', render: (r) => fmtDate(r.day) },
              { key: 'branch_name', label: 'Branch' },
              { key: 'sets', label: 'Sets', num: true },
              { key: 'volume_kg', label: 'Volume (kg)', num: true },
            ]} />
          )}
        </Card>
        <Card title="Personal records">
          {!records.data ? <Loading state={records} /> : (
            <Table rows={records.data.records} columns={[
              { key: 'exercise_name', label: 'Exercise' },
              { key: 'muscle_group', label: 'Muscle', render: (r) => <Badge value={r.muscle_group} tone="" /> },
              { key: 'record_type', label: 'Best', render: (r) => recordLabel(r.record_type, r.record_value) },
              { key: 'achieved_at', label: 'Set on', render: (r) => fmtDate(r.achieved_at) },
            ]} />
          )}
        </Card>
      </div>
    </div>
  );
}
