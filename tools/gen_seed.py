"""
Generates database/mysql/05_seed.sql.

All dates are written relative to @base, which 05_seed.sql sets to the day the
script is run (never earlier than 2026-10-19). Re-running 00_run_all.sql on any
day therefore produces fresh, recent demo data. Active demo plans run well past
2026-12-31, so the data stays usable until then even without a re-run.

Offsets: day 0 = the day of loading, -1 = yesterday, etc.
"""
import random, hashlib, uuid, os
from collections import defaultdict

R = random.Random(20261019)
OUT = os.path.join(os.path.dirname(__file__), '..', 'database', 'mysql', '05_seed.sql')
L = []                       # output lines
def w(s=''): L.append(s)
def q(s): return "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"
def D(n): return f"(@base + INTERVAL {n} DAY)"
def DT(n, hhmmss): return f"TIMESTAMP(@base + INTERVAL {n} DAY, '{hhmmss}')"
def DTm(n, minutes):  # minutes after midnight, may exceed a day
    n += minutes // 1440; minutes %= 1440
    return DT(n, f"{minutes//60:02d}:{minutes%60:02d}:00"), (n, minutes)
def uid(seed): return str(uuid.UUID(hashlib.md5(seed.encode()).hexdigest()))
def tok(seed): return hashlib.sha256(seed.encode()).hexdigest()

HIST = 63          # days of visit history
# ---------------------------------------------------------------------------
TIERS = [(1, 'SILVER', 1), (2, 'GOLD', 2), (3, 'DIAMOND', 3)]
BR = [  # id, name, tier, address, phone, open, close
 (1, 'Jayanagar', 1, '24, 11th Main Road, 4th Block, Jayanagar', '08041100001', '05:30', '22:30'),
 (2, 'Malleshwaram', 1, '7, Sampige Road, 8th Cross, Malleshwaram', '08041100002', '05:30', '22:30'),
 (3, 'Banashankari', 1, '112, Outer Ring Road, 2nd Stage, Banashankari', '08041100003', '05:30', '22:30'),
 (4, 'Rajajinagar', 1, '3, Dr Rajkumar Road, 1st Block, Rajajinagar', '08041100004', '05:30', '22:30'),
 (5, 'Yelahanka', 1, '58, Bazaar Street, Old Town, Yelahanka', '08041100005', '05:30', '22:30'),
 (6, 'Koramangala', 2, '80 Feet Road, 6th Block, Koramangala', '08041100006', '05:00', '23:00'),
 (7, 'HSR Layout', 2, '27th Main Road, Sector 1, HSR Layout', '08041100007', '05:00', '23:00'),
 (8, 'Whitefield', 2, 'ITPL Main Road, Hoodi, Whitefield', '08041100008', '05:00', '23:00'),
 (9, 'Indiranagar', 3, '100 Feet Road, HAL 2nd Stage, Indiranagar', '08041100009', '05:00', '23:30'),
 (10, 'Lavelle Road', 3, '14, Lavelle Road, Ashok Nagar', '08041100010', '05:00', '23:30'),
]
BR_TIER = {b[0]: b[2] for b in BR}
def hm(s): h, m = s.split(':'); return int(h) * 60 + int(m)

# users ------------------------------------------------------------------------
users = []   # (id, name, phone, email, role, created_offset)
def add_user(name, phone, role, created):
    uid_ = len(users) + 1
    email = name.lower().replace(' ', '.') + f'.{uid_}@example.com'
    users.append((uid_, name, phone, email, role, created))
    return uid_

ADMIN1 = add_user('Arjun Rao', '9000000001', 'ADMIN', -400)
ADMIN2 = add_user('Meera Nair', '9000000002', 'ADMIN', -380)

STAFF_DEF = [  # phone, name, branch, designation, shift
 ('9000000011', 'Kavya Shetty', 1, 'Front Desk Executive', ('05:30', '14:00')),
 ('9000000012', 'Rahul Menon', 6, 'Front Desk Executive', ('05:00', '14:00')),
 ('9000000013', 'Sneha Iyer', 2, 'Front Desk Executive', ('05:30', '14:00')),
 ('9000000014', 'Vikram Gowda', 3, 'Front Desk Executive', ('14:00', '22:30')),
 ('9000000015', 'Anjali Desai', 4, 'Front Desk Executive', ('05:30', '14:00')),
 ('9000000016', 'Suresh Babu', 5, 'Front Desk Executive', ('14:00', '22:30')),
 ('9000000017', 'Pooja Hegde', 7, 'Front Desk Executive', ('05:00', '14:00')),
 ('9000000018', 'Imran Khan', 8, 'Front Desk Executive', ('14:00', '23:00')),
 ('9000000019', 'Nisha Reddy', 9, 'Front Desk Executive', ('05:00', '14:00')),
 ('9000000020', 'Deepak Joshi', 10, 'Front Desk Executive', ('14:00', '23:30')),
 ('9000000021', 'Lakshmi Prasad', 6, 'Facility Manager', ('09:00', '18:00')),
 ('9000000022', 'Farhan Ali', 9, 'Facility Manager', ('09:00', '18:00')),
]
STAFF = {}           # user_id -> branch
STAFF_BY_BRANCH = defaultdict(list)
for ph, nm, br, des, sh in STAFF_DEF:
    u = add_user(nm, ph, 'STAFF', -300 + R.randint(0, 100))
    STAFF[u] = (br, des, sh); STAFF_BY_BRANCH[br].append(u)

TRAINER_DEF = [  # phone, name, branch, specialization, years, rate
 ('9000000101', 'Aditya Verma', 6, 'Strength and Conditioning', 8, 1200),
 ('9000000102', 'Divya Krishnan', 1, 'Weight Loss and Cardio', 5, 700),
 ('9000000103', 'Manoj Pillai', 2, 'Functional Training', 6, 750),
 ('9000000104', 'Ritika Sharma', 3, 'Yoga and Mobility', 4, 600),
 ('9000000105', 'Sanjay Patil', 4, 'Bodybuilding', 9, 800),
 ('9000000106', 'Asha Thomas', 5, 'Senior Fitness', 7, 650),
 ('9000000107', 'Karthik Subramanian', 7, 'Powerlifting', 10, 1100),
 ('9000000108', 'Neha Bansal', 8, 'HIIT and Endurance', 6, 1000),
 ('9000000109', 'Rajesh Naidu', 9, 'Athletic Performance', 12, 2200),
 ('9000000110', 'Tanya Fernandes', 10, 'Pilates and Core', 8, 2000),
 ('9000000111', 'Gaurav Malhotra', 6, 'Hypertrophy', 5, 1000),
 ('9000000112', 'Shreya Kapoor', 9, 'Rehabilitation', 7, 1800),
]
TRAINERS = {}        # user_id -> (branch, rate)
for ph, nm, br, sp, yrs, rate in TRAINER_DEF:
    u = add_user(nm, ph, 'TRAINER', -500 + R.randint(0, 150))
    TRAINERS[u] = (br, sp, yrs, rate)
T_BY_PHONE = {d[0]: i for i, d in zip(TRAINERS.keys(), TRAINER_DEF)}

MEMBER_NAMES = ['Rohan Kulkarni', 'Priya Hebbar', 'Siddharth Rao', 'Ananya Bhat', 'Nikhil Shenoy', 'Ishita Ghosh',
 'Varun Acharya', 'Meghana Gowda', 'Aakash Jain', 'Swathi Murthy', 'Kunal Mehta', 'Ritu Agarwal', 'Harsha Vardhan',
 'Pallavi Joshi', 'Amit Saxena', 'Bhavana Reddy', 'Chetan Kumar', 'Divya Ramesh', 'Eshan Kapoor', 'Fathima Banu',
 'Girish Hegde', 'Hema Latha', 'Irfan Sheikh', 'Jyothi Naik', 'Kiran Rao', 'Lavanya Iyengar', 'Mohan Das',
 'Nandini Pai', 'Omkar Deshpande', 'Preethi Srinivas']
MEM = {}   # user_id -> dict
MEMBER_IDS = []
for i, nm in enumerate(MEMBER_NAMES):
    u = add_user(nm, f'90000010{i+1:02d}', 'MEMBER', 0)
    MEMBER_IDS.append(u)
M = MEMBER_IDS  # M[0] = member A (9000001001)

# plans ------------------------------------------------------------------------
DURS = [('Monthly', 30), ('Quarterly', 90), ('Half-Yearly', 180), ('Annual', 365)]
PRICE = {1: [1500, 4000, 7500, 14000], 2: [2500, 6750, 12500, 23000], 3: [6000, 16500, 31000, 58000]}
PLANS = {}   # (tier, durname) -> (plan_id, dur, price)
pid = 0
for t in (1, 2, 3):
    for k, (dn, dd) in enumerate(DURS):
        pid += 1
        PLANS[(t, dn)] = (pid, dd, PRICE[t][k])
TNAME = {1: 'Silver', 2: 'Gold', 3: 'Diamond'}

