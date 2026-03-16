// src/controllers/banners.controller.js
async function getActiveBanners(req, res) {
  try {
    const now = new Date();
    const lang = req.lang || "en";
    
    // Determine user role (guest, customer, or vendor)
    let userRole = "guest";
    if (req.user) {
      userRole = req.user.role; // "customer" or "vendor"
    }

    const query = {
      isActive: true,
      $and: [
        { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
        { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
      ],
      // Filter by target audience based on user role
      $or: [
        { targetAudience: "all" },
        { targetAudience: userRole },
        ...(userRole === "guest" ? [{ targetAudience: "customers" }] : []), // guests see customer banners
      ],
    };

    const banners = await Banner.find(query)
      .sort({ priority: 1 })
      .lean();

    // Resolve multi-language fields (if using ML model)
    const resolvedBanners = banners.map(banner => ({
      ...banner,
      title: resolveML(banner.titleML, lang),
      subtitle: resolveML(banner.subtitleML, lang),
      ctaText: resolveML(banner.ctaTextML, lang),
    }));

    res.json({ banners: resolvedBanners, lang, userRole });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}