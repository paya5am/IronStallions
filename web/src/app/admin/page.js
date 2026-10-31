'use client';
import { useState } from 'react';
import { useApi, Card, Stat, Badge, PageHead, Loading, Bars, HBars, Table, rupees } from '@/components/ui';

const month = (m) => new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short' });

export default function AdminHome() {
  const [branchId, setBranchId] = useState('');
  const state = useApi(`/api/admin/dashboard${branchId ? `?branchId=${branchId}` : ''}`);
  const d = state.data;
  if (!d) return <Loading state={state} />;
  const k = d.kpi;
  const eq = Object.fromEntries(d.equipment.map((e) => [e.status, e.n]));

  return (
    <div className="stack">
      <PageHead title="Chain overview" subtitle="All branches. Revenue is attributed to the member's home branch." />
      <div className="grid g4">
        <Stat label="Active plans" value={k.active_members} hint={`${k.members_total} members registered`} />
        <Stat label="Inside right now" value={k.inside_now} hint={`${k.visits_today} visits today`} />
        <Stat label="Overdue" value={rupees(k.overdue_amount)} hint={`${k.overdue_invoices} invoices`} />
        <Stat label="Plans ending in 14 days" value={k.expiring_14d} hint={`${k.pt_upcoming} PT sessions booked`} />
      </div>
      <div className="grid g2">
        <Card title="Net revenue by month">
          <Bars items={d.revenue.map((r) => ({ label: month(r.month), value: Number(r.net_revenue) }))} format={(v) => `${Math.round(v / 1000)}k`} />
          <p className="small muted">Plans {rupees(d.revenue.reduce((a, r) => a + Number(r.plan_revenue), 0))}, personal training {rupees(d.revenue.reduce((a, r) => a + Number(r.pt_revenue), 0))}, refunds {rupees(d.revenue.reduce((a, r) => a + Number(r.refunded), 0))} (6 months).</p>
        </Card>
        <Card title="Net revenue by branch (3 months)">
          <HBars items={d.revenueByBranch.map((r) => ({ label: r.branch_name, value: Number(r.net_revenue) }))} format={(v) => `${Math.round(v / 1000)}k`} />
        </Card>
      </div>
      <div className="grid g2">
        <Card title="Occupancy now">
          <HBars items={d.occupancy.map((o) => ({ label: `${o.branch_name}`, value: Number(o.inside_now) }))} />
        </Card>
        <Card title="Peak hours (check-ins, last 8 weeks)" actions={
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">All branches</option>
            {d.occupancy.map((o) => <option key={o.branch_id} value={o.branch_id}>{o.branch_name}</option>)}
          </select>}>
          <Bars items={d.peak.map((p) => ({ label: `${p.hour_of_day}h`, value: Number(p.check_ins) }))} />
        </Card>
      </div>
      <div className="grid g3">
        <Card title="Equipment">
          <p><Badge value="AVAILABLE" /> {eq.AVAILABLE || 0} &nbsp; <Badge value="OCCUPIED" /> {eq.OCCUPIED || 0}</p>
          <p><Badge value="MAINTENANCE" /> {eq.MAINTENANCE || 0} &nbsp; <Badge value="RETIRED" /> {eq.RETIRED || 0}</p>
        </Card>
        <Card title="Maintenance cost">
          <Bars height={110} items={d.maintenance.map((m) => ({ label: month(m.month), value: Number(m.total_cost) }))} format={(v) => `${(v / 1000).toFixed(1)}k`} />
        </Card>
        <Card title="Active plans by tier">
          <HBars items={d.tiers.map((t) => ({ label: t.tier_name, value: Number(t.active) }))} />
        </Card>
      </div>
      <Card title="Members on a plateau">
        <Table rows={d.plateaus} empty="No plateaus detected." columns={[
          { key: 'member_name', label: 'Member' }, { key: 'exercise_name', label: 'Exercise' },
          { key: 'best_before', label: 'Best before', num: true, render: (r) => `${r.best_before} kg` },
          { key: 'best_recent', label: 'Best recently', num: true, render: (r) => `${r.best_recent} kg` },
        ]} />
      </Card>
    </div>
  );
}
