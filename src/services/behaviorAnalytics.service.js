const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Cart = require('../models/Cart');
const RecentlyViewed = require('../models/RecentlyViewed');
const WishlistItem = require('../models/WishlistItem');
const PreferredSupplier = require('../models/PreferredSupplier');
const Product = require('../models/Product');
const User = require('../models/User');
const Vendor = require('../models/Vendor');

class BehaviorAnalytics {
  
  /**
   * Get customer purchase patterns
   */
  async getCustomerPurchasePatterns(customerId) {
    const orders = await Order.find({ 
      customerUserId: customerId,
      status: 'delivered'
    }).lean();

    if (orders.length === 0) {
      return { hasHistory: false };
    }

    // Calculate average order value
    const totalSpent = orders.reduce((sum, o) => sum + o.grandTotal, 0);
    const avgOrderValue = totalSpent / orders.length;

    // Get purchase frequency
    const firstOrder = orders[orders.length - 1];
    const lastOrder = orders[0];
    const daysBetween = (new Date(lastOrder.createdAt) - new Date(firstOrder.createdAt)) / (1000 * 60 * 60 * 24);
    const avgDaysBetweenOrders = daysBetween / (orders.length - 1 || 1);

    // Get favorite categories
    const orderItems = await OrderItem.find({
      orderId: { $in: orders.map(o => o._id) }
    }).lean();

    const productIds = orderItems.map(i => i.productId);
    const products = await Product.find({
      _id: { $in: productIds }
    }).lean();

    const categoryCount = {};
    products.forEach(p => {
      const catId = p.categoryId.toString();
      categoryCount[catId] = (categoryCount[catId] || 0) + 1;
    });

    const favoriteCategories = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);

