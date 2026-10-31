// End-to-end check of the API layer against a running app (npm run dev) with fresh demo data.
//   node tools/api_smoke_test.mjs              (default http://localhost:3000)
//   node tools/api_smoke_test.mjs http://localhost:3001
// Needs DEMO_SHOW_OTP=true in web/.env.local, because it reads the codes from the responses.
// It changes data (check-ins, payments, a plan upgrade). Re-run 00_run_all.sql afterwards.
const BASE = process.argv[2] || 'http://localhost:3000';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -  ' + extra : ''}`); };

class Client {
  constructor() { this.cookie = ''; }
  async call(method, path, body) {
    const res = await fetch(BASE + path, {
      method, headers: { 'Content-Type': 'application/json', Cookie: this.cookie }, body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    let data = {}; try { data = await res.json(); } catch { /* empty */ }
    return { status: res.status, data };
  }
  async login(phone) {
    const a = await this.call('POST', '/api/auth/request-otp', { phone });
    if (!a.data.demoOtp) throw new Error('DEMO_SHOW_OTP must be true for this test');
    const b = await this.call('POST', '/api/auth/verify-otp', { phone, otp: a.data.demoOtp, deviceId: this.deviceId });
    if (b.data.step === 'EMAIL_OTP') {
      const c = await this.call('POST', '/api/auth/verify-email', { challengeId: b.data.challengeId, otp: b.data.demoOtp, deviceName: 'smoke test' });
      this.deviceId = c.data.deviceId; return c;
    }
    return this.call('POST', '/api/auth/confirm-device', { challengeId: b.data.challengeId, deviceId: this.deviceId });
  }
}

const member = new Client(), member2 = new Client(), silver = new Client(), expired = new Client();
const staff = new Client(), goldStaff = new Client(), trainer = new Client(), admin = new Client();

// --- login and sessions
let r = await member.login('9000001001');
ok('Member logs in (SMS code + email code, new device registered)', r.status === 200 && r.data.role === 'MEMBER');
const intruder = new Client();
r = await intruder.login('9000001001');
ok('Second login for the same account is refused', r.status === 409 && /already logged in/.test(r.data.error), r.data.error);
r = await member.call('GET', '/api/staff/overview');
ok('Member cannot call a staff API', r.status === 403);
ok('Staff logs in', (await staff.login('9000000011')).status === 200);
ok('Gold-branch staff logs in', (await goldStaff.login('9000000012')).status === 200);
ok('Trainer logs in', (await trainer.login('9000000101')).status === 200);
ok('Admin logs in', (await admin.login('9000000001')).status === 200);

// --- QR check-in
r = await member.call('POST', '/api/member/qr');
ok('Member generates a QR code', r.status === 200 && r.data.token?.length === 64, `${r.data.secondsLeft}s left`);
const token = r.data.token;
r = await staff.call('POST', '/api/staff/checkin', { mode: 'qr', token });
ok('Staff scans the QR code: checked in', r.status === 200, r.data.message || r.data.error);
r = await staff.call('POST', '/api/staff/checkin', { mode: 'qr', token });
ok('Same QR code scanned again is refused', r.status === 409 && /already been used/.test(r.data.error), r.data.error);

ok('Silver member logs in', (await silver.login('9000001003')).status === 200);
r = await silver.call('POST', '/api/member/qr');
r = await goldStaff.call('POST', '/api/staff/checkin', { mode: 'qr', token: r.data.token });
ok('Silver member refused at a Gold branch', r.status === 409 && /tier/.test(r.data.error), r.data.error);
ok('Expired member logs in (account still works)', (await expired.login('9000001002')).status === 200);
r = await expired.call('POST', '/api/member/qr');
ok('Expired member gets no QR code', r.status === 409 && /No active plan/.test(r.data.error), r.data.error);

// --- machines, substitution, sets, personal records
r = await member.call('GET', '/api/member/visit');
const branchId = r.data.visit?.branch_id;
ok('Member sees the current visit', !!branchId, r.data.visit?.branch_name);
r = await member.call('GET', `/api/equipment?branchId=${branchId}&status=AVAILABLE`);
const bench = r.data.equipment.find((e) => e.category_name === 'Bench Press Station');
r = await member.call('POST', '/api/member/usage', { action: 'start', equipmentId: bench.equipment_id });
const benchUsage = r.data.usageId;
ok('Member starts the bench', r.status === 200);
r = await member.call('GET', `/api/equipment?branchId=${branchId}`);
ok('Bench is now OCCUPIED', r.data.equipment.find((e) => e.equipment_id === bench.equipment_id).status === 'OCCUPIED');
r = await member.call('GET', `/api/member/substitutes?equipmentId=${bench.equipment_id}`);
ok('Substitutes suggested for the occupied bench', r.status === 200 && Array.isArray(r.data.substitutes), r.data.substitutes?.map((s) => s.name).join(', '));
r = await member.call('POST', '/api/member/sets', { exerciseId: 13, usageId: benchUsage, reps: 5, weight: 47.5 });
ok('Heavier bench set logged and recognised as a personal record', r.status === 200 && r.data.newRecords > 0, JSON.stringify(r.data));
r = await member.call('POST', '/api/member/sets', { exerciseId: 13, reps: 5 });
ok('Set without weight is refused by the database', r.status === 409, r.data.error);
r = await member.call('GET', '/api/member/visit');
const usage = r.data.usages.find((u) => !u.end_time);
r = await member.call('POST', '/api/member/usage', { action: 'end', usageId: usage.usage_id, difficulty: 4, comfort: 5 });
ok('Member finishes and rates the machine', r.status === 200);

// --- plans and billing
r = await silver.call('POST', '/api/member/plans', { action: 'change', planId: 2 });
ok('Same-tier change refused (Silver to Silver Half-Yearly not allowed mid-plan)', r.status === 409, r.data.error);
r = await silver.call('POST', '/api/member/plans', { action: 'change', planId: 7 });
ok('Silver member upgrades to Gold with a pro-rata refund', r.status === 200 && Number(r.data.refund) > 0, r.data.message || r.data.error);
r = await silver.call('GET', '/api/member/invoices');
const goldInvoice = r.data.invoices.find((i) => i.description === 'Gold Half-Yearly');
r = await silver.call('POST', '/api/member/invoices', { invoiceId: goldInvoice.invoice_id, amount: 5000, method: 'UPI' });
ok('Partial online payment accepted', r.status === 200 && r.data.status === 'PARTIAL', r.data.status);
r = await staff.call('POST', '/api/staff/payments', { invoiceId: goldInvoice.invoice_id, amount: 999999, method: 'CASH' });
ok('Overpayment at the desk refused', r.status === 409, r.data.error);
r = await staff.call('POST', '/api/staff/payments', { invoiceId: goldInvoice.invoice_id, amount: 7500, method: 'CASH' });
ok('Remaining balance paid at the desk', r.status === 200 && /PAID/.test(r.data.message), r.data.message);

// --- personal training
r = await member.call('GET', '/api/member/training');
const t = r.data.trainers.find((x) => x.full_name === 'Gaurav Malhotra');
const slot = r.data.slots.find((s) => s.trainer_id === t.trainer_id);
const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const d = new Date(r.data.settings.today + 'T00:00:00'); do { d.setDate(d.getDate() + 1); } while (days[d.getDay()] !== slot.day_of_week);
const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
r = await member.call('POST', '/api/member/training', { action: 'book', availabilityId: slot.availability_id, date, start: slot.slot_start.slice(0, 5), duration: 60 });
ok('Member books a trainer slot', r.status === 200, r.data.message || r.data.error);
ok('Gold member 2 logs in', (await member2.login('9000001012')).status === 200);
r = await member2.call('POST', '/api/member/training', { action: 'book', availabilityId: slot.availability_id, date, start: slot.slot_start.slice(0, 5), duration: 60 });
ok('Same slot and date booked by another member is refused', r.status === 409, r.data.error);

r = await trainer.call('GET', '/api/trainer/overview');
const done = r.data.sessions.find((s) => s.status === 'COMPLETED');
ok('Trainer sees sessions', r.status === 200 && !!done);
r = await trainer.call('PUT', '/api/trainer/sessions/log', { sessionId: done.training_session_id, summary: 'Smoke test log', exercises: [{ name: 'Bench', sets: 3, reps: 5, weight_kg: 50 }], formNotes: 'Elbows in', tags: 'strength' });
ok('Trainer saves a session log (MongoDB)', r.status === 200, r.data.error);
r = await trainer.call('GET', `/api/trainer/sessions/log?sessionId=${done.training_session_id}`);
ok('Session log is read back', r.data.log?.summary === 'Smoke test log');

// --- staff and admin
r = await staff.call('GET', '/api/staff/overview');
ok('Staff live floor lists members inside', r.status === 200 && r.data.inside.length >= 1, `${r.data.inside.length} inside`);
r = await admin.call('GET', '/api/admin/dashboard');
ok('Admin dashboard loads', r.status === 200 && r.data.revenue.length > 0, `${r.data.revenue.length} months of revenue`);
r = await admin.call('GET', '/api/admin/activity?limit=50');
ok('Activity log (MongoDB) has entries', r.status === 200 && r.data.logs.length > 0, `${r.data.logs.length} entries`);
r = await staff.call('PATCH', '/api/admin/settings', { key: 'SESSION_HOURS', value: '5' });
ok('Staff cannot change system settings', r.status === 403);
r = await member.call('POST', '/api/member/visit');
ok('Member checks out', r.status === 200);
r = await member.call('POST', '/api/auth/logout');
r = await intruder.login('9000001001');
ok('After logout the account can log in elsewhere', r.status === 200);

for (const c of [intruder, member2, silver, expired, staff, goldStaff, trainer, admin]) await c.call('POST', '/api/auth/logout');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