# member profiles: home branch, plan history -----------------------------------------
# each history item: (tier, durname, start_offset, status, closed_offset)
# status computed later; 'X' = closed type set explicitly
PROF = {}
def prof(idx, home, history, days=5, pt=None):
    PROF[M[idx]] = dict(home=home, hist=history, days=days)

prof(0,  6, [(2, 'Quarterly', -235, None), (2, 'Annual', -145, None)], 5)               # A: Gold annual, active
prof(1,  1, [(1, 'Quarterly', -120, None)], 4)                                            # B: expired
prof(2,  1, [(1, 'Half-Yearly', -50, None)], 4)                                           # C: Silver active
prof(3,  6, [(2, 'Annual', -120, None)], 5)                                                # D: Gold, squat plateau
prof(4,  9, [(3, 'Annual', -200, None)], 6)                                                # E: Diamond
prof(5,  7, [(2, 'Quarterly', -40, None), (2, 'Quarterly', 50, 'UPCOMING')], 4)            # F: active + queued renewal
prof(6,  2, [(1, 'Quarterly', -60, ('UPGRADED', -30)), (2, 'Half-Yearly', -30, None)], 5) # G: upgraded
prof(7,  8, [(2, 'Quarterly', -80, ('DOWNGRADED', -45)), (1, 'Half-Yearly', -45, None)], 3) # H: downgraded
prof(8,  3, [(2, 'Monthly', -35, ('CANCELLED', -20))], 3)                                  # I: cancelled, no plan
prof(9,  4, [(1, 'Annual', -10, None)], 4)                                                 # J: partial payment
prof(10, 10, [(3, 'Half-Yearly', -70, None)], 5)
prof(11, 6, [(2, 'Half-Yearly', -90, None)], 5)
prof(12, 5, [(1, 'Annual', -150, None)], 3)
prof(13, 7, [(2, 'Annual', -60, None)], 4)
prof(14, 1, [(1, 'Monthly', -15, None)], 3)                                                # unpaid -> overdue
prof(15, 9, [(3, 'Quarterly', -170, None), (3, 'Annual', -80, None)], 6)
prof(16, 2, [(1, 'Half-Yearly', -100, None)], 4)
prof(17, 8, [(2, 'Half-Yearly', -55, None)], 5)
prof(18, 3, [(1, 'Quarterly', -150, None), (1, 'Quarterly', -60, None)], 4)                # active till ~+29, renew? no
prof(19, 6, [(2, 'Annual', -30, None)], 5)
prof(20, 4, [(1, 'Monthly', -100, None)], 3)                                               # long expired
prof(21, 10, [(3, 'Annual', -45, None)], 5)
prof(22, 5, [(1, 'Half-Yearly', -160, None)], 3)                                           # active till ~+19
prof(23, 7, [(2, 'Monthly', -20, None)], 4)
prof(24, 1, [(1, 'Annual', -300, None)], 4)
prof(25, 6, [(2, 'Quarterly', -95, None)], 4)                                              # expired recently
prof(26, 2, [(1, 'Half-Yearly', -25, None)], 3)
prof(27, 9, [(3, 'Half-Yearly', -110, None)], 5)
prof(28, 8, [(2, 'Annual', -75, None)], 4)
prof(29, 3, [(1, 'Quarterly', -20, None)], 3)

for i, mid in enumerate(M):
    first = min(h[2] for h in PROF[mid]['hist'])
    u = users[mid - 1]; users[mid - 1] = (u[0], u[1], u[2], u[3], u[4], first - 1)

# compute subscription rows ----------------------------------------------------------
SUBS = []  # dict rows in insertion order
for mid in M:
    p = PROF[mid]; prev = None
    for (tier, dn, start, extra) in p['hist']:
        plan_id, dur, price = PLANS[(tier, dn)]
        end = start + dur - 1
        closed = None
        if extra == 'UPCOMING':
            status = 'UPCOMING'
        elif isinstance(extra, tuple):
            status, closed = extra
        else:
            status = 'ACTIVE' if start <= 0 <= end else ('EXPIRED' if end < 0 else 'UPCOMING')
        cov_end = end if closed is None else closed - 1
        row = dict(id=len(SUBS) + 1, member=mid, plan=plan_id, tier=tier, dur=dur, price=price, start=start,
                   end=end, status=status, closed=closed, prev=prev, cov_end=cov_end)
        SUBS.append(row); prev = row['id']
for s in SUBS:
    s['issue'] = min(s['start'], 0)
    s['due'] = s['issue'] + 7

def coverage(mid, day):
    """tier rank covering a given day offset"""
    best = None
    for s in SUBS:
        if s['member'] == mid and s['start'] <= day <= s['cov_end']:
            best = max(best or 0, s['tier'])
    return best

# equipment --------------------------------------------------------------------------
CATS = [  # id, name, group, desc
 (1, 'Treadmill', 'CARDIO', 'Motorised running machine'),
 (2, 'Exercise Bike', 'CARDIO', 'Stationary upright or recumbent bike'),
 (3, 'Rowing Machine', 'CARDIO', 'Air or magnetic rower'),
 (4, 'Elliptical Trainer', 'CARDIO', 'Low-impact cross trainer'),
 (5, 'Leg Press', 'STRENGTH_MACHINE', 'Plate-loaded 45-degree leg press'),
 (6, 'Chest Press Machine', 'STRENGTH_MACHINE', 'Seated selectorised chest press'),
 (7, 'Lat Pulldown', 'STRENGTH_MACHINE', 'Cable lat pulldown station'),
 (8, 'Cable Station', 'STRENGTH_MACHINE', 'Adjustable dual cable column'),
 (9, 'Smith Machine', 'STRENGTH_MACHINE', 'Guided barbell rack'),
 (10, 'Leg Extension', 'STRENGTH_MACHINE', 'Seated leg extension'),
 (11, 'Shoulder Press Machine', 'STRENGTH_MACHINE', 'Seated selectorised shoulder press'),
 (12, 'Bench Press Station', 'FREE_WEIGHT', 'Flat bench with barbell and rack'),
 (13, 'Squat Rack', 'FREE_WEIGHT', 'Power rack with barbell'),
 (14, 'Dumbbell Rack', 'FREE_WEIGHT', 'Dumbbells 2.5 to 40 kg with bench'),
]
CAT_MUSCLE = {1: 'CARDIO', 2: 'CARDIO', 3: 'CARDIO', 4: 'CARDIO', 5: 'LEGS', 6: 'CHEST', 7: 'BACK', 8: 'BACK',
              9: 'LEGS', 10: 'LEGS', 11: 'SHOULDERS', 12: 'CHEST', 13: 'LEGS', 14: 'ARMS'}
EQ = []   # (id, branch, cat, name, muscle, purchase_offset, status)
LAYOUT = {1: [1, 1, 2, 5, 6, 6, 7, 8, 12, 13, 14],
          2: [1, 1, 2, 3, 5, 6, 6, 7, 8, 10, 11, 12, 13, 14],
          3: [1, 1, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10, 11, 12, 13, 14]}
for b in BR:
    count = defaultdict(int)
    for c in LAYOUT[b[2]]:
        count[c] += 1
        name = f"{CATS[c-1][1]} #{count[c]}"
        EQ.append([len(EQ) + 1, b[0], c, name, CAT_MUSCLE[c], -R.randint(300, 1500), 'AVAILABLE'])
# one retired machine (an extra old treadmill at Jayanagar)
EQ.append([len(EQ) + 1, 1, 1, 'Treadmill #3 (old)', 'CARDIO', -2400, 'RETIRED'])
RETIRED = {EQ[-1][0]}
EQ_BY_BRANCH_CAT = defaultdict(list)
for e in EQ:
    if e[6] != 'RETIRED':
        EQ_BY_BRANCH_CAT[(e[1], e[2])].append(e[0])
EQ_INFO = {e[0]: e for e in EQ}