    return {
      hasHistory: true,
      totalOrders: orders.length,
      totalSpent,
      avgOrderValue,
      avgDaysBetweenOrders,
      favoriteCategories,
      lastPurchaseDate: lastOrder.createdAt
    };
  }

  /**
   * Get product affinity (what products are often bought together)
   */
  async getProductAffinity(productId, limit = 5) {
    // Find orders containing this product
    const orderItems = await OrderItem.find({ productId }).lean();
    const orderIds = orderItems.map(i => i.orderId);

    // Find other products in same orders
    const relatedItems = await OrderItem.aggregate([
      {
        $match: {
          orderId: { $in: orderIds },
          productId: { $ne: productId }
        }
      },
      {
        $group: {
          _id: '$productId',
          togetherCount: { $sum: 1 },
          totalQuantity: { $sum: '$qty' }
        }
      },
      { $sort: { togetherCount: -1, totalQuantity: -1 } },
      { $limit }
    ]);

    const productIds = relatedItems.map(r => r._id);
    const products = await Product.find({
      _id: { $in: productIds },
      status: 'approved'
    }).lean();

    const productMap = new Map(products.map(p => [p._id.toString(), p]));

    return relatedItems
      .map(item => ({
        ...productMap.get(item._id.toString()),
        affinityScore: item.togetherCount,
        togetherCount: item.togetherCount
      }))
      .filter(p => p._id); // Remove any that aren't found/approved
  }

  /**
   * Get customer lifetime value prediction
   */
  async predictCustomerLTV(customerId) {
    const patterns = await this.getCustomerPurchasePatterns(customerId);
    
    if (!patterns.hasHistory) {
      return { predictedLTV: 0, confidence: 'low' };
    }

    // Simple prediction based on historical data
    const monthlySpend = patterns.totalSpent / (patterns.totalOrders * patterns.avgDaysBetweenOrders / 30);
    const predicted12Months = monthlySpend * 12;

    // Confidence level based on data volume
    let confidence = 'low';
    if (patterns.totalOrders >= 10) confidence = 'high';
    else if (patterns.totalOrders >= 5) confidence = 'medium';

    return {
      predictedLTV: Math.round(predicted12Months * 100) / 100,
      confidence,
      basedOn: {
        orders: patterns.totalOrders,
        avgOrderValue: patterns.avgOrderValue,
        purchaseFrequency: patterns.avgDaysBetweenOrders
      }
    };
  }

  /**
   * Get abandoned cart analysis
   */
  async getAbandonedCartStats(days = 30, limit = 10) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const carts = await Cart.find({
      updatedAt: { $gte: startDate },
      items: { $exists: true, $ne: [] },
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (carts.length === 0) {
      return {
        period: days,
        totalTrackedCarts: 0,
        totalAbandonedCarts: 0,
        recoveredCarts: 0,
        potentialRevenue: 0,
        recoveryRate: 0,
        avgItems: 0,
        topProducts: [],
        items: [],
      };
    }

    const customerIds = [...new Set(carts.map((cart) => String(cart.customerUserId)))];

    const [customers, orders] = await Promise.all([
      User.find({ _id: { $in: customerIds } }).lean(),
      Order.find({
        customerUserId: { $in: customerIds },
        createdAt: { $gte: startDate },
      })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const customerMap = new Map(customers.map((customer) => [String(customer._id), customer]));
    const ordersByCustomer = new Map();

    for (const order of orders) {
      const key = String(order.customerUserId);
      const bucket = ordersByCustomer.get(key) || [];
      bucket.push(order);
      ordersByCustomer.set(key, bucket);
    }

    const productStats = new Map();
    const abandonedItems = [];
    let recoveredCarts = 0;
    let potentialRevenue = 0;
    let totalItems = 0;

    for (const cart of carts) {
      const cartOrders = ordersByCustomer.get(String(cart.customerUserId)) || [];
      const recovered = cartOrders.some((order) => new Date(order.createdAt) > new Date(cart.updatedAt));

      if (recovered) {
        recoveredCarts += 1;
        continue;
      }

      potentialRevenue += Number(cart.subtotal || 0);
      totalItems += Array.isArray(cart.items) ? cart.items.length : 0;

      for (const item of cart.items || []) {
        const productKey = String(item.productId);
        const existing = productStats.get(productKey) || {
          productId: productKey,
          abandonedCount: 0,
          value: 0,
        };

        existing.abandonedCount += Number(item.qty || 0);
        existing.value += Number(item.lineTotal || 0);
        productStats.set(productKey, existing);
      }

      const customer = customerMap.get(String(cart.customerUserId));
      abandonedItems.push({
        cartId: cart._id,
        customerUserId: cart.customerUserId,
        customer: customer
          ? {
              email: customer.email || '',
              phone: customer.phone || '',
            }
          : null,
        subtotal: Number(cart.subtotal || 0),
        totalItems: Number(cart.totalItems || (cart.items || []).length),
        vendorCount: new Set((cart.items || []).map((item) => String(item.vendorId))).size,
        updatedAt: cart.updatedAt,
        createdAt: cart.createdAt,
        appliedCouponCode: cart.appliedCoupon?.code || '',
        itemsPreview: (cart.items || []).slice(0, 3).map((item) => ({
          productId: item.productId,
          title: item.title,
          qty: item.qty,
          lineTotal: item.lineTotal,
          imageUrl: item.imageUrl || '',
        })),
      });
    }

    const abandonedCount = abandonedItems.length;
    const productIds = [...productStats.keys()];
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const productMap = new Map(products.map((product) => [String(product._id), product]));

    const topProducts = [...productStats.values()]
      .sort((a, b) => {
        if (b.abandonedCount !== a.abandonedCount) return b.abandonedCount - a.abandonedCount;
        return b.value - a.value;
      })
      .slice(0, limit)
      .map((item) => ({
        ...item,
        product: productMap.get(item.productId) || null,
      }));

    return {
      period: days,
      totalTrackedCarts: carts.length,
      totalAbandonedCarts: abandonedCount,
      recoveredCarts,
      potentialRevenue: Number(potentialRevenue.toFixed(2)),
      recoveryRate: carts.length ? Number(((recoveredCarts / carts.length) * 100).toFixed(1)) : 0,
      avgItems: abandonedCount ? Number((totalItems / abandonedCount).toFixed(1)) : 0,
      topProducts,
      items: abandonedItems.slice(0, limit),
    };
  }

  /**
   * Get customer segmentation
   */
  async getCustomerSegments() {
    const allCustomers = await User.find({ role: 'customer' }).lean();
    
    const segments = {
      new: [],
      active: [],
      vip: [],
      atRisk: [],
      churned: []
    };

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    for (const customer of allCustomers) {
      const lastOrder = await Order.findOne({
        customerUserId: customer._id,
        status: 'delivered'
      }).sort({ createdAt: -1 }).lean();

      const totalSpent = await Order.aggregate([
        {
          $match: {
            customerUserId: customer._id,
            status: 'delivered'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$grandTotal' },
            count: { $sum: 1 }
          }
        }
      ]);

      const stats = totalSpent[0] || { total: 0, count: 0 };

      // Segment classification
      if (!lastOrder) {
        segments.new.push(customer._id);
      } else if (lastOrder.createdAt > thirtyDaysAgo) {
        if (stats.total > 5000) {
          segments.vip.push(customer._id);
        } else {
          segments.active.push(customer._id);
        }
      } else if (lastOrder.createdAt > ninetyDaysAgo) {
        segments.atRisk.push(customer._id);
      } else {
        segments.churned.push(customer._id);
      }
    }

    return {
      counts: {
        new: segments.new.length,
        active: segments.active.length,
        vip: segments.vip.length,
        atRisk: segments.atRisk.length,
        churned: segments.churned.length,
        total: allCustomers.length
      },
      segments
    };
  }
}

module.exports = new BehaviorAnalytics();
