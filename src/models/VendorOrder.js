const mongoose = require("mongoose");

const VENDOR_ORDER_STATUS = [
  "placed",        // created after checkout
  "picking",       // admin fulfillment picking step
  "accepted",      // vendor accepts
  "packed",        // vendor packs
  "ready_pickup",  // vendor marks ready for pickup (shipping prep)
  "shipped",       // admin updates (manual shipping)
  "delivered",     // admin updates
  "cancelled",
];

const vendorOrderSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null, index: true },
    fulfillmentType: { type: String, enum: ["vendor", "admin"], default: "vendor", index: true },
    fulfillmentOwner: { type: String, enum: ["vendor", "admin"], default: "vendor", index: true },

    // Snapshot store data (optional but useful)
    vendorStoreName: { type: String, default: "" },
    vendorStoreSlug: { type: String, default: "" },

    status: { type: String, enum: VENDOR_ORDER_STATUS, default: "placed", index: true },

    paymentStatus: {
      type: String,
      enum: ["unpaid", "awaiting_transfer", "under_review", "paid", "rejected", "refunded"],
      default: "unpaid",
      index: true,
    },

    boxCount: { type: Number, default: 1, min: 1 },
    labelNotes: { type: String, default: "" },

    // ✅ ENHANCED: Detailed packages array (per box dimensions)
    packages: {
      type: [
        {
          boxIndex: { type: Number, min: 1, required: true },
          weightKg: { type: Number, default: 0 },
          lengthCm: { type: Number, default: 0 },
          widthCm: { type: Number, default: 0 },
          heightCm: { type: Number, default: 0 },
        },
      ],
      default: [],
    },

    // ✅ Handover specific fields
    handoverStatus: {
      type: String,
      enum: ["not_ready", "ready_for_pickup", "picked_up", "in_transit", "delivered"],
      default: "not_ready",
      index: true,
    },

    readyForPickupAt: { type: Date, default: null },
    pickedUpAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    handoverNote: { type: String, default: "" },

    // ✅ Enhanced tracking object
    tracking: {
      carrier: { type: String, default: "" },
      trackingNumber: { type: String, default: "" },
      trackingUrl: { type: String, default: "" },
    },

    shippingPricingMode: { type: String, enum: ["auto", "manual_discuss"], default: "auto", index: true },
    shippingStatus: { type: String, enum: ["pending_quote", "quoted", "confirmed"], default: "pending_quote", index: true },

    shippingQuote: {
      amount: { type: Number, default: 0 },
      note: { type: String, default: "" },
      quotedAt: { type: Date, default: null },
      quotedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },

    // Shipping prep details (vendor enters weight/dimensions per PDF)
    shippingPrep: {
      weightKg: { type: Number, default: 0 },
      lengthCm: { type: Number, default: 0 },
      widthCm: { type: Number, default: 0 },
      heightCm: { type: Number, default: 0 },
      boxCount: { type: Number, default: 1 },
      readyForPickupAt: { type: Date },
    },

    pickup: {
      scheduledAt: { type: Date },
      pickupWindow: { type: String, default: "" }, // e.g. "10:00-14:00"
      notes: { type: String, default: "" },
    },

    // Manual shipping assignment (admin later)
    shipping: {
      partnerName: { type: String, default: "" },
      trackingCode: { type: String, default: "" }, // optional even in manual model
      shippedAt: { type: Date },
      deliveredAt: { type: Date },
    },

    subtotal: { type: Number, required: true, min: 0 },
    shippingTotal: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    discountTotal: { type: Number, default: 0, min: 0 },
    currency: { type: String, enum: ["EUR", "TRY", "USD"], default: "EUR", index: true },

    vendorOrderNumber: { type: String, required: true, unique: true, index: true },

    // Vendor notes / admin notes
    vendorNote: { type: String, default: "" },
    adminNote: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VendorOrder", vendorOrderSchema);
