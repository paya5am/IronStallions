import { route, str, ApiError } from '@/lib/api';
import { query } from '@/lib/mysql';

export const GET = route(['ADMIN'], async () => {
  const settings = await query(`SELECT s.*, u.full_name AS updated_by_name FROM system_settings s
                                  JOIN users u ON u.user_id = s.updated_by ORDER BY s.setting_key`);
  return { settings };
});

export const PATCH = route(['ADMIN'], async ({ user, body }) => {
  const value = str(body.value, 'Value', 100);
  if (!/^\d+$/.test(value) || Number(value) < 1) throw new ApiError(400, 'Settings are whole numbers of 1 or more.');
  const res = await query('UPDATE system_settings SET setting_value = ?, updated_by = ? WHERE setting_key = ?',
    [value, user.user_id, str(body.key, 'Setting', 50)]);
  if (!res.affectedRows) throw new ApiError(404, 'Unknown setting.');
  return { ok: true };
});
