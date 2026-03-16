const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis(process.env.REDIS_URL);

async function testConnection() {
  try {
    await redis.set('test', 'Hello Redis Cloud!');
    const value = await redis.get('test');
    console.log('✅ Connected to Redis Cloud!');
    console.log('Test value:', value);
    
    // Clean up
    await redis.del('test');
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection failed:', error);
    process.exit(1);
  }
}

testConnection();