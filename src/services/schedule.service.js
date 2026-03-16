const cron = require('node-cron');
const Order = require('../models/Order');
const VendorOrder = require('../models/VendorOrder');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const { sendLocalizedEmail } = require('./localizedEmail.service');
const exportService = require('./export.service');

class ScheduleService {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Initialize all scheduled jobs
   */
  init() {
    // Daily sales report at 8 AM
    this.scheduleDailyReport();
    
    // Weekly analytics report on Monday at 9 AM
    this.scheduleWeeklyReport();
    
    // Monthly performance report on 1st at 10 AM
    this.scheduleMonthlyReport();
    
    // Low stock alert daily at 7 AM
    this.scheduleLowStockAlert();
    
    // Clean old exports every day at 2 AM
    this.scheduleExportCleanup();
  }

  /**
   * Daily sales report
   */
  scheduleDailyReport() {
    const job = cron.schedule('0 8 * * *', async () => {
      console.log('Running daily sales report...');
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const orders = await Order.find({
        createdAt: { $gte: yesterday, $lt: today },
        status: { $in: ['placed', 'delivered'] }
      }).lean();

      const totalSales = orders.reduce((sum, o) => sum + o.grandTotal, 0);
      const totalOrders = orders.length;

      // Get all admins
      const admins = await User.find({ role: 'admin' }).lean();

      // Send report to each admin
      for (const admin of admins) {
        await sendLocalizedEmail({
          toUserId: admin._id,
          templateKey: 'daily_sales_report',
          variables: {
            date: yesterday.toLocaleDateString(),
            totalSales: totalSales.toFixed(2),
            totalOrders,
            averageOrderValue: totalOrders ? (totalSales / totalOrders).toFixed(2) : 0
          }
        });
      }

      console.log(`Daily report sent to ${admins.length} admins`);
    });

    this.jobs.set('dailyReport', job);
  }

  /**
   * Weekly analytics report
   */
  scheduleWeeklyReport() {
    const job = cron.schedule('0 9 * * 1', async () => { // Monday at 9 AM
      console.log('Running weekly analytics report...');
      
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      lastWeek.setHours(0, 0, 0, 0);

      // Get weekly stats
      const orders = await Order.find({
        createdAt: { $gte: lastWeek }
      }).lean();

      const totalRevenue = orders.reduce((sum, o) => sum + o.grandTotal, 0);
      const totalOrders = orders.length;

      // Top vendors
      const vendorOrders = await VendorOrder.aggregate([
        {
          $match: {
            createdAt: { $gte: lastWeek }
          }
        },
        {
          $group: {
            _id: '$vendorId',
            orders: { $sum: 1 },
            revenue: { $sum: '$grandTotal' }
          }
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 }
      ]);

      const vendors = await Vendor.find({
        _id: { $in: vendorOrders.map(v => v._id) }
      }).lean();

      const vendorMap = new Map(vendors.map(v => [v._id.toString(), v]));

      const topVendors = vendorOrders.map(v => ({
        name: vendorMap.get(v._id.toString())?.storeName || 'Unknown',
        orders: v.orders,
        revenue: v.revenue
      }));

      // Get all admins
      const admins = await User.find({ role: 'admin' }).lean();

      // Send report
      for (const admin of admins) {
        await sendLocalizedEmail({
          toUserId: admin._id,
          templateKey: 'weekly_analytics_report',
          variables: {
            startDate: lastWeek.toLocaleDateString(),
            endDate: new Date().toLocaleDateString(),
            totalRevenue: totalRevenue.toFixed(2),
            totalOrders,
            averageOrderValue: totalOrders ? (totalRevenue / totalOrders).toFixed(2) : 0,
            topVendors: JSON.stringify(topVendors)
          }
        });
      }

      console.log(`Weekly report sent to ${admins.length} admins`);
    });

    this.jobs.set('weeklyReport', job);
  }

