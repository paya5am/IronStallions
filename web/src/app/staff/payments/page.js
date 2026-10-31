'use client';
import { useState } from 'react';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table, fmtDate, rupees } from '@/components/ui';

export default function PaymentsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('OPEN');
  const state = useApi(`/api/staff/payments?q=${encodeURIComponent(q)}&status=${status}`);
  const { msg, setMsg, busy, run } = useAction();
  const [pay, setPay] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const r = await run(() => api.post('/api/staff/payments', { invoiceId: pay.invoice_id, amount: Number(pay.amount), method: pay.method, note: pay.note }));
    if (r) { setPay(null); state.reload(); }
  };

  return (
    <div className="stack">
      <PageHead title="Payments" subtitle="Record payments at the desk. Partial payments are allowed; overpayment is refused by the database." />
      <Alert msg={msg} onClose={() => setMsg(null)} />
      {pay && (
        <Card title={`Invoice #${pay.invoice_id}: ${pay.member_name}`}>
          <p className="muted">{pay.description}. Balance {rupees(pay.balance)}.</p>
          <form className="form" onSubmit={submit}>
            <label className="field">Amount<input type="number" step="0.01" min="1" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></label>
            <label className="field">Method<select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{['CASH', 'CARD', 'UPI', 'NETBANKING'].map((m) => <option key={m}>{m}</option>)}</select></label>
            <label className="field">Note<input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></label>
            <button className="primary" disabled={busy}>Record payment</button>
            <button type="button" onClick={() => setPay(null)}>Cancel</button>
          </form>
        </Card>
      )}
      <Card>
        <div className="row" style={{ marginBottom: 12 }}>
          <input placeholder="Member name, phone or invoice #" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {['OPEN', 'ALL', 'PENDING', 'PARTIAL', 'OVERDUE', 'PAID', 'CANCELLED'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        {!state.data ? <Loading state={state} /> : (
          <Table rows={state.data.invoices} rowKey={(r) => r.invoice_id} columns={[
            { key: 'invoice_id', label: '#' },
            { key: 'member_name', label: 'Member', render: (r) => <>{r.member_name}<div className="small muted">{r.phone}</div></> },
            { key: 'description', label: 'For' },
            { key: 'due_date', label: 'Due', render: (r) => fmtDate(r.due_date) },
            { key: 'amount_due', label: 'Amount', num: true, render: (r) => rupees(r.amount_due) },
            { key: 'balance', label: 'Balance', num: true, render: (r) => rupees(r.balance) },
            { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
            { key: 'act', label: '', render: (r) => (r.balance > 0 ? <button className="small primary" onClick={() => setPay({ ...r, amount: String(r.balance), method: 'CASH', note: '' })}>Record</button> : null) },
          ]} />
        )}
      </Card>
    </div>
  );
}
