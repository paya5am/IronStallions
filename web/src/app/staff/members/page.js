'use client';
import { useState } from 'react';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table, fmtDate, rupees } from '@/components/ui';

const blank = { fullName: '', phone: '', email: '', dateOfBirth: '', gender: 'MALE', emergencyContact: '' };

export default function MembersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const state = useApi(`/api/staff/members?q=${encodeURIComponent(q)}&status=${status}`);
  const { msg, setMsg, busy, run } = useAction();
  const [f, setF] = useState(null);

  const checkIn = async (m) => {
    const r = await run(() => api.post('/api/staff/checkin', { mode: 'manual', memberId: m.member_id }));
    if (r) state.reload();
  };
  const register = async (e) => {
    e.preventDefault();
    const r = await run(() => api.post('/api/staff/members', f));
    if (r) { setF(null); setQ(f.phone); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="stack">
      <PageHead title="Members" subtitle="Search, check in at the desk, or register a new member.">
        <button className="primary" onClick={() => setF(f ? null : { ...blank })}>{f ? 'Close form' : 'Register member'}</button>
      </PageHead>
      <Alert msg={msg} onClose={() => setMsg(null)} />
      {f && (
        <Card title="New member (joins this branch)">
          <form className="form" onSubmit={register}>
            <label className="field">Full name<input value={f.fullName} onChange={set('fullName')} required /></label>
            <label className="field">Phone (login)<input value={f.phone} onChange={set('phone')} required pattern="\d{10}" /></label>
            <label className="field">Email<input type="email" value={f.email} onChange={set('email')} required /></label>
            <label className="field">Date of birth<input type="date" value={f.dateOfBirth} onChange={set('dateOfBirth')} required /></label>
            <label className="field">Gender<select value={f.gender} onChange={set('gender')}>{['MALE', 'FEMALE', 'OTHER'].map((g) => <option key={g}>{g}</option>)}</select></label>
            <label className="field">Emergency contact<input value={f.emergencyContact} onChange={set('emergencyContact')} required /></label>
            <button className="primary" disabled={busy}>Register</button>
          </form>
        </Card>
      )}
      <Card>
        <div className="row" style={{ marginBottom: 12 }}>
          <input placeholder="Name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All members</option><option value="ACTIVE">With active plan</option><option value="NONE">No active plan</option><option value="INSIDE">Inside now</option>
          </select>
        </div>
        {!state.data ? <Loading state={state} /> : (
          <Table rows={state.data.members} rowKey={(r) => r.member_id} columns={[
            { key: 'full_name', label: 'Member', render: (r) => <>{r.full_name}<div className="small muted">{r.phone}</div></> },
            { key: 'home_branch', label: 'Home' },
            { key: 'plan_name', label: 'Plan', render: (r) => (r.plan_name ? <>{r.plan_name} <Badge value={r.tier_name} /><div className="small muted">until {fmtDate(r.end_date)}</div></> : <Badge value="NO PLAN" tone="bad" />) },
            { key: 'balance', label: 'Owes', num: true, render: (r) => (r.balance > 0 ? rupees(r.balance) : '-') },
            { key: 'is_inside', label: '', render: (r) => (r.is_inside ? <Badge value="INSIDE" tone="ok" /> : <button className="small" disabled={busy} onClick={() => checkIn(r)}>Check in</button>) },
          ]} />
        )}
      </Card>
    </div>
  );
}
