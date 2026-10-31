// Staff and trainer accounts; enabling / disabling any account.
import { pool, query } from '@/lib/mysql';
import { route, int, num, str, oneOf, ApiError, clientIp } from '@/lib/api';
import { logActivity } from '@/lib/docs';

export const GET = route(['ADMIN'], async ({ req }) => {
  const role = req.nextUrl.searchParams.get('role') || '';
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const where = []; const args = [];
  if (role) { where.push('u.role = ?'); args.push(role); }
  if (q) { where.push('(u.full_name LIKE ? OR u.phone LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  const people = await query(`
    SELECT u.user_id, u.full_name, u.phone, u.email, u.role, u.is_active, u.created_at,
           COALESCE(sb.branch_name, tb.branch_name, mb.branch_name) AS branch_name,
           COALESCE(s.designation, t.specialization) AS detail
      FROM users u
      LEFT JOIN staff s ON s.staff_id = u.user_id LEFT JOIN branches sb ON sb.branch_id = s.branch_id
      LEFT JOIN trainers t ON t.trainer_id = u.user_id LEFT JOIN branches tb ON tb.branch_id = t.branch_id
      LEFT JOIN members m ON m.member_id = u.user_id LEFT JOIN branches mb ON mb.branch_id = m.branch_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY u.role, u.full_name LIMIT 200`, args);
  return { people };
});

export const POST = route(['ADMIN'], async ({ req, user, body }) => {
  const role = oneOf(body.role, ['STAFF', 'TRAINER'], 'Role');
  const phone = str(body.phone, 'Phone', 15);
  if (!/^\d{10}$/.test(phone)) throw new ApiError(400, 'Phone must be 10 digits.');
  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    const [u] = await conn.query('INSERT INTO users (full_name, phone, email, role) VALUES (?, ?, ?, ?)',
      [str(body.fullName, 'Full name', 100), phone, str(body.email, 'Email', 120), role]);
    const branchId = int(body.branchId, 'Branch');
    if (role === 'STAFF') {
      await conn.query('INSERT INTO staff (staff_id, branch_id, designation, shift_start, shift_end) VALUES (?, ?, ?, ?, ?)',
        [u.insertId, branchId, str(body.designation, 'Designation', 60), str(body.shiftStart, 'Shift start', 8), str(body.shiftEnd, 'Shift end', 8)]);
    } else {
      await conn.query('INSERT INTO trainers (trainer_id, branch_id, specialization, years_experience, hourly_rate) VALUES (?, ?, ?, ?, ?)',
        [u.insertId, branchId, str(body.specialization, 'Specialization', 100), int(body.yearsExperience, 'Experience'), num(body.hourlyRate, 'Hourly rate')]);
    }
    await conn.commit();
    return { ok: true, userId: u.insertId };
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'That phone number or email is already registered.');
    throw err;
  } finally {
    conn.release();
  }
});

// Disabling an account also ends its login session.
export const PATCH = route(['ADMIN'], async ({ req, user, body }) => {
  const id = int(body.userId, 'User');
  if (id === user.user_id) throw new ApiError(409, 'You cannot disable your own account.');
  const active = body.isActive ? 1 : 0;
  await query('UPDATE users SET is_active = ? WHERE user_id = ?', [active, id]);
  if (!active) await query('UPDATE user_sessions SET is_valid = FALSE WHERE user_id = ? AND is_valid', [id]);
  await logActivity('ACCOUNT_STATUS_CHANGED', { userId: user.user_id, role: user.role, ip: clientIp(req), details: { target_user: id, is_active: !!active } });
  return { ok: true };
});
