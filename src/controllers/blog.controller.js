const BlogPost = require("../models/BlogPost");
const { resolveML } = require("../utils/ml"); // You already have this utility

async function listPosts(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const skip = (page - 1) * limit;
    const lang = req.lang || "en";

    const query = { isPublished: true };
    
    if (req.query.tag) {
      query.tags = req.query.tag;
    }

    const [posts, total] = await Promise.all([
      BlogPost.find(query)
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BlogPost.countDocuments(query),
    ]);

    // Resolve multi-language fields
    const resolvedPosts = posts.map(post => ({
      ...post,
      title: resolveML(post.titleML, lang),
      summary: resolveML(post.summaryML, lang),
      content: resolveML(post.contentML, lang), // Remove for list to save bandwidth
      metaTitle: resolveML(post.seo?.metaTitleML, lang),
      metaDescription: resolveML(post.seo?.metaDescriptionML, lang),
    }));

    // Remove content from list to save bandwidth
    resolvedPosts.forEach(p => delete p.content);

    res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      posts: resolvedPosts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function getPostBySlug(req, res) {
  try {
    const { slug } = req.params;
    const lang = req.lang || "en";
    
    const post = await BlogPost.findOne({ 
      slug, 
      isPublished: true 
    }).lean();
    
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    
    // Resolve multi-language fields
    const resolvedPost = {
      ...post,
      title: resolveML(post.titleML, lang),
      summary: resolveML(post.summaryML, lang),
      content: resolveML(post.contentML, lang),
      metaTitle: resolveML(post.seo?.metaTitleML, lang),
      metaDescription: resolveML(post.seo?.metaDescriptionML, lang),
    };
    
    // Increment view count (add this field if you want)
    // BlogPost.updateOne({ _id: post._id }, { $inc: { viewCount: 1 } }).exec();
    
    res.json({ post: resolvedPost });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function getPostById(req, res) {
  try {
    const lang = req.lang || "en";
    const post = await BlogPost.findById(req.params.id).lean();
    
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const resolvedPost = {
      ...post,
      title: resolveML(post.titleML, lang),
      summary: resolveML(post.summaryML, lang),
      content: resolveML(post.contentML, lang),
      metaTitle: resolveML(post.seo?.metaTitleML, lang),
      metaDescription: resolveML(post.seo?.metaDescriptionML, lang),
    };
    
    res.json({ post: resolvedPost });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = { listPosts, getPostBySlug, getPostById };