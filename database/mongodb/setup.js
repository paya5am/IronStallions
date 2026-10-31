// =====================================================================
// MongoDB setup for gym_management_docs. Run from the project root:
//   mongosh "mongodb://127.0.0.1:27017/gym_management_docs" database/mongodb/setup.js
// Re-running drops and recreates the Phase 1 collections.
// =====================================================================
const RETENTION_DAYS = 90;

for (const name of ['otp_requests', 'activity_logs', 'pt_session_logs']) {
  if (db.getCollectionNames().includes(name)) db.getCollection(name).drop();
}

// One-time passwords and login challenges. Deleted automatically at expires_at (TTL index).
db.createCollection('otp_requests', {
  validator: { $jsonSchema: {
    bsonType: 'object',
    required: ['purpose', 'subject', 'user_id', 'attempts', 'used', 'created_at', 'expires_at'],
    properties: {
      purpose:    { enum: ['LOGIN_SMS', 'LOGIN_CHALLENGE'] },
      subject:    { bsonType: 'string', description: 'phone number, or challenge id' },
      user_id:    { bsonType: 'number' },
      otp_hash:   { bsonType: ['string', 'null'] },
      attempts:   { bsonType: 'number', minimum: 0 },
      used:       { bsonType: 'bool' },
      created_at: { bsonType: 'date' },
      expires_at: { bsonType: 'date' },
    },
  } },
});
db.otp_requests.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'ttl_expires_at' });
db.otp_requests.createIndex({ subject: 1, purpose: 1, created_at: -1 }, { name: 'lookup_subject' });

// Append-only event history. Fields inside "details" differ per event type.
db.createCollection('activity_logs', {
  validator: { $jsonSchema: {
    bsonType: 'object',
    required: ['at', 'event'],
    properties: {
      at:      { bsonType: 'date' },
      event:   { bsonType: 'string' },
      user_id: { bsonType: ['number', 'null'] },
      role:    { enum: ['MEMBER', 'TRAINER', 'STAFF', 'ADMIN', null] },
      ip:      { bsonType: ['string', 'null'] },
      details: { bsonType: 'object' },
    },
  } },
});
db.activity_logs.createIndex({ at: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 3600, name: 'ttl_retention' });
db.activity_logs.createIndex({ user_id: 1, at: -1 }, { name: 'by_user' });
db.activity_logs.createIndex({ event: 1, at: -1 }, { name: 'by_event' });

// Trainer notes for a completed PT session: one document per session, nested and variable.
db.createCollection('pt_session_logs', {
  validator: { $jsonSchema: {
    bsonType: 'object',
    required: ['training_session_id', 'member_id', 'trainer_id', 'written_at', 'summary'],
    properties: {
      training_session_id: { bsonType: 'number' },
      member_id:   { bsonType: 'number' },
      trainer_id:  { bsonType: 'number' },
      session_date: { bsonType: 'string' },
      written_at:  { bsonType: 'date' },
      summary:     { bsonType: 'string', minLength: 1 },
      exercises:   { bsonType: 'array', items: { bsonType: 'object', required: ['name'] } },
      form_notes:  { bsonType: 'array', items: { bsonType: 'string' } },
      pain_or_injury: { bsonType: 'object', required: ['area', 'severity'] },
      measurements: { bsonType: 'object' },
      next_session_plan: { bsonType: 'string' },
      tags:        { bsonType: 'array', items: { bsonType: 'string' } },
    },
  } },
});
db.pt_session_logs.createIndex({ training_session_id: 1 }, { unique: true, name: 'one_log_per_session' });
db.pt_session_logs.createIndex({ member_id: 1, written_at: -1 }, { name: 'by_member' });
db.pt_session_logs.createIndex({ trainer_id: 1, written_at: -1 }, { name: 'by_trainer' });

print('Collections ready: ' + db.getCollectionNames().sort().join(', '));
