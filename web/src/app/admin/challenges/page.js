'use client';
import { useState } from 'react';
import { useApi, useAction, api, Card, Alert, PageHead, Loading, Table, fmtDate } from '@/components/ui';

export default function AdminChallenges() {
  const state = useApi('/api/admin/challenges');
  const exercises = useApi('/api/exercises');
  const branches = useApi('/api/branches');
  const { msg, setMsg, busy, run } = useAction();
  const [f, setF] = useState({ title: '', description: '', metric: 'TOTAL_VISITS', exerciseId: '', branchId: '', startDate: '', endDate: '' });
  if (!state.data || !exercises.data || !branches.data) return <Loading state={state} />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const add = async (e) => { e.preventDefault(); const r = await run(() => api.post('/api/admin/challenges', f)); if (r) state.reload(); };
  return (
    <div className="stack">
      <PageHead title="Challenges" subtitle="Scores are computed from attendance and workout data; final ranks are stored when a challenge ends." />
      <Alert msg={msg} onClose={() => setMsg(null)} />
      <Card title="New challenge">
        <form className="form" onSubmit={add}>
          <label className="field">Title<input value={f.title} onChange={set('title')} required /></label>
          <label className="field">Description<input value={f.description} onChange={set('description')} /></label>
          <label className="field">Metric<select value={f.metric} onChange={set('metric')}>{['TOTAL_VISITS', 'TOTAL_VOLUME', 'LONGEST_STREAK', 'EXERCISE_MAX_WEIGHT'].map((m) => <option key={m}>{m}</option>)}</select></label>
          {f.metric === 'EXERCISE_MAX_WEIGHT' && <label className="field">Exercise<select value={f.exerciseId} onChange={set('exerciseId')} required><option value="">Choose...</option>{exercises.data.exercises.filter((x) => x.measure_type === 'WEIGHT_REPS').map((x) => <option key={x.exercise_id} value={x.exercise_id}>{x.exercise_name}</option>)}</select></label>}
          <label className="field">Branch<select value={f.branchId} onChange={set('branchId')}><option value="">All branches</option>{branches.data.branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></label>
          <label className="field">Starts<input type="date" value={f.startDate} onChange={set('startDate')} required /></label>
          <label className="field">Ends<input type="date" value={f.endDate} onChange={set('endDate')} required /></label>
          <button className="primary" disabled={busy}>Create</button>
        </form>
      </Card>
      <Card>
        <Table rows={state.data.challenges} rowKey={(r) => r.challenge_id} columns={[
          { key: 'title', label: 'Challenge', render: (c) => <>{c.title}<div className="small muted">{c.metric}{c.exercise_name ? `: ${c.exercise_name}` : ''}</div></> },
          { key: 'branch_name', label: 'Where' },
          { key: 'dates', label: 'Dates', render: (c) => `${fmtDate(c.start_date)} - ${fmtDate(c.end_date)}` },
          { key: 'participants', label: 'Members', num: true },
          { key: 'leader', label: 'Leader' },
          { key: 'created_by_name', label: 'Created by' },
        ]} />
      </Card>
    </div>
  );
}
