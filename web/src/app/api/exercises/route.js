import { route } from '@/lib/api';
import { query } from '@/lib/mysql';

export const GET = route(['MEMBER', 'TRAINER', 'STAFF', 'ADMIN'], async () => {
  const exercises = await query(`
    SELECT e.exercise_id, e.exercise_name, e.muscle_group, e.measure_type, e.category_id, c.category_name
      FROM exercises e LEFT JOIN equipment_categories c ON c.category_id = e.category_id
     ORDER BY e.muscle_group, e.exercise_name`);
  return { exercises };
});
