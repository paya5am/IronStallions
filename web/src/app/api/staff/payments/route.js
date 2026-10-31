// Front desk billing: find unpaid invoices and record cash / card / UPI payments.
import { route, int, num, oneOf, str, clientIp } from '@/lib/api';
import { query, callProc } from '@/lib/mysql';
import { logActivity } from '@/lib/docs';

export const GET = route(['STAFF', 'ADMIN'], async ({ req }) => {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const status = req.nextUrl.searchParams.get('status') || 'OPEN';
  const where = []; const args = [];
  if (q) { where.push('(d.member_name LIKE ? OR u.phone LIKE ? OR d.invoice_id = ?)'); args.push(`%${q}%`, `%${q}%`, Number(q) || 0); }
  if (status === 'OPEN') where.push("d.status IN ('PENDING','PARTIAL','OVERDUE')");
  else if (status !== 'ALL') { where.push('d.status = ?'); args.push(status); }
  const invoices = await query(`
    SELECT d.*, u.phone FROM v_member_dues d JOIN users u ON u.user_id = d.member_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.due_date, d.invoice_id LIMIT 100`, args);
  return { invoices };
});

export const POST = route(['STAFF', 'ADMIN'], async ({ req, user, body }) => {
  const invoiceId = int(body.invoiceId, 'Invoice');
  const amount = num(body.amount, 'Amount');
  const method = oneOf(body.method, ['CASH', 'CARD', 'UPI', 'NETBANKING'], 'Method');
  const note = body.note ? str(body.note, 'Note', 255) : 'Paid at front desk';
  const { out } = await callProc('sp_record_payment', [invoiceId, amount, method, user.user_id, note], ['payment_id', 'status']);
  await logActivity('PAYMENT', { userId: user.user_id, role: user.role, ip: clientIp(req), details: { invoice_id: invoiceId, amount, method, recorded_by: user.user_id } });
  return { ok: true, message: `Payment recorded. Invoice is now ${out.status}.` };
});
