const PDFDocument = require("pdfkit");

/**
 * Creates a well-structured packaging label PDF (1 page per box).
 * @param {Object} payload
 * @param {Object} payload.vendorOrder
 * @param {Object} payload.vendor
 * @param {Object} payload.order
 * @param {Array}  payload.items
 * @returns {PDFDocument}
 */
function buildPackagingLabelPdf({ vendorOrder, vendor, order, items }) {
  const doc = new PDFDocument({ 
    size: "A4", 
    margin: 50
  });

  // Use shippingPrep.boxCount if available, fallback to top-level boxCount
  const boxCount = Math.max(1, Number(vendorOrder.shippingPrep?.boxCount || vendorOrder.boxCount || 1));

  for (let boxIndex = 1; boxIndex <= boxCount; boxIndex++) {
    if (boxIndex > 1) doc.addPage();

    // ===== HEADER =====
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .text('PACKAGING LABEL', { align: 'center' });
    
    doc.moveDown(0.5);
    doc.fontSize(14)
       .font('Helvetica')
       .text(`BOX ${boxIndex} of ${boxCount}`, { align: 'center' });
    
    doc.moveDown(1);

    // ===== DIVIDER LINE =====
    doc.moveTo(50, doc.y)
       .lineTo(560, doc.y)
       .lineWidth(1)
       .stroke();
    
    doc.moveDown(1);

    // ===== TWO-COLUMN LAYOUT =====
    const leftCol = 50;
    const rightCol = 320;
    const startY = doc.y;

    // Left Column - Order Details
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('ORDER DETAILS', leftCol, startY);
    
    doc.moveDown(0.5);
    doc.fontSize(10)
       .font('Helvetica');

    let leftY = doc.y;
    doc.text(`Order #: ${vendorOrder.vendorOrderNumber || vendorOrder._id}`, leftCol, leftY);
    doc.text(`Main Order: ${order.orderNumber || order._id}`, leftCol, leftY + 20);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, leftCol, leftY + 40);
    doc.text(`Status: ${vendorOrder.status.replace('_', ' ').toUpperCase()}`, leftCol, leftY + 60);
    doc.text(`Boxes: ${boxCount}`, leftCol, leftY + 80);

    // Right Column - Vendor Details
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('VENDOR DETAILS', rightCol, startY);
    
    doc.moveDown(0.5);
    doc.fontSize(10)
       .font('Helvetica');

    let rightY = doc.y;
    doc.text(`${vendor.storeName || 'Vendor'}`, rightCol, rightY);
    if (vendor.storeSlug) doc.text(`@${vendor.storeSlug}`, rightCol, rightY + 20);
    if (vendor.business?.companyName) doc.text(`${vendor.business.companyName}`, rightCol, rightY + 40);
    if (vendor.business?.country) doc.text(`${vendor.business.city || ''}, ${vendor.business.country}`, rightCol, rightY + 60);

    // ===== SHIPPING ADDRESS SECTION =====
    doc.moveDown(8);
    
    // Section line
    const sectionY = doc.y;
    doc.moveTo(50, sectionY)
       .lineTo(560, sectionY)
       .lineWidth(0.5)
       .stroke();
    
    doc.moveDown(1);
    
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('SHIPPING ADDRESS', 50, doc.y);
    
    doc.moveDown(0.5);
    doc.fontSize(10)
       .font('Helvetica');

    const ship = order.shippingAddress || {};
    const buyerName = ship.companyName || ship.contactPerson || 'Customer';
    
    doc.text(buyerName, 50, doc.y);
    doc.moveDown(0.5);
    
    if (ship.contactPerson) doc.text(`Attn: ${ship.contactPerson}`);
    if (ship.phone) doc.text(`Phone: ${ship.phone}`);
    
    const addrLines = [
      ship.street1,
      ship.street2,
      [ship.city, ship.postalCode].filter(Boolean).join(' '),
      ship.country,
    ].filter(Boolean);
    
    addrLines.forEach(line => doc.text(line));

    // ===== ITEMS TABLE =====
    doc.moveDown(2);
    
    // Section line
    const tableLineY = doc.y;
    doc.moveTo(50, tableLineY)
       .lineTo(560, tableLineY)
       .lineWidth(0.5)
       .stroke();
    
    doc.moveDown(1);
    
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('ITEMS IN THIS SHIPMENT', 50, doc.y);
    
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    const colSku = 50;
    const colProduct = 150;
    const colQty = 500;

    doc.fontSize(10)
       .font('Helvetica-Bold')
       .text('SKU', colSku, tableTop)
       .text('Product', colProduct, tableTop)
       .text('Qty', colQty, tableTop, { align: 'right' });

    // Underline
    doc.moveTo(50, tableTop + 15)
       .lineTo(560, tableTop + 15)
       .stroke();

    let y = tableTop + 25;
    doc.font('Helvetica').fontSize(9);

    const safeItems = Array.isArray(items) ? items : [];
    safeItems.slice(0, 15).forEach(item => {
      const sku = item.variantSku || item.sku || '-';
      const name = item.title || item.productTitle || 'Item';
      const qty = item.qty || 0;

      doc.text(String(sku).slice(0, 15), colSku, y);
      doc.text(String(name).slice(0, 45), colProduct, y, { width: 330 });
      doc.text(String(qty), colQty, y, { align: 'right' });

      y += 18;
    });

    // ===== PACKAGE DETAILS =====
    doc.moveDown(2);
    
    // Section line
    const packageLineY = Math.max(y + 10, doc.y + 10);
    doc.moveTo(50, packageLineY)
       .lineTo(560, packageLineY)
       .lineWidth(0.5)
       .stroke();
    
    doc.moveDown(1);

    // Two-column layout for package details
    const packageStartY = doc.y;
    
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('PACKAGE DETAILS', 50, packageStartY);
    
    doc.moveDown(0.5);
    doc.fontSize(10)
       .font('Helvetica');

    // Left column - Dimensions
    if (vendorOrder.shippingPrep) {
      doc.text(`Weight: ${vendorOrder.shippingPrep.weightKg || 0} kg`, 50, doc.y);
      doc.moveDown(0.5);
      doc.text(`Dimensions: ${vendorOrder.shippingPrep.lengthCm || 0} x ${vendorOrder.shippingPrep.widthCm || 0} x ${vendorOrder.shippingPrep.heightCm || 0} cm`, 50, doc.y);
    }

    // Right column - Notes
    if (vendorOrder.labelNotes) {
      const notesY = packageStartY + 25;
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('NOTES', 320, packageStartY);
      
      doc.fontSize(10)
         .font('Helvetica')
         .text(vendorOrder.labelNotes, 320, notesY, { width: 220 });
    }

    // ===== FOOTER =====
    doc.fontSize(8)
       .font('Helvetica')
       .text(`Generated on ${new Date().toLocaleString()}`, 50, 780, { align: 'center', width: 520 });
  }

  return doc;
}

module.exports = { buildPackagingLabelPdf };