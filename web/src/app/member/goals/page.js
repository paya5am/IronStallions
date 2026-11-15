'use client';
import { useState } from 'react';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table, fmtDate } from '@/components/ui';

const LABEL = { EXERCISE_WEIGHT: 'Lift a weight', EXERCISE_REPS: 'Reach reps', MONTHLY_VISITS: 'Visits this month', WORKOUT_STREAK: 'Day streak' };

export default function GoalsPage() {
  const state = useApi('/api/member/goals');
  const exercises = useApi('/api/exercises');
  const { msg, setMsg, busy, run } = useAction();
  const [f, setF] = useState({ goalType: 'EXERCISE_WEIGHT', exerciseId: '', targetValue: '', targetDate: '' });
  if (!state.data || !exercises.data) return <Loading state={state.data ? exercises : state} />;

  const add = async (e) => { e.preventDefault(); const r = await run(() => api.post('/api/member/goals', f)); if (r) state.reload(); };
  const abandon = async (g) => { const r = await run(() => api.patch('/api/member/goals', { goalId: g.goal_id }), 'Goal abandoned.'); if (r) state.reload(); };
  const exOptions = exercises.data.exercises.filter((x) => (f.goalType === 'EXERCISE_WEIGHT' ? x.measure_type === 'WEIGHT_REPS' : x.measure_type !== 'TIME_DISTANCE'));

  return (
    <div className="stack">
      <PageHead title="Goals" subtitle="Progress is measured from your logged sets and visits; goals are marked achieved automatically." />
      <Alert msg={msg} onClose={() => setMsg(null)} />
      <Card title="New goal">
        <form className="form" onSubmit={add}>
          <label className="field">Type<select value={f.goalType} onChange={(e) => setF({ ...f, goalType: e.target.value, exerciseId: '' })}>{Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {f.goalType.startsWith('EXERCISE') && <label className="field">Exercise<select value={f.exerciseId} onChange={(e) => setF({ ...f, exerciseId: e.target.value })} required><option value="">Choose...</option>{exOptions.map((x) => <option key={x.exercise_id} value={x.exercise_id}>{x.exercise_name}</option>)}</select></label>}
          <label className="field">Target{f.goalType === 'EXERCISE_WEIGHT' ? ' (kg)' : ''}<input type="number" min="1" step="0.5" value={f.targetValue} onChange={(e) => setF({ ...f, targetValue: e.target.value })} required /></label>
          <label className="field">By<input type="date" value={f.targetDate} onChange={(e) => setF({ ...f, targetDate: e.target.value })} required /></label>
          <button className="primary" disabled={busy}>Add goal</button>
        </form>
      </Card>
      <Card title="Your goals">
        <Table rows={state.data.goals} rowKey={(r) => r.goal_id} columns={[
          { key: 'goal_type', label: 'Goal', render: (g) => <>{LABEL[g.goal_type]}{g.exercise_name ? `: ${g.exercise_name}` : ''}</> },
          { key: 'target_value', label: 'Target', num: true },
          { key: 'current_value', label: 'Now', num: true, render: (g) => g.current_value ?? 0 },
          { key: 'progress', label: 'Progress', render: (g) => {
            const pct = Math.min(100, Math.round(((Number(g.current_value) || 0) / Number(g.target_value)) * 100));
            return <div className="hbars" style={{ minWidth: 140 }}><div className="track"><div style={{ width: `${pct}%` }} /></div><span className="small">{pct}%</span></div>;
          } },
          { key: 'target_date', label: 'By', render: (g) => fmtDate(g.target_date) },
          { key: 'status', label: 'Status', render: (g) => <Badge value={g.status} /> },
          { key: 'act', label: '', render: (g) => (g.status === 'ACTIVE' ? <button className="small" disabled={busy} onClick={() => abandon(g)}>Abandon</button> : null) },
        ]} />
      </Card>
    </div>
  );
}
