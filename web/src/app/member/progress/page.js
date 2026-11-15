'use client';
import { useState } from 'react';
import { useApi, Card, Badge, PageHead, Loading, Table, Bars, HBars, fmtDate } from '@/components/ui';

export default function ProgressPage() {
  const [exerciseId, setExerciseId] = useState('');
  const state = useApi(`/api/member/progress${exerciseId ? `?exerciseId=${exerciseId}` : ''}`);
  const d = state.data;
  if (!d) return <Loading state={state} />;

  const weeks = [...new Set(d.volume.map((v) => v.week_start))];
  const weeklyVolume = weeks.map((w) => ({ label: fmtDate(w).slice(0, 6), value: d.volume.filter((v) => v.week_start === w).reduce((a, v) => a + Number(v.volume_kg), 0) }));
  return (
    <div className="stack">
      <PageHead title="Progress" subtitle="Calculated from every set you have logged.">
        <select value={exerciseId || d.chosen || ''} onChange={(e) => setExerciseId(e.target.value)}>
          {d.exercises.map((x) => <option key={x.exercise_id} value={x.exercise_id}>{x.exercise_name}</option>)}
        </select>
      </PageHead>
      <div className="grid g2">
        <Card title="Best weight per week (12 weeks)">
          <Bars items={d.progression.map((p) => ({ label: fmtDate(p.week_start).slice(0, 6), value: Number(p.best_weight) }))} format={(v) => `${v}`} />
          <div className="pill-list" style={{ marginTop: 8 }}>{d.progression.slice(-4).map((p, i) => <Badge key={i} value={p.trend} tone={p.trend === 'IMPROVED' ? 'ok' : p.trend === 'REGRESSED' ? 'bad' : ''} />)}</div>
        </Card>
        <Card title="Weekly training volume (kg x reps)">
          <Bars items={weeklyVolume} format={(v) => `${Math.round(v / 1000)}k`} />
        </Card>
      </div>
      <Card title="Last workout compared with the previous time">
        <Table rows={d.comparison} empty="Finish a workout to see a comparison." columns={[
          { key: 'exercise_name', label: 'Exercise' },
          { key: 'best_weight', label: 'Best kg', num: true, render: (r) => r.best_weight ?? '-' },
          { key: 'prev_best_weight', label: 'Previous', num: true, render: (r) => r.prev_best_weight ?? '-' },
          { key: 'volume_kg', label: 'Volume', num: true },
          { key: 'volume_change', label: 'Change', num: true, render: (r) => (r.volume_change === null ? 'first time' : <span style={{ color: r.volume_change >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{r.volume_change >= 0 ? '+' : ''}{r.volume_change}</span>) },
          { key: 'prev_date', label: 'Previous date', render: (r) => (r.prev_date ? fmtDate(r.prev_date) : '-') },
        ]} />
      </Card>
      <Card title="Muscle groups (last 28 days)">
        <HBars items={d.muscles.map((m) => ({ label: m.muscle_group, value: Number(m.sets_28d) }))} format={(v) => `${v} sets`} />
        <p className="small muted">Groups at zero have not been trained for four weeks.</p>
      </Card>
    </div>
  );
}
