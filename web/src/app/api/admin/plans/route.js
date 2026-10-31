import { route, int, num, str, ApiError } from '@/lib/api';
import { query } from '@/lib/mysql';

export const POST = route(['ADMIN'], async ({ body }) => {
  const res = await query(`INSERT INTO membership_plans (plan_name, tier_id, duration_days, price, description) VALUES (?, ?, ?, ?, ?)`,
    [str(body.planName, 'Name', 60), int(body.tierId, 'Tier'), int(body.durationDays, 'Duration'), num(body.price, 'Price'),
     body.description ? str(body.description, 'Description') : null]);
  return { ok: true, planId: res.insertId };
});

// Price changes apply to future purchases only: existing invoices keep their amount.
export const PATCH = route(['ADMIN'], async ({ body }) => {
  const id = int(body.planId, 'Plan');
  const fields = []; const args = [];
  if (body.price !== undefined) { fields.push('price = ?'); args.push(num(body.price, 'Price')); }
  if (body.description !== undefined) { fields.push('description = ?'); args.push(String(body.description).slice(0, 255)); }
  if (body.isActive !== undefined) { fields.push('is_active = ?'); args.push(body.isActive ? 1 : 0); }
  if (!fields.length) throw new ApiError(400, 'Nothing to change.');
  await query(`UPDATE membership_plans SET ${fields.join(', ')} WHERE plan_id = ?`, [...args, id]);
  return { ok: true };
});
