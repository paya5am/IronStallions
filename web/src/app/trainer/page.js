'use client';
import Link from 'next/link';
import { useApi, useAction, api, Card, Stat, Badge, Alert, PageHead, Loading, Table, fmtDate, hhmm, rupees } from '@/components/ui';

export default function TrainerHome() {
  const state = useApi('/api/trainer/overview');
  const { msg, setMsg, busy, run } = useAction();
  const d = state.data;
  if (!d) return <Loading state={state} />;

  const n = new Date();
  const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  const upcoming = d.sessions.filter((s) => s.status === 'SCHEDULED').sort((a, b) => (a.session_date + a.start_time).localeCompare(b.session_date + b.start_time));
  const past = d.sessions.filter((s) => s.status !== 'SCHEDULED');
  const act = async (s, action) => {
    if (action === 'cancel' && !window.confirm('Cancel this session? The member will not be charged.')) return;
    const r = await run(() => api.post('/api/trainer/sessions', { sessionId: s.training_session_id, action }), 'Session updated.');
    if (r) state.reload();
  };

  return (
    <div className="stack">
      <PageHead title="Sessions" subtitle={`${d.me.branch_name} (${d.me.tier_name}) - ${d.me.specialization}`} />
      <Alert msg={msg} onClose={() => setMsg(null)} />
      <div className="grid g4">
        <Stat label="Upcoming" value={d.stats.upcoming || 0} />
        <Stat label="Completed this month" value={d.stats.completed_this_month || 0} />
        <Stat label="No-shows" value={d.stats.no_shows || 0} />
        <Stat label="Paid sessions (total)" value={rupees(d.stats.earned_total)} hint={`Rate ${rupees(d.me.hourly_rate)}/h`} />
      </div>

      <Card title="Upcoming">
        <Table rows={upcoming} rowKey={(r) => r.training_session_id} empty="No sessions booked." columns={[
          { key: 'session_date', label: 'When', render: (r) => `${fmtDate(r.session_date)} ${hhmm(r.start_time)}` },
          { key: 'member_name', label: 'Member' },
          { key: 'duration_minutes', label: 'Min', num: true },
          { key: 'invoice_status', label: 'Paid?', render: (r) => <Badge value={r.invoice_status} /> },
          { key: 'act', label: '', render: (r) => (
            <div className="row">
              {r.session_date <= today && <>
                <button className="small primary" disabled={busy} onClick={() => act(r, 'complete')}>Completed</button>
                <button className="small" disabled={busy} onClick={() => act(r, 'no_show')}>No-show</button>
              </>}
              <button className="small danger" disabled={busy} onClick={() => act(r, 'cancel')}>Cancel</button>
            </div>) },
        ]} />
      </Card>

      {d.clientPlateaus.length > 0 && (
        <Card title="Clients on a plateau">
          <Table rows={d.clientPlateaus} columns={[
            { key: 'member_name', label: 'Member' }, { key: 'exercise_name', label: 'Exercise' },
            { key: 'best_before', label: 'Best before', num: true, render: (r) => `${r.best_before} kg` },
            { key: 'best_recent', label: 'Best recent', num: true, render: (r) => `${r.best_recent} kg` },
          ]} />
        </Card>
      )}

      <Card title="Last 60 days">
        <Table rows={past} rowKey={(r) => r.training_session_id} columns={[
          { key: 'session_date', label: 'When', render: (r) => `${fmtDate(r.session_date)} ${hhmm(r.start_time)}` },
          { key: 'member_name', label: 'Member' },
          { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
          { key: 'log', label: 'Session log', render: (r) => (r.status === 'COMPLETED'
            ? <Link href={`/trainer/log/${r.training_session_id}`}>{r.has_log ? 'View / edit' : 'Write log'}</Link> : '-') },
        ]} />
      </Card>
    </div>
  );
}
