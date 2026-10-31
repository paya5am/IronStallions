'use client';
import { useState } from 'react';
import { useApi, Card, Badge, PageHead, Loading, Table, fmtDateTime } from '@/components/ui';

export default function ActivityPage() {
  const [event, setEvent] = useState('');
  const state = useApi(`/api/admin/activity?limit=200${event ? `&event=${event}` : ''}`);
  return (
    <div className="stack">
      <PageHead title="Activity log" subtitle="Stored in MongoDB (activity_logs). Each event type has its own fields; entries expire automatically after 90 days.">
        <select value={event} onChange={(e) => setEvent(e.target.value)}>
          <option value="">All events</option>
          {(state.data?.events || []).map((e) => <option key={e}>{e}</option>)}
        </select>
      </PageHead>
      <Card>
        {!state.data ? <Loading state={state} /> : (
          <Table rows={state.data.logs} rowKey={(r) => r._id} empty="No events yet." columns={[
            { key: 'at', label: 'When', render: (r) => fmtDateTime(r.at) },
            { key: 'event', label: 'Event', render: (r) => <Badge value={r.event} tone={/REFUSED/.test(r.event) || r.details?.result === 'REFUSED' ? 'bad' : 'info'} /> },
            { key: 'user_name', label: 'User', render: (r) => <>{r.user_name || '-'}<div className="small muted">{r.role}</div></> },
            { key: 'details', label: 'Details (document)', render: (r) => <details><summary className="small">show</summary><pre className="json">{JSON.stringify(r.details, null, 2)}</pre></details> },
          ]} />
        )}
      </Card>
    </div>
  );
}
