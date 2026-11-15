// Personalised insights: generated from MySQL views, stored as one MongoDB document per member.
import { route } from '@/lib/api';
import { collection } from '@/lib/docs';
import { generateInsights } from '@/lib/insights';

export const GET = route(['MEMBER'], async ({ user }) => {
  const col = await collection('member_insights');
  let doc = await col.findOne({ member_id: user.user_id });
  const stale = !doc || Date.now() - new Date(doc.generated_at).getTime() > 6 * 3600 * 1000;
  if (stale) doc = await generateInsights(user.user_id);
  return { insights: { ...doc, _id: undefined } };
});

export const POST = route(['MEMBER'], async ({ user }) => {
  const doc = await generateInsights(user.user_id);
  return { insights: { ...doc, _id: undefined } };
});
