const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const morgan = require("morgan");

const Category = require("./models/Category");
const authRoutes = require("./routes/auth.routes");
const vendorRoutes = require("./routes/vendor.routes");
const catalogRoutes = require("./routes/catalog.routes");
const productRoutes = require("./routes/product.routes");
const shopRoutes = require("./routes/shop.routes");
const cartRoutes = require("./routes/cart.routes");
const checkoutRoutes = require("./routes/checkout.routes");
const vendorOrdersRoutes = require("./routes/vendorOrders.routes");
const adminRoutes = require("./routes/admin.routes");
const walletRoutes = require("./routes/wallet.routes");
const adminPayoutsRoutes = require("./routes/adminPayouts.routes");
const notificationRoutes = require("./routes/notification.routes");
const couponsApplyRoutes = require("./routes/couponsApply.routes");
const couponsAdminRoutes = require("./routes/couponsAdmin.routes");
const adminAnalyticsRoutes = require("./routes/adminAnalytics.routes");
const adminVendorProductAnalyticsRoutes = require("./routes/adminVendorProductAnalytics.routes");
const checkoutEventsRoutes = require("./routes/checkoutEvents.routes");
const adminTimeSeriesAnalyticsRoutes = require("./routes/adminTimeSeriesAnalytics.routes");
const reviewsRoutes = require("./routes/reviews.routes");
const adminReviewsRoutes = require("./routes/adminReviews.routes");
const adminCmsRoutes = require("./routes/adminCms.routes");
const publicCmsRoutes = require("./routes/publicCms.routes");
const announcementsRoutes = require("./routes/announcements.routes");
const adminNotificationCampaignsRoutes = require("./routes/adminNotificationCampaigns.routes");
const addressBookRoutes = require("./routes/addressBook.routes");
const wishlistRoutes = require("./routes/wishlist.routes");
const preferredSuppliersRoutes = require("./routes/preferredSuppliers.routes");
const recentlyViewedRoutes = require("./routes/recentlyViewed.routes");
const reorderRoutes = require("./routes/reorder.routes");
const disputesRoutes = require("./routes/disputes.routes");
const adminDisputesRoutes = require("./routes/adminDisputes.routes");
const vendorInventoryRoutes = require("./routes/vendorInventory.routes");
const vendorLabelsRoutes = require("./routes/vendorLabels.routes");
const bankTransferRoutes = require("./routes/bankTransfer.routes");
const adminBankTransferRoutes = require("./routes/adminBankTransfer.routes");
const adminShippingQuotesRoutes = require("./routes/adminShippingQuotes.routes");
const shippingConfirmRoutes = require("./routes/shippingConfirm.routes");
const paymentInfoRoutes = require("./routes/paymentInfo.routes");
const customerOrdersRoutes = require("./routes/customerOrders.routes");
const adminHandoverRoutes = require("./routes/adminHandover.routes");
const adminTaxRoutes = require("./routes/adminTax.routes");
const adminEmailTemplatesRoutes = require("./routes/adminEmailTemplates.routes");
const adminPasswordResetRoutes = require("./routes/adminPasswordReset.routes");
const broadcastRoutes = require("./routes/broadcast.routes");
const passwordResetRoutes = require("./routes/passwordReset.routes");
const { attachLang } = require("./middlewares/lang.middleware");
const { translateResponse } = require("./middlewares/translation.middleware");
const analyticsRoutes = require("./routes/analytics.routes");
const vendorStaffRoutes = require("./routes/vendorStaff.routes");
const vendorActivityRoutes = require("./routes/vendorActivity.routes");
const bulkImportRoutes = require("./routes/bulkImport.routes");
const supportTicketRoutes = require("./routes/supportTicket.routes");
const vendorCouponsRoutes = require("./routes/vendorCoupons.routes");
const vendorAnalyticsRoutes = require("./routes/vendorAnalytics.routes");
const deviceTokensRoutes = require("./routes/deviceTokens.routes");
const stripePaymentsRoutes = require("./routes/stripePayments.routes");

const { notFound, errorHandler } = require("./middlewares/error.middleware");

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  ...(process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean) || []),
];

function setCorsHeaders(req, res) {
  const requestOrigin = req.headers.origin;
  const allowOrigin = requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0];

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-lang");
}

