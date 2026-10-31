'use client';
import { useState } from 'react';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table, fmtDate, fmtDateTime, rupees } from '@/components/ui';

export default function BillingPage() {
  const state = useApi('/api/member/invoices');
  const { msg, setMsg, busy, run } = useAction();
  const [filter, setFilter] = useState('ALL');
  const [paying, setPaying] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('UPI');
  if (!state.data) return <Loading state={state} />;

  const invoices = state.data.invoices.filter((i) => filter === 'ALL' || i.status === filter || (filter === 'OPEN' && i.balance > 0));
  const open = (inv) => { setPaying(inv); setAmount(String(inv.balance)); };
  const pay = async (e) => {
    e.preventDefault();
    const r = await run(() => api.post('/api/member/invoices', { invoiceId: paying.invoice_id, amount: Number(amount), method }), 'Payment successful.');
    if (r) { setPaying(null); state.reload(); }
  };

  return (
    <div className="stack">
      <PageHead title="Billing" subtitle="Plans and personal training are invoiced separately. You can pay in parts.">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          {['ALL', 'OPEN', 'PENDING', 'PARTIAL', 'OVERDUE', 'PAID', 'CANCELLED'].map((s) => <option key={s}>{s}</option>)}
        </select>
      </PageHead>
      <Alert msg={msg} onClose={() => setMsg(null)} />

      {paying && (
        <Card title={`Pay invoice #${paying.invoice_id}`}>
          <p className="muted">{paying.description}: {rupees(paying.balance)} still due.</p>
          <form className="form" onSubmit={pay}>
            <label className="field">Amount<input type="number" min="1" step="0.01" max={paying.balance} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="field">Method
              <select value={method} onChange={(e) => setMethod(e.target.value)}>{['UPI', 'CARD', 'NETBANKING'].map((m) => <option key={m}>{m}</option>)}</select>
            </label>
            <button className="primary" disabled={busy}>Pay {rupees(amount || 0)}</button>
            <button type="button" onClick={() => setPaying(null)}>Cancel</button>
          </form>
          <p className="small muted" style={{ marginTop: 8 }}>Online payment is simulated in this demo; the payment row is recorded exactly as a real gateway callback would.</p>
        </Card>
      )}

      <Card title="Invoices">
        <Table rows={invoices} rowKey={(r) => r.invoice_id} columns={[
          { key: 'invoice_id', label: '#' },
          { key: 'description', label: 'For' },
          { key: 'issue_date', label: 'Issued', render: (r) => fmtDate(r.issue_date) },
          { key: 'due_date', label: 'Due', render: (r) => fmtDate(r.due_date) },
          { key: 'amount_due', label: 'Amount', num: true, render: (r) => rupees(r.amount_due) },
          { key: 'paid', label: 'Paid', num: true, render: (r) => rupees(r.paid) },
          { key: 'refunded', label: 'Refunded', num: true, render: (r) => (r.refunded > 0 ? rupees(r.refunded) : '-') },
          { key: 'balance', label: 'Balance', num: true, render: (r) => rupees(r.balance) },
          { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
          { key: 'pay', label: '', render: (r) => (r.balance > 0 ? <button className="small primary" onClick={() => open(r)}>Pay</button> : null) },
        ]} />
      </Card>

      <Card title="Payments and refunds">
        <Table rows={state.data.payments} columns={[
          { key: 'paid_at', label: 'When', render: (r) => fmtDateTime(r.paid_at) },
          { key: 'invoice_id', label: 'Invoice' },
          { key: 'payment_type', label: 'Type', render: (r) => <Badge value={r.payment_type} tone={r.payment_type === 'REFUND' ? 'info' : 'ok'} /> },
          { key: 'payment_method', label: 'Method' },
          { key: 'amount', label: 'Amount', num: true, render: (r) => rupees(r.amount) },
          { key: 'note', label: 'Note' },
        ]} />
      </Card>
    </div>
  );
}
