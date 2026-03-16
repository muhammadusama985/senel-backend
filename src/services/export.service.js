const { createObjectCsvWriter } = require('csv-writer');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

class ExportService {
  constructor() {
    this.exportDir = path.join(__dirname, '../../exports');
    // Ensure export directory exists
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  /**
   * Export data to CSV
   */
  async toCSV(data, headers, filename) {
    const filePath = path.join(this.exportDir, `${filename}.csv`);
    
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: headers.map(h => ({ id: h.key, title: h.label }))
    });

    await csvWriter.writeRecords(data);
    
    return {
      filePath,
      filename: `${filename}.csv`,
      downloadUrl: `/exports/${filename}.csv`
    };
  }

  /**
   * Export data to Excel
   */
  async toExcel(data, sheets, filename) {
    const workbook = new ExcelJS.Workbook();
    
    sheets.forEach(sheet => {
      const worksheet = workbook.addWorksheet(sheet.name);
      
      // Add headers
      worksheet.columns = sheet.headers.map(h => ({
        header: h.label,
        key: h.key,
        width: h.width || 20
      }));
      
      // Add data
      worksheet.addRows(sheet.data);
      
      // Style headers
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    });

    const filePath = path.join(this.exportDir, `${filename}.xlsx`);
    await workbook.xlsx.writeFile(filePath);
    
    return {
      filePath,
      filename: `${filename}.xlsx`,
      downloadUrl: `/exports/${filename}.xlsx`
    };
  }

  /**
   * Export orders report
   */
  async exportOrders(orders, format = 'csv') {
    const headers = [
      { key: 'orderNumber', label: 'Order Number' },
      { key: 'customerName', label: 'Customer' },
      { key: 'date', label: 'Date' },
      { key: 'subtotal', label: 'Subtotal' },
      { key: 'discount', label: 'Discount' },
      { key: 'shipping', label: 'Shipping' },
      { key: 'tax', label: 'Tax' },
      { key: 'total', label: 'Total' },
      { key: 'status', label: 'Status' },
      { key: 'paymentMethod', label: 'Payment Method' },
      { key: 'paymentStatus', label: 'Payment Status' }
    ];

    const data = orders.map(order => ({
      orderNumber: order.orderNumber,
      customerName: order.customerName || 'N/A',
      date: new Date(order.createdAt).toLocaleDateString(),
      subtotal: order.subtotal,
      discount: order.discountTotal || 0,
      shipping: order.shippingTotal || 0,
      tax: order.taxAmount || 0,
      total: order.grandTotal,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus
    }));

    const filename = `orders_${new Date().toISOString().split('T')[0]}`;
    
    if (format === 'csv') {
      return this.toCSV(data, headers, filename);
    } else {
      return this.toExcel([{ name: 'Orders', headers, data }], filename);
    }
  }

  /**
   * Export products report
   */
  async exportProducts(products, format = 'csv') {
    const headers = [
      { key: 'title', label: 'Product Name' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'category', label: 'Category' },
      { key: 'price', label: 'Price' },
      { key: 'moq', label: 'MOQ' },
      { key: 'stock', label: 'Stock' },
      { key: 'status', label: 'Status' },
      { key: 'createdAt', label: 'Created Date' }
    ];

    const data = products.map(product => ({
      title: product.title,
      vendor: product.vendorName || 'N/A',
      category: product.categoryName || 'N/A',
      price: product.priceTiers[0]?.unitPrice || 0,
      moq: product.moq,
      stock: product.stockQty,
      status: product.status,
      createdAt: new Date(product.createdAt).toLocaleDateString()
    }));

    const filename = `products_${new Date().toISOString().split('T')[0]}`;
    
    if (format === 'csv') {
      return this.toCSV(data, headers, filename);
    } else {
      return this.toExcel([{ name: 'Products', headers, data }], filename);
    }
  }

  /**
   * Export analytics report
   */
  async exportAnalytics(analytics, format = 'csv') {
    const sheets = [
      {
        name: 'Summary',
        headers: [
          { key: 'metric', label: 'Metric', width: 30 },
          { key: 'value', label: 'Value', width: 20 }
        ],
        data: Object.entries(analytics.summary).map(([key, value]) => ({
          metric: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
          value
        }))
      },
      {
        name: 'Orders by Status',
        headers: [
          { key: 'status', label: 'Status', width: 20 },
          { key: 'count', label: 'Count', width: 15 },
          { key: 'total', label: 'Total', width: 20 }
        ],
        data: analytics.ordersByStatus.map(s => ({
          status: s._id,
          count: s.orders,
          total: s.grandTotalSum
        }))
      },
      {
        name: 'Top Products',
        headers: [
          { key: 'name', label: 'Product', width: 40 },
          { key: 'quantity', label: 'Quantity', width: 15 },
          { key: 'revenue', label: 'Revenue', width: 20 }
        ],
        data: analytics.topProducts.map(p => ({
          name: p.title,
          quantity: p.totalQty,
          revenue: p.totalRevenue
        }))
      }
    ];

    const filename = `analytics_${new Date().toISOString().split('T')[0]}`;
    
    if (format === 'csv') {
      // For CSV, we'll create multiple files
      const results = [];
      for (const sheet of sheets) {
        const result = await this.toCSV(sheet.data, sheet.headers, `${filename}_${sheet.name}`);
        results.push(result);
      }
      return results;
    } else {
      return this.toExcel(sheets, filename);
    }
  }

  /**
   * Clean old exports
   */
  async cleanOldExports(days = 7) {
    const files = fs.readdirSync(this.exportDir);
    const now = Date.now();
    
    files.forEach(file => {
      const filePath = path.join(this.exportDir, file);
      const stats = fs.statSync(filePath);
      const daysOld = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
      
      if (daysOld > days) {
        fs.unlinkSync(filePath);
      }
    });
  }
}

module.exports = new ExportService();