// Equipment faults and maintenance for the staff member's branch.
import { route, int, oneOf, str, optNum, ApiError, clientIp } from '@/lib/api';
import { query, queryOne, callProc } from '@/lib/mysql';
import { logActivity } from '@/lib/docs';
import { staffBranch } from '@/lib/staff';

export const GET = route(['STAFF'], async ({ user }) => {
  const me = await staffBranch(user.user_id);
  const records = await query(`
    SELECT m.*, e.name AS equipment_name, u.full_name AS reported_by_name
      FROM equipment_maintenance m JOIN equipment e ON e.equipment_id = m.equipment_id
      LEFT JOIN users u ON u.user_id = m.reported_by
     WHERE e.branch_id = ? ORDER BY m.status = 'RESOLVED', m.reported_date DESC`, [me.branch_id]);
  return { branch: me, records };
});

async function ensureBranch(equipmentId, branchId) {
  const e = await queryOne('SELECT branch_id FROM equipment WHERE equipment_id = ?', [equipmentId]);
  if (!e || e.branch_id !== branchId) throw new ApiError(404, 'Machine not found at your branch.');
}

export const POST = route(['STAFF'], async ({ req, user, body }) => {
  const me = await staffBranch(user.user_id);
  const action = oneOf(body.action, ['report', 'update', 'retire'], 'Action');
  if (action === 'report') {
    const equipmentId = int(body.equipmentId, 'Machine');
    await ensureBranch(equipmentId, me.branch_id);
    const { out } = await callProc('sp_report_fault', [equipmentId, user.user_id, str(body.issue, 'Issue')], ['maintenance_id']);
    await logActivity('FAULT_REPORTED', { userId: user.user_id, role: user.role, ip: clientIp(req), details: { equipment_id: equipmentId, maintenance_id: out.maintenance_id } });
    return { ok: true, message: 'Fault reported. The machine is now under maintenance.' };
  }
  if (action === 'update') {
    const id = int(body.maintenanceId, 'Record');
    const rec = await queryOne('SELECT equipment_id FROM equipment_maintenance WHERE maintenance_id = ?', [id]);
    if (!rec) throw new ApiError(404, 'Record not found.');
    await ensureBranch(rec.equipment_id, me.branch_id);
    await callProc('sp_update_maintenance', [id, oneOf(body.status, ['IN_PROGRESS', 'RESOLVED'], 'Status'), optNum(body.cost)]);
    return { ok: true };
  }
  const equipmentId = int(body.equipmentId, 'Machine');
  await ensureBranch(equipmentId, me.branch_id);
  await query("UPDATE equipment SET status = 'RETIRED' WHERE equipment_id = ?", [equipmentId]);
  return { ok: true, message: 'Machine retired.' };
});
