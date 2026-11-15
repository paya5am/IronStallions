import { route, int, ApiError } from '@/lib/api';
import { query } from '@/lib/mysql';

export const GET = route(['MEMBER'], async ({ user }) => {
  const challenges = await query(`
    SELECT c.*, x.exercise_name, IFNULL(b.branch_name, 'All branches') AS branch_name,
           (SELECT COUNT(*) FROM challenge_participants p WHERE p.challenge_id = c.challenge_id) AS participants,
           EXISTS (SELECT 1 FROM challenge_participants p WHERE p.challenge_id = c.challenge_id AND p.member_id = ?) AS joined,
           CASE WHEN c.end_date < CURDATE() THEN 'ENDED' WHEN c.start_date > CURDATE() THEN 'UPCOMING' ELSE 'RUNNING' END AS phase
      FROM challenges c LEFT JOIN exercises x ON x.exercise_id = c.exercise_id LEFT JOIN branches b ON b.branch_id = c.branch_id
     ORDER BY phase = 'ENDED', c.end_date`, [user.user_id]);
  const boards = await query(`
    SELECT l.challenge_id, l.member_id, l.member_name, l.score, l.live_rank, p.final_rank, p.final_score
      FROM v_challenge_leaderboard l JOIN challenge_participants p ON p.challenge_id = l.challenge_id AND p.member_id = l.member_id
     ORDER BY l.challenge_id, l.live_rank`);
  for (const c of challenges) c.board = boards.filter((b) => b.challenge_id === c.challenge_id);
  return { challenges, me: user.user_id };
});

export const POST = route(['MEMBER'], async ({ user, body }) => {
  const id = int(body.challengeId, 'Challenge');
  const [c] = await query('SELECT end_date < CURDATE() AS ended FROM challenges WHERE challenge_id = ?', [id]);
  if (!c) throw new ApiError(404, 'Challenge not found.');
  await query('INSERT INTO challenge_participants (challenge_id, member_id, joined_at) VALUES (?, ?, NOW())', [id, user.user_id]);
  return { ok: true, message: 'You joined the challenge.' };
});
