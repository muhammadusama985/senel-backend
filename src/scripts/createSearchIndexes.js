const { loadEnv } = require("../config/env");
loadEnv();

const { connectDB } = require("../config/db");
const searchService = require("../services/search.service");

async function createIndexes() {
  try {
    console.log('📦 Connecting to MongoDB...');
    await connectDB();
    
    console.log('🔍 Detecting MongoDB capabilities...');
    await searchService.detectCapabilities();
    
    console.log('📊 Creating search indexes...');
    await searchService.createIndexes();
    
    console.log('✅ Search indexes created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    process.exit(1);
  }
}

createIndexes();