// Update CORS configuration
const corsOptions = {
    origin: allowedOrigins,
    credentials: true,
    optionsSuccessStatus: 200
};

// Apply CORS middleware first
app.use(cors(corsOptions));

// Configure helmet to allow cross-origin resources
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "unsafe-none" }
}));

// Stripe webhook must receive raw body (before express.json middleware).
app.use("/api/v1/payments/stripe", stripePaymentsRoutes);

app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

app.use(attachLang);
app.use(translateResponse);

// Serve static files with proper headers
app.use('/uploads', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    setCorsHeaders(req, res);
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
}, express.static(path.join(__dirname, '../uploads'), {
    maxAge: '1d',
    etag: true,
    lastModified: true
}));

// Also serve at API path
app.use('/api/v1/admin/uploads', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    setCorsHeaders(req, res);
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
}, express.static(path.join(__dirname, '../uploads')));



app.use("/exports", express.static(path.join(__dirname, "../exports")));

app.get("/health", (req, res) => res.json({ ok: true, env: process.env.NODE_ENV }));
// Public categories endpoint
app.get("/api/v1/catalog/categories/public", async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .sort({ parentId: 1, sortOrder: 1, name: 1 })
      .lean();
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/vendors", vendorRoutes);
app.use("/api/v1/catalog", catalogRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/shop", shopRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/checkout", checkoutRoutes);
app.use("/api/v1/orders", customerOrdersRoutes);
app.use("/api/v1/vendor-orders", vendorOrdersRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/admin", adminPayoutsRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/coupons", couponsApplyRoutes);
app.use("/api/v1/admin", couponsAdminRoutes);
app.use("/api/v1/admin", adminAnalyticsRoutes);
app.use("/api/v1/admin", adminVendorProductAnalyticsRoutes);
app.use("/api/v1/checkout-events", checkoutEventsRoutes);
app.use("/api/v1/admin", adminTimeSeriesAnalyticsRoutes);
app.use("/api/v1/reviews", reviewsRoutes);
app.use("/api/v1/admin", adminReviewsRoutes);
app.use("/api/v1/admin", adminCmsRoutes);
app.use("/api/v1", publicCmsRoutes);
app.use("/api/v1/admin", adminNotificationCampaignsRoutes);
app.use("/api/v1/addresses", addressBookRoutes);
app.use("/api/v1/wishlist", wishlistRoutes);
app.use("/api/v1/preferred-suppliers", preferredSuppliersRoutes);
app.use("/api/v1/recently-viewed", recentlyViewedRoutes);
app.use("/api/v1/reorder", reorderRoutes);
app.use("/api/v1/disputes", disputesRoutes);
app.use("/api/v1/admin", adminDisputesRoutes);
app.use("/api/v1/vendor/inventory", vendorInventoryRoutes);
app.use("/api/v1/vendor/labels", vendorLabelsRoutes);
app.use("/api/v1/bank-transfer", bankTransferRoutes);
app.use("/api/v1/admin", adminBankTransferRoutes);
app.use("/api/v1/admin", adminShippingQuotesRoutes);
app.use("/api/v1", shippingConfirmRoutes);
app.use("/api/v1", paymentInfoRoutes);
app.use("/api/v1/admin", adminHandoverRoutes);
app.use("/api/v1/admin", adminTaxRoutes);
app.use("/api/v1/admin", adminEmailTemplatesRoutes);
app.use("/api/v1/admin", adminPasswordResetRoutes);
app.use("/api/v1", announcementsRoutes);
app.use("/api/v1/admin", broadcastRoutes);
app.use("/api/v1/auth", passwordResetRoutes);
app.use("/api/v1/admin/analytics", analyticsRoutes);
app.use("/api/v1/vendor", vendorStaffRoutes);
app.use("/api/v1/vendor", vendorActivityRoutes);
app.use("/api/v1/vendor", bulkImportRoutes);
app.use("/api/v1/vendor", supportTicketRoutes);
app.use("/api/v1/vendor", vendorCouponsRoutes);
app.use("/api/v1/vendor", vendorAnalyticsRoutes);
app.use("/api/v1", deviceTokensRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
