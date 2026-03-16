const mongoose = require("mongoose");

const USER_ROLES = ["admin", "vendor", "customer"];
const USER_STATUS = ["active", "blocked", "disabled"];

const userSchema = new mongoose.Schema(
  {
    email: { type: String, trim: true, lowercase: true, index: true },
    phone: { type: String, trim: true, index: true },
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },
    companyName: { type: String, trim: true, default: "" },
    taxId: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    addressLine: { type: String, trim: true, default: "" },
    contactPhone: { type: String, trim: true, default: "" },

    passwordHash: { type: String, required: true },
    loginOtpHash: { type: String, default: null },
    loginOtpExpiresAt: { type: Date, default: null },
    loginOtpAttempts: { type: Number, default: 0 },
    preferredLanguage: {
      type: String,
      enum: ["en", "de", "tr"],
      default: "en"
    },

    role: { type: String, enum: USER_ROLES, required: true, index: true },
    status: { type: String, enum: USER_STATUS, default: "active", index: true },

    // B2B relevant placeholders (we’ll extend later)
    isVerifiedBusiness: { type: Boolean, default: false }, // customer/vendor verification flag later
  },
  { timestamps: true }
);

// Ensure at least one identifier exists
userSchema.pre("validate", function () {
  if (!this.email && !this.phone) {
    this.invalidate("email", "Either email or phone is required");
    this.invalidate("phone", "Either email or phone is required");
  }
});

module.exports = mongoose.model("User", userSchema);
