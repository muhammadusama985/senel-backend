const mongoose = require("mongoose");

const ORDER_STATUS = ["placed", "cancelled"]; // keep master order simple; vendorOrders drive lifecycle

const orderSchema = new mongoose.Schema(
  {
    customerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // Address snapshot (B2B requirement: company + contact + warehouse/street)
    shippingAddress: {
      companyName: { type: String, default: "" },
      contactPerson: { type: String, default: "" },
      mobileNumber: { type: String, default: "" },
      country: { type: String, default: "" },
      city: { type: String, default: "" },
      street: { type: String, default: "" },
    },

    paymentMethod: { type: String, enum: ["cod", "card", "wallet", "bank_transfer", "online"], default: "cod", index: true },

    paymentStatus: {
      type: String,
      enum: ["unpaid", "awaiting_transfer", "under_review", "paid", "rejected", "refunded"],
      default: "unpaid",
      index: true,
    },
    // Manual shipping flow
    shippingPricingMode: { type: String, enum: ["auto", "manual_discuss"], default: "auto", index: true },
    shippingStatus: {
      type: String,
      enum: ["not_required", "pending_quote", "quoted", "confirmed"],
      default: "not_required",
      index: true,
    },

    shippingQuoteNote: { type: String, default: "" },

    // We'll store what the customer saw/accepted at checkout.
    shippingTotal: { type: Number, default: 0, min: 0 },

    coupon: {
      code: { type: String, default: "" },
      couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
      scope: { type: String, default: "" },
      vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
      discountType: { type: String, default: "" },
      value: { type: Number, default: 0 },
    },
    discountTotal: { type: Number, default: 0, min: 0 },

    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    taxableAmount: { type: Number, default: 0 },

    subtotal: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ["EUR", "TRY", "USD"], default: "EUR", index: true },

    bankTransfer: {
      reference: { type: String, default: "" },
      proofUrl: { type: String, default: "" },
      submittedAt: { type: Date, default: null },
      reviewedAt: { type: Date, default: null },
      reviewedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      rejectionReason: { type: String, default: "" },
    },

    paymentGateway: {
      provider: { type: String, default: "" },
      paymentIntentId: { type: String, default: "" },
      latestStatus: { type: String, default: "" },
      chargeId: { type: String, default: "" },
      failureMessage: { type: String, default: "" },
      lastEventAt: { type: Date, default: null },
    },

    refundRequest: {
      status: {
        type: String,
        enum: ["none", "requested", "refunded", "rejected"],
        default: "none",
      },
      accountHolderName: { type: String, default: "" },
      bankName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      iban: { type: String, default: "" },
      swiftCode: { type: String, default: "" },
      country: { type: String, default: "" },
      notes: { type: String, default: "" },
      requestedAt: { type: Date, default: null },
      processedAt: { type: Date, default: null },
      processedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      adminNote: { type: String, default: "" },
    },

    status: { type: String, enum: ORDER_STATUS, default: "placed", index: true },

    // Helpful identifier
    orderNumber: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
