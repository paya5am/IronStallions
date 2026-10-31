// Invoices with paid / refunded / balance, and online payment (simulated gateway).
import { route, int, num, oneOf, ApiError, clientIp } from '@/lib/api';
import { query, queryOne, callProc } from '@/lib/mysql';
import { logActivity } from '@/lib/docs';

export const GET = route(['MEMBER'], async ({ user }) => {
  const invoices = await query('SELECT * FROM v_member_dues WHERE member_id = ? ORDER BY issue_date DESC, invoice_id DESC', [user.user_id]);
  const payments = await query(`
    SELECT pay.payment_id, pay.invoice_id, pay.amount, pay.payment_type, pay.payment_method, pay.paid_at, pay.note
      FROM payments pay JOIN invoices i ON i.invoice_id = pay.invoice_id
     WHERE i.member_id = ? ORDER BY pay.paid_at DESC`, [user.user_id]);
  return { invoices, payments };
});

export const POST = route(['MEMBER'], async ({ req, user, body }) => {
  const invoiceId = int(body.invoiceId, 'Invoice');
  const amount = num(body.amount, 'Amount');
  const method = oneOf(body.method, ['UPI', 'CARD', 'NETBANKING'], 'Payment method');
  const inv = await queryOne('SELECT member_id FROM invoices WHERE invoice_id = ?', [invoiceId]);
  if (!inv || inv.member_id !== user.user_id) throw new ApiError(404, 'Invoice not found.');
  const { out } = await callProc('sp_record_payment', [invoiceId, amount, method, null, 'Online payment'], ['payment_id', 'status']);
  await logActivity('PAYMENT', { userId: user.user_id, role: user.role, ip: clientIp(req), details: { invoice_id: invoiceId, amount, method } });
  return { ok: true, ...out };
});
