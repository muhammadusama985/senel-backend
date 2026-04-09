const Product = require("../models/Product");
const { notifyVendorOwner } = require("./notification.service");

/**
 * Adjust stock by delta (+ / -), then trigger low stock logic.
 * Call inside checkout transaction with session.
 */
async function adjustStock({ productId, variantSku, delta, reason = "", session }) {
  const product = await Product.findOne({ _id: productId, trackInventory: true }, null, { session });

  // If product not tracked or not found, skip
  if (!product) return null;

  if (product.hasVariants && variantSku) {
    const variant = (product.variants || []).find((item) => item.sku === variantSku);
    if (!variant) {
      const err = new Error(`Variant ${variantSku || ""} not found for product ${productId}`);
      err.statusCode = 400;
      throw err;
    }
  }

  product.stockQty = Number(product.stockQty || 0) + Number(delta || 0);
  if (product.stockQty < 0) {
    product.stockQty = 0;
  }

  if (product.hasVariants && Array.isArray(product.variants)) {
    product.variants = product.variants.map((variant) => ({
      ...(typeof variant.toObject === "function" ? variant.toObject() : variant),
      stockQty: product.stockQty,
    }));
  }

  await product.save({ session });

  // 3) Low stock state machine
  await checkLowStockAndNotify(product, session, reason, {
    qtyOverride: product.stockQty,
    sku: variantSku || product.sku || "",
  });

  return product;
}

/**
 * Notify once when entering low stock state.
 * Reset when stock goes above threshold.
 */
async function checkLowStockAndNotify(productDoc, session, reason, alertContext = {}) {
  const threshold = Number(productDoc.lowStockThreshold || 0);
  const qty = Number(alertContext.qtyOverride ?? productDoc.stockQty ?? 0);
  const sku = alertContext.sku || productDoc.sku || "";

  // If threshold is 0, treat as disabled (or low stock at 0 only). Here: disabled.
  if (threshold <= 0) {
    if (productDoc.lowStockActive) {
      productDoc.lowStockActive = false;
      productDoc.lowStockNotifiedAt = null;
      await productDoc.save({ session });
    }
    return;
  }

  const isLowNow = qty <= threshold;

  // If recovered above threshold, reset state so it can notify next time it drops
  if (!isLowNow && productDoc.lowStockActive) {
    productDoc.lowStockActive = false;
    productDoc.lowStockNotifiedAt = null;
    await productDoc.save({ session });
    return;
  }

  // If low now and not yet active, enter state + notify
  if (isLowNow && !productDoc.lowStockActive) {
    productDoc.lowStockActive = true;
    productDoc.lowStockNotifiedAt = new Date();
    await productDoc.save({ session });

    // Notify vendor users (owner + team)
    await notifyVendorOwner({
      vendorId: productDoc.vendorId,
      title: "Low stock alert",
      body: `"${productDoc.title}" is low on stock (${qty} left, threshold ${threshold}).`,
      type: "low_stock",
      data: {
        productId: productDoc._id,
        sku,
        qty,
        threshold,
        reason,
      },
    });
  }
}

module.exports = { adjustStock, checkLowStockAndNotify };