# exercises --------------------------------------------------------------------------
EX = [  # id, name, muscle, cat, measure
 (1, 'Treadmill Run', 'CARDIO', 1, 'TIME_DISTANCE'), (2, 'Stationary Cycling', 'CARDIO', 2, 'TIME_DISTANCE'),
 (3, 'Rowing', 'FULL_BODY', 3, 'TIME_DISTANCE'), (4, 'Elliptical Session', 'CARDIO', 4, 'TIME_DISTANCE'),
 (5, 'Leg Press', 'LEGS', 5, 'WEIGHT_REPS'), (6, 'Machine Chest Press', 'CHEST', 6, 'WEIGHT_REPS'),
 (7, 'Lat Pulldown', 'BACK', 7, 'WEIGHT_REPS'), (8, 'Seated Cable Row', 'BACK', 8, 'WEIGHT_REPS'),
 (9, 'Cable Triceps Pushdown', 'ARMS', 8, 'WEIGHT_REPS'), (10, 'Smith Machine Squat', 'LEGS', 9, 'WEIGHT_REPS'),
 (11, 'Leg Extension', 'LEGS', 10, 'WEIGHT_REPS'), (12, 'Machine Shoulder Press', 'SHOULDERS', 11, 'WEIGHT_REPS'),
 (13, 'Barbell Bench Press', 'CHEST', 12, 'WEIGHT_REPS'), (14, 'Barbell Back Squat', 'LEGS', 13, 'WEIGHT_REPS'),
 (15, 'Deadlift', 'BACK', 13, 'WEIGHT_REPS'), (16, 'Dumbbell Curl', 'ARMS', 14, 'WEIGHT_REPS'),
 (17, 'Dumbbell Shoulder Press', 'SHOULDERS', 14, 'WEIGHT_REPS'), (18, 'Dumbbell Lunge', 'LEGS', 14, 'WEIGHT_REPS'),
 (19, 'Incline Dumbbell Press', 'CHEST', 14, 'WEIGHT_REPS'), (20, 'Push-up', 'CHEST', None, 'REPS_ONLY'),
 (21, 'Pull-up', 'BACK', None, 'REPS_ONLY'), (22, 'Bodyweight Squat', 'LEGS', None, 'REPS_ONLY'),
 (23, 'Crunch', 'CORE', None, 'REPS_ONLY'), (24, 'Plank', 'CORE', None, 'TIME_DISTANCE'),
 (25, 'Burpee', 'FULL_BODY', None, 'REPS_ONLY'),
]
EX_BY_CAT = defaultdict(list)
for e in EX:
    if e[3]: EX_BY_CAT[e[3]].append(e)
BASE_W = {5: 80, 6: 30, 7: 35, 8: 30, 9: 15, 10: 40, 11: 20, 12: 20, 13: 40, 14: 50, 15: 60, 16: 8, 17: 10, 18: 10, 19: 12}

# closures (relative) -------------------------------------------------------------------
CLOSURES = [  # branch or None, offset, reason, by
 (3, -50, 'Electrical rewiring', ADMIN1), (5, -44, 'Flooring replacement', ADMIN1),
 (None, -70, 'Festival holiday (all branches)', ADMIN1), (8, -33, 'Water supply repair', ADMIN2),
 (2, -26, 'Annual deep cleaning', ADMIN2), (10, -19, 'Private corporate event', ADMIN1),
 (4, -12, 'Pest control', ADMIN2), (7, 24, 'Annual deep cleaning', ADMIN1),
 (5, 41, 'Equipment installation', ADMIN2), (3, 58, 'Annual deep cleaning', ADMIN1),
]
def closed(branch, day):
    return any(c[1] == day and (c[0] is None or c[0] == branch) for c in CLOSURES)

# trainer slots ----------------------------------------------------------------------
DOWS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
SLOT_PATTERNS = [[('MON', '07:00', '09:00'), ('WED', '18:00', '20:00'), ('SAT', '08:00', '10:00')],
                 [('TUE', '06:30', '08:30'), ('THU', '19:00', '21:00'), ('SUN', '09:00', '11:00')],
                 [('MON', '17:00', '19:00'), ('FRI', '07:00', '09:00'), ('SAT', '16:00', '18:00')]]
SLOTS = []  # (id, trainer, dow, start, end, active)
for k, t in enumerate(TRAINERS):
    for dow, s, e in SLOT_PATTERNS[k % 3]:
        SLOTS.append((len(SLOTS) + 1, t, dow, s, e, True))
SLOTS.append((len(SLOTS) + 1, list(TRAINERS)[0], 'FRI', '18:00', '20:00', False))   # a retired slot
SLOTS_BY_T = defaultdict(list)
for s in SLOTS:
    if s[5]: SLOTS_BY_T[s[1]].append(s)

# PT sessions: (member, trainer, slot, n_intended, status) -------------------------------
TA = T_BY_PHONE['9000000101']
PT = []
def add_pt(member, trainer, slot_idx, n, status, minutes=60):
    PT.append(dict(member=member, trainer=trainer, slot=SLOTS_BY_T[trainer][slot_idx], n=n, status=status, dur=minutes))
# Member A and D train with Aditya (Gold, Koramangala)
for n in (-56, -42, -28, -14):
    add_pt(M[0], TA, 0, n, 'COMPLETED')
add_pt(M[0], TA, 0, 14, 'SCHEDULED')
for n in (-49, -35, -21, -7):
    add_pt(M[3], TA, 1, n, 'COMPLETED' if n != -35 else 'NO_SHOW')
add_pt(M[3], TA, 1, 21, 'SCHEDULED')
add_pt(M[11], TA, 2, -30, 'COMPLETED'); add_pt(M[11], TA, 2, -16, 'CANCELLED'); add_pt(M[11], TA, 2, 9, 'SCHEDULED')
add_pt(M[19], TA, 2, -9, 'COMPLETED')
TG = T_BY_PHONE['9000000111']
add_pt(M[19], TG, 0, -23, 'COMPLETED'); add_pt(M[25], TG, 1, -60, 'COMPLETED'); add_pt(M[0], TG, 2, -63, 'COMPLETED', 45)
# Silver trainers with silver members
TD = T_BY_PHONE['9000000102']
add_pt(M[2], TD, 0, -40, 'COMPLETED'); add_pt(M[2], TD, 0, -26, 'COMPLETED'); add_pt(M[2], TD, 0, 12, 'SCHEDULED')
add_pt(M[14], TD, 1, -8, 'COMPLETED', 45); add_pt(M[24], TD, 2, -20, 'CANCELLED')
TM = T_BY_PHONE['9000000103']
add_pt(M[6], TM, 0, -45, 'COMPLETED'); add_pt(M[16], TM, 1, -30, 'COMPLETED'); add_pt(M[26], TM, 2, -10, 'NO_SHOW')
TS = T_BY_PHONE['9000000105']
add_pt(M[9], TS, 0, -2, 'COMPLETED'); add_pt(M[9], TS, 0, 16, 'SCHEDULED')
# Diamond
TR = T_BY_PHONE['9000000109']
add_pt(M[4], TR, 0, -50, 'COMPLETED'); add_pt(M[4], TR, 0, -36, 'COMPLETED'); add_pt(M[4], TR, 0, -22, 'COMPLETED')
add_pt(M[4], TR, 0, 20, 'SCHEDULED'); add_pt(M[15], TR, 1, -18, 'COMPLETED'); add_pt(M[27], TR, 2, -11, 'COMPLETED')
TT = T_BY_PHONE['9000000110']
add_pt(M[10], TT, 1, -25, 'COMPLETED'); add_pt(M[21], TT, 2, -12, 'COMPLETED'); add_pt(M[21], TT, 2, 11, 'CANCELLED')
TK = T_BY_PHONE['9000000107']
add_pt(M[5], TK, 0, -29, 'COMPLETED'); add_pt(M[13], TK, 1, -15, 'COMPLETED'); add_pt(M[17], TK, 2, -6, 'COMPLETED')

# validate PT sessions against plan coverage, tier, closures, spacing
for p in PT:
    tb = TRAINERS[p['trainer']][0]
    for day in range(p['n'] - 6, p['n'] + 1):
        r = coverage(p['member'], day)
        assert r is not None and r >= BR_TIER[tb], ('pt coverage', p, day)
        assert not closed(tb, day), ('pt closure', p)
for i, a in enumerate(PT):
    for b in PT[i + 1:]:
        if a['member'] == b['member'] or a['slot'][0] == b['slot'][0]:
            assert abs(a['n'] - b['n']) >= 7, ('pt spacing', a, b)

# devices ---------------------------------------------------------------------------
DEV = {u[0]: uid('device-' + str(u[0])) for u in users}

# visits ------------------------------------------------------------------------------
# preferences: comfort per (member, category)
PREF = {(m, c): R.randint(2, 5) for m in M for c in range(1, 15)}
busy = defaultdict(list)          # equipment -> [(start_abs, end_abs)]
def abs_min(n, mins): return n * 1440 + mins
def free(eq, a, b): return all(b <= s or a >= e for s, e in busy[eq])

# open faults: machine id -> offset from which it is out of action
OPEN_FAULT = {}
VISITS = []   # dict(member, branch, n, in_min, out_min, auto, method, staff)
def plan_visits(mid):
    p = PROF[mid]
    if mid == M[0]:
        days = sorted(set(list(range(-6, 0)) + [d for d in range(-HIST, -6) if R.random() < 0.62]))
    else:
        rate = p['days'] / 7.0 * 0.85
        days = [d for d in range(-HIST, 0) if R.random() < rate]
    out = []
    for d in days:
        r = coverage(mid, d)
        if r is None: continue
        home = p['home']
        if R.random() < 0.15:
            options = [b[0] for b in BR if b[2] <= r and b[0] != home]
            br = R.choice(options) if options else home
        else:
            br = home
        if BR_TIER[br] > r:
            br = R.choice([b[0] for b in BR if b[2] <= r])
        if closed(br, d): continue
        out.append((d, br))
    return out

