import { route, int, str, ApiError } from '@/lib/api';
import { query } from '@/lib/mysql';

export const GET = route(['ADMIN'], async () => {
  const closures = await query(`
    SELECT c.closure_id, c.branch_id, IFNULL(b.branch_name, 'All branches') AS branch_name, c.closure_date, c.reason, u.full_name AS created_by
      FROM branch_closures c LEFT JOIN branches b ON b.branch_id = c.branch_id JOIN users u ON u.user_id = c.created_by
     ORDER BY c.closure_date DESC`);
  return { closures };
});

export const POST = route(['ADMIN'], async ({ user, body }) => {
  const date = str(body.date, 'Date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, 'Date must be YYYY-MM-DD.');
  const branchId = body.branchId ? int(body.branchId, 'Branch') : null;
  await query('INSERT INTO branch_closures (branch_id, closure_date, reason, created_by) VALUES (?, ?, ?, ?)',
    [branchId, date, str(body.reason, 'Reason', 200), user.user_id]);
  return { ok: true };
});

export const DELETE = route(['ADMIN'], async ({ req }) => {
  const id = int(req.nextUrl.searchParams.get('closureId'), 'Close day');
  const res = await query('DELETE FROM branch_closures WHERE closure_id = ? AND closure_date >= CURDATE()', [id]);
  if (!res.affectedRows) throw new ApiError(409, 'Only future close days can be removed.');
  return { ok: true };
});
