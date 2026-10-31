import { route, int, str, ApiError } from '@/lib/api';
import { query } from '@/lib/mysql';

const time = (v, n) => { if (!/^\d{2}:\d{2}(:\d{2})?$/.test(String(v || ''))) throw new ApiError(400, `${n} must be HH:MM.`); return v; };

export const POST = route(['ADMIN'], async ({ body }) => {
  const res = await query(`INSERT INTO branches (branch_name, tier_id, address, city, phone, opening_time, closing_time)
                           VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [str(body.branchName, 'Name', 80), int(body.tierId, 'Tier'), str(body.address, 'Address', 200), str(body.city || 'Bengaluru', 'City', 60),
     str(body.phone, 'Phone', 15), time(body.openingTime, 'Opening time'), time(body.closingTime, 'Closing time')]);
  return { ok: true, branchId: res.insertId };
});

export const PATCH = route(['ADMIN'], async ({ body }) => {
  const id = int(body.branchId, 'Branch');
  const fields = []; const args = [];
  if (body.tierId !== undefined) { fields.push('tier_id = ?'); args.push(int(body.tierId, 'Tier')); }
  if (body.openingTime) { fields.push('opening_time = ?'); args.push(time(body.openingTime, 'Opening time')); }
  if (body.closingTime) { fields.push('closing_time = ?'); args.push(time(body.closingTime, 'Closing time')); }
  if (body.phone) { fields.push('phone = ?'); args.push(str(body.phone, 'Phone', 15)); }
  if (body.isActive !== undefined) { fields.push('is_active = ?'); args.push(body.isActive ? 1 : 0); }
  if (!fields.length) throw new ApiError(400, 'Nothing to change.');
  await query(`UPDATE branches SET ${fields.join(', ')} WHERE branch_id = ?`, [...args, id]);
  return { ok: true };
});
