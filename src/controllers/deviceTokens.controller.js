const { z } = require("zod");
const DeviceToken = require("../models/DeviceToken");

const registerSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(["ios", "android", "web"]),
  deviceId: z.string().optional(),
  appVersion: z.string().optional(),
});

async function registerDeviceToken(req, res) {
  try {
    const body = registerSchema.parse(req.body);

    await DeviceToken.updateOne(
      { userId: req.user._id, token: body.token },
      {
        $set: {
          platform: body.platform,
          deviceId: body.deviceId || "",
          appVersion: body.appVersion || "",
          isActive: true,
          lastUsed: new Date(),
        },
      },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Failed to register token" });
  }
}

async function unregisterDeviceToken(req, res) {
  try {
    const { token } = req.body;

    await DeviceToken.updateOne(
      { userId: req.user._id, token },
      { $set: { isActive: false } }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function listMyTokens(req, res) {
  try {
    const tokens = await DeviceToken.find({ 
      userId: req.user._id, 
      isActive: true 
    }).lean();

    res.json({ tokens });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = { registerDeviceToken, unregisterDeviceToken, listMyTokens };