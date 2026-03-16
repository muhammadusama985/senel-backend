const { z } = require("zod");
const BlogPost = require("../models/BlogPost");
const AuditLog = require("../models/AuditLog");
const { resolveML } = require("../utils/ml");

const mlSchema = z.object({
  en: z.string().optional(),
  de: z.string().optional(),
  tr: z.string().optional(),
});

const postSchema = z.object({
  slug: z.string().min(2),
  coverImageUrl: z.string().optional(),
  tags: z.array(z.string()).optional(),
  titleML: mlSchema,
  summaryML: mlSchema.optional(),
  contentML: mlSchema,
  authorName: z.string().optional(),
  seo: z.object({
    metaTitleML: mlSchema.optional(),
    metaDescriptionML: mlSchema.optional(),
    keywords: z.array(z.string()).optional(),
  }).optional(),
  isPublished: z.boolean().optional(),
  publishedAt: z.string().datetime().optional(),
});

function validateML(obj) {
  return !!(
    obj?.en?.trim() ||
    obj?.de?.trim() ||
    obj?.tr?.trim()
  );
}

async function adminListPosts(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const lang = req.lang || "en";

    const query = {};
    if (req.query.isPublished !== undefined) {
      query.isPublished = req.query.isPublished === "true";
    }
    if (req.query.tag) {
      query.tags = req.query.tag;
    }

    const [items, total] = await Promise.all([
      BlogPost.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BlogPost.countDocuments(query),
    ]);

    // Resolve titles for admin view
    const resolvedItems = items.map(item => ({
      ...item,
      title: resolveML(item.titleML, lang),
      summary: resolveML(item.summaryML, lang),
    }));

    res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      items: resolvedItems,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function adminGetPost(req, res) {
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

async function adminCreatePost(req, res) {
  try {
    const body = postSchema.parse(req.body);

    // Validate required ML fields
    if (!validateML(body.titleML)) {
      return res.status(400).json({ message: "titleML must contain at least one language" });
    }
    if (!validateML(body.contentML)) {
      return res.status(400).json({ message: "contentML must contain at least one language" });
    }

    // Check if slug exists
    const existing = await BlogPost.findOne({ slug: body.slug });
    if (existing) {
      return res.status(400).json({ message: "Slug already exists" });
    }

    const post = await BlogPost.create({
      slug: body.slug,
      coverImageUrl: body.coverImageUrl || "",
      tags: body.tags || [],
      titleML: body.titleML,
      summaryML: body.summaryML || { en: "", de: "", tr: "" },
      contentML: body.contentML,
      authorName: body.authorName || "",
      seo: body.seo || {
        metaTitleML: { en: "", de: "", tr: "" },
        metaDescriptionML: { en: "", de: "", tr: "" },
        keywords: [],
      },
      isPublished: body.isPublished || false,
      publishedAt: body.isPublished ? new Date() : null,
      createdByAdminId: req.user._id,
      updatedByAdminId: req.user._id,
    });

    await AuditLog.create({
      actorUserId: req.user._id,
      action: "BLOG_POST_CREATED",
      entityType: "BlogPost",
      entityId: post._id,
      meta: { slug: post.slug },
    });

    res.status(201).json({ post });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Failed to create post" });
  }
}

async function adminUpdatePost(req, res) {
  try {
    const body = postSchema.partial().parse(req.body);

    const post = await BlogPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check slug uniqueness if changing
    if (body.slug && body.slug !== post.slug) {
      const existing = await BlogPost.findOne({ slug: body.slug });
      if (existing) {
        return res.status(400).json({ message: "Slug already exists" });
      }
      post.slug = body.slug;
    }

    // Update fields
    if (body.coverImageUrl !== undefined) post.coverImageUrl = body.coverImageUrl;
    if (body.tags !== undefined) post.tags = body.tags;
    if (body.titleML !== undefined) {
      if (!validateML(body.titleML)) {
        return res.status(400).json({ message: "titleML must contain at least one language" });
      }
      post.titleML = body.titleML;
    }
    if (body.summaryML !== undefined) {
      post.summaryML = body.summaryML;
    }
    if (body.contentML !== undefined) {
      if (!validateML(body.contentML)) {
        return res.status(400).json({ message: "contentML must contain at least one language" });
      }
      post.contentML = body.contentML;
    }
    if (body.authorName !== undefined) post.authorName = body.authorName;
    if (body.seo !== undefined) post.seo = { ...post.seo, ...body.seo };
    if (body.isPublished !== undefined) {
      post.isPublished = body.isPublished;
      post.publishedAt = body.isPublished ? new Date() : null;
    }

    post.updatedByAdminId = req.user._id;
    await post.save();

    await AuditLog.create({
      actorUserId: req.user._id,
      action: "BLOG_POST_UPDATED",
      entityType: "BlogPost",
      entityId: post._id,
      meta: { updates: body },
    });

    res.json({ post });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Failed to update post" });
  }
}

async function adminDeletePost(req, res) {
  try {
    const post = await BlogPost.findByIdAndDelete(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    await AuditLog.create({
      actorUserId: req.user._id,
      action: "BLOG_POST_DELETED",
      entityType: "BlogPost",
      entityId: post._id,
      meta: { slug: post.slug },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function adminPublishPost(req, res) {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    post.isPublished = true;
    post.publishedAt = new Date();
    post.updatedByAdminId = req.user._id;
    await post.save();

    res.json({ post });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function adminUnpublishPost(req, res) {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    post.isPublished = false;
    post.publishedAt = null;
    post.updatedByAdminId = req.user._id;
    await post.save();

    res.json({ post });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  adminListPosts,
  adminGetPost,
  adminCreatePost,
  adminUpdatePost,
  adminDeletePost,
  adminPublishPost,
  adminUnpublishPost,
};