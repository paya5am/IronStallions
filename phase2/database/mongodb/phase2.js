// Phase 2 MongoDB collection. Run from the project root:
//   mongosh "mongodb://127.0.0.1:27017/gym_management_docs" phase2/database/mongodb/phase2.js
// member_insights: one generated summary document per member. Its sections differ per member
// (only the insights that apply are present), it is rebuilt from MySQL data and read in one request.
if (db.getCollectionNames().includes('member_insights')) db.member_insights.drop();
db.createCollection('member_insights', {
  validator: { $jsonSchema: {
    bsonType: 'object',
    required: ['member_id', 'generated_at', 'headline', 'highlights', 'suggestions'],
    properties: {
      member_id:    { bsonType: 'number' },
      generated_at: { bsonType: 'date' },
      headline:     { bsonType: 'string' },
      highlights:   { bsonType: 'array', items: { bsonType: 'string' } },
      warnings:     { bsonType: 'array', items: { bsonType: 'string' } },
      suggestions:  { bsonType: 'array', items: { bsonType: 'string' } },
      stats:        { bsonType: 'object' },
      muscle_balance: { bsonType: 'array' },
    },
  } },
});
db.member_insights.createIndex({ member_id: 1 }, { unique: true, name: 'one_per_member' });
print('member_insights ready');
