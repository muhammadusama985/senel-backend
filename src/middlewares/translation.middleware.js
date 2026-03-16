const translationService = require("../services/translation.service");

/**
 * Middleware to translate API responses based on language
 */
async function translateResponse(req, res, next) {
  // Skip translation for English
  if (req.lang === 'en') {
    return next();
  }

  // Store original json function
  const originalJson = res.json;
  
  // Override json function
  res.json = async function(data) {
    try {
      // Translate the response data
      const translatedData = await translationService.translateResponse(data, req.lang);
      return originalJson.call(this, translatedData);
    } catch (error) {
      console.error('Translation error:', error);
      // Fall back to original data if translation fails
      return originalJson.call(this, data);
    }
  };
  
  next();
}

module.exports = { translateResponse };