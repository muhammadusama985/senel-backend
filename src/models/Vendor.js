const mongoose = require("mongoose");

const VENDOR_STATUS = ["draft", "submitted", "under_review", "approved", "rejected", "blocked"];

const vendorSchema = new mongoose.Schema(
  {
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // Store profile
    storeName: { type: String, required: true, trim: true },
    storeSlug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    description: { type: String, default: "" },

    logoUrl: { type: String, default: "" },
    bannerUrl: { type: String, default: "" },

    // Business details (keep flexible for future fields)
    business: {
      companyName: { type: String, default: "" },
      taxId: { type: String, default: "" },
      country: { type: String, default: "" },
      city: { type: String, default: "" },
      addressLine: { type: String, default: "" },
      contactName: { type: String, default: "" },
      contactPhone: { type: String, default: "" },
    },

    // Uploaded verification docs (metadata only; actual file should be stored e.g. S3)
    verificationDocs: [
      {
        type: { type: String, required: true, trim: true }, // e.g. "trade_license", "tax_certificate"
        fileUrl: { type: String, required: true, trim: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    status: { type: String, enum: VENDOR_STATUS, default: "draft", index: true },

    isVerifiedBadge: { type: Boolean, default: false, index: true },

    // Admin review info
    reviewedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    reviewNote: { type: String, default: "" },

    // Admin can disable vendor capabilities (permissions control)
    permissions: {
      canCreateProducts: { type: Boolean, default: true },
      canReceiveOrders: { type: Boolean, default: true },
      canRequestPayouts: { type: Boolean, default: true },
    },

    settings: {
      timezone: { type: String, default: "Europe/Berlin" },
      currency: { type: String, default: "EUR" },
      language: { type: String, enum: ["en", "de", "tr"], default: "en" },
      notifications: {
        emailOrders: { type: Boolean, default: true },
        emailPayouts: { type: Boolean, default: true },
        emailMarketing: { type: Boolean, default: false },
        pushOrders: { type: Boolean, default: true },
        pushPayouts: { type: Boolean, default: true },
        pushLowStock: { type: Boolean, default: true },
      },
      security: {
        twoFactorAuth: { type: Boolean, default: false },
        sessionTimeout: { type: String, default: "30" },
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vendor", vendorSchema);
