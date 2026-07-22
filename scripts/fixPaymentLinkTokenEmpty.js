/**
 * One-time DB cleanup: any customproductionrequests / bulkoffers row that
 * was created BEFORE the paymentLink.token default / insert-value was
 * changed from "" to null still has token: "" in the database. That row
 * is in the unique-sparse index, and any new insert that also writes
 * token: "" will collide on E11000.
 *
 * Run this script ONCE after deploying the model + controller fix:
 *   node scripts/fixPaymentLinkTokenEmpty.js
 *
 * It rewrites every existing paymentLink.token = "" to null. Because
 * the index is `unique: true, sparse: true`, MongoDB drops the now-null
 * entries from the index, so subsequent inserts no longer collide.
 *
 * SAFE to run multiple times — the second run is a no-op.
 */

const mongoose = require("mongoose");
const { connect } = require("../src/config/db");
const BulkOffer = require("../src/models/BulkOffer");
const CustomProductionRequest = require("../src/models/CustomProductionRequest");

(async () => {
  await connect();
  console.log("Connected. Cleaning up paymentLink.token = \"\" rows...");

  const bulk = await BulkOffer.updateMany(
    { "paymentLink.token": "" },
    { $set: { "paymentLink.token": null } }
  );
  console.log(`BulkOffer: matched=${bulk.matchedCount} modified=${bulk.modifiedCount}`);

  const rfq = await CustomProductionRequest.updateMany(
    { "paymentLink.token": "" },
    { $set: { "paymentLink.token": null } }
  );
  console.log(`CustomProductionRequest: matched=${rfq.matchedCount} modified=${rfq.modifiedCount}`);

  await mongoose.disconnect();
  console.log("Done.");
  process.exit(0);
})().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
