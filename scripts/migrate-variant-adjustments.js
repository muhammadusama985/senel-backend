/**
 * One-shot migration: for every product that has variants but no
 * `variantAdjustments` map yet, build a `variantAdjustments` map with one
 * entry per variant (initial value 0 — vendors can re-tune via the new
 * editor). The legacy `attributeAdjustments` map is left in place so the
 * customer-side fallback can still use it.
 *
 * Run with:
 *   node scripts/migrate-variant-adjustments.js
 *
 * Safe to re-run: existing entries are not overwritten.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../src/models/Product");

async function run() {
  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    "mongodb://localhost:27017/senel";

  await mongoose.connect(uri);
  console.log(`Connected to ${uri}`);

  const cursor = Product.find({
    hasVariants: true,
    $or: [
      { variantAdjustments: { $exists: false } },
      { variantAdjustments: {} },
    ],
  }).cursor();

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for await (const product of cursor) {
    scanned += 1;
    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (!variants.length) {
      skipped += 1;
      continue;
    }

    const existing = product.variantAdjustments || {};
    const next = { ...existing };

    for (const variant of variants) {
      const attrs = variant.attributes || {};
      const titles = Object.keys(attrs).sort();
      const key = titles
        .map((t) => {
          const v = attrs[t];
          return v == null || v === '' ? '' : String(v);
        })
        .filter((p) => p !== '')
        .join('|');
      if (!key) continue;
      if (next[key] == null) next[key] = 0;
    }

    // Only write if there's something new.
    const hasNew = Object.keys(next).some((k) => existing[k] == null);
    if (hasNew) {
      product.variantAdjustments = next;
      product.markModified("variantAdjustments");
      await product.save();
      updated += 1;
    } else {
      skipped += 1;
    }
  }

  console.log(
    `Done. scanned=${scanned} updated=${updated} skipped=${skipped}`
  );
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});