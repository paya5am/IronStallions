import { queryOne } from './mysql';
import { ApiError } from './api';

export async function staffBranch(userId) {
  const s = await queryOne(`SELECT s.staff_id, s.branch_id, s.designation, b.branch_name, b.opening_time, b.closing_time, t.tier_name
                              FROM staff s JOIN branches b ON b.branch_id = s.branch_id JOIN tiers t ON t.tier_id = b.tier_id
                             WHERE s.staff_id = ?`, [userId]);
  if (!s) throw new ApiError(403, 'No staff profile.');
  return s;
}
