const { z } = require("zod");
const Product = require("../models/Product");
const { adjustStock } = require("../services/inventory.service");

const updateSchema = z.object({
  trackInventory: z.boolean().optional(),
  stockQty: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
});

async function listLowStock(req, res) {
  const vendorId = req.vendorContext.vendorId;

  const query = {
    vendorId,
    trackInventory: true,
    lowStockActive: true,
  };

  const [items, total] = await Promise.all([
    Product.find(query)
      .sort({ updatedAt: -1 })
      .lean(),
    Product.countDocuments(query),
  ]);

  res.json({ items, total });
}

async function updateProductInventory(req, res) {
  const vendorId = req.vendorContext.vendorId;
  const body = updateSchema.parse(req.body);

  const p = await Product.findOne({ _id: req.params.productId, vendorId });
  if (!p) return res.status(404).json({ message: "Product not found" });

  // Direct set (admin-like). If you prefer delta only, remove stockQty set.
  if (body.trackInventory !== undefined) p.trackInventory = body.trackInventory;
  if (body.lowStockThreshold !== undefined) p.lowStockThreshold = body.lowStockThreshold;

  // If stockQty is directly set, compute delta to run state machine consistently
  if (body.stockQty !== undefined) {
    const delta = body.stockQty - (p.stockQty || 0);
    // Save current changes first so adjustStock sees threshold/trackInventory correct
    await p.save();

    const updated = await adjustStock({
      productId: p._id,
      delta,
      reason: "MANUAL_STOCK_ADJUST",
      // not inside transaction here
      session: undefined,
    });

    return res.json({ product: updated });
  }

  await p.save();
  res.json({ product: p });
}

module.exports = { listLowStock, updateProductInventory };
