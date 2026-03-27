const mongoose = require("mongoose");

const PRODUCT_STATUS = ["draft", "submitted", "approved", "rejected", "blocked", "archived"];
const HOT_REQUEST_STATUS = ["none", "pending", "approved", "rejected"];

const priceTierSchema = new mongoose.Schema(
  {
    minQty: { type: Number, required: true, min: 1 },   // e.g. 50
    unitPrice: { type: Number, required: true, min: 0 }, // e.g. 1.2
  },
  { _id: false }
);

const variantSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true },
    attributes: { type: Object, default: {} }, // e.g. { size:"M", color:"Black" }
    stockQty: { type: Number, default: 0, min: 0 },
    imageUrls: [{ type: String, trim: true }],
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null, index: true },

    title: { type: String, required: true, trim: true, index: true },
    titleML: {
      en: { type: String, default: "", trim: true },
      de: { type: String, default: "", trim: true },
      tr: { type: String, default: "", trim: true },
    },
    sku: { type: String, default: "", trim: true, index: true },
    slug: { type: String, required: true, trim: true, lowercase: true, index: true },
    description: { type: String, default: "" },
    descriptionML: {
      en: { type: String, default: "", trim: true },
      de: { type: String, default: "", trim: true },
      tr: { type: String, default: "", trim: true },
    },

    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true, index: true },
    attributeSetId: { type: mongoose.Schema.Types.ObjectId, ref: "AttributeSet", default: null, index: true },

    // B2B rules
    moq: { type: Number, required: true, min: 1 }, // Minimum Order Quantity
    priceTiers: { type: [priceTierSchema], default: [] }, // must be sorted by minQty asc

    // Inventory
    stockQty: { type: Number, default: 0, min: 0 }, // for non-variant products
    hasVariants: { type: Boolean, default: false },
    variants: { type: [variantSchema], default: [] },
    trackInventory: { type: Boolean, default: true, index: true },

    lowStockThreshold: { type: Number, default: 5, min: 0 },

    // anti-spam / state
    lowStockActive: { type: Boolean, default: false, index: true },
    lowStockNotifiedAt: { type: Date, default: null },

    // Media
    imageUrls: [{ type: String, trim: true }],

    // Product lifecycle & admin controls
    status: { type: String, enum: PRODUCT_STATUS, default: "draft", index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    hotRequestStatus: { type: String, enum: HOT_REQUEST_STATUS, default: "none", index: true },
    hotRequestNote: { type: String, default: "" },
    hotRequestedAt: { type: Date, default: null },
    hotReviewedAt: { type: Date, default: null },
    hotReviewedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    reviewedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    reviewNote: { type: String, default: "" },
    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    source: {
      type: String,
      enum: ["vendor", "admin_platform", "admin_vendor"],
      default: "vendor",
      index: true,
    },
    isPlatformProduct: { type: Boolean, default: false, index: true },

    requiresManualShipping: { type: Boolean, default: false, index: true },

    // Optional: country of origin/manufacturing etc. helpful for filtering
    country: { type: String, default: "", index: true },
    currency: { type: String, enum: ["EUR", "TRY", "USD"], default: "EUR", index: true },
  },
  { timestamps: true }
);

// Helpful index for customer searches
productSchema.index({ title: "text", description: "text" });
productSchema.index({
  "titleML.en": "text",
  "titleML.de": "text",
  "titleML.tr": "text",
  "descriptionML.en": "text",
  "descriptionML.de": "text",
  "descriptionML.tr": "text",
});

module.exports = mongoose.model("Product", productSchema);
