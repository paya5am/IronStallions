'use client';
import { useState } from 'react';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table, hhmm } from '@/components/ui';

export default function AvailabilityPage() {
  const state = useApi('/api/trainer/overview');
  const { msg, setMsg, busy, run } = useAction();
  const [f, setF] = useState({ day: 'MON', start: '07:00', end: '09:00' });
  if (!state.data) return <Loading state={state} />;

  const add = async (e) => {
    e.preventDefault();
    const r = await run(() => api.post('/api/trainer/slots', f), 'Slot added.');
    if (r) state.reload();
  };
  const toggle = async (s) => {
    const r = await run(() => api.patch('/api/trainer/slots', { availabilityId: s.availability_id, isActive: !s.is_active }), s.is_active ? 'Slot hidden from booking.' : 'Slot offered again.');
    if (r) state.reload();
  };

  return (
    <div className="stack">
      <PageHead title="Weekly availability" subtitle={`Members book these slots. Branch hours: ${state.data.me.branch_name}.`} />
      <Alert msg={msg} onClose={() => setMsg(null)} />
      <Card title="Add a slot">
        <form className="form" onSubmit={add}>
          <label className="field">Day<select value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })}>{['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => <option key={d}>{d}</option>)}</select></label>
          <label className="field">From<input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
          <label className="field">To<input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
          <button className="primary" disabled={busy}>Add slot</button>
        </form>
        <p className="small muted" style={{ marginTop: 8 }}>Slots cannot overlap and must be inside your branch's opening hours (checked by the database).</p>
      </Card>
      <Card title="Your slots">
        <Table rows={state.data.slots} rowKey={(r) => r.availability_id} columns={[
          { key: 'day_of_week', label: 'Day' },
          { key: 'slot_start', label: 'Time', render: (r) => `${hhmm(r.slot_start)} - ${hhmm(r.slot_end)}` },
          { key: 'is_active', label: 'Status', render: (r) => <Badge value={r.is_active ? 'OFFERED' : 'HIDDEN'} tone={r.is_active ? 'ok' : ''} /> },
          { key: 'act', label: '', render: (r) => <button className="small" disabled={busy} onClick={() => toggle(r)}>{r.is_active ? 'Hide' : 'Offer'}</button> },
        ]} />
      </Card>
    </div>
  );
}
