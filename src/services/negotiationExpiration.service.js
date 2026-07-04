const cron = require("node-cron");
const BulkOffer = require("../models/BulkOffer");
const CustomProductionRequest = require("../models/CustomProductionRequest");
const { notifyCounterpartyOnOffer } = require("../controllers/bulkOffers.controller");
const { notifyRFQ } = require("../controllers/customProduction.controller");

/**
 * Scheduled job that:
 *  - Marks expired bulk offers as "expired" and notifies both parties
 *  - Marks expired custom production requests as "expired" and notifies both parties
 */
async function runExpirationTick() {
  const now = new Date();

  try {
    const expiredOffers = await BulkOffer.find({
      status: { $in: ["requested", "countered"] },
      validUntil: { $lte: now },
    }).limit(200);

    for (const offer of expiredOffers) {
      offer.status = "expired";
      offer.messages.push({
        senderRole: "system",
        message: "Offer expired due to validity period.",
        qty: offer.currentQty,
        unitPrice: offer.currentUnitPrice,
        currency: offer.currency,
        attachments: [],
        createdAt: new Date(),
      });
      await offer.save();
      try {
        await notifyCounterpartyOnOffer(offer, "expired");
      } catch (err) {
        console.error("[expiration] notify offer failed:", err.message);
      }
    }
    if (expiredOffers.length) {
      console.log(`[expiration] expired ${expiredOffers.length} bulk offers`);
    }
  } catch (err) {
    console.error("[expiration] bulk offer tick error:", err.message);
  }

  try {
    const expiredRFQs = await CustomProductionRequest.find({
      status: { $in: ["requested", "quoted"] },
      validUntil: { $lte: now },
    }).limit(200);

    for (const rfq of expiredRFQs) {
      rfq.status = "expired";
      rfq.messages.push({
        senderRole: "system",
        message: "Custom production request expired due to validity period.",
        attachments: [],
        createdAt: new Date(),
      });
      await rfq.save();
      try {
        await notifyRFQ(rfq, "expired");
      } catch (err) {
        console.error("[expiration] notify RFQ failed:", err.message);
      }
    }
    if (expiredRFQs.length) {
      console.log(`[expiration] expired ${expiredRFQs.length} custom production requests`);
    }
  } catch (err) {
    console.error("[expiration] RFQ tick error:", err.message);
  }
}

class NegotiationExpirationService {
  constructor() {
    this.job = null;
  }

  init() {
    // Every 5 minutes
    this.job = cron.schedule("*/5 * * * *", runExpirationTick);
    console.log("[negotiationExpiration] service initialized");
  }

  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
    }
  }
}

module.exports = new NegotiationExpirationService();
module.exports.runExpirationTick = runExpirationTick;