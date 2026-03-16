const Product = require("../models/Product");
const OrderItem = require("../models/OrderItem");
const RecentlyViewed = require("../models/RecentlyViewed");
const WishlistItem = require("../models/WishlistItem");

/**
 * Get related products based on category and other factors
 */
async function getRelatedProducts(productId, limit = 10) {
  try {
    const product = await Product.findById(productId).lean();
    if (!product) return [];

    // Find products in same category with similar price range
    const priceRange = product.priceTiers[0]?.unitPrice || 0;
    const minPrice = priceRange * 0.7;
    const maxPrice = priceRange * 1.3;

    const related = await Product.find({
      _id: { $ne: productId },
      categoryId: product.categoryId,
      status: "approved",
      "priceTiers.unitPrice": { $gte: minPrice, $lte: maxPrice }
    })
      .limit(limit)
      .lean();

    // If not enough related products, get more from same category
    if (related.length < limit) {
      const moreFromCategory = await Product.find({
        _id: { $ne: productId },
        categoryId: product.categoryId,
        status: "approved",
        _id: { $nin: related.map(r => r._id) }
      })
        .limit(limit - related.length)
        .lean();
      
      return [...related, ...moreFromCategory];
    }

    return related;
  } catch (error) {
    console.error("Error getting related products:", error);
    return [];
  }
}

/**
 * Get trending products based on order frequency
 */
async function getTrendingProducts(limit = 20, days = 30) {
  try {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    // Aggregate order items to find most popular products
    const trending = await OrderItem.aggregate([
      {
        $lookup: {
          from: "orders",
          localField: "orderId",
          foreignField: "_id",
          as: "order"
        }
      },
      { $unwind: "$order" },
      { $match: { "order.createdAt": { $gte: dateThreshold } } },
      {
        $group: {
          _id: "$productId",
          orderCount: { $sum: 1 },
          totalQuantity: { $sum: "$qty" }
        }
      },
      { $sort: { orderCount: -1, totalQuantity: -1 } },
      { $limit: limit * 2 } // Get more to account for filtering
    ]);

    const productIds = trending.map(t => t._id);
    
    // Get full product details
    const products = await Product.find({
      _id: { $in: productIds },
      status: "approved"
    }).lean();

    // Map trending data to products
    const trendingMap = new Map(
      trending.map(t => [t._id.toString(), { 
        orderCount: t.orderCount, 
        totalQuantity: t.totalQuantity 
      }])
    );

    // Sort products by trending score
    const result = products
      .map(p => ({
        ...p,
        trendingScore: trendingMap.get(p._id.toString())?.orderCount || 0,
        totalSold: trendingMap.get(p._id.toString())?.totalQuantity || 0
      }))
      .sort((a, b) => b.trendingScore - a.trendingScore)
      .slice(0, limit);

    return result;
  } catch (error) {
    console.error("Error getting trending products:", error);
    
    // Fallback to newest products
    const fallback = await Product.find({ status: "approved" })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    
    return fallback;
  }
}

/**
 * Get personalized recommendations based on user behavior
 */
async function getPersonalizedRecommendations(customerId, limit = 20) {
  try {
    // Get user's recently viewed products
    const recentlyViewed = await RecentlyViewed.findOne({ 
      customerUserId: customerId 
    }).lean();
    
    const viewedProductIds = recentlyViewed?.items.map(i => i.productId) || [];

    // Get user's wishlist
    const wishlistItems = await WishlistItem.find({ 
      customerUserId: customerId 
    }).lean();
    
    const wishlistProductIds = wishlistItems.map(i => i.productId);

    // Get user's order history
    const orderItems = await OrderItem.aggregate([
      {
        $lookup: {
          from: "orders",
          localField: "orderId",
          foreignField: "_id",
          as: "order"
        }
      },
      { $unwind: "$order" },
      { $match: { "order.customerUserId": customerId } },
      { $group: { _id: "$productId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]);

    const orderedProductIds = orderItems.map(i => i._id);

    // Combine all user interaction IDs
    const relevantIds = [
      ...new Set([...viewedProductIds, ...wishlistProductIds, ...orderedProductIds])
    ];

    if (relevantIds.length === 0) {
      return getTrendingProducts(limit);
    }

    // Get categories from these products
    const relevantProducts = await Product.find({
      _id: { $in: relevantIds },
      status: "approved"
    }).lean();

    const categoryIds = [...new Set(relevantProducts.map(p => p.categoryId))];
    const vendorIds = [...new Set(relevantProducts.map(p => p.vendorId))];

    // Find recommendations based on user's interests
    const recommendations = await Product.aggregate([
      {
        $match: {
          _id: { $nin: relevantIds },
          status: "approved",
          $or: [
            { categoryId: { $in: categoryIds } },
            { vendorId: { $in: vendorIds } }
          ]
        }
      },
      {
        $lookup: {
          from: "orderitems",
          localField: "_id",
          foreignField: "productId",
          as: "orders"
        }
      },
      {
        $addFields: {
          popularity: { $size: "$orders" },
          categoryMatch: { $cond: [{ $in: ["$categoryId", categoryIds] }, 2, 0] },
          vendorMatch: { $cond: [{ $in: ["$vendorId", vendorIds] }, 1, 0] },
          relevanceScore: {
            $add: [
              { $size: "$orders" },
              { $cond: [{ $in: ["$categoryId", categoryIds] }, 2, 0] },
              { $cond: [{ $in: ["$vendorId", vendorIds] }, 1, 0] }
            ]
          }
        }
      },
      { $sort: { relevanceScore: -1, popularity: -1, createdAt: -1 } },
      { $limit }
    ]);

    return recommendations;
  } catch (error) {
    console.error("Error getting personalized recommendations:", error);
    return getTrendingProducts(limit);
  }
}

module.exports = {
  getRelatedProducts,
  getTrendingProducts,
  getPersonalizedRecommendations
};