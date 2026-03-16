const VendorOrder = require("../models/VendorOrder");
const Order = require("../models/Order");
const Vendor = require("../models/Vendor");
const OrderItem = require("../models/OrderItem");
const { buildPackagingLabelPdf } = require("../utils/pdf/packagingLabelPdf");

async function vendorDownloadPackagingLabel(req, res) {
  const vendorId = req.vendorContext.vendorId;
  const vendorOrderId = req.params.vendorOrderId;

  const vo = await VendorOrder.findOne({ _id: vendorOrderId, vendorId }).lean();
  if (!vo) return res.status(404).json({ message: "Vendor order not found" });

  const [vendor, order, items] = await Promise.all([
    Vendor.findById(vendorId).lean(),
    Order.findById(vo.orderId).lean(),
    OrderItem.find({ vendorOrderId: vo._id }).lean().catch(() => []), // if you store vendorOrderId on items
  ]);

  // Fallback if OrderItem doesn’t include vendorOrderId
  let resolvedItems = items;
  if (!resolvedItems || resolvedItems.length === 0) {
    const all = await OrderItem.find({ orderId: vo.orderId, vendorId }).lean();
    resolvedItems = all || [];
  }

  const doc = buildPackagingLabelPdf({
    vendorOrder: vo,
    vendor: vendor || {},
    order: order || {},
    items: resolvedItems,
  });

  const filename = `packaging-label-${vo.vendorOrderNumber || vo._id}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

  doc.pipe(res);
  doc.end();
}

module.exports = { vendorDownloadPackagingLabel };