import { route } from '@/lib/api';
import { query } from '@/lib/mysql';

export const GET = route(['MEMBER'], async ({ user }) => {
  const records = await query(
    'SELECT * FROM v_personal_records WHERE member_id = ? ORDER BY muscle_group, exercise_name, record_type', [user.user_id]);
  return { records };
});
