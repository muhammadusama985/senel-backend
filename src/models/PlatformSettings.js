const mongoose = require("mongoose");

const platformSettingsSchema = new mongoose.Schema(
  {
    // single doc usage
    key: { type: String, unique: true, default: "default" },

    bankTransfer: {
      enabled: { type: Boolean, default: true },
      bankName: { type: String, default: "" },
      accountTitle: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      iban: { type: String, default: "" },
      swift: { type: String, default: "" },
      instructions: { type: String, default: "" },
    },

    tax: {
      enabled: { type: Boolean, default: true },
      mode: { type: String, enum: ["exclusive", "inclusive"], default: "exclusive" },
      defaultRate: { type: Number, default: 0 }, // e.g. 19 for 19%

      // Optional: country-based overrides
      countryRates: {
        type: [
          {
            country: { type: String },
            rate: { type: Number },
          }
        ],
        default: [],
      },

      applyOnShipping: { type: Boolean, default: false },
    },

    manualShipping: {
      enabled: { type: Boolean, default: true },
      message: { type: String, default: "Shipping cost will be confirmed after checkout." },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlatformSettings", platformSettingsSchema);