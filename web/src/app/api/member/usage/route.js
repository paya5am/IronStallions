// Start or finish using a machine. Equipment status changes automatically (triggers).
import { route, int, oneOf, optNum } from '@/lib/api';
import { callProc } from '@/lib/mysql';

export const POST = route(['MEMBER'], async ({ user, body }) => {
  const action = oneOf(body.action, ['start', 'end'], 'Action');
  if (action === 'start') {
    const { out } = await callProc('sp_start_usage', [user.user_id, int(body.equipmentId, 'Machine')], ['usage_id']);
    return { ok: true, usageId: out.usage_id };
  }
  const clamp = (v) => (v === null ? null : Math.min(5, Math.max(1, Math.round(v))));
  await callProc('sp_end_usage', [int(body.usageId, 'Usage'), user.user_id, clamp(optNum(body.difficulty)), clamp(optNum(body.comfort))]);
  return { ok: true };
});
