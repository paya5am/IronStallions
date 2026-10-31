'use client';
import { useEffect } from 'react';
import { useApi, useAction, api, Card, Stat, Badge, Alert, PageHead, Loading, Table, Bars, fmtDate, fmtDateTime, hhmm } from '@/components/ui';

export default function StaffHome() {
  const state = useApi('/api/staff/overview');
  const { msg, setMsg, busy, run } = useAction();
  const { reload } = state;
  useEffect(() => { const t = setInterval(reload, 15000); return () => clearInterval(t); }, [reload]);
  const d = state.data;
  if (!d) return <Loading state={state} />;
  const eq = Object.fromEntries(d.equipment.map((e) => [e.status, e.n]));

  const checkout = async (m) => {
    const r = await run(() => api.post('/api/staff/checkin', { mode: 'checkout', memberId: m.member_id }));
    if (r) state.reload();
  };

  return (
    <div className="stack">
      <PageHead title={`${d.me.branch_name} live floor`} subtitle={`${d.me.tier_name} branch, open ${hhmm(d.me.opening_time)}-${hhmm(d.me.closing_time)}. Refreshes every 15 seconds.`}>
        <button onClick={state.reload}>Refresh</button>
      </PageHead>
      <Alert msg={msg} onClose={() => setMsg(null)} />
      <div className="grid g4">
        <Stat label="Inside now" value={d.inside.length} />
        <Stat label="Check-ins today" value={d.today.check_ins || 0} hint={`${d.today.by_qr || 0} by QR, ${d.today.by_staff || 0} at desk`} />
        <Stat label="Machines free" value={eq.AVAILABLE || 0} hint={`${eq.OCCUPIED || 0} in use, ${eq.MAINTENANCE || 0} under maintenance`} />
        <Stat label="Auto check-outs today" value={d.today.auto_closed || 0} hint="Visits closed after 3 hours" />
      </div>
      <Card title="Members inside">
        <Table rows={d.inside} rowKey={(r) => r.attendance_id} empty="Nobody is inside right now." columns={[
          { key: 'full_name', label: 'Member', render: (r) => <>{r.full_name}<div className="small muted">{r.phone}</div></> },
          { key: 'plan_name', label: 'Plan', render: (r) => <>{r.plan_name || '-'} {r.tier_name && <Badge value={r.tier_name} />}</> },
          { key: 'check_in_time', label: 'Since', render: (r) => `${fmtDateTime(r.check_in_time)} (${r.minutes_inside} min)` },
          { key: 'method', label: 'Entry' },
          { key: 'using_machine', label: 'On machine' },
          { key: 'act', label: '', render: (r) => <button className="small" disabled={busy} onClick={() => checkout(r)}>Check out</button> },
        ]} />
      </Card>
      <div className="grid g2">
        <Card title="Busiest hours (last 8 weeks)">
          <Bars items={d.hours.map((h) => ({ label: `${h.hour_of_day}h`, value: Number(h.check_ins) }))} />
        </Card>
        <Card title="Upcoming close days">
          <Table rows={d.closures} empty="No close days scheduled." columns={[
            { key: 'closure_date', label: 'Date', render: (r) => fmtDate(r.closure_date) }, { key: 'reason', label: 'Reason' }]} />
        </Card>
      </div>
    </div>
  );
}
