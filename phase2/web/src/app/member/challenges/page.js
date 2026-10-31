'use client';
import { useApi, useAction, api, Card, Badge, Alert, PageHead, Loading, Table, fmtDate } from '@/components/ui';

const unit = (m, v) => (m === 'EXERCISE_MAX_WEIGHT' ? `${v} kg` : m === 'TOTAL_VOLUME' ? `${Math.round(v).toLocaleString('en-IN')} kg` : `${Number(v)} day${Number(v) === 1 ? '' : 's'}`);

export default function ChallengesPage() {
  const state = useApi('/api/member/challenges');
  const { msg, setMsg, busy, run } = useAction();
  if (!state.data) return <Loading state={state} />;
  const join = async (c) => { const r = await run(() => api.post('/api/member/challenges', { challengeId: c.challenge_id })); if (r) state.reload(); };
  return (
    <div className="stack">
      <PageHead title="Challenges" subtitle="Rankings are calculated live from visits and logged sets." />
      <Alert msg={msg} onClose={() => setMsg(null)} />
      <div className="grid g2">
        {state.data.challenges.map((c) => (
          <Card key={c.challenge_id} title={c.title} actions={<Badge value={c.phase} tone={c.phase === 'RUNNING' ? 'ok' : c.phase === 'UPCOMING' ? 'info' : ''} />}>
            <p className="muted small">{c.description ? `${c.description}. ` : ''}{c.branch_name}. {fmtDate(c.start_date)} to {fmtDate(c.end_date)}. {c.participants} taking part.</p>
            <Table rows={c.board.slice(0, 5)} empty="No participants yet." columns={[
              { key: 'rank', label: '#', render: (b) => b.final_rank ?? b.live_rank },
              { key: 'member_name', label: 'Member', render: (b) => (b.member_id === state.data.me ? <b>{b.member_name} (you)</b> : b.member_name) },
              { key: 'score', label: 'Score', num: true, render: (b) => unit(c.metric, b.final_score ?? b.score) },
            ]} />
            {!c.joined && c.phase !== 'ENDED' && <button className="primary small" style={{ marginTop: 8 }} disabled={busy} onClick={() => join(c)}>Join</button>}
          </Card>
        ))}
      </div>
    </div>
  );
}
