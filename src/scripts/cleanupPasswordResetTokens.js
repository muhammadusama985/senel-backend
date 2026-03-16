const mongoose = require("mongoose");
const PasswordResetToken = require("../models/PasswordResetToken");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  await PasswordResetToken.updateMany(
    { status: "active", expiresAt: { $lt: new Date() } },
    { $set: { status: "expired" } }
  );

  // optional: delete old records after 30 days
  await PasswordResetToken.deleteMany({ createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } });

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});