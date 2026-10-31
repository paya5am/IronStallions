// Front desk: scan a member's QR code, check a member in by hand, or check a member out.
import { route, int, oneOf, str, clientIp } from '@/lib/api';
import { callProc, queryOne } from '@/lib/mysql';
import { logActivity } from '@/lib/docs';
import { staffBranch } from '@/lib/staff';

export const POST = route(['STAFF'], async ({ req, user, body }) => {
  const me = await staffBranch(user.user_id);
  const mode = oneOf(body.mode, ['qr', 'manual', 'checkout'], 'Mode');
  const ip = clientIp(req);
  if (mode === 'qr') {
    const token = str(body.token, 'QR code', 64).toLowerCase();
    try {
      const { out } = await callProc('sp_check_in_qr', [token, me.branch_id], ['attendance_id', 'member_id']);
      const m = await queryOne('SELECT full_name FROM users WHERE user_id = ?', [out.member_id]);
      await logActivity('QR_SCANNED', { userId: user.user_id, role: user.role, ip, details: { result: 'ACCEPTED', member_id: out.member_id, branch_id: me.branch_id, attendance_id: out.attendance_id } });
      return { ok: true, message: `${m.full_name} checked in.` };
    } catch (err) {
      if (err.sqlState === '45000') {
        await logActivity('QR_SCANNED', { userId: user.user_id, role: user.role, ip, details: { result: 'REFUSED', reason: err.sqlMessage, branch_id: me.branch_id } });
      }
      throw err;
    }
  }
  const memberId = int(body.memberId, 'Member');
  if (mode === 'manual') {
    const { out } = await callProc('sp_check_in_manual', [user.user_id, memberId], ['attendance_id']);
    await logActivity('CHECK_IN_MANUAL', { userId: user.user_id, role: user.role, ip, details: { member_id: memberId, branch_id: me.branch_id, attendance_id: out.attendance_id } });
    return { ok: true, message: 'Member checked in.' };
  }
  await callProc('sp_check_out', [memberId], ['attendance_id']);
  await logActivity('CHECK_OUT', { userId: user.user_id, role: user.role, ip, details: { member_id: memberId, by: 'staff' } });
  return { ok: true, message: 'Member checked out.' };
});
