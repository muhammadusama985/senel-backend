const mongoose = require("mongoose");

const passwordResetTokenSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },

    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },

    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },

    // anti-spam
    resendCount: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: null },

    status: { type: String, enum: ["active", "used", "expired", "locked"], default: "active", index: true },

    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

passwordResetTokenSchema.index({ email: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("PasswordResetToken", passwordResetTokenSchema);