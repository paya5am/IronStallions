'use client';
import { useState } from 'react';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table } from '@/components/ui';

export default function PeoplePage() {
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const state = useApi(`/api/admin/people?role=${role}&q=${encodeURIComponent(q)}`);
  const branches = useApi('/api/branches');
  const { msg, setMsg, busy, run } = useAction();
  const [f, setF] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const toggle = async (p) => { const r = await run(() => api.patch('/api/admin/people', { userId: p.user_id, isActive: !p.is_active }), p.is_active ? 'Account disabled and logged out.' : 'Account enabled.'); if (r) state.reload(); };
  const add = async (e) => { e.preventDefault(); const r = await run(() => api.post('/api/admin/people', f), 'Account created.'); if (r) { setF(null); state.reload(); } };

  return (
    <div className="stack">
      <PageHead title="People" subtitle="Accounts across all branches. Members register at the front desk.">
        <button className="primary" onClick={() => setF(f ? null : { role: 'STAFF', fullName: '', phone: '', email: '', branchId: '1', designation: 'Front Desk Executive', shiftStart: '06:00', shiftEnd: '14:00', specialization: '', yearsExperience: '1', hourlyRate: '800' })}>{f ? 'Close' : 'Add staff or trainer'}</button>
      </PageHead>
      <Alert msg={msg} onClose={() => setMsg(null)} />
      {f && branches.data && (
        <Card title="New account">
          <form className="form" onSubmit={add}>
            <label className="field">Role<select value={f.role} onChange={set('role')}><option>STAFF</option><option>TRAINER</option></select></label>
            <label className="field">Full name<input value={f.fullName} onChange={set('fullName')} required /></label>
            <label className="field">Phone<input value={f.phone} onChange={set('phone')} required /></label>
            <label className="field">Email<input type="email" value={f.email} onChange={set('email')} required /></label>
            <label className="field">Branch<select value={f.branchId} onChange={set('branchId')}>{branches.data.branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></label>
            {f.role === 'STAFF' ? <>
              <label className="field">Designation<input value={f.designation} onChange={set('designation')} required /></label>
              <label className="field">Shift start<input type="time" value={f.shiftStart} onChange={set('shiftStart')} /></label>
              <label className="field">Shift end<input type="time" value={f.shiftEnd} onChange={set('shiftEnd')} /></label>
            </> : <>
              <label className="field">Specialization<input value={f.specialization} onChange={set('specialization')} required /></label>
              <label className="field">Years of experience<input type="number" min="0" value={f.yearsExperience} onChange={set('yearsExperience')} /></label>
              <label className="field">Hourly rate<input type="number" min="1" value={f.hourlyRate} onChange={set('hourlyRate')} /></label>
            </>}
            <button className="primary" disabled={busy}>Create</button>
          </form>
        </Card>
      )}
      <Card>
        <div className="row" style={{ marginBottom: 12 }}>
          <input placeholder="Name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option>{['MEMBER', 'TRAINER', 'STAFF', 'ADMIN'].map((r) => <option key={r}>{r}</option>)}</select>
        </div>
        {!state.data ? <Loading state={state} /> : (
          <Table rows={state.data.people} rowKey={(r) => r.user_id} columns={[
            { key: 'full_name', label: 'Name', render: (r) => <>{r.full_name}<div className="small muted">{r.email}</div></> },
            { key: 'phone', label: 'Phone' },
            { key: 'role', label: 'Role', render: (r) => <Badge value={r.role} tone="info" /> },
            { key: 'branch_name', label: 'Branch' },
            { key: 'detail', label: 'Detail' },
            { key: 'is_active', label: '', render: (r) => <button className="small" disabled={busy} onClick={() => toggle(r)}>{r.is_active ? 'Disable' : 'Enable'}</button> },
          ]} />
        )}
      </Card>
    </div>
  );
}
