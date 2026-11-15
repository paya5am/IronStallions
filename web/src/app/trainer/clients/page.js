'use client';
import { useApi, Card, Badge, PageHead, Loading, Table, HBars, fmtDate } from '@/components/ui';

export default function ClientsPage() {
  const state = useApi('/api/trainer/clients');
  if (!state.data) return <Loading state={state} />;
  return (
    <div className="stack">
      <PageHead title="Clients" subtitle="Everyone you have trained, with progress signals from their own logging." />
      {state.data.clients.length === 0 && <div className="empty">No clients yet.</div>}
      {state.data.clients.map((c) => (
        <Card key={c.member_id} title={c.full_name} actions={<>{c.tier_name && <Badge value={c.tier_name} />} {c.plateaus > 0 && <Badge value="PLATEAU" tone="bad" />}</>}>
          <div className="grid g3">
            <div>
              <p className="small muted">Plan: {c.plan_name || 'none'}<br />Sessions with you: {c.sessions_with_me} (last {fmtDate(c.last_session)})<br />
                Streak {c.current_streak || 0} days, {c.visit_days_last_30 || 0} visits in 30 days<br />Volume last 4 weeks: {Number(c.volume_4w || 0).toLocaleString('en-IN')} kg</p>
              {c.plateau_list.map((p, i) => <div key={i} className="small" style={{ color: 'var(--bad)' }}>{p.exercise_name}: stuck at {p.best_recent} kg</div>)}
            </div>
            <div>
              <h3>Goals</h3>
              <Table rows={c.goals} empty="No active goals." columns={[
                { key: 'g', label: 'Goal', render: (g) => g.exercise_name || g.goal_type.replace('_', ' ').toLowerCase() },
                { key: 'v', label: 'Progress', num: true, render: (g) => `${g.current_value ?? 0} / ${g.target_value}` }]} />
            </div>
            <div>
              <h3>Muscle groups (28 days)</h3>
              <HBars items={c.muscles.filter((m) => m.muscle_group !== 'FULL_BODY').map((m) => ({ label: m.muscle_group, value: Number(m.sets_28d) }))} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
