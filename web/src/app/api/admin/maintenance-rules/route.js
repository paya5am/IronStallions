// Service intervals per machine type, and the machines that are due.
import { route, int } from '@/lib/api';
import { query, callProc } from '@/lib/mysql';

export const GET = route(['ADMIN'], async () => {
  const rules = await query(`
    SELECT c.category_id, c.category_name, c.category_group, r.rule_id, r.service_interval_hours, u.full_name AS set_by
      FROM equipment_categories c LEFT JOIN maintenance_rules r ON r.category_id = c.category_id
      LEFT JOIN users u ON u.user_id = r.created_by ORDER BY c.category_name`);
  const due = await query('SELECT * FROM v_service_due ORDER BY hours_since_service / service_interval_hours DESC LIMIT 25');
  return { rules, due };
});

export const POST = route(['ADMIN'], async ({ user, body }) => {
  if (body.action === 'run') {
    const { out } = await callProc('sp_generate_service_alerts', [], ['created']);
    return { ok: true, message: `${out.created} service job(s) created. They appear under each branch's equipment page.` };
  }
  const categoryId = int(body.categoryId, 'Machine type');
  const hours = int(body.hours, 'Hours');
  await query(`INSERT INTO maintenance_rules (category_id, service_interval_hours, created_by) VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE service_interval_hours = VALUES(service_interval_hours), created_by = VALUES(created_by)`,
    [categoryId, hours, user.user_id]);
  return { ok: true, message: 'Service rule saved.' };
});
