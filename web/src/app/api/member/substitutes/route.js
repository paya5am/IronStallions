// Live machine substitution (distinguishing feature).
import { route, int } from '@/lib/api';
import { callProc } from '@/lib/mysql';

export const GET = route(['MEMBER'], async ({ req, user }) => {
  const equipmentId = int(req.nextUrl.searchParams.get('equipmentId'), 'Machine');
  const { rows } = await callProc('sp_suggest_substitutes', [user.user_id, equipmentId]);
  return { substitutes: rows };
});
