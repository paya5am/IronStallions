'use client';
import { useState } from 'react';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table, fmtDate, rupees } from '@/components/ui';

export default function StaffEquipment() {
  const maint = useApi('/api/staff/maintenance');
  const branchId = maint.data?.branch.branch_id;
  const eq = useApi(branchId ? `/api/equipment?branchId=${branchId}` : null);
  const { msg, setMsg, busy, run } = useAction();
  const [fault, setFault] = useState(null);
  const [cost, setCost] = useState({});
  if (!maint.data) return <Loading state={maint} />;
  const reload = () => { maint.reload(); eq.reload(); };

  const report = async (e) => {
    e.preventDefault();
    const r = await run(() => api.post('/api/staff/maintenance', { action: 'report', equipmentId: fault.equipment_id, issue: fault.issue }));
    if (r) { setFault(null); reload(); }
  };
  const update = async (rec, status) => {
    const r = await run(() => api.post('/api/staff/maintenance', { action: 'update', maintenanceId: rec.maintenance_id, status, cost: cost[rec.maintenance_id] }), status === 'RESOLVED' ? 'Resolved. The machine is available again.' : 'Work started.');
    if (r) reload();
  };
  const retire = async (m) => {
    if (!window.confirm(`Retire ${m.name}? This cannot be undone here.`)) return;
    const r = await run(() => api.post('/api/staff/maintenance', { action: 'retire', equipmentId: m.equipment_id }));
    if (r) reload();
  };

  return (
    <div className="stack">
      <PageHead title={`Equipment at ${maint.data.branch.branch_name}`} subtitle="Machine status changes automatically from usage and maintenance records." />
      <Alert msg={msg} onClose={() => setMsg(null)} />
      {fault && (
        <Card title={`Report a fault on ${fault.name}`}>
          <form className="form" onSubmit={report}>
            <label className="field" style={{ gridColumn: 'span 2' }}>What is wrong?<input value={fault.issue} onChange={(e) => setFault({ ...fault, issue: e.target.value })} required /></label>
            <button className="primary" disabled={busy}>Report</button>
            <button type="button" onClick={() => setFault(null)}>Cancel</button>
          </form>
        </Card>
      )}
      <Card title="Open and recent maintenance">
        <Table rows={maint.data.records} rowKey={(r) => r.maintenance_id} columns={[
          { key: 'equipment_name', label: 'Machine' },
          { key: 'maintenance_type', label: 'Type', render: (r) => <Badge value={r.maintenance_type} tone="" /> },
          { key: 'reported_issue', label: 'Issue', render: (r) => <>{r.reported_issue}<div className="small muted">by {r.reported_by_name || 'service rule'} on {fmtDate(r.reported_date)}</div></> },
          { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
          { key: 'cost', label: 'Cost', num: true, render: (r) => (r.cost !== null ? rupees(r.cost) : '-') },
          { key: 'act', label: '', render: (r) => r.status === 'RESOLVED' ? `Fixed ${fmtDate(r.resolved_date)}` : (
            <div className="row">
              {r.status === 'REPORTED' && <button className="small" disabled={busy} onClick={() => update(r, 'IN_PROGRESS')}>Start work</button>}
              <input type="number" placeholder="Cost" style={{ width: 90 }} value={cost[r.maintenance_id] || ''} onChange={(e) => setCost({ ...cost, [r.maintenance_id]: e.target.value })} />
              <button className="small primary" disabled={busy || !cost[r.maintenance_id]} onClick={() => update(r, 'RESOLVED')}>Resolve</button>
            </div>) },
        ]} />
      </Card>
      <Card title="Machines">
        {!eq.data ? <Loading state={eq} /> : (
          <Table rows={eq.data.equipment} rowKey={(r) => r.equipment_id} columns={[
            { key: 'name', label: 'Machine' },
            { key: 'category_name', label: 'Type' },
            { key: 'status', label: 'Status', render: (r) => <><Badge value={r.status} />{r.in_use_by && <div className="small muted">{r.in_use_by}</div>}</> },
            { key: 'act', label: '', render: (r) => r.status === 'RETIRED' ? null : (
              <div className="row">
                <button className="small" onClick={() => setFault({ ...r, issue: '' })}>Report fault</button>
                {r.status !== 'OCCUPIED' && <button className="small danger" disabled={busy} onClick={() => retire(r)}>Retire</button>}
              </div>) },
          ]} />
        )}
      </Card>
    </div>
  );
}
