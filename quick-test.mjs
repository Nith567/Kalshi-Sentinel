import * as dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

console.log('Testing MongoDB connection...');
const client = new MongoClient(MONGODB_URI);

try {
  await client.connect();
  console.log('✅ Connected to MongoDB!');
  
  const db = client.db('kalshi_bot');
  const collections = await db.listCollections().toArray();
  console.log('✅ Database collections:', collections.map(c => c.name).join(', '));
  
  await client.close();
  process.exit(0);
} catch (error) {
  console.error('❌ Connection failed:', error.message);
  process.exit(1);
}
