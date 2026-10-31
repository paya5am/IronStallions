import { route } from '@/lib/api';
import { query } from '@/lib/mysql';

export const GET = route(['MEMBER', 'TRAINER', 'STAFF', 'ADMIN'], async () => {
  const plans = await query(`
    SELECT p.plan_id, p.plan_name, p.duration_days, p.price, p.description, p.is_active, t.tier_id, t.tier_name, t.tier_rank,
           (SELECT GROUP_CONCAT(b.branch_name ORDER BY b.branch_name SEPARATOR ', ')
              FROM branches b JOIN tiers bt ON bt.tier_id = b.tier_id WHERE bt.tier_rank <= t.tier_rank AND b.is_active) AS branches
      FROM membership_plans p JOIN tiers t ON t.tier_id = p.tier_id
     ORDER BY t.tier_rank, p.duration_days`);
  return { plans };
});
