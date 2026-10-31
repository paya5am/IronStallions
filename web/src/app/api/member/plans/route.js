// Plan history, buying / renewing, upgrading or downgrading, cancelling.
import { route, int, oneOf, clientIp } from '@/lib/api';
import { query, callProc } from '@/lib/mysql';
import { logActivity } from '@/lib/docs';

const METHODS = ['UPI', 'CARD', 'NETBANKING', 'CASH'];

export const GET = route(['MEMBER'], async ({ user }) => {
  const history = await query(`
    SELECT s.subscription_id, p.plan_name, t.tier_name, s.start_date, s.end_date, s.status, s.closed_on,
           s.previous_subscription_id, i.invoice_id, i.status AS invoice_status
      FROM subscriptions s JOIN membership_plans p ON p.plan_id = s.plan_id JOIN tiers t ON t.tier_id = p.tier_id
      LEFT JOIN invoices i ON i.subscription_id = s.subscription_id
     WHERE s.member_id = ? ORDER BY s.start_date DESC, s.subscription_id DESC`, [user.user_id]);
  return { history };
});

export const POST = route(['MEMBER'], async ({ req, user, body }) => {
  const action = oneOf(body.action, ['buy', 'change', 'cancel'], 'Action');
  const refundMethod = METHODS.includes(body.refundMethod) ? body.refundMethod : 'UPI';
  let result;
  if (action === 'buy') {
    const { out } = await callProc('sp_buy_plan', [user.user_id, int(body.planId, 'Plan')], ['subscription_id', 'status']);
    result = { message: out.status === 'UPCOMING' ? 'Renewal queued. It starts when your current plan ends.' : 'Plan activated. Pay the invoice under Billing.', ...out };
  } else if (action === 'change') {
    const { out } = await callProc('sp_change_plan', [user.user_id, int(body.planId, 'Plan'), refundMethod], ['subscription_id', 'refund', 'kind']);
    result = { message: `Plan ${out.kind.toLowerCase()}. Refund of Rs ${Number(out.refund).toFixed(2)} issued for unused days; pay the new invoice under Billing.`, ...out };
  } else {
    const { out } = await callProc('sp_cancel_plan', [user.user_id, refundMethod], ['refund']);
    result = { message: `Plan cancelled. Refund of Rs ${Number(out.refund).toFixed(2)} issued.`, ...out };
  }
  await logActivity('PLAN_' + action.toUpperCase(), { userId: user.user_id, role: user.role, ip: clientIp(req), details: { plan_id: body.planId ?? null, ...result } });
  return result;
});
