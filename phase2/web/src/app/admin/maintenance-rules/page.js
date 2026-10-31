'use client';
import { useState } from 'react';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table, fmtDate } from '@/components/ui';

export default function ServiceRules() {
  const state = useApi('/api/admin/maintenance-rules');
  const { msg, setMsg, busy, run } = useAction();
  const [hours, setHours] = useState({});
  if (!state.data) return <Loading state={state} />;
  const save = async (r) => { const x = await run(() => api.post('/api/admin/maintenance-rules', { categoryId: r.category_id, hours: Number(hours[r.category_id]) })); if (x) state.reload(); };
  const runNow = async () => { const x = await run(() => api.post('/api/admin/maintenance-rules', { action: 'run' })); if (x) state.reload(); };
  return (
    <div className="stack">
      <PageHead title="Service rules" subtitle="Each machine type is serviced after a set number of hours of use, counted from the usage log.">
        <button className="primary" onClick={runNow} disabled={busy}>Check machines now</button>
      </PageHead>
      <Alert msg={msg} onClose={() => setMsg(null)} />
      <div className="grid g2">
        <Card title="Rules by machine type">
          <Table rows={state.data.rules} rowKey={(r) => r.category_id} columns={[
            { key: 'category_name', label: 'Machine type' },
            { key: 'service_interval_hours', label: 'Every (hours)', num: true, render: (r) => r.service_interval_hours ?? <span className="muted">no rule</span> },
            { key: 'edit', label: '', render: (r) => <div className="row"><input type="number" min="1" style={{ width: 80 }} value={hours[r.category_id] ?? ''} onChange={(e) => setHours({ ...hours, [r.category_id]: e.target.value })} /><button className="small" disabled={busy || !hours[r.category_id]} onClick={() => save(r)}>Set</button></div> },
          ]} />
        </Card>
        <Card title="Closest to service">
          <Table rows={state.data.due} rowKey={(r) => r.equipment_id} columns={[
            { key: 'name', label: 'Machine', render: (r) => <>{r.name}<div className="small muted">{r.branch_name}</div></> },
            { key: 'h', label: 'Hours used', num: true, render: (r) => `${r.hours_since_service} / ${r.service_interval_hours}` },
            { key: 'last_service', label: 'Last service', render: (r) => (r.last_service ? fmtDate(r.last_service) : 'never') },
            { key: 'service_open', label: '', render: (r) => (r.service_open ? <Badge value="SERVICE OPEN" tone="warn" /> : null) },
          ]} />
        </Card>
      </div>
    </div>
  );
}
