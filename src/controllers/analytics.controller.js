const exportService = require('../services/export.service');
const behaviorAnalytics = require('../services/behaviorAnalytics.service');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');

/**
 * Export orders report
 */
async function exportOrdersReport(req, res) {
  try {
    const { format = 'csv', startDate, endDate } = req.query;
    
    const query = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const orders = await Order.find(query)
      .populate('customerUserId', 'email firstName lastName')
      .lean();

    const result = await exportService.exportOrders(orders, format);
    
    res.download(result.filePath, result.filename);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Export products report
 */
async function exportProductsReport(req, res) {
  try {
    const { format = 'csv' } = req.query;
    
    const products = await Product.find({})
      .populate('vendorId', 'storeName')
      .populate('categoryId', 'name')
      .lean();

    const result = await exportService.exportProducts(products, format);
    
    res.download(result.filePath, result.filename);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Export analytics report
 */
async function exportAnalyticsReport(req, res) {
  try {
    const { format = 'excel', startDate, endDate } = req.query;
    
    // Gather analytics data
    const query = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const orders = await Order.find(query).lean();
    const orderItems = await OrderItem.find(query)
      .populate('productId')
      .lean();

    const summary = {
      totalRevenue: orders.reduce((sum, o) => sum + o.grandTotal, 0),
      totalOrders: orders.length,
      averageOrderValue: orders.length ? 
        orders.reduce((sum, o) => sum + o.grandTotal, 0) / orders.length : 0
    };

    const ordersByStatus = await Order.aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$grandTotal' } } }
    ]);

    const topProducts = await OrderItem.aggregate([
      { $match: query },
      { $group: { _id: '$productId', totalQty: { $sum: '$qty' }, totalRevenue: { $sum: '$lineTotal' } } },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' }
    ]);

    const analytics = {
      summary,
      ordersByStatus,
      topProducts: topProducts.map(p => ({
        title: p.product.title,
        totalQty: p.totalQty,
        totalRevenue: p.totalRevenue
      }))
    };

    const result = await exportService.exportAnalytics(analytics, format);
    
    if (Array.isArray(result)) {
      // For multiple CSV files, zip them
      // For simplicity, send first file
      res.download(result[0].filePath, result[0].filename);
    } else {
      res.download(result.filePath, result.filename);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Get customer behavior analytics
 */
async function getCustomerBehavior(req, res) {
  try {
    const { customerId } = req.params;
    
    const [patterns, ltvPrediction] = await Promise.all([
      behaviorAnalytics.getCustomerPurchasePatterns(customerId),
      behaviorAnalytics.predictCustomerLTV(customerId)
    ]);

    res.json({
      patterns,
      ltvPrediction
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Get product affinity
 */
async function getProductAffinity(req, res) {
  try {
    const { productId } = req.params;
    const limit = parseInt(req.query.limit) || 5;
    
    const affinity = await behaviorAnalytics.getProductAffinity(productId, limit);
    
    res.json({ affinity });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Get abandoned cart stats
 */
async function getAbandonedCartStats(req, res) {
  try {
    const days = parseInt(req.query.days) || 30;
    const limit = parseInt(req.query.limit) || 10;

    const stats = await behaviorAnalytics.getAbandonedCartStats(days, limit);
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Get customer segments
 */
async function getCustomerSegments(req, res) {
  try {
    const segments = await behaviorAnalytics.getCustomerSegments();
    
    res.json(segments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  exportOrdersReport,
  exportProductsReport,
  exportAnalyticsReport,
  getCustomerBehavior,
  getProductAffinity,
  getAbandonedCartStats,
  getCustomerSegments
};