for mid in M:
    for d, br in plan_visits(mid):
        b = BR[br - 1]
        start = R.choice([R.randint(hm('06:00'), hm('09:30')), R.randint(hm('17:00'), hm('20:30'))])
        auto = R.random() < 0.04
        dur = 180 if auto else R.randint(50, 110)
        method = 'STAFF' if R.random() < 0.25 else 'QR'
        staff = R.choice(STAFF_BY_BRANCH[br]) if method == 'STAFF' else None
        VISITS.append(dict(member=mid, branch=br, n=d, in_min=start, out_min=start + dur, auto=auto,
                           method=method, staff=staff))
VISITS.sort(key=lambda v: (v['n'], v['in_min']))

# workouts per visit ---------------------------------------------------------------------
def weight_for(mid, ex_id, d):
    base = BASE_W[ex_id] * (0.8 + 0.4 * ((mid * 7 + ex_id) % 10) / 10)
    plateau = (mid == M[0] and ex_id == 13) or (mid == M[3] and ex_id == 14)
    weeks = (d + HIST) / 7.0
    if plateau:
        weeks = min(weeks, 4.0)   # stops improving five weeks ago
    w_ = base + 2.5 * int(weeks)
    return round(w_ / 2.5) * 2.5

FAV = {mid: R.sample([5, 6, 7, 8, 10, 11, 12, 13, 14], 5) for mid in M}
FAV[M[0]] = [12, 6, 7, 5, 14]
FAV[M[3]] = [13, 5, 7, 12, 8]

USAGES = []   # dict
SETS = []     # dict(visit_idx, ex, usage_idx, num, reps, weight, dur, dist, abs_time)
for vi, v in enumerate(VISITS):
    br, d = v['branch'], v['n']
    t = v['in_min'] + 5
    endv = v['out_min'] - 3 if not v['auto'] else v['in_min'] + 100
    cats = [R.choice([1, 2])] + R.sample(FAV[v['member']], 3)
    if v['member'] in (M[0], M[3]):
        cats = [1] + FAV[v['member']][:3]
    for c in cats:
        length = 15 if c in (1, 2, 3, 4) else R.randint(9, 13)
        if t + length > endv: break
        cands = [e for e in EQ_BY_BRANCH_CAT.get((br, c), [])
                 if free(e, abs_min(d, t), abs_min(d, t + length))
                 and not (e in OPEN_FAULT and d >= OPEN_FAULT[e])]
        if not cands:
            t += 2; continue
        eq = cands[0]
        busy[eq].append((abs_min(d, t), abs_min(d, t + length)))
        ui = len(USAGES)
        USAGES.append(dict(eq=eq, member=v['member'], visit=vi, n=d, s=t, e=t + length,
                           diff=R.randint(2, 4) if R.random() < 0.8 else None,
                           comf=min(5, max(1, PREF[(v['member'], c)] + R.choice([-1, 0, 0, 1]))) if R.random() < 0.8 else None))
        if c in (1, 2, 3, 4):
            ex = EX_BY_CAT[c][0]
            dur_s = (length - 2) * 60
            SETS.append(dict(visit=vi, ex=ex[0], usage=ui, num=1, reps=None, weight=None, dur=dur_s,
                             dist=int(dur_s * R.uniform(2.2, 3.2)) if c in (1, 2) else int(dur_s * 3.5),
                             n=d, m=t + 1))
        else:
            exs = EX_BY_CAT[c]
            ex = exs[0] if v['member'] in (M[0], M[3]) else R.choice(exs)
            wgt = weight_for(v['member'], ex[0], d)
            for k in range(3):
                SETS.append(dict(visit=vi, ex=ex[0], usage=ui, num=k + 1, reps=R.choice([8, 10, 12]) if k < 2 else 8,
                                 weight=wgt if k < 2 else wgt - 2.5 if wgt > 5 else wgt,
                                 dur=None, dist=None, n=d, m=t + 2 + 3 * k))
        t += length + 2
    # bodyweight finisher
    if t + 6 <= endv and R.random() < 0.6:
        ex = R.choice([20, 21, 22, 23, 24, 25])
        for k in range(2):
            if ex == 24:
                SETS.append(dict(visit=vi, ex=ex, usage=None, num=k + 1, reps=None, weight=None,
                                 dur=R.choice([45, 60, 75, 90]), dist=None, n=d, m=t + 1 + 2 * k))
            else:
                SETS.append(dict(visit=vi, ex=ex, usage=None, num=k + 1, reps=R.randint(10, 25), weight=None,
                                 dur=None, dist=None, n=d, m=t + 1 + 2 * k))

# maintenance -------------------------------------------------------------------------
def eq_at(branch, cat, k=0): return EQ_BY_BRANCH_CAT[(branch, cat)][k]
MAINT = [  # eq, type, issue, reporter, rep, start, resolved, cost, status
 (eq_at(1, 1, 1), 'FAULT', 'Belt slipping at high speed', STAFF_BY_BRANCH[1][0], -58, -57, -55, 1800, 'RESOLVED'),
 (eq_at(6, 5), 'FAULT', 'Seat adjustment pin broken', M[0], -47, -46, -46, 650, 'RESOLVED'),
 (eq_at(9, 3), 'SCHEDULED_SERVICE', 'Service due: 500 hours of use', None, -40, -39, -39, 2500, 'RESOLVED'),
 (eq_at(7, 8), 'FAULT', 'Cable frayed on left column', STAFF_BY_BRANCH[7][0], -35, -34, -32, 3200, 'RESOLVED'),
 (eq_at(2, 2), 'SCHEDULED_SERVICE', 'Service due: 400 hours of use', None, -30, -30, -29, 1200, 'RESOLVED'),
 (eq_at(10, 4), 'FAULT', 'Display not powering on', STAFF_BY_BRANCH[10][0], -27, -26, -24, 4500, 'RESOLVED'),
 (eq_at(3, 6, 1), 'FAULT', 'Weight stack sticking', M[2], -21, -20, -20, 900, 'RESOLVED'),
 (eq_at(8, 1), 'SCHEDULED_SERVICE', 'Service due: 600 hours of use', None, -18, -17, -17, 2200, 'RESOLVED'),
 (eq_at(6, 13), 'FAULT', 'J-hook loose on right side', STAFF_BY_BRANCH[6][0], -12, -11, -11, 500, 'RESOLVED'),
 (eq_at(4, 7), 'FAULT', 'Pulldown bar cable worn', STAFF_BY_BRANCH[4][0], -9, -8, -6, 1500, 'RESOLVED'),
 (eq_at(1, 6, 1), 'FAULT', 'Seat cushion torn', STAFF_BY_BRANCH[1][0], -4, None, None, None, 'REPORTED'),
 (eq_at(6, 6, 1), 'FAULT', 'Handle grip loose', STAFF_BY_BRANCH[6][0], -2, None, None, None, 'REPORTED'),
 (eq_at(9, 1), 'SCHEDULED_SERVICE', 'Service due: 600 hours of use', None, -3, -1, None, None, 'IN_PROGRESS'),
 (eq_at(7, 1), 'SCHEDULED_SERVICE', 'Service due: 600 hours of use', None, -1, None, None, None, 'REPORTED'),
 (eq_at(5, 2), 'FAULT', 'Pedal crank noise', STAFF_BY_BRANCH[5][0], -15, -14, -13, 700, 'RESOLVED'),
]
# machines out of action must not appear in usage during the outage: drop such usages
outages = []
for (eq, typ, iss, rep, r, s, res, cost, st) in MAINT:
    off_from = r if typ == 'FAULT' else (s if s is not None else None)
    if off_from is None: continue
    off_to = res if res is not None else 10**6
    outages.append((eq, off_from, off_to))
def in_outage(u):
    return any(u['eq'] == eq and a <= u['n'] <= b for eq, a, b in outages)
drop = {i for i, u in enumerate(USAGES) if in_outage(u)}
keep_map = {}
NEW_USAGES = []
for i, u in enumerate(USAGES):
    if i in drop: continue
    keep_map[i] = len(NEW_USAGES); NEW_USAGES.append(u)
SETS = [s for s in SETS if s['usage'] is None or s['usage'] not in drop]
for s in SETS:
    if s['usage'] is not None: s['usage'] = keep_map[s['usage']]
USAGES = NEW_USAGES

# =====================================================================================
w("-- =====================================================================")
w("-- 05_seed.sql : demo data (generated by tools/gen_seed.py - do not edit by hand)")
w("-- Dates are relative to the day the script runs, so the demo data is always recent.")
w("-- Every row passes the triggers in 02_triggers.sql.")
w("-- =====================================================================")
w("USE gym_management;")
w("SET @base = GREATEST(CURDATE(), DATE('2026-10-19'));")
w("SET @gym_internal = 0;")
w()

def ins(table, cols, rows, chunk=200):
    for i in range(0, len(rows), chunk):
        w(f"INSERT INTO {table} ({', '.join(cols)}) VALUES")
        part = rows[i:i + chunk]
        w(",\n".join("  (" + ", ".join(r) + ")" for r in part) + ";")
    w()

