import { route } from '@/lib/api';

export const GET = route(['MEMBER', 'TRAINER', 'STAFF', 'ADMIN'], async ({ user }) => ({
  user_id: user.user_id, role: user.role, name: user.full_name, expires_at: user.expires_at,
}));
