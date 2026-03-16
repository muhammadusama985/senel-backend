const VendorActivityLog = require("../models/VendorActivityLog");
const { Parser } = require('json2csv');
const VendorStaff = require("../models/VendorStaff");


/**
 * Log an activity (internal function)
 */
async function logActivity({ vendorId, userId, action, entityType, entityId, details = {}, req = null }) {
  try {
    // Get user role
    const staff = await VendorStaff.findOne({ vendorId, userId }).lean();
    const userRole = staff?.role || "owner";

    const log = await VendorActivityLog.create({
      vendorId,
      userId,
      userRole,
      action,
      entityType,
      entityId,
      details,
      ipAddress: req?.ip,
      userAgent: req?.get('User-Agent')
    });

    return log;
  } catch (error) {
    console.error("Error logging activity:", error);
  }
}

/**
 * Get activity logs for a vendor
 */
async function getActivityLogs(req, res) {
  try {
    const vendorId = req.vendorContext.vendorId;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const skip = (page - 1) * limit;

    const query = { vendorId };

    // Filter by action
    if (req.query.action) {
      query.action = req.query.action;
    }

    // Filter by user
    if (req.query.userId) {
      query.userId = req.query.userId;
    }

    // Filter by entity type
    if (req.query.entityType) {
      query.entityType = req.query.entityType;
    }

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) {
        query.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        query.createdAt.$lte = new Date(req.query.endDate);
      }
    }

    const [logs, total] = await Promise.all([
      VendorActivityLog.find(query)
        .populate("userId", "email firstName lastName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      VendorActivityLog.countDocuments(query)
    ]);

    // Enrich logs with user info
    const enriched = logs.map(log => ({
      ...log,
      user: log.userId,
      userId: undefined
    }));

    res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      logs: enriched
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Export activity logs
 */
async function exportActivityLogs(req, res) {
  try {
    const vendorId = req.vendorContext.vendorId;
    const { format = 'csv', startDate, endDate } = req.query;

    const query = { vendorId };
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const logs = await VendorActivityLog.find(query)
      .populate("userId", "email firstName lastName")
      .sort({ createdAt: -1 })
      .lean();

    const data = logs.map(log => ({
      Date: new Date(log.createdAt).toLocaleString(),
      User: log.userId?.email || 'Unknown',
      Role: log.userRole,
      Action: log.action,
      Entity: log.entityType,
      Details: JSON.stringify(log.details),
      IP: log.ipAddress,
      'User Agent': log.userAgent
    }));

    if (format === 'csv') {
      const parser = new Parser();
      const csv = parser.parse(data);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=vendor-activity-${Date.now()}.csv`);
      res.send(csv);
    } else {
      res.json({ logs: data });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Get activity summary
 */
async function getActivitySummary(req, res) {
  try {
    const vendorId = req.vendorContext.vendorId;
    const days = parseInt(req.query.days) || 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const summary = await VendorActivityLog.aggregate([
      {
        $match: {
          vendorId: vendorId,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          total: { $sum: 1 },
          products: {
            $sum: { $cond: [{ $in: ["$entityType", ["product"]] }, 1, 0] }
          },
          orders: {
            $sum: { $cond: [{ $in: ["$entityType", ["order"]] }, 1, 0] }
          },
          inventory: {
            $sum: { $cond: [{ $in: ["$entityType", ["inventory"]] }, 1, 0] }
          },
          staff: {
            $sum: { $cond: [{ $in: ["$entityType", ["staff"]] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    // Get top actors
    const topActors = await VendorActivityLog.aggregate([
      {
        $match: {
          vendorId: vendorId,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: "$userId",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      }
    ]);

    res.json({
      period: `${days} days`,
      summary,
      topActors: topActors.map(a => ({
        userId: a._id,
        email: a.user[0]?.email,
        count: a.count
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  logActivity,
  getActivityLogs,
  exportActivityLogs,
  getActivitySummary
};