import { route } from '@/lib/api';
import { query } from '@/lib/mysql';

export const GET = route(['MEMBER', 'TRAINER', 'STAFF', 'ADMIN'], async () => {
  const branches = await query(`
    SELECT b.branch_id, b.branch_name, b.address, b.city, b.phone, b.opening_time, b.closing_time, b.is_active,
           t.tier_id, t.tier_name, t.tier_rank
      FROM branches b JOIN tiers t ON t.tier_id = b.tier_id ORDER BY t.tier_rank, b.branch_name`);
  return { branches };
});
