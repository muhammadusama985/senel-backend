const StaticPage = require("../models/StaticPage");

async function getPageBySlug(req, res) {
  try {
    const { slug } = req.params;
    
    const page = await StaticPage.findOne({ 
      slug, 
      status: "published" 
    }).lean();
    
    if (!page) {
      return res.status(404).json({ message: "Page not found" });
    }
    
    res.json({ page });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = { getPageBySlug };