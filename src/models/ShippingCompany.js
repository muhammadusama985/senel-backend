const mongoose = require("mongoose");

const shippingCompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, required: true, trim: true, lowercase: true, unique: true },
    description: { type: String, default: "" },
    logoUrl: { type: String, default: "" },
    trackingUrlTemplate: { type: String, default: "" },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    contactInfo: {
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      website: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

shippingCompanySchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model("ShippingCompany", shippingCompanySchema);