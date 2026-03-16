const PlatformSettings = require("../models/PlatformSettings");

async function getSettings() {
  let doc = await PlatformSettings.findOne({ key: "default" }).lean();
  if (!doc) {
    doc = await PlatformSettings.create({ key: "default" });
    doc = doc.toObject();
  }
  return doc;
}

async function updateSettings(patch) {
  const doc = await PlatformSettings.findOneAndUpdate(
    { key: "default" },
    { $set: patch },
    { upsert: true, new: true }
  ).lean();
  return doc;
}

module.exports = { getSettings, updateSettings };