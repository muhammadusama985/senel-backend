const mongoose = require("mongoose");

/**
 * Bulk Offer & Negotiation Module
 * Multi-round negotiation thread between a buyer and a seller for a specific
 * product. Buyers submit initial offers; sellers (or buyers) submit counter
 * offers until acceptance, rejection, or expiration.
 *
 * Lifecycle:
 *   requested -> countered | accepted | rejected | expired | cancelled
 *
 * On acceptance a `paymentLink` token is generated that powers the checkout
 * flow which auto-creates the order.
 */

const BULK_OFFER_STATUS = [
  "requested", // buyer initial offer
  "countered", // either side sent a counter
  "accepted", // both parties agreed - payment link generated
  "rejected", // either side rejected - terminal
  "expired", // validity passed with no action - terminal
  "cancelled", // buyer cancelled before agreement - terminal
];

const offerMessageSchema = new mongoose.Schema(
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

    // Snapshot of the offer terms at the time this message was sent
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "EUR" },
    notes: { type: String, default: "" },
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

const bulkOfferSchema = new mongoose.Schema(
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

    // Product snapshot (in case product is later edited/deleted)
    productSnapshot: {
      title: { type: String, default: "" },
      slug: { type: String, default: "" },
      imageUrl: { type: String, default: "" },
      currency: { type: String, default: "EUR" },
      moq: { type: Number, default: 1 },
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

    // Current / agreed terms (updated on every counter)
    currentQty: { type: Number, required: true, min: 1 },
    currentUnitPrice: { type: Number, required: true, min: 0 },
    currentTotal: { type: Number, default: 0 },
    currency: { type: String, default: "EUR", index: true },

    // Last action side - determines who is expected to respond next
    lastActionBy: {
      type: String,
      enum: ["buyer", "seller"],
      default: "buyer",
    },

    // Validity - extended whenever a new offer is sent
    validUntil: { type: Date, required: true, index: true },

    // Lifecycle
    status: {
      type: String,
      enum: BULK_OFFER_STATUS,
      default: "requested",
      index: true,
    },

    // Negotiation thread
    messages: [offerMessageSchema],

    // Optional shipping info captured at request time
    shippingAddress: { type: shippingAddressSnapshotSchema, default: null },

    // On acceptance, this token powers the payment link
    paymentLink: {
      token: { type: String, default: "", index: true, unique: true, sparse: true },
      generatedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
      usedAt: { type: Date, default: null },
      orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        default: null,
      },
    },

    // Order created from this offer (if accepted and paid)
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

bulkOfferSchema.index({ buyerUserId: 1, createdAt: -1 });
bulkOfferSchema.index({ vendorId: 1, createdAt: -1 });
bulkOfferSchema.index({ status: 1, validUntil: 1 });

bulkOfferSchema.virtual("lineTotal").get(function () {
  return Number((this.currentQty * this.currentUnitPrice).toFixed(2));
});

bulkOfferSchema.set("toJSON", { virtuals: true });
bulkOfferSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("BulkOffer", bulkOfferSchema);
module.exports.BULK_OFFER_STATUS = BULK_OFFER_STATUS;