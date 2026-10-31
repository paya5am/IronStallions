'use client';
import { useState } from 'react';
import { useApi, useAction, api, Card, Alert, PageHead, Loading, Table, fmtDateTime } from '@/components/ui';

export default function SettingsPage() {
  const state = useApi('/api/admin/settings');
  const { msg, setMsg, busy, run } = useAction();
  const [val, setVal] = useState({});
  if (!state.data) return <Loading state={state} />;
  const save = async (s) => { const r = await run(() => api.patch('/api/admin/settings', { key: s.setting_key, value: val[s.setting_key] }), 'Setting saved. The database uses it immediately.'); if (r) state.reload(); };
  return (
    <div className="stack">
      <PageHead title="System rules" subtitle="Values read by the database triggers, procedures and scheduled events." />
      <Alert msg={msg} onClose={() => setMsg(null)} />
      <Card>
        <Table rows={state.data.settings} rowKey={(r) => r.setting_key} columns={[
          { key: 'setting_key', label: 'Rule', render: (r) => <><span className="mono">{r.setting_key}</span><div className="small muted">{r.description}</div></> },
          { key: 'setting_value', label: 'Value', num: true },
          { key: 'updated', label: 'Last change', render: (r) => <span className="small">{r.updated_by_name}, {fmtDateTime(r.updated_at)}</span> },
          { key: 'edit', label: '', render: (r) => <div className="row"><input type="number" min="1" style={{ width: 90 }} value={val[r.setting_key] ?? ''} onChange={(e) => setVal({ ...val, [r.setting_key]: e.target.value })} /><button className="small" disabled={busy || !val[r.setting_key]} onClick={() => save(r)}>Save</button></div> },
        ]} />
      </Card>
    </div>
  );
}
