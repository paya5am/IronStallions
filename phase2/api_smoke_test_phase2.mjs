// Checks the Phase 2 API routes against a running app (after Phase 2 is installed).
//   node phase2/api_smoke_test_phase2.mjs [http://localhost:3000]
// Needs DEMO_SHOW_OTP=true. Changes data (a routine, a goal, a challenge). Re-run 00_run_all.sql + 08_phase2.sql afterwards.
const BASE = process.argv[2] || 'http://localhost:3000';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  -  ' + x : ''}`); };
class Client {
  constructor() { this.cookie = ''; }
  async call(method, path, body) {
    const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Cookie: this.cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) this.cookie = set.split(';')[0];
    let data = {}; try { data = await res.json(); } catch { /* empty */ }
    return { status: res.status, data };
  }
  async login(phone) {
    const a = await this.call('POST', '/api/auth/request-otp', { phone });
    const b = await this.call('POST', '/api/auth/verify-otp', { phone, otp: a.data.demoOtp });
    return this.call('POST', '/api/auth/verify-email', { challengeId: b.data.challengeId, otp: b.data.demoOtp, deviceName: 'phase2 test' });
  }
}
const m = new Client(), t = new Client(), a = new Client();
ok('Member logs in', (await m.login('9000001001')).status === 200);
let r = await m.call('POST', '/api/member/routine', { action: 'generate', days: 4 });
ok('Routine builder creates a 4-day routine', r.status === 200, r.data.message || r.data.error);
r = await m.call('GET', '/api/member/routine');
const gen = r.data.templates.find((x) => x.source === 'GENERATED' && x.is_active);
ok('Generated routine covers all 4 days', gen && new Set(gen.items.map((i) => i.day_number)).size === 4, `${gen?.items.length} exercises`);
r = await m.call('POST', '/api/member/routine', { action: 'create', name: 'Test template', days: 2, items: [{ day: 1, exerciseId: 20, sets: 3, reps: 15 }, { day: 2, exerciseId: 24, sets: 3, duration: 60 }] });
ok('Manual template saved', r.status === 200, r.data.error);
r = await m.call('POST', '/api/member/routine', { action: 'create', name: 'Bad', days: 1, items: [{ day: 3, exerciseId: 20, sets: 3, reps: 10 }] });
ok('Template day beyond days-per-week refused by the database', r.status === 409, r.data.error);
r = await m.call('GET', '/api/member/progress');
ok('Progress: progression, volume and muscle groups', r.status === 200 && r.data.progression.length > 0 && r.data.muscles.length === 8);
r = await m.call('POST', '/api/member/goals', { goalType: 'MONTHLY_VISITS', targetValue: 1, targetDate: '2027-01-31' });
r = await m.call('GET', '/api/member/goals');
ok('Goal already met is marked ACHIEVED automatically', r.data.goals.some((g) => g.goal_type === 'MONTHLY_VISITS' && Number(g.target_value) === 1 && g.status === 'ACHIEVED'));
r = await m.call('GET', '/api/member/challenges');
ok('Challenges with live leaderboards', r.status === 200 && r.data.challenges.some((c) => c.board.length > 0));
const open = r.data.challenges.find((c) => !c.joined && c.phase !== 'ENDED');
r = await m.call('POST', '/api/member/challenges', { challengeId: open.challenge_id });
ok('Member joins a challenge', r.status === 200, r.data.error);
r = await m.call('GET', '/api/member/insights');
ok('Insights document generated (MongoDB)', r.status === 200 && r.data.insights.highlights.length > 0, r.data.insights?.headline);
ok('Trainer logs in', (await t.login('9000000101')).status === 200);
r = await t.call('GET', '/api/trainer/clients');
ok('Trainer sees clients with plateau flags', r.status === 200 && r.data.clients.some((c) => c.plateaus > 0));
ok('Admin logs in', (await a.login('9000000001')).status === 200);
r = await a.call('POST', '/api/admin/maintenance-rules', { categoryId: 1, hours: 5 });
r = await a.call('POST', '/api/admin/maintenance-rules', { action: 'run' });
ok('Lowering the treadmill interval creates service jobs', r.status === 200 && /^[1-9]/.test(r.data.message), r.data.message);
r = await a.call('POST', '/api/admin/challenges', { title: 'Test Cup', metric: 'TOTAL_VISITS', startDate: '2026-11-01', endDate: '2026-11-30' });
ok('Admin creates a challenge', r.status === 200, r.data.error);
for (const c of [m, t, a]) await c.call('POST', '/api/auth/logout');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
