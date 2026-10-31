// Live machine list with search and filters (used by members, staff and admin).
import { route } from '@/lib/api';
import { query } from '@/lib/mysql';

export const GET = route(['MEMBER', 'TRAINER', 'STAFF', 'ADMIN'], async ({ req }) => {
  const p = req.nextUrl.searchParams;
  const where = []; const args = [];
  if (p.get('branchId')) { where.push('branch_id = ?'); args.push(Number(p.get('branchId'))); }
  if (p.get('muscle')) { where.push('muscle_group = ?'); args.push(p.get('muscle')); }
  if (p.get('status')) { where.push('status = ?'); args.push(p.get('status')); }
  if (p.get('categoryId')) { where.push('category_id = ?'); args.push(Number(p.get('categoryId'))); }
  if (p.get('q')) { where.push('(name LIKE ? OR category_name LIKE ?)'); args.push(`%${p.get('q')}%`, `%${p.get('q')}%`); }
  const equipment = await query(
    `SELECT * FROM v_equipment_live ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY branch_name, category_name, name`, args);
  const categories = await query('SELECT category_id, category_name, category_group FROM equipment_categories ORDER BY category_name');
  return { equipment, categories };
});
