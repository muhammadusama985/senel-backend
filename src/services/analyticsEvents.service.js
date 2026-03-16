const AnalyticsEvent = require("../models/AnalyticsEvents");

async function logEvent(payload, session) {
  try {
    const docs = await AnalyticsEvent.create([payload], session ? { session } : undefined);
    return docs[0];
  } catch {
    // Analytics must never break checkout/orders
    return null;
  }
}

module.exports = { logEvent };