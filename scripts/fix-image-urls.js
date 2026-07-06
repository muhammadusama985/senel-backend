/**
 * One-time migration script to fix mixed-content warnings.
 * Rewrites http://... image URLs to https://... in all image-related fields
 * across the database.
 *
 * Run with:  node senel-backend/scripts/fix-image-urls.js
 *
 * Safe to run multiple times — already-https URLs are left untouched.
 */

const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const Category = require("../src/models/Category");
const Vendor = require("../src/models/Vendor");
const Banner = require("../src/models/Banner");
const BlogPost = require("../src/models/BlogPost");
const ShippingCompany = require("../src/models/ShippingCompany");
const { loadEnv } = require("../src/config/env");

loadEnv();

function fixStringUrl(url) {
  if (typeof url !== "string") return url;
  if (url.startsWith("http://")) return url.replace(/^http:\/\//, "https://");
  return url;
}

function fixArray(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(fixStringUrl);
}

function fixVariantsImageUrls(variants) {
  if (!Array.isArray(variants)) return variants;
  return variants.map((v) => ({
    ...v,
    imageUrls: fixArray(v?.imageUrls || []),
  }));
}

async function migrateModel(model, fields, label) {
  let totalFixed = 0;
  for (const field of fields) {
    const query = { [field.path]: { $regex: "^http://" } };
    const docs = await model.find(query).lean();
    for (const doc of docs) {
      const value = doc[field.path];
      let update;

      if (field.special === "variants.imageUrls") {
        update = { variants: fixVariantsImageUrls(doc.variants) };
      } else if (Array.isArray(value)) {
        update = { [field.path]: fixArray(value) };
      } else if (typeof value === "string") {
        update = { [field.path]: fixStringUrl(value) };
      } else {
        continue;
      }

      await model.updateOne({ _id: doc._id }, { $set: update });
      totalFixed++;
    }
  }
  console.log(`  ${label}: fixed ${totalFixed} documents`);
  return totalFixed;
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(
      "Connected. Migrating http:// -> https:// for image URLs...\n"
    );

    let total = 0;

    total += await migrateModel(
      Product,
      [
        { path: "imageUrls" },
        { path: "logoUrl" },
        { path: "bannerImageUrl" },
        { path: "variants.imageUrls", special: "variants.imageUrls" },
      ],
      "Product"
    );

    total += await migrateModel(
      Category,
      [{ path: "imageUrl" }],
      "Category"
    );

    total += await migrateModel(
      Vendor,
      [
        { path: "logoUrl" },
        { path: "bannerUrl" },
        { path: "verificationDocs.fileUrl" },
      ],
      "Vendor"
    );

    total += await migrateModel(
      Banner,
      [{ path: "imageUrl" }, { path: "imageUrlMobile" }],
      "Banner"
    );

    total += await migrateModel(
      BlogPost,
      [{ path: "coverImageUrl" }],
      "BlogPost"
    );

    total += await migrateModel(
      ShippingCompany,
      [{ path: "logoUrl" }],
      "ShippingCompany"
    );

    console.log(`\nDone. Total documents fixed: ${total}`);
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
})();