w("-- tiers, branches, users")
ins('tiers', ['tier_id', 'tier_name', 'tier_rank'], [[str(a), q(b), str(c)] for a, b, c in TIERS])
ins('branches', ['branch_id', 'branch_name', 'tier_id', 'address', 'city', 'phone', 'opening_time', 'closing_time'],
    [[str(b[0]), q(b[1]), str(b[2]), q(b[3]), q('Bengaluru'), q(b[4]), q(b[5] + ':00'), q(b[6] + ':00')] for b in BR])
ins('users', ['user_id', 'full_name', 'phone', 'email', 'role', 'created_at', 'is_active'],
    [[str(u[0]), q(u[1]), q(u[2]), q(u[3]), q(u[4]), DT(u[5], '10:00:00'), 'TRUE'] for u in users])

SETTINGS = [('SESSION_HOURS', '3', 'Hours a login stays valid (absolute, from login time)'),
 ('QR_VALID_SECONDS', '30', 'Seconds a check-in QR code stays valid'),
 ('AUTO_CHECKOUT_HOURS', '3', 'Open visits are closed automatically after this many hours'),
 ('PT_REFUND_CUTOFF_HOURS', '24', 'Members cancelling later than this before a PT session are charged'),
 ('INVOICE_DUE_DAYS', '7', 'Days after issue that a plan invoice is due'),
 ('PLATEAU_WEEKS', '4', 'Weeks without improvement before a plateau is flagged'),
 ('ACTIVITY_LOG_RETENTION_DAYS', '90', 'Days activity logs are kept in MongoDB'),
 ('OTP_VALID_MINUTES', '5', 'Minutes a login OTP stays valid'),
 ('MAX_PT_BOOKING_DAYS_AHEAD', '30', 'How far ahead members may book PT sessions'),
 ('DEFAULT_TRAINING_DAYS', '5', 'Default training days per week for new members')]
ins('system_settings', ['setting_key', 'setting_value', 'description', 'updated_by', 'updated_at'],
    [[q(k), q(v), q(d), str(ADMIN1), DT(-200, '09:00:00')] for k, v, d in SETTINGS])

w("-- devices (one registered phone per user)")
ins('user_devices', ['device_id', 'user_id', 'device_name', 'public_key', 'registered_at', 'is_active'],
    [[q(DEV[u[0]]), str(u[0]), q(R.choice(['iPhone 15', 'Pixel 8', 'Galaxy S24', 'OnePlus 12', 'iPhone 14', 'Redmi Note 13'])),
      q('demo-public-key-' + tok(str(u[0]))[:40]), DT(u[5], '10:05:00'), 'TRUE'] for u in users])

w("-- role profiles")
ins('staff', ['staff_id', 'branch_id', 'designation', 'shift_start', 'shift_end'],
    [[str(u), str(b), q(des), q(sh[0] + ':00'), q(sh[1] + ':00')] for u, (b, des, sh) in STAFF.items()])
ins('trainers', ['trainer_id', 'branch_id', 'specialization', 'years_experience', 'hourly_rate'],
    [[str(u), str(b), q(sp), str(y), f"{r:.2f}"] for u, (b, sp, y, r) in TRAINERS.items()])
mrows = []
for i, mid in enumerate(M):
    p = PROF[mid]
    first = min(h[2] for h in p['hist'])
    dob = f"'{1975 + (i * 7) % 28}-{1 + i % 12:02d}-{1 + (i * 3) % 27:02d}'"
    mrows.append([str(mid), str(p['home']), dob, q(['MALE', 'FEMALE'][i % 2] if i != 17 else 'OTHER'),
                  D(first), q(f'98450{10000 + i * 37:05d}'), str(p['days'])])
ins('members', ['member_id', 'branch_id', 'date_of_birth', 'gender', 'join_date', 'emergency_contact', 'training_days_per_week'], mrows)

w("-- plans, categories, equipment, exercises")
ins('membership_plans', ['plan_id', 'plan_name', 'tier_id', 'duration_days', 'price', 'description'],
    [[str(v[0]), q(f'{TNAME[t]} {dn}'), str(t), str(v[1]), f"{v[2]:.2f}",
      q(f'{TNAME[t]} tier access for {v[1]} days; entry to all {TNAME[t]}' + (' and lower-tier' if t > 1 else '') + ' branches')]
     for (t, dn), v in PLANS.items()])
ins('equipment_categories', ['category_id', 'category_name', 'category_group', 'description'],
    [[str(c[0]), q(c[1]), q(c[2]), q(c[3])] for c in CATS])
ins('equipment', ['equipment_id', 'branch_id', 'category_id', 'name', 'muscle_group', 'purchase_date', 'status'],
    [[str(e[0]), str(e[1]), str(e[2]), q(e[3]), q(e[4]), D(e[5]), q(e[6])] for e in EQ])
ins('exercises', ['exercise_id', 'exercise_name', 'muscle_group', 'category_id', 'measure_type'],
    [[str(e[0]), q(e[1]), q(e[2]), 'NULL' if e[3] is None else str(e[3]), q(e[4])] for e in EX])

w("-- admin rules")
ins('branch_closures', ['branch_id', 'closure_date', 'reason', 'created_by'],
    [['NULL' if c[0] is None else str(c[0]), D(c[1]), q(c[2]), str(c[3])] for c in CLOSURES])
RULE_H = {1: 600, 2: 400, 3: 500, 4: 500, 5: 800, 6: 900, 7: 700, 8: 700, 9: 900, 10: 900}
ins('maintenance_rules', ['category_id', 'service_interval_hours', 'created_by'],
    [[str(c), str(h), str(ADMIN1 if c % 2 else ADMIN2)] for c, h in RULE_H.items()])
ins('trainer_availability', ['availability_id', 'trainer_id', 'day_of_week', 'slot_start', 'slot_end', 'is_active'],
    [[str(s[0]), str(s[1]), q(s[2]), q(s[3] + ':00'), q(s[4] + ':00'), 'TRUE' if s[5] else 'FALSE'] for s in SLOTS])

w("-- subscriptions (invoices are created automatically by trg_subs_ai)")
ins('subscriptions', ['subscription_id', 'member_id', 'plan_id', 'start_date', 'end_date', 'status', 'closed_on', 'previous_subscription_id'],
    [[str(s['id']), str(s['member']), str(s['plan']), D(s['start']), D(s['start']), q(s['status']),
      'NULL' if s['closed'] is None else D(s['closed']), 'NULL' if s['prev'] is None else str(s['prev'])] for s in SUBS], chunk=1)

# payments for plan invoices
def staff_of_home(mid): return STAFF_BY_BRANCH[PROF[mid]['home']][0]
PAYS = []   # (sub_id or pt index, kind, amount, type, method, n, time, recorder, note)
unpaid_members = {M[14]}          # overdue
partial_members = {M[9]}          # partial
for s in SUBS:
    mid = s['member']
    if s['status'] == 'UPCOMING' or mid in unpaid_members:
        continue
    if mid in partial_members:
        PAYS.append(('sub', s['id'], s['price'] * 0.5, 'PAYMENT', 'CASH', s['issue'], '11:15:00', staff_of_home(mid), 'First instalment'))
        continue
    method = R.choice(['UPI', 'UPI', 'CARD', 'CASH', 'NETBANKING'])
    rec = staff_of_home(mid) if method == 'CASH' else None
    if R.random() < 0.15 and method != 'CASH':
        half = round(s['price'] / 2, 2)
        PAYS.append(('sub', s['id'], half, 'PAYMENT', method, s['issue'], '10:30:00', rec, 'Instalment 1 of 2'))
        PAYS.append(('sub', s['id'], s['price'] - half, 'PAYMENT', method, min(s['issue'] + 5, -1), '18:45:00', rec, 'Instalment 2 of 2'))
    else:
        PAYS.append(('sub', s['id'], s['price'], 'PAYMENT', method, s['issue'] + R.randint(0, 2), '10:30:00', rec, None))
    if s['closed'] is not None:
        unused = s['end'] - s['closed'] + 1
        refund = round(s['price'] * unused / s['dur'], 2)
        PAYS.append(('sub', s['id'], refund, 'REFUND', method, s['closed'], '12:00:00', None,
                     f"Pro-rata refund: {unused} unused days (plan {s['status'].lower()})"))
# the queued renewal of member F is prepaid
for s in SUBS:
    if s['status'] == 'UPCOMING':
        PAYS.append(('sub', s['id'], s['price'], 'PAYMENT', 'UPI', 0, '08:00:00', None, 'Renewal paid in advance'))

def pay_row(p, inv_expr):
    kind, ref, amt, typ, meth, n, tm, rec, note = p
    return [inv_expr, f"{amt:.2f}", q(typ), q(meth), DT(n, tm), 'NULL' if rec is None else str(rec), q(note)]