  /**
   * Monthly performance report
   */
  scheduleMonthlyReport() {
    const job = cron.schedule('0 10 1 * *', async () => { // 1st of month at 10 AM
      console.log('Running monthly performance report...');
      
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      lastMonth.setDate(1);
      lastMonth.setHours(0, 0, 0, 0);
      
      const firstOfMonth = new Date(lastMonth);
      firstOfMonth.setMonth(firstOfMonth.getMonth() + 1);

      // Get monthly stats
      const orders = await Order.find({
        createdAt: { $gte: lastMonth, $lt: firstOfMonth }
      }).lean();

      const totalRevenue = orders.reduce((sum, o) => sum + o.grandTotal, 0);
      const totalOrders = orders.length;

      // Category performance
      const categoryPerformance = await OrderItem.aggregate([
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $group: {
            _id: '$product.categoryId',
            revenue: { $sum: '$lineTotal' },
            quantity: { $sum: '$qty' }
          }
        },
        { $sort: { revenue: -1 } }
      ]);

      // Export full report as attachment
      const reportData = {
        summary: {
          totalRevenue,
          totalOrders,
          averageOrderValue: totalOrders ? (totalRevenue / totalOrders).toFixed(2) : 0,
          period: `${lastMonth.toLocaleDateString()} - ${firstOfMonth.toLocaleDateString()}`
        },
        ordersByStatus: await this.getOrdersByStatus(lastMonth, firstOfMonth),
        topProducts: await this.getTopProducts(lastMonth, firstOfMonth)
      };

      const exportResult = await exportService.exportAnalytics(reportData, 'excel');

      // Get all admins
      const admins = await User.find({ role: 'admin' }).lean();

      // Send report with attachment
      for (const admin of admins) {
        await sendLocalizedEmail({
          toUserId: admin._id,
          templateKey: 'monthly_performance_report',
          variables: {
            month: lastMonth.toLocaleDateString('default', { month: 'long', year: 'numeric' }),
            totalRevenue: totalRevenue.toFixed(2),
            totalOrders,
            downloadLink: exportResult.downloadUrl
          }
        });
      }

      console.log(`Monthly report sent to ${admins.length} admins`);
    });

    this.jobs.set('monthlyReport', job);
  }

  /**
   * Low stock alert
   */
  scheduleLowStockAlert() {
    const job = cron.schedule('0 7 * * *', async () => {
      console.log('Checking low stock products...');
      
      const lowStockProducts = await Product.find({
        trackInventory: true,
        lowStockActive: true
      }).populate('vendorId').lean();

      if (lowStockProducts.length === 0) return;

      // Group by vendor
      const vendorProducts = {};
      lowStockProducts.forEach(p => {
        const vendorId = p.vendorId._id.toString();
        if (!vendorProducts[vendorId]) {
          vendorProducts[vendorId] = [];
        }
        vendorProducts[vendorId].push(p);
      });

      // Notify each vendor
      for (const [vendorId, products] of Object.entries(vendorProducts)) {
        await sendLocalizedEmail({
          toUserId: products[0].vendorId.ownerUserId,
          templateKey: 'low_stock_alert',
          variables: {
            vendorName: products[0].vendorId.storeName,
            productCount: products.length,
            products: products.map(p => `${p.title}: ${p.stockQty} left`).join('\n')
          }
        });
      }

      console.log(`Low stock alerts sent to ${Object.keys(vendorProducts).length} vendors`);
    });

    this.jobs.set('lowStockAlert', job);
  }

  /**
   * Clean old exports
   */
  scheduleExportCleanup() {
    const job = cron.schedule('0 2 * * *', async () => {
      console.log('Cleaning old exports...');
      await exportService.cleanOldExports(7);
      console.log('Export cleanup completed');
    });

    this.jobs.set('exportCleanup', job);
  }

  /**
   * Helper: Get orders by status
   */
  async getOrdersByStatus(startDate, endDate) {
    return Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate }
        }
      },
      {
        $group: {
          _id: '$status',
          orders: { $sum: 1 },
          grandTotalSum: { $sum: '$grandTotal' }
        }
      }
    ]);
  }

  /**
   * Helper: Get top products
   */
  async getTopProducts(startDate, endDate) {
    return OrderItem.aggregate([
      {
        $lookup: {
          from: 'orders',
          localField: 'orderId',
          foreignField: '_id',
          as: 'order'
        }
      },
      { $unwind: '$order' },
      {
        $match: {
          'order.createdAt': { $gte: startDate, $lt: endDate }
        }
      },
      {
        $group: {
          _id: '$productId',
          title: { $first: '$title' },
          totalQty: { $sum: '$qty' },
          totalRevenue: { $sum: '$lineTotal' }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 }
    ]);
  }

  /**
   * Stop all jobs
   */
  stopAll() {
    for (const job of this.jobs.values()) {
      job.stop();
    }
    console.log('All scheduled jobs stopped');
  }
}

module.exports = new ScheduleService();
