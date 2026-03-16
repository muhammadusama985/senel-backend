const mongoose = require("mongoose");
const Product = require("../models/Product");
const { checkLowStockAndNotify } = require("../services/inventory.service");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const cursor = Product.find({ trackInventory: true }).cursor();
  for await (const p of cursor) {
    await checkLowStockAndNotify(p, undefined, "SCHEDULED_SCAN");
  }

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});