w("-- plan payments and refunds")
# (the invoice id is read into a variable first: a statement may not read the table its trigger updates)
for p in PAYS:
    w(f"SET @inv = (SELECT invoice_id FROM invoices WHERE subscription_id = {p[1]});")
    w("INSERT INTO payments (invoice_id, amount, payment_type, payment_method, paid_at, recorded_by, note) VALUES ("
      + ", ".join(pay_row(p, '@inv')) + ");")
w()

# sessions + attendance + usage + sets, chronologically -------------------------------
w("-- login sessions behind every QR check-in, the visits, machine usage and sets (chronological)")
sess_rows, att_rows = [], []
for vi, v in enumerate(VISITS):
    vid = vi + 1
    if v['method'] == 'QR':
        sid = uid(f'sess-{vi}')
        login_n, login_m = v['n'], v['in_min'] - 6
        tok_ = tok(f'qr-{vi}')
        sess_rows.append([q(sid), str(v['member']), q(DEV[v['member']]), q('Gym mobile app'), q(f'10.0.{v["branch"]}.{(vi % 200) + 20}'),
                          DTm(login_n, login_m)[0], DTm(login_n, login_m + 180)[0], DTm(v['n'], min(v['out_min'], login_m + 178))[0],
                          DTm(v['n'], min(v['out_min'] + 1, login_m + 179))[0], 'FALSE', q(tok_), DTm(v['n'], v['in_min'] + 1)[0] , 'TRUE'])
        v['sid'] = sid
    att_rows.append([str(vid), str(v['member']), str(v['branch']), q(v.get('sid')),
                     'NULL' if v['staff'] is None else str(v['staff']), DTm(v['n'], v['in_min'])[0],
                     DTm(v['n'], v['out_min'])[0], 'TRUE' if v['auto'] else 'FALSE'])
# staff / trainer / admin historical logins
for k, u in enumerate([x for x in users if x[4] != 'MEMBER']):
    for j in range(2):
        n = -R.randint(2, 50); m = R.randint(hm('06:00'), hm('18:00'))
        sess_rows.append([q(uid(f'ops-{k}-{j}')), str(u[0]), q(DEV[u[0]]), q('Front desk terminal' if u[4] == 'STAFF' else 'Web browser'),
                          q(f'10.1.0.{k + 10}'), DTm(n, m)[0], DTm(n, m + 180)[0], DTm(n, m + 90)[0],
                          DTm(n, m + 95)[0], 'FALSE', 'NULL', 'NULL', 'FALSE'])
ins('user_sessions', ['session_id', 'user_id', 'device_id', 'device_info', 'ip_address', 'login_time', 'expires_at',
                      'last_active', 'logout_time', 'is_valid', 'qr_token', 'qr_expires_at', 'qr_used'], sess_rows)
ins('attendance', ['attendance_id', 'member_id', 'branch_id', 'session_id', 'checked_in_by', 'check_in_time',
                   'check_out_time', 'auto_checked_out'], att_rows)
urows = []
for i, u in enumerate(USAGES):
    urows.append([str(i + 1), str(u['eq']), str(u['member']), str(u['visit'] + 1), DTm(u['n'], u['s'])[0],
                  DTm(u['n'], u['e'])[0], 'NULL' if u['diff'] is None else str(u['diff']),
                  'NULL' if u['comf'] is None else str(u['comf'])])
ins('equipment_usage_log', ['usage_id', 'equipment_id', 'member_id', 'attendance_id', 'start_time', 'end_time',
                            'difficulty_rating', 'comfort_rating'], urows)
SETS.sort(key=lambda s: (s['n'], s['m'], s['visit'], s['num']))
srows = []
for s in SETS:
    srows.append([str(s['visit'] + 1), str(s['ex']), 'NULL' if s['usage'] is None else str(s['usage'] + 1), str(s['num']),
                  'NULL' if s['reps'] is None else str(s['reps']), 'NULL' if s['weight'] is None else f"{s['weight']:.2f}",
                  'NULL' if s['dur'] is None else str(s['dur']), 'NULL' if s['dist'] is None else str(s['dist']),
                  DTm(s['n'], s['m'])[0]])
w("-- sets are inserted in time order so personal records are detected correctly")
ins('workout_sets', ['attendance_id', 'exercise_id', 'usage_id', 'set_number', 'reps', 'weight_kg', 'duration_seconds',
                     'distance_m', 'performed_at'], srows, chunk=1)

w("-- maintenance history (equipment status follows automatically)")
ins('equipment_maintenance', ['equipment_id', 'maintenance_type', 'reported_issue', 'reported_by', 'reported_date',
                              'started_date', 'resolved_date', 'cost', 'status'],
    [[str(m[0]), q(m[1]), q(m[2]), 'NULL' if m[3] is None else str(m[3]), D(m[4]),
      'NULL' if m[5] is None else D(m[5]), 'NULL' if m[6] is None else D(m[6]),
      'NULL' if m[7] is None else f"{m[7]:.2f}", q(m[8])] for m in MAINT], chunk=1)

w("-- personal training sessions (invoices created automatically by trg_ts_ai)")
def pt_date(p):
    tw = DOWS.index(p['slot'][2])
    dn = D(p['n'])
    return f"({dn} - INTERVAL ((WEEKDAY({dn}) - {tw} + 7) % 7) DAY)"
pt_rows = []
for i, p in enumerate(PT):
    date = pt_date(p)
    bn = min(p['n'] - 10, -1)
    booked = DT(bn, '20:15:00')
    canc = 'NULL'
    if p['status'] == 'CANCELLED':
        canc = f"TIMESTAMP(@base + INTERVAL {bn} DAY, '22:15:00')"
    pt_rows.append([str(i + 1), str(p['member']), str(p['trainer']), str(p['slot'][0]), date, q(p['slot'][3] + ':00'),
                    str(p['dur']), q(p['status']), booked, canc])
ins('training_sessions', ['training_session_id', 'member_id', 'trainer_id', 'availability_id', 'session_date', 'start_time',
                          'duration_minutes', 'status', 'booked_at', 'cancelled_at'], pt_rows, chunk=1)
# cancelled in time -> invoice cancelled (refund if paid); payments for the rest
for i, p in enumerate(PT):
    inv = f"(SELECT invoice_id FROM invoices WHERE training_session_id = {i + 1})"
    if p['status'] == 'CANCELLED':
        w(f"UPDATE invoices SET status = 'CANCELLED' WHERE training_session_id = {i + 1};")
    elif p['status'] in ('COMPLETED', 'NO_SHOW') or (p['status'] == 'SCHEDULED' and i % 2 == 0):
        meth = R.choice(['UPI', 'CARD', 'UPI'])
        w(f"SELECT invoice_id, amount_due, issue_date INTO @inv, @amt, @iss FROM invoices WHERE training_session_id = {i + 1};")
        w(f"INSERT INTO payments (invoice_id, amount, payment_type, payment_method, paid_at, recorded_by, note) "
          f"VALUES (@inv, @amt, 'PAYMENT', '{meth}', TIMESTAMP(@iss, '20:30:00'), NULL, 'Paid at booking');")
w()

w("-- goals")
def fav_ex(m, k=0):
    """the k-th weighted exercise this member actually trains (from their favourite machine types)"""
    cats = [c for c in FAV[m] if c not in (1, 2, 3, 4)]
    c = cats[k % len(cats)]
    return EX_BY_CAT[c][0][0] if m in (M[0], M[3]) or True else None
def goal_target(m, ex, extra):
    return weight_for(m, ex, -1) + extra
GOALS = [
 (M[0], 'EXERCISE_WEIGHT', 13, 60, -60, 30, 'ACTIVE', None), (M[0], 'MONTHLY_VISITS', None, 20, -30, 1, 'ACTIVE', None),
 (M[3], 'EXERCISE_WEIGHT', 14, 70, -70, 20, 'ACTIVE', None), (M[2], 'WORKOUT_STREAK', None, 5, -40, 20, 'ACTIVE', None),
 (M[4], 'WORKOUT_STREAK', None, 3, -90, -10, 'ACHIEVED', -25), (M[5], 'EXERCISE_REPS', 20, 30, -50, 10, 'ACTIVE', None),
 (M[6], 'MONTHLY_VISITS', None, 16, -60, -30, 'EXPIRED', None), (M[10], 'EXERCISE_WEIGHT', fav_ex(M[10]), goal_target(M[10], fav_ex(M[10]), 10), -40, 30, 'ACTIVE', None),
 (M[11], 'MONTHLY_VISITS', None, 8, -80, -20, 'ACHIEVED', -35), (M[13], 'WORKOUT_STREAK', None, 7, -30, 30, 'ACTIVE', None),
 (M[15], 'EXERCISE_REPS', 21, 12, -45, 15, 'ACTIVE', None), (M[17], 'MONTHLY_VISITS', None, 18, -20, 10, 'ACTIVE', None),
 (M[19], 'EXERCISE_WEIGHT', fav_ex(M[19]), goal_target(M[19], fav_ex(M[19]), 7.5), -30, 60, 'ACTIVE', None),
 (M[21], 'EXERCISE_WEIGHT', fav_ex(M[21]), goal_target(M[21], fav_ex(M[21]), 20), -50, -5, 'ABANDONED', None),
 (M[27], 'EXERCISE_WEIGHT', fav_ex(M[27], 1), goal_target(M[27], fav_ex(M[27], 1), 5), -60, 40, 'ACTIVE', None),
]
ins('fitness_goals', ['member_id', 'goal_type', 'exercise_id', 'target_value', 'start_date', 'target_date', 'status', 'achieved_on'],
    [[str(g[0]), q(g[1]), 'NULL' if g[2] is None else str(g[2]), f"{g[3]:.2f}", D(g[4]), D(g[5]), q(g[6]),
      'NULL' if g[7] is None else D(g[7])] for g in GOALS])

w("-- challenges and participants")
CH = [  # title, desc, metric, ex, branch, start, end, creator
 ('October Consistency Cup', 'Most visit days in the month', 'TOTAL_VISITS', None, None, -30, 1, ADMIN1),
 ('Koramangala Bench Battle', 'Heaviest barbell bench press', 'EXERCISE_MAX_WEIGHT', 13, 6, -45, -5, STAFF_BY_BRANCH[6][0]),
 ('Volume Kings', 'Highest total training volume (kg x reps)', 'TOTAL_VOLUME', None, None, -60, -31, ADMIN2),
 ('Streak Sprint', 'Longest run of consecutive gym days', 'LONGEST_STREAK', None, None, -21, 14, ADMIN1),
 ('Jayanagar Squat Off', 'Heaviest barbell back squat', 'EXERCISE_MAX_WEIGHT', 14, 1, -40, -10, STAFF_BY_BRANCH[1][0]),
 ('Diamond Deadlift Classic', 'Heaviest deadlift at Diamond branches', 'EXERCISE_MAX_WEIGHT', 15, 9, -35, 5, STAFF_BY_BRANCH[9][0]),
 ('HSR Early Birds', 'Most visit days', 'TOTAL_VISITS', None, 7, -28, -1, STAFF_BY_BRANCH[7][0]),
 ('Whitefield Volume Week', 'Highest training volume in a week', 'TOTAL_VOLUME', None, 8, -14, -7, STAFF_BY_BRANCH[8][0]),
 ('New Year Countdown', 'Most visit days until the year ends', 'TOTAL_VISITS', None, None, 2, 70, ADMIN1),
 ('Leg Press Ladder', 'Heaviest leg press', 'EXERCISE_MAX_WEIGHT', 5, None, -20, 20, ADMIN2),
]
ins('challenges', ['challenge_id', 'title', 'description', 'metric', 'exercise_id', 'branch_id', 'start_date', 'end_date', 'created_by'],
    [[str(i + 1), q(c[0]), q(c[1]), q(c[2]), 'NULL' if c[3] is None else str(c[3]), 'NULL' if c[4] is None else str(c[4]),
      D(c[5]), D(c[6]), str(c[7])] for i, c in enumerate(CH)])
CP = []
EX_BY_ID = {e[0]: e for e in EX}
for i, c in enumerate(CH):
    title, desc, metric, ex, br, start, end, creator = c
    lo, hi = start, min(end, -1)
    # members who were actually active for this challenge (right branch, right exercise, inside the dates)
    active = set()
    for s_ in SETS:
        v = VISITS[s_['visit']]
        if lo <= s_['n'] <= hi and (br is None or v['branch'] == br) and (ex is None or s_['ex'] == ex):
            active.add(v['member'])
    if metric == 'TOTAL_VISITS' or metric == 'LONGEST_STREAK':
        active = {v['member'] for v in VISITS if lo <= v['n'] <= hi and (br is None or v['branch'] == br)}
    pool = sorted(active) or [m for m in M if PROF[m]['home'] == (br or PROF[m]['home'])]
    want = 4 if i < 9 else 6
    picks = R.sample(pool, min(len(pool), want))
    if ex == 13 and M[0] in pool and M[0] not in picks: picks[0] = M[0]
    for m in picks:
        CP.append((i + 1, m, min(start + R.randint(0, 3), -1)))
ins('challenge_participants', ['challenge_id', 'member_id', 'joined_at'],
    [[str(a), str(b), DT(n, '07:30:00')] for a, b, n in CP])

w("-- workout templates")
TPL = [  # name, creator, for, source, days, exercises[(day, ex, eq_branch, sets, reps, w, dur)]
 ('Push Pull Legs', M[0], M[0], 'MANUAL', 3, [(1, 13, 6, 4, 8, 60), (1, 19, 6, 3, 10, 20), (2, 7, 6, 3, 10, 45),
   (2, 8, 6, 3, 12, 40), (3, 14, 6, 4, 8, 80), (3, 5, 6, 3, 12, 140)]),
 ('Aditya: Strength Block for Rohan', TA, M[0], 'MANUAL', 4, [(1, 13, 6, 5, 5, 62.5), (2, 14, 6, 5, 5, 85), (3, 15, 6, 3, 5, 100),
   (4, 17, 6, 3, 10, 16)]),
 ('Beginner Full Body', TD, None, 'MANUAL', 3, [(1, 22, None, 3, 15, None), (1, 20, None, 3, 10, None), (2, 1, 1, 1, None, None),
   (2, 23, None, 3, 20, None), (3, 6, 1, 3, 12, 20)]),
 ('Generated routine for Siddharth', M[2], M[2], 'GENERATED', 4, [(1, 6, 1, 3, 10, 30), (2, 7, 1, 3, 10, 35), (3, 5, 1, 3, 12, 90),
   (4, 1, 1, 1, None, None)]),
 ('Squat Focus', TA, M[3], 'MANUAL', 3, [(1, 14, 6, 5, 5, 70), (2, 5, 6, 4, 10, 150), (3, 11, 6, 3, 12, 50)]),
 ('Diamond Athletic Prep', TR, M[4], 'MANUAL', 5, [(1, 3, 9, 1, None, None), (2, 15, 9, 4, 5, 110), (3, 10, 9, 3, 8, 70),
   (4, 12, 9, 3, 10, 30), (5, 25, None, 3, 15, None)]),
 ('Upper Lower Split', M[11], M[11], 'MANUAL', 4, [(1, 6, 6, 4, 10, 40), (2, 5, 6, 4, 10, 120), (3, 7, 6, 4, 10, 45), (4, 18, 6, 3, 12, 14)]),
 ('Core and Cardio', TT, None, 'MANUAL', 2, [(1, 24, None, 3, None, None), (1, 4, 10, 1, None, None), (2, 23, None, 3, 25, None)]),
 ('Generated routine for Ishita', M[5], M[5], 'GENERATED', 4, [(1, 6, 7, 3, 10, 25), (2, 8, 7, 3, 12, 30), (3, 5, 7, 3, 12, 80),
   (4, 2, 7, 1, None, None)]),
 ('Powerlifting Basics', TK, None, 'MANUAL', 3, [(1, 14, 7, 5, 5, 60), (2, 13, 7, 5, 5, 50), (3, 15, 7, 5, 5, 80)]),
 ('Home Branch Quick Session', M[16], M[16], 'MANUAL', 2, [(1, 6, 2, 3, 12, 25), (2, 7, 2, 3, 12, 30)]),
 ('Rehab Mobility', T_BY_PHONE['9000000112'], M[15], 'MANUAL', 3, [(1, 24, None, 3, None, None), (2, 22, None, 3, 15, None),
   (3, 2, 9, 1, None, None)]),
]
ins('workout_templates', ['template_id', 'template_name', 'created_by', 'for_member_id', 'source', 'days_per_week', 'created_at'],
    [[str(i + 1), q(t[0]), str(t[1]), 'NULL' if t[2] is None else str(t[2]), q(t[3]), str(t[4]), DT(-R.randint(5, 60), '21:00:00')]
     for i, t in enumerate(TPL)])
EXI = {e[0]: e for e in EX}
te_rows = []
for i, t in enumerate(TPL):
    order = defaultdict(int)
    for item in t[5]:
        day, ex, ebr, sets, reps, wgt = item
        order[day] += 1
        cat = EXI[ex][3]
        eq = EQ_BY_BRANCH_CAT[(ebr, cat)][0] if (ebr and cat) else None
        measure = EXI[ex][4]
        dur = 1200 if measure == 'TIME_DISTANCE' and ex != 24 else (60 if ex == 24 else None)
        te_rows.append([str(i + 1), str(day), str(order[day]), str(ex), 'NULL' if eq is None else str(eq), str(sets),
                        'NULL' if (reps is None or measure == 'TIME_DISTANCE') else str(reps),
                        'NULL' if wgt is None else f"{wgt:.2f}", 'NULL' if dur is None else str(dur)])
ins('template_exercises', ['template_id', 'day_number', 'exercise_order', 'exercise_id', 'preferred_equipment_id', 'target_sets',
                           'target_reps', 'target_weight_kg', 'target_duration_seconds'], te_rows)

