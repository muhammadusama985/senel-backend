const mongoose = require("mongoose");

/**
 * Custom Production Request (RFQ - Request For Quotation)
 * Buyer describes a custom manufacturing request. Vendor responds with a
 * quotation. Buyer accepts -> payment link generated -> order created.
 *
 * Lifecycle:
 *   requested -> quoted -> accepted | rejected | expired | cancelled
 *   After payment: -> in_production -> completed
 */

const RFQ_STATUS = [
  "requested", // buyer submitted
  "quoted", // vendor sent a quotation
  "accepted", // buyer accepted quotation - payment link generated
  "rejected", // either side rejected - terminal
  "expired", // validity passed with no action - terminal
  "cancelled", // buyer cancelled - terminal
  "in_production", // payment completed, production started
  "completed", // production finished - terminal
];

const quotationSchema = new mongoose.Schema(
  {
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, default: 0 },
    currency: { type: String, default: "EUR" },
    leadTimeDays: { type: Number, default: 0, min: 0 },
    productionNotes: { type: String, default: "" },
    termsAndConditions: { type: String, default: "" },
    quotedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    quotedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const rfqMessageSchema = new mongoose.Schema(
  {
    senderRole: {
      type: String,
      enum: ["buyer", "seller", "admin", "system"],
      required: true,
    },
    senderUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    senderVendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
    },
    senderName: { type: String, default: "" },
    message: { type: String, default: "" },
    attachments: [
      {
        url: { type: String, default: "" },
        filename: { type: String, default: "" },
        mimeType: { type: String, default: "" },
        size: { type: Number, default: 0 },
      },
    ],
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const shippingAddressSnapshotSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: "" },
    contactPerson: { type: String, default: "" },
    mobileNumber: { type: String, default: "" },
    country: { type: String, default: "" },
    city: { type: String, default: "" },
    street: { type: String, default: "" },
    postalCode: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const customProductionRequestSchema = new mongoose.Schema(
  {
    // Parties
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    buyerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Snapshots
    productSnapshot: {
      title: { type: String, default: "" },
      slug: { type: String, default: "" },
      imageUrl: { type: String, default: "" },
      currency: { type: String, default: "EUR" },
    },
    vendorSnapshot: {
      storeName: { type: String, default: "" },
      storeSlug: { type: String, default: "" },
    },
    buyerSnapshot: {
      email: { type: String, default: "" },
      firstName: { type: String, default: "" },
      lastName: { type: String, default: "" },
      companyName: { type: String, default: "" },
    },

    // Request specification
    qty: { type: Number, required: true, min: 1 },
    specifications: { type: String, default: "" },
    deliveryExpectations: { type: String, default: "" },

    attachments: [
      {
        url: { type: String, default: "" },
        filename: { type: String, default: "" },
        mimeType: { type: String, default: "" },
        size: { type: Number, default: 0 },
      },
    ],

    shippingAddress: { type: shippingAddressSnapshotSchema, default: null },

    // Validity window - extended each time a counter or quote is sent
    validUntil: { type: Date, required: true, index: true },

    // Lifecycle
    status: {
      type: String,
      enum: RFQ_STATUS,
      default: "requested",
      index: true,
    },

    // Conversation thread
    messages: [rfqMessageSchema],

    // Active quotation (latest)
    quotation: { type: quotationSchema, default: null },

    // Once buyer accepts the quote, a payment link is generated
    paymentLink: {
      token: { type: String, default: null, index: true, unique: true, sparse: true },
      generatedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
      usedAt: { type: Date, default: null },
      orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        default: null,
      },
    },

    // Order that resulted from this RFQ (after payment)
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

customProductionRequestSchema.index({ buyerUserId: 1, createdAt: -1 });
customProductionRequestSchema.index({ vendorId: 1, createdAt: -1 });
customProductionRequestSchema.index({ status: 1, validUntil: 1 });

module.exports = mongoose.model(
  "CustomProductionRequest",
  customProductionRequestSchema
);
module.exports.RFQ_STATUS = RFQ_STATUS;