const DeviceToken = require("../models/DeviceToken");

/**
 * Infrastructure-ready push dispatch.
 * If no provider is configured, this returns token counts without sending.
 */
async function sendPushToUsers({ userIds = [], title, body, data = {} }) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return { attempted: 0, sent: 0, provider: "none" };
  }

  const tokens = await DeviceToken.find({
    userId: { $in: userIds },
    isActive: true,
  })
    .select("token platform userId")
    .lean();

  const provider = process.env.PUSH_PROVIDER || "none";

  // Provider integrations can be added here (FCM/APNs/etc.).
  // Current behavior is safe no-op with accurate recipient count.
  if (provider === "none") {
    return { attempted: tokens.length, sent: 0, provider: "none" };
  }

  // Placeholder for provider-backed sending.
  // Keeping the function deterministic for now.
  return { attempted: tokens.length, sent: 0, provider };
}

module.exports = { sendPushToUsers };

