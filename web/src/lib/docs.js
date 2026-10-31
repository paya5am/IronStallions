// MongoDB access (database gym_management_docs) for the API layer.
// Collections: otp_requests, activity_logs, pt_session_logs (+ member_insights in Phase 2).
//
// DOCS_STORE=memory keeps the documents in this process instead of MongoDB.
// It exists only as an emergency fallback for development when MongoDB is
// not installed; the demo and the submission must use MongoDB.
import { MongoClient } from 'mongodb';

const useMemory = process.env.DOCS_STORE === 'memory';

async function mongoDb() {
  if (!globalThis.__gymMongo) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('Missing environment variable MONGODB_URI. Copy .env.example to .env.local and fill it in.');
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
    globalThis.__gymMongo = client.connect().then(() => client.db(process.env.MONGODB_DB || 'gym_management_docs'));
    globalThis.__gymMongo.catch(() => { globalThis.__gymMongo = null; });
  }
  return globalThis.__gymMongo;
}

// --- tiny in-memory stand-in with the few operations this app uses --------------
function memoryCollection(name) {
  globalThis.__gymMemory = globalThis.__gymMemory || {};
  const store = (globalThis.__gymMemory[name] = globalThis.__gymMemory[name] || []);
  const matches = (doc, filter) => Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === 'object' && '$gt' in v) return doc[k] > v.$gt;
    return doc[k] === v;
  });
  return {
    async insertOne(doc) { const d = { _id: String(Date.now() + Math.random()), ...doc }; store.push(d); return { insertedId: d._id }; },
    async findOne(filter) { return store.find((d) => matches(d, filter)) || null; },
    async updateOne(filter, update, opts = {}) {
      let d = store.find((x) => matches(x, filter));
      if (!d && opts.upsert) { d = { _id: String(Date.now()), ...filter }; store.push(d); }
      if (d) { Object.assign(d, update.$set || {}); if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) d[k] = (d[k] || 0) + v; }
      return { matchedCount: d ? 1 : 0 };
    },
    async replaceOne(filter, doc, opts = {}) {
      const i = store.findIndex((x) => matches(x, filter));
      if (i >= 0) store[i] = { _id: store[i]._id, ...doc };
      else if (opts.upsert) store.push({ _id: String(Date.now()), ...doc });
      return { matchedCount: i >= 0 ? 1 : 0 };
    },
    async deleteMany(filter) { for (let i = store.length - 1; i >= 0; i--) if (matches(store[i], filter)) store.splice(i, 1); },
    find(filter = {}) {
      let res = store.filter((d) => matches(d, filter));
      const api = {
        sort(s) { const [[k, dir]] = Object.entries(s); res = [...res].sort((a, b) => (a[k] > b[k] ? dir : -dir)); return api; },
        limit(n) { res = res.slice(0, n); return api; },
        async toArray() { return res; },
      };
      return api;
    },
    async countDocuments(filter = {}) { return store.filter((d) => matches(d, filter)).length; },
  };
}

export async function collection(name) {
  if (useMemory) return memoryCollection(name);
  const db = await mongoDb();
  return db.collection(name);
}

// Activity logging must never break a request, so failures are only printed.
export async function logActivity(event, { userId = null, role = null, ip = null, details = {} } = {}) {
  try {
    const col = await collection('activity_logs');
    await col.insertOne({ at: new Date(), event, user_id: userId, role, ip, details });
  } catch (err) {
    console.error('activity log failed:', err.message);
  }
}
