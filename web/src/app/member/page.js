'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useApi, useAction, api, Card, Stat, Badge, Alert, PageHead, Loading, Bars, Table, fmtDate, fmtDateTime, hhmm, rupees, recordLabel } from '@/components/ui';

export default function MemberDashboard() {
  const state = useApi('/api/member/overview');
  const { msg, setMsg, run } = useAction();
  const [days, setDays] = useState('');
  const d = state.data;
  if (!d) return <Loading state={state} />;
  const o = d.overview || {};

  const saveDays = async () => {
    const r = await run(() => api.patch('/api/member/profile', { trainingDays: Number(days) }), 'Training days updated.');
    if (r) state.reload();
  };

  return (
    <div className="stack">
      <PageHead title={`Hi, ${o.full_name?.split(' ')[0] || ''}`} subtitle={`Home branch: ${o.home_branch}`}>
        <Link href="/member/check-in"><button className="primary">Get check-in QR</button></Link>
      </PageHead>
      <Alert msg={msg} onClose={() => setMsg(null)} />

      {!o.plan_name && <div className="alert warn">You have no active plan, so you cannot check in. <Link href="/member/plans">Buy a plan</Link>.</div>}
      {Number(d.dues?.overdue) > 0 && <div className="alert bad">You have an overdue invoice. <Link href="/member/billing">Pay now</Link>.</div>}

      <div className="grid g4">
        <Stat label="Plan" value={o.plan_name ? <Badge value={o.tier_name} /> : 'None'}
              hint={o.plan_name ? `${o.plan_name}, until ${fmtDate(o.end_date)}${o.queued_renewal ? ' (renewal queued)' : ''}` : 'Buy a plan to check in'} />
        <Stat label="Current streak" value={`${d.streak?.current_streak ?? 0} days`} hint={`Longest ${d.streak?.longest_streak ?? 0} days`} />
        <Stat label="Visits (30 days)" value={d.streak?.visit_days_last_30 ?? 0} hint={`Target ${o.training_days_per_week} days a week`} />
        <Stat label="Amount due" value={rupees(d.dues?.owed || 0)} hint={<Link href="/member/billing">View invoices</Link>} />
      </div>

      <div className="grid g2">
        <Card title="Right now">
          {d.visit ? (
            <>
              <p>Checked in at <b>{d.visit.branch_name}</b> since {fmtDateTime(d.visit.check_in_time)}.</p>
              <div className="row"><Link href="/member/equipment"><button>Use a machine</button></Link><Link href="/member/workouts"><button>Log sets</button></Link></div>
            </>
          ) : <p className="muted">Not checked in. Show your QR code at the front desk to enter.</p>}
          {d.nextPt && <p style={{ marginTop: 12 }}>Next PT session: <b>{fmtDate(d.nextPt.session_date)} {hhmm(d.nextPt.start_time)}</b> with {d.nextPt.trainer_name} at {d.nextPt.branch_name}.</p>}
        </Card>
        <Card title="Visit days per week">
          <Bars items={(d.weeks || []).map((w) => ({ label: fmtDate(w.week_start).slice(0, 6), value: Number(w.days) }))} height={120} />
        </Card>
      </div>

      {d.plateaus.length > 0 && (
        <Card title="Plateau detected">
          <p className="muted">These exercises have not improved for {d.plateaus[0].window_weeks} weeks. Try a lighter deload week, change rep ranges, or ask your trainer.</p>
          <Table rows={d.plateaus} columns={[
            { key: 'exercise_name', label: 'Exercise' },
            { key: 'best_before', label: 'Best before', num: true, render: (r) => `${r.best_before} kg` },
            { key: 'best_recent', label: 'Best recently', num: true, render: (r) => `${r.best_recent} kg` },
            { key: 'recent_weeks', label: 'Weeks trained', num: true },
          ]} />
        </Card>
      )}

      <div className="grid g2">
        <Card title="Latest personal records" actions={<Link href="/member/workouts">All records</Link>}>
          <Table rows={d.records} empty="Log some sets to start setting records." columns={[
            { key: 'exercise_name', label: 'Exercise' },
            { key: 'record_type', label: 'Record', render: (r) => recordLabel(r.record_type, r.record_value) },
            { key: 'achieved_at', label: 'When', render: (r) => fmtDate(r.achieved_at) },
          ]} />
        </Card>
        <Card title="Training days per week">
          <p className="muted">Used for your weekly routine. Currently <b>{o.training_days_per_week}</b>.</p>
          <div className="row">
            <select value={days || o.training_days_per_week} onChange={(e) => setDays(e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} days</option>)}
            </select>
            <button onClick={saveDays} disabled={!days}>Save</button>
          </div>
        </Card>
      </div>
    </div>
  );
}
