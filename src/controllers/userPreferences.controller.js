const { z } = require("zod");
const User = require("../models/User");

const updateSchema = z.object({
  language: z.enum(["en", "de", "tr"]),
});

async function getMyPreferences(req, res) {
  try {
    res.json({
      preferences: {
        language: req.user.preferredLanguage || "en",
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function updateMyPreferences(req, res) {
  try {
    const body = updateSchema.parse(req.body);

    req.user.preferredLanguage = body.language;
    await req.user.save();

    res.json({
      preferences: {
        language: req.user.preferredLanguage,
      },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Failed to update preferences" });
  }
}

module.exports = { getMyPreferences, updateMyPreferences };