// A member reads the trainer's notes (MongoDB) for one of their own sessions.
import { route, int, ApiError } from '@/lib/api';
import { queryOne } from '@/lib/mysql';
import { collection } from '@/lib/docs';

export const GET = route(['MEMBER'], async ({ req, user }) => {
  const id = int(req.nextUrl.searchParams.get('sessionId'), 'Session');
  const s = await queryOne('SELECT member_id FROM training_sessions WHERE training_session_id = ?', [id]);
  if (!s || s.member_id !== user.user_id) throw new ApiError(404, 'Session not found.');
  const col = await collection('pt_session_logs');
  const log = await col.findOne({ training_session_id: id });
  return { log };
});