w("-- invoice statuses depend on today's date: recompute once after loading")
w("UPDATE invoices SET status = fn_invoice_status(invoice_id) WHERE status <> 'CANCELLED';")
w()
w("-- quick summary")
w("SELECT 'seed loaded' AS status, @base AS data_reference_date;")

open(OUT, 'w', newline='\n').write("\n".join(L) + "\n")
print('visits', len(VISITS), 'usages', len(USAGES), 'sets', len(SETS), 'pt', len(PT), 'subs', len(SUBS),
      'sessions', len(sess_rows), 'equipment', len(EQ))

# =====================================================================================
# MongoDB sample documents (database/mongodb/seed.js), consistent with the MySQL seed
# =====================================================================================
import json
MOUT = os.path.join(os.path.dirname(__file__), '..', 'database', 'mongodb', 'seed.js')
J = []
J.append("// Sample documents for gym_management_docs (generated by tools/gen_seed.py - do not edit by hand).")
J.append("// Run after setup.js:  mongosh \"mongodb://127.0.0.1:27017/gym_management_docs\" database/mongodb/seed.js")
J.append("// Dates are relative to today, matching the MySQL seed (which also counts from the day it is loaded).")
J.append("const ref = new Date(Math.max(new Date().setHours(0, 0, 0, 0), new Date('2026-10-19T00:00:00').getTime()));")
J.append("const day = (n, hh = 0, mm = 0) => { const d = new Date(ref); d.setDate(d.getDate() + n); d.setHours(hh, mm, 0, 0); return d; };")
J.append("const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;")
J.append("// same rule as the SQL seed: the latest date on or before day n that falls on the slot's weekday (0 = Monday)")
J.append("const onWeekday = (n, wd) => { const d = day(n); const cur = (d.getDay() + 6) % 7; d.setDate(d.getDate() - ((cur - wd + 7) % 7)); return iso(d); };")
J.append("db.pt_session_logs.deleteMany({}); db.activity_logs.deleteMany({});")

FOCUS = {
 'Strength and Conditioning': ['Barbell Bench Press', 'Barbell Back Squat', 'Deadlift'], 'Hypertrophy': ['Incline Dumbbell Press', 'Lat Pulldown', 'Leg Press'],
 'Weight Loss and Cardio': ['Treadmill Run', 'Burpee', 'Stationary Cycling'], 'Functional Training': ['Burpee', 'Dumbbell Lunge', 'Plank'],
 'Bodybuilding': ['Machine Chest Press', 'Dumbbell Curl', 'Cable Triceps Pushdown'], 'Athletic Performance': ['Rowing', 'Deadlift', 'Smith Machine Squat'],
 'Pilates and Core': ['Plank', 'Crunch', 'Bodyweight Squat'], 'Powerlifting': ['Barbell Back Squat', 'Barbell Bench Press', 'Deadlift'],
 'HIIT and Endurance': ['Burpee', 'Rowing', 'Treadmill Run'], 'Rehabilitation': ['Bodyweight Squat', 'Plank', 'Stationary Cycling'],
 'Yoga and Mobility': ['Plank', 'Bodyweight Squat', 'Crunch'], 'Senior Fitness': ['Stationary Cycling', 'Bodyweight Squat', 'Leg Extension'],
}
NOTES = ['Keep the core braced through the whole rep', 'Slow the lowering phase to 3 seconds', 'Elbows tucked at about 45 degrees',
         'Knees tracking over the toes', 'Full range of motion before adding weight', 'Breathe out on the effort', 'Neutral spine, chest up']
logs = []
for i, p in enumerate(PT):
    if p['status'] != 'COMPLETED': continue
    spec = TRAINERS[p['trainer']][1]
    names = FOCUS.get(spec, ['Bodyweight Squat', 'Plank', 'Push-up'])
    exs = []
    for k, nm in enumerate(names[:R.randint(2, 3)]):
        e = {'name': nm, 'sets': R.choice([3, 4, 5])}
        exd = next(x for x in EX if x[1] == nm)
        if exd[4] == 'WEIGHT_REPS': e.update(reps=R.choice([5, 8, 10]), weight_kg=float(weight_for(p['member'], exd[0], p['n'])))
        elif exd[4] == 'REPS_ONLY': e.update(reps=R.choice([10, 12, 15]))
        else: e.update(duration_min=R.choice([10, 15, 20]))
        if R.random() < 0.4: e['notes'] = R.choice(['Good tempo', 'Last set was a grind', 'Increase load next time', 'Form broke on the final rep'])
        exs.append(e)
    doc = {'training_session_id': i + 1, 'member_id': p['member'], 'trainer_id': p['trainer'],
           'summary': R.choice(['Solid session, energy was high throughout.', 'Technique focus today; loads kept moderate.',
                                'Member was tired after work, so volume was reduced.', 'Good progress, ready to add load next week.']),
           'exercises': exs, 'form_notes': R.sample(NOTES, R.randint(1, 3)),
           'next_session_plan': R.choice(['Repeat the main lift with +2.5 kg', 'Deload week: 70 percent loads', 'Add accessory work for the upper back', 'Test a new 3-rep max']),
           'tags': R.sample(['strength', 'technique', 'conditioning', 'mobility', 'progress'], 2)}
    if p['member'] == M[3] and R.random() < 0.7:
        doc['pain_or_injury'] = {'area': 'Lower back', 'severity': 3, 'note': 'Mild tightness after squats; warm up longer.'}
    if R.random() < 0.5:
        doc['measurements'] = {'body_weight_kg': round(R.uniform(58, 92), 1)}
        if R.random() < 0.5: doc['measurements']['resting_heart_rate'] = R.randint(58, 78)
    wd = DOWS.index(p['slot'][2])
    logs.append((doc, p['n'], wd))
J.append("db.pt_session_logs.insertMany([")
for doc, n, wd in logs:
    body = json.dumps(doc)[1:-1]
    J.append(f"  {{ {body}, session_date: onWeekday({n}, {wd}), written_at: day({n}, 21, 30) }},")
J.append("]);")

# activity logs over the last 30 days
acts = []
phone_of = {u[0]: u[2] for u in users}
role_of = {u[0]: u[4] for u in users}
qr_visits = [v for v in VISITS if v['method'] == 'QR' and v['n'] >= -30]
for v in qr_visits[-40:]:
    h, m = divmod(v['in_min'] - 6, 60)
    acts.append((v['n'], h, m, 'LOGIN_SUCCESS', v['member'], {'device_id': DEV[v['member']], 'user_agent': 'Gym mobile app'}))
    acts.append((v['n'], h, m + 5, 'QR_GENERATED', v['member'], {'branch_hint': v['branch']}))
    staff_u = STAFF_BY_BRANCH[v['branch']][0]
    acts.append((v['n'], h, m + 6, 'QR_SCANNED', staff_u, {'result': 'ACCEPTED', 'member_id': v['member'], 'branch_id': v['branch']}))
acts.append((-3, 18, 5, 'LOGIN_REFUSED_DUPLICATE', M[0], {'device_id': 'unregistered-browser', 'user_agent': 'Chrome on Windows', 'note': 'second login while a session was valid'}))
acts.append((-9, 7, 40, 'QR_SCANNED', STAFF_BY_BRANCH[6][0], {'result': 'REFUSED', 'reason': 'Check-in refused: plan tier does not cover this branch', 'branch_id': 6}))
acts.append((-6, 8, 15, 'QR_SCANNED', STAFF_BY_BRANCH[1][0], {'result': 'REFUSED', 'reason': 'This QR code has already been used', 'branch_id': 1}))
acts.append((-4, 9, 2, 'OTP_SENT', M[1], {'channel': 'SMS', 'to': '********02'}))
acts.append((-2, 11, 20, 'FAULT_REPORTED', STAFF_BY_BRANCH[6][0], {'equipment_id': eq_at(6, 6, 1), 'issue': 'Handle grip loose'}))
acts.append((-30, 12, 0, 'PLAN_CHANGE', M[6], {'from': 'Silver Quarterly', 'to': 'Gold Half-Yearly', 'kind': 'UPGRADED'}))
acts.append((-20, 12, 0, 'PLAN_CANCEL', M[8], {'plan': 'Gold Monthly', 'refund': 1250.0}))
for p in PT[-6:]:
    acts.append((min(p['n'] - 10, -1), 20, 15, 'PT_BOOKED', p['member'], {'trainer_id': p['trainer'], 'availability_id': p['slot'][0]}))
J.append("db.activity_logs.insertMany([")
for n, h, m, ev, uid_, det in acts:
    J.append(f"  {{ at: day({n}, {h}, {m}), event: '{ev}', user_id: {uid_}, role: '{role_of[uid_]}', ip: '10.0.0.{uid_ % 250}', details: {json.dumps(det)} }},")
J.append("]);")
J.append("print(`pt_session_logs: ${db.pt_session_logs.countDocuments()}, activity_logs: ${db.activity_logs.countDocuments()}`);")
open(MOUT, 'w', newline='\n').write("\n".join(J) + "\n")
print('mongo docs', len(logs), len(acts))
