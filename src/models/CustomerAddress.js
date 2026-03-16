const mongoose = require("mongoose");

const customerAddressSchema = new mongoose.Schema(
  {
    customerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    label: { type: String, default: "Default", trim: true }, // e.g. "Warehouse 1"
    isDefault: { type: Boolean, default: false, index: true },

    companyName: { type: String, default: "", trim: true },
    contactPerson: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },

    country: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    postalCode: { type: String, default: "", trim: true },

    street1: { type: String, required: true, trim: true },
    street2: { type: String, default: "", trim: true },

    notes: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

customerAddressSchema.index({ customerUserId: 1, createdAt: -1 });

module.exports = mongoose.model("CustomerAddress", customerAddressSchema);