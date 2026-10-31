'use client';
import { useState } from 'react';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table, rupees } from '@/components/ui';

export default function AdminPlans() {
  const state = useApi('/api/plans');
  const { msg, setMsg, busy, run } = useAction();
  const [price, setPrice] = useState({});
  const [f, setF] = useState(null);
  if (!state.data) return <Loading state={state} />;

  const save = async (p) => { const r = await run(() => api.patch('/api/admin/plans', { planId: p.plan_id, price: Number(price[p.plan_id]) }), 'Price updated for future purchases.'); if (r) state.reload(); };
  const toggle = async (p) => { const r = await run(() => api.patch('/api/admin/plans', { planId: p.plan_id, isActive: !p.is_active }), p.is_active ? 'Plan withdrawn from sale.' : 'Plan back on sale.'); if (r) state.reload(); };
  const add = async (e) => { e.preventDefault(); const r = await run(() => api.post('/api/admin/plans', f), 'Plan added.'); if (r) { setF(null); state.reload(); } };

  return (
    <div className="stack">
      <PageHead title="Membership plans" subtitle="Each tier has one plan per duration. Price changes do not affect invoices already issued.">
        <button className="primary" onClick={() => setF(f ? null : { planName: '', tierId: '1', durationDays: '', price: '', description: '' })}>{f ? 'Close' : 'Add plan'}</button>
      </PageHead>
      <Alert msg={msg} onClose={() => setMsg(null)} />
      {f && (
        <Card title="New plan">
          <form className="form" onSubmit={add}>
            <label className="field">Name<input value={f.planName} onChange={(e) => setF({ ...f, planName: e.target.value })} required /></label>
            <label className="field">Tier<select value={f.tierId} onChange={(e) => setF({ ...f, tierId: e.target.value })}><option value="1">SILVER</option><option value="2">GOLD</option><option value="3">DIAMOND</option></select></label>
            <label className="field">Days<input type="number" min="1" value={f.durationDays} onChange={(e) => setF({ ...f, durationDays: e.target.value })} required /></label>
            <label className="field">Price<input type="number" min="0" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} required /></label>
            <label className="field">Description<input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
            <button className="primary" disabled={busy}>Add</button>
          </form>
        </Card>
      )}
      <Card>
        <Table rows={state.data.plans} rowKey={(r) => r.plan_id} columns={[
          { key: 'plan_name', label: 'Plan' },
          { key: 'tier_name', label: 'Tier', render: (r) => <Badge value={r.tier_name} /> },
          { key: 'duration_days', label: 'Days', num: true },
          { key: 'price', label: 'Price', num: true, render: (r) => rupees(r.price) },
          { key: 'edit', label: 'New price', render: (r) => <div className="row"><input type="number" style={{ width: 100 }} value={price[r.plan_id] ?? ''} onChange={(e) => setPrice({ ...price, [r.plan_id]: e.target.value })} /><button className="small" disabled={busy || !price[r.plan_id]} onClick={() => save(r)}>Save</button></div> },
          { key: 'is_active', label: 'On sale', render: (r) => <button className="small" disabled={busy} onClick={() => toggle(r)}>{r.is_active ? 'Withdraw' : 'Put on sale'}</button> },
        ]} />
      </Card>
    </div>
  );
}
