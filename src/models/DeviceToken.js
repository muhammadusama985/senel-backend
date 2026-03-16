const mongoose = require("mongoose");

const deviceTokenSchema = new mongoose.Schema(
  {
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true,
      index: true 
    },
    token: { 
      type: String, 
      required: true,
      index: true 
    },
    platform: { 
      type: String, 
      enum: ["ios", "android", "web"], 
      required: true 
    },
    deviceId: { 
      type: String, 
      default: "" 
    },
    appVersion: { 
      type: String, 
      default: "" 
    },
    isActive: { 
      type: Boolean, 
      default: true,
      index: true 
    },
    lastUsed: { 
      type: Date, 
      default: Date.now 
    },
  },
  { timestamps: true }
);

// Unique constraint per user per token
deviceTokenSchema.index({ userId: 1, token: 1 }, { unique: true });

module.exports = mongoose.model("DeviceToken", deviceTokenSchema);