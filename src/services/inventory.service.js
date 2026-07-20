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

  const d = Number(delta || 0);

  if (product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0) {
    // Variant products: decrement ONLY the specific variant's stockQty.
    // The product-level stockQty is treated as the overall inventory (sum of
    // all variant stocks) and is recomputed below.
    if (variantSku) {
      const variant = product.variants.find((item) => item.sku === variantSku);
      if (!variant) {
        const err = new Error(`Variant ${variantSku} not found for product ${productId}`);
        err.statusCode = 400;
        throw err;
      }
      const plainVariant =
        typeof variant.toObject === "function" ? variant.toObject() : { ...variant };
      plainVariant.stockQty = Math.max(0, Number(plainVariant.stockQty || 0) + d);
      product.variants = product.variants.map((v) =>
        (typeof v.toObject === "function" ? v.toObject() : v).sku === variantSku ? plainVariant : v
      );
      // Keep the product-level stockQty in sync with the per-variant stocks.
      product.stockQty = product.variants.reduce(
        (sum, v) => sum + Math.max(0, Number(v.stockQty || 0)),
        0,
      );
    } else {
      // Variant product without a specific variant SKU (e.g. admin/platform
      // flows): spread the delta across all variants proportionally.
      const variants = product.variants.map((v) => {
        const plain = typeof v.toObject === "function" ? v.toObject() : { ...v };
        plain.stockQty = Math.max(0, Number(plain.stockQty || 0) + d);
        return plain;
      });
      product.variants = variants;
      product.stockQty = variants.reduce(
        (sum, v) => sum + Math.max(0, Number(v.stockQty || 0)),
        0,
      );
    }
  } else {
    // Non-variant products: just adjust the product-level stockQty.
    product.stockQty = Math.max(0, Number(product.stockQty || 0) + d);
  }

  await product.save({ session });

  // 3) Low stock state machine — pass the relevant stock for the alert context.
  let alertQty = product.stockQty;
  if (product.hasVariants && variantSku) {
    const v = (product.variants || []).find((x) => x.sku === variantSku);
    if (v) alertQty = Number(v.stockQty || 0);
  }
  await checkLowStockAndNotify(product, session, reason, {
    qtyOverride: alertQty,
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
