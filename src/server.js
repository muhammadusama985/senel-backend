const { loadEnv } = require("./config/env");
loadEnv();

const app = require("./app");
const { connectDB } = require("./config/db");
const searchService = require("./services/search.service");

const PORT = process.env.PORT || 4000;

(async () => {
  // Connect to MongoDB
  await connectDB();
  
  // Initialize search service and detect MongoDB capabilities
  try {
    await searchService.detectCapabilities();
    console.log('🔍 Search service initialized');
    
    // Optional: Create indexes (uncomment if you want to run this on startup)
    // await searchService.createIndexes();
    // console.log('📊 Search indexes created/verified');
  } catch (error) {
    console.error('⚠️ Search service initialization warning:', error.message);
    // Non-fatal error - app can still run with basic search
  }
  
  // Start server
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📅 Started at: ${new Date().toISOString()}`);
  });
})();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});