'use client';
// Live machine availability with filters, start/stop using a machine, and live substitution.
import { useEffect, useState } from 'react';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table, MUSCLES, fmtDateTime } from '@/components/ui';

export default function EquipmentPage() {
  const visit = useApi('/api/member/visit');
  const overview = useApi('/api/member/overview');
  const branches = useApi('/api/branches');
  const [branchId, setBranchId] = useState('');
  const [muscle, setMuscle] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const { msg, setMsg, busy, run } = useAction();
  const [subs, setSubs] = useState(null);       // { forName, rows }
  const [rating, setRating] = useState({ difficulty: '3', comfort: '3' });

  const v = visit.data?.visit;
  useEffect(() => {
    if (!branchId && (v || overview.data)) setBranchId(String(v?.branch_id || overview.data.overview.home_branch_id));
  }, [v, overview.data, branchId]);

  const params = new URLSearchParams({ branchId, muscle, status, q });
  const eq = useApi(branchId ? `/api/equipment?${params}` : null);
  if (!visit.data || !branches.data) return <Loading state={visit.data ? branches : visit} />;

  const current = visit.data.usages.find((u) => !u.end_time);
  const here = v && String(v.branch_id) === String(branchId);
  const refresh = () => { eq.reload(); visit.reload(); };

  const start = async (m) => {
    const r = await run(() => api.post('/api/member/usage', { action: 'start', equipmentId: m.equipment_id }), `You are now using ${m.name}.`);
    if (r) { setSubs(null); refresh(); }
  };
  const finish = async () => {
    const r = await run(() => api.post('/api/member/usage', { action: 'end', usageId: current.usage_id, ...rating }), 'Machine freed. Thanks for rating it.');
    if (r) refresh();
  };
  const findAlternative = async (m) => {
    const r = await run(() => api.get(`/api/member/substitutes?equipmentId=${m.equipment_id}`), ' ');
    setMsg(null);
    if (r) setSubs({ forName: m.name, status: m.status, rows: r.substitutes });
  };

  return (
    <div className="stack">
      <PageHead title="Machines" subtitle={v ? `You are at ${v.branch_name}.` : 'Check in to start using machines.'} />
      <Alert msg={msg} onClose={() => setMsg(null)} />

      {current && (
        <Card title={`Using ${current.name}`}>
          <p className="muted">Since {fmtDateTime(current.start_time)}. Log your sets on the Workouts page. Rate the machine when you finish; your ratings shape your suggestions and routine.</p>
          <div className="form">
            <label className="field">Difficulty (1 easy - 5 hard)<select value={rating.difficulty} onChange={(e) => setRating({ ...rating, difficulty: e.target.value })}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
            <label className="field">Comfort (1 poor - 5 great)<select value={rating.comfort} onChange={(e) => setRating({ ...rating, comfort: e.target.value })}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
            <button className="primary" onClick={finish} disabled={busy}>Finish and free the machine</button>
          </div>
        </Card>
      )}

      {subs && (
        <Card title={`Alternatives to ${subs.forName}`} actions={<button className="small" onClick={() => setSubs(null)}>Close</button>}>
          <p className="muted small">{subs.forName} is {subs.status.toLowerCase()}. Available now at this branch, same machine type first, then same muscle group, ranked by your own comfort ratings:</p>
          <Table rows={subs.rows} empty="No free alternative right now. Try again in a few minutes." columns={[
            { key: 'name', label: 'Machine' },
            { key: 'reason', label: 'Why' },
            { key: 'muscle_group', label: 'Muscle', render: (r) => <Badge value={r.muscle_group} /> },
            { key: 'your_comfort', label: 'Your comfort', num: true, render: (r) => r.your_comfort ?? 'not rated' },
            { key: 'go', label: '', render: (r) => (here && !current ? <button className="small primary" onClick={() => start(r)} disabled={busy}>Use this</button> : null) },
          ]} />
        </Card>
      )}

      <Card>
        <div className="row" style={{ marginBottom: 12 }}>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.data.branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name} ({b.tier_name})</option>)}
          </select>
          <select value={muscle} onChange={(e) => setMuscle(e.target.value)}><option value="">All muscles</option>{MUSCLES.map((m) => <option key={m}>{m}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'RETIRED'].map((s) => <option key={s}>{s}</option>)}</select>
          <input placeholder="Search machines" value={q} onChange={(e) => setQ(e.target.value)} />
          <button onClick={refresh}>Refresh</button>
        </div>
        {!eq.data ? <Loading state={eq} /> : (
          <Table rows={eq.data.equipment} rowKey={(r) => r.equipment_id} columns={[
            { key: 'name', label: 'Machine' },
            { key: 'category_name', label: 'Type' },
            { key: 'muscle_group', label: 'Muscle', render: (r) => <Badge value={r.muscle_group} tone="" /> },
            { key: 'status', label: 'Status', render: (r) => <><Badge value={r.status} />{r.open_issue && <div className="small muted">{r.open_issue}</div>}</> },
            { key: 'act', label: '', render: (r) => {
              if (r.status === 'AVAILABLE') return here && !current ? <button className="small primary" disabled={busy} onClick={() => start(r)}>Start</button> : null;
              if (r.status === 'OCCUPIED' && r.in_use_by_member_id && current?.equipment_id === r.equipment_id) return <span className="small">You</span>;
              if (r.status !== 'RETIRED') return <button className="small" disabled={busy} onClick={() => findAlternative(r)}>Find alternative</button>;
              return null;
            } },
          ]} />
        )}
      </Card>
    </div>
  );
}
