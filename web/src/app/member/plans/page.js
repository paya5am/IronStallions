'use client';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table, fmtDate, rupees } from '@/components/ui';

export default function PlansPage() {
  const plans = useApi('/api/plans');
  const mine = useApi('/api/member/plans');
  const overview = useApi('/api/member/overview');
  const { msg, setMsg, busy, run } = useAction();
  if (!plans.data || !mine.data || !overview.data) return <Loading state={plans.error ? plans : mine.error ? mine : overview} />;

  const o = overview.data.overview || {};
  const active = o.plan_name ? o : null;
  const tiers = [...new Set(plans.data.plans.map((p) => p.tier_name))];

  const act = async (action, plan) => {
    const verb = { buy: active ? 'Queue renewal' : 'Buy', change: 'Change to', cancel: 'Cancel' }[action];
    if (!window.confirm(plan ? `${verb} ${plan.plan_name} for ${rupees(plan.price)}?` : 'Cancel your plan? Unused days are refunded pro rata.')) return;
    const r = await run(() => api.post('/api/member/plans', { action, planId: plan?.plan_id }));
    if (r) { mine.reload(); overview.reload(); }
  };

  const buttonFor = (p) => {
    if (!p.is_active) return <span className="muted small">Not on sale</span>;
    if (!active) return <button className="primary small" disabled={busy} onClick={() => act('buy', p)}>Buy</button>;
    if (p.tier_rank === active.tier_rank) {
      return o.queued_renewal
        ? <span className="muted small">Renewal queued</span>
        : <button className="small" disabled={busy} onClick={() => act('buy', p)}>Renew after current</button>;
    }
    return <button className="small" disabled={busy} onClick={() => act('change', p)}>{p.tier_rank > active.tier_rank ? 'Upgrade now' : 'Downgrade now'}</button>;
  };

  return (
    <div className="stack">
      <PageHead title="Plans" subtitle="A plan gives entry to every branch of its tier and the tiers below it.">
        {(active || o.queued_renewal) && <button className="danger" disabled={busy} onClick={() => act('cancel')}>Cancel plan</button>}
      </PageHead>
      <Alert msg={msg} onClose={() => setMsg(null)} />

      <Card title="Your plan">
        {active
          ? <p><b>{active.plan_name}</b> <Badge value={active.tier_name} /> from {fmtDate(active.start_date)} to {fmtDate(active.end_date)}.
              {o.queued_renewal && <> Renewal queued: <b>{o.queued_renewal}</b>.</>}</p>
          : <p className="muted">No active plan.</p>}
        <p className="small muted">Changing tier switches today: the old plan is closed, unused days are refunded pro rata, and the new plan starts today. Same-tier changes are only possible as a renewal that starts when the current plan ends.</p>
      </Card>

      <div className="grid g3">
        {tiers.map((t) => (
          <Card key={t} title={<span>{t} <Badge value={t} /></span>}>
            <p className="small muted">Branches: {plans.data.plans.find((p) => p.tier_name === t)?.branches}</p>
            <Table rows={plans.data.plans.filter((p) => p.tier_name === t)} columns={[
              { key: 'plan_name', label: 'Plan', render: (p) => <>{p.plan_name}<div className="small muted">{p.duration_days} days</div></> },
              { key: 'price', label: 'Price', num: true, render: (p) => rupees(p.price) },
              { key: 'a', label: '', render: buttonFor },
            ]} />
          </Card>
        ))}
      </div>

      <Card title="History">
        <Table rows={mine.data.history} columns={[
          { key: 'plan_name', label: 'Plan' },
          { key: 'start_date', label: 'Start', render: (r) => fmtDate(r.start_date) },
          { key: 'end_date', label: 'End', render: (r) => fmtDate(r.end_date) },
          { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
          { key: 'closed_on', label: 'Closed on', render: (r) => (r.closed_on ? fmtDate(r.closed_on) : '-') },
          { key: 'invoice_status', label: 'Invoice', render: (r) => <Badge value={r.invoice_status} /> },
        ]} />
      </Card>
    </div>
  );
}
