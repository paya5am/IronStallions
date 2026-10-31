'use client';
import { useState } from 'react';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table, hhmm } from '@/components/ui';

const blank = { branchName: '', tierId: '1', address: '', city: 'Bengaluru', phone: '', openingTime: '05:30', closingTime: '22:30' };

export default function BranchesPage() {
  const state = useApi('/api/branches');
  const { msg, setMsg, busy, run } = useAction();
  const [f, setF] = useState(null);
  const [edit, setEdit] = useState(null);
  if (!state.data) return <Loading state={state} />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const add = async (e) => { e.preventDefault(); const r = await run(() => api.post('/api/admin/branches', f), 'Branch added.'); if (r) { setF(null); state.reload(); } };
  const save = async (e) => { e.preventDefault(); const r = await run(() => api.patch('/api/admin/branches', edit), 'Branch updated.'); if (r) { setEdit(null); state.reload(); } };
  const toggle = async (b) => { const r = await run(() => api.patch('/api/admin/branches', { branchId: b.branch_id, isActive: !b.is_active }), 'Branch updated.'); if (r) state.reload(); };

  return (
    <div className="stack">
      <PageHead title="Branches"><button className="primary" onClick={() => setF(f ? null : { ...blank })}>{f ? 'Close' : 'Add branch'}</button></PageHead>
      <Alert msg={msg} onClose={() => setMsg(null)} />
      {f && (
        <Card title="New branch">
          <form className="form" onSubmit={add}>
            <label className="field">Name<input value={f.branchName} onChange={set('branchName')} required /></label>
            <label className="field">Tier<select value={f.tierId} onChange={set('tierId')}><option value="1">SILVER</option><option value="2">GOLD</option><option value="3">DIAMOND</option></select></label>
            <label className="field">Address<input value={f.address} onChange={set('address')} required /></label>
            <label className="field">City<input value={f.city} onChange={set('city')} required /></label>
            <label className="field">Phone<input value={f.phone} onChange={set('phone')} required /></label>
            <label className="field">Opens<input type="time" value={f.openingTime} onChange={set('openingTime')} /></label>
            <label className="field">Closes<input type="time" value={f.closingTime} onChange={set('closingTime')} /></label>
            <button className="primary" disabled={busy}>Add</button>
          </form>
        </Card>
      )}
      {edit && (
        <Card title={`Edit ${edit.name}`}>
          <form className="form" onSubmit={save}>
            <label className="field">Tier<select value={edit.tierId} onChange={(e) => setEdit({ ...edit, tierId: e.target.value })}><option value="1">SILVER</option><option value="2">GOLD</option><option value="3">DIAMOND</option></select></label>
            <label className="field">Opens<input type="time" value={edit.openingTime} onChange={(e) => setEdit({ ...edit, openingTime: e.target.value })} /></label>
            <label className="field">Closes<input type="time" value={edit.closingTime} onChange={(e) => setEdit({ ...edit, closingTime: e.target.value })} /></label>
            <label className="field">Phone<input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
            <button className="primary" disabled={busy}>Save</button><button type="button" onClick={() => setEdit(null)}>Cancel</button>
          </form>
        </Card>
      )}
      <Card>
        <Table rows={state.data.branches} rowKey={(r) => r.branch_id} columns={[
          { key: 'branch_name', label: 'Branch', render: (r) => <>{r.branch_name}<div className="small muted">{r.address}</div></> },
          { key: 'tier_name', label: 'Tier', render: (r) => <Badge value={r.tier_name} /> },
          { key: 'hours', label: 'Hours', render: (r) => `${hhmm(r.opening_time)}-${hhmm(r.closing_time)}` },
          { key: 'phone', label: 'Phone' },
          { key: 'is_active', label: 'Status', render: (r) => <Badge value={r.is_active ? 'OPERATING' : 'CLOSED'} tone={r.is_active ? 'ok' : 'bad'} /> },
          { key: 'act', label: '', render: (r) => <div className="row">
            <button className="small" onClick={() => setEdit({ branchId: r.branch_id, name: r.branch_name, tierId: String(r.tier_id), openingTime: hhmm(r.opening_time), closingTime: hhmm(r.closing_time), phone: r.phone })}>Edit</button>
            <button className="small" disabled={busy} onClick={() => toggle(r)}>{r.is_active ? 'Shut down' : 'Reopen'}</button></div> },
        ]} />
      </Card>
    </div>
  );
}
