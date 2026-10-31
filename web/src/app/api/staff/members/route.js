// Member search for the front desk, and registering a new member at this branch.
import { route, str, oneOf, ApiError, clientIp } from '@/lib/api';
import { pool, query } from '@/lib/mysql';
import { logActivity } from '@/lib/docs';
import { staffBranch } from '@/lib/staff';

export const GET = route(['STAFF', 'ADMIN'], async ({ req }) => {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const status = req.nextUrl.searchParams.get('status') || '';
  const where = []; const args = [];
  if (q) { where.push('(mo.full_name LIKE ? OR mo.phone LIKE ? OR mo.email LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (status === 'ACTIVE') where.push('mo.plan_status IS NOT NULL');
  if (status === 'NONE') where.push('mo.plan_status IS NULL');
  if (status === 'INSIDE') where.push('mo.is_inside');
  const members = await query(`
    SELECT mo.*, (SELECT IFNULL(SUM(d.balance), 0) FROM v_member_dues d WHERE d.member_id = mo.member_id) AS balance
      FROM v_member_overview mo ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY mo.full_name LIMIT 50`, args);
  return { members };
});

export const POST = route(['STAFF'], async ({ req, user, body }) => {
  const me = await staffBranch(user.user_id);
  const fullName = str(body.fullName, 'Full name', 100);
  const phone = str(body.phone, 'Phone', 15).replace(/\s+/g, '');
  if (!/^\d{10}$/.test(phone)) throw new ApiError(400, 'Phone must be 10 digits.');
  const email = str(body.email, 'Email', 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, 'Email is not valid.');
  const dob = str(body.dateOfBirth, 'Date of birth', 10);
  const gender = oneOf(body.gender, ['MALE', 'FEMALE', 'OTHER'], 'Gender');
  const emergency = str(body.emergencyContact, 'Emergency contact', 15);
  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    const [u] = await conn.query("INSERT INTO users (full_name, phone, email, role) VALUES (?, ?, ?, 'MEMBER')", [fullName, phone, email]);
    await conn.query(`INSERT INTO members (member_id, branch_id, date_of_birth, gender, join_date, emergency_contact, training_days_per_week)
                      VALUES (?, ?, ?, ?, CURDATE(), ?, fn_setting_int('DEFAULT_TRAINING_DAYS', 5))`,
      [u.insertId, me.branch_id, dob, gender, emergency]);
    await conn.commit();
    await logActivity('MEMBER_REGISTERED', { userId: user.user_id, role: user.role, ip: clientIp(req), details: { member_id: u.insertId, branch_id: me.branch_id } });
    return { ok: true, memberId: u.insertId, message: `${fullName} registered. They can now log in with ${phone}.` };
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'That phone number or email is already registered.');
    throw err;
  } finally {
    conn.release();
  }
});
