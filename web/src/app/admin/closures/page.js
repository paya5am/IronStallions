'use client';
import { useState } from 'react';
import { useApi, useAction, api, Card, Alert, PageHead, Loading, Table, fmtDate } from '@/components/ui';

export default function ClosuresPage() {
  const state = useApi('/api/admin/closures');
  const branches = useApi('/api/branches');
  const { msg, setMsg, busy, run } = useAction();
  const [f, setF] = useState({ branchId: '', date: '', reason: '' });
  if (!state.data || !branches.data) return <Loading state={state.data ? branches : state} />;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const add = async (e) => { e.preventDefault(); const r = await run(() => api.post('/api/admin/closures', f), 'Close day added. Check-ins and bookings on that date are now refused.'); if (r) { setF({ branchId: '', date: '', reason: '' }); state.reload(); } };
  const remove = async (c) => { const r = await run(() => api.del(`/api/admin/closures?closureId=${c.closure_id}`), 'Close day removed.'); if (r) state.reload(); };

  return (
    <div className="stack">
      <PageHead title="Close days" subtitle="Whole-day closures for one branch or the whole chain." />
      <Alert msg={msg} onClose={() => setMsg(null)} />
      <Card title="Declare a close day">
        <form className="form" onSubmit={add}>
          <label className="field">Branch<select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}>
            <option value="">All branches</option>{branches.data.branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></label>
          <label className="field">Date<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></label>
          <label className="field">Reason<input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required /></label>
          <button className="primary" disabled={busy}>Add</button>
        </form>
        <p className="small muted" style={{ marginTop: 8 }}>The database refuses a close day if personal training is already booked at that branch on that date.</p>
      </Card>
      <Card>
        <Table rows={state.data.closures} rowKey={(r) => r.closure_id} columns={[
          { key: 'closure_date', label: 'Date', render: (r) => fmtDate(r.closure_date) },
          { key: 'branch_name', label: 'Branch' }, { key: 'reason', label: 'Reason' }, { key: 'created_by', label: 'By' },
          { key: 'act', label: '', render: (r) => (new Date(r.closure_date + 'T00:00:00') >= today ? <button className="small danger" disabled={busy} onClick={() => remove(r)}>Remove</button> : null) },
        ]} />
      </Card>
    </div>
  );
}
