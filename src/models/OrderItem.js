const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    vendorOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "VendorOrder", required: true, index: true },

    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null, index: true },

    title: { type: String, required: true },
    imageUrl: { type: String, default: "" },

    variantSku: { type: String, default: "" },
    variantAttributes: { type: Object, default: {} },

    qty: { type: Number, required: true, min: 1 },

    // Price frozen at checkout:
    unitPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ["EUR", "TRY", "USD"], default: "EUR" },
    tierMinQtyApplied: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OrderItem", orderItemSchema);
