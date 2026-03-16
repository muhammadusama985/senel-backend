const { z } = require("zod");
const Page = require("../models/Page");
const BlogPost = require("../models/BlogPost");
const Banner = require("../models/Banner");

const mlSchema = z.object({
  en: z.string().optional(),
  de: z.string().optional(),
  tr: z.string().optional(),
}).optional();

const seoSchema = z.object({
  metaTitleML: mlSchema,
  metaDescriptionML: mlSchema,
  keywords: z.array(z.string()).optional(),
}).optional();

const getBaseUrl = (req) => {
  return `${req.protocol}://${req.get('host')}`;
};
/** PAGES **/
const pageCreateSchema = z.object({
  slug: z.string().min(2).transform(v => v.trim().toLowerCase()),
  titleML: mlSchema,
  contentML: mlSchema,
  seo: seoSchema,
  isPublished: z.boolean().optional(),
});

async function adminCreatePage(req, res) {
  const body = pageCreateSchema.parse(req.body);
  const doc = await Page.create({
    ...body,
    createdByAdminId: req.user._id,
    updatedByAdminId: req.user._id,
    publishedAt: body.isPublished ? new Date() : null,
  });
  res.status(201).json({ page: doc });
}

const pageUpdateSchema = pageCreateSchema.partial();

async function adminUpdatePage(req, res) {
  const body = pageUpdateSchema.parse(req.body);
  const page = await Page.findById(req.params.id);
  if (!page) return res.status(404).json({ message: "Page not found" });

  Object.assign(page, body);
  page.updatedByAdminId = req.user._id;
  if (body.isPublished === true && !page.publishedAt) page.publishedAt = new Date();
  if (body.isPublished === false) page.publishedAt = null;

  await page.save();
  res.json({ page });
}

async function adminListPages(req, res) {
  const q = {};
  if (req.query.published === "true") q.isPublished = true;
  if (req.query.published === "false") q.isPublished = false;

  const items = await Page.find(q).sort({ createdAt: -1 }).lean();
  res.json({ items });
}

async function adminGetPage(req, res) {
  const page = await Page.findById(req.params.id).lean();
  if (!page) return res.status(404).json({ message: "Page not found" });
  res.json({ page });
}

async function adminPublishPage(req, res) {
  const page = await Page.findById(req.params.id);
  if (!page) return res.status(404).json({ message: "Page not found" });
  page.isPublished = true;
  page.publishedAt = new Date();
  page.updatedByAdminId = req.user._id;
  await page.save();
  res.json({ page });
}

async function adminUnpublishPage(req, res) {
  const page = await Page.findById(req.params.id);
  if (!page) return res.status(404).json({ message: "Page not found" });
  page.isPublished = false;
  page.publishedAt = null;
  page.updatedByAdminId = req.user._id;
  await page.save();
  res.json({ page });
}

// Add after adminUnpublishPage
async function adminDeletePage(req, res) {
  const page = await Page.findByIdAndDelete(req.params.id);
  if (!page) return res.status(404).json({ message: "Page not found" });
  res.json({ message: "Page deleted successfully" });
}

// Add after adminUnpublishBlog
async function adminDeleteBlog(req, res) {
  const post = await BlogPost.findByIdAndDelete(req.params.id);
  if (!post) return res.status(404).json({ message: "Blog post not found" });
  res.json({ message: "Blog post deleted successfully" });
}

// Add after adminDeactivateBanner
async function adminDeleteBanner(req, res) {
  const banner = await Banner.findByIdAndDelete(req.params.id);
  if (!banner) return res.status(404).json({ message: "Banner not found" });
  res.json({ message: "Banner deleted successfully" });
}

/** BLOG **/
const blogCreateSchema = z.object({
  slug: z.string().min(2).transform(v => v.trim().toLowerCase()),
  coverImageUrl: z.string().optional(),
  tags: z.array(z.string()).optional(),

  titleML: mlSchema,
  summaryML: mlSchema,
  contentML: mlSchema,

  authorName: z.string().optional(),
  seo: seoSchema,
  isPublished: z.boolean().optional(),
});

async function adminCreateBlog(req, res) {
  try {
    console.log('=== BLOG CREATION DEBUG ===');
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);
    
    let blogData;
    
    // Parse the data from FormData
    if (req.body.data) {
      try {
        blogData = JSON.parse(req.body.data);
        console.log('Parsed blog data:', blogData);
      } catch (e) {
        console.error('JSON parse error:', e);
        return res.status(400).json({ 
          message: 'Invalid blog data format',
          error: e.message 
        });
      }
    } else {
      blogData = req.body;
      console.log('Using body directly:', blogData);
    }

    // Prepare blog data for database
    const blogPayload = {
      slug: blogData.slug,
      tags: blogData.tags || [],
      titleML: {
        en: blogData.titleML?.en || '',
        de: blogData.titleML?.de || '',
        tr: blogData.titleML?.tr || ''
      },
      summaryML: {
        en: blogData.summaryML?.en || '',
        de: blogData.summaryML?.de || '',
        tr: blogData.summaryML?.tr || ''
      },
      contentML: {
        en: blogData.contentML?.en || '',
        de: blogData.contentML?.de || '',
        tr: blogData.contentML?.tr || ''
      },
      authorName: blogData.authorName || '',
      seo: {
        metaTitleML: blogData.seo?.metaTitleML || { en: '', de: '', tr: '' },
        metaDescriptionML: blogData.seo?.metaDescriptionML || { en: '', de: '', tr: '' },
        keywords: blogData.seo?.keywords || []
      },
      isPublished: blogData.isPublished === true || blogData.isPublished === 'true',
      createdByAdminId: req.user?._id,
      updatedByAdminId: req.user?._id,
      publishedAt: blogData.isPublished ? new Date() : null
    };

    // Add cover image from uploaded file
    if (req.file) {
      blogPayload.coverImageUrl = `/uploads/blogs/${req.file.filename}`;
      console.log('✅ Cover image saved to:', req.file.path);
      console.log('✅ Cover image URL set to:', blogPayload.coverImageUrl);
    }

    // Validate required fields
    if (!blogPayload.slug) {
      return res.status(400).json({ message: 'Slug is required' });
    }

    console.log('Final blog payload:', blogPayload);

    // Save to database
    const BlogPost = require('../models/BlogPost');
    const blog = new BlogPost(blogPayload);
    await blog.save();

    console.log('✅ Blog saved to database with ID:', blog._id);

    res.status(201).json({
      message: 'Blog post created successfully',
      post: blog
    });

  } catch (error) {
    console.error('=== BLOG CREATION ERROR ===');
    console.error(error);
    res.status(500).json({ 
      message: 'Failed to create blog post',
      error: error.message 
    });
  }
}

const blogUpdateSchema = blogCreateSchema.partial();

async function adminUpdateBlog(req, res) {
  try {
    console.log('=== BLOG UPDATE DEBUG ===');
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);
    
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Blog post not found" });

    // Parse the data from FormData
    let updateData = {};
    if (req.body.data) {
      try {
        updateData = JSON.parse(req.body.data);
        console.log('Parsed update data:', updateData);
      } catch (e) {
        console.error('JSON parse error:', e);
        return res.status(400).json({ 
          message: "Invalid JSON data",
          error: e.message 
        });
      }
    } else {
      updateData = req.body;
    }

    // Handle file upload
    if (req.file) {
      updateData.coverImageUrl = `/uploads/blogs/${req.file.filename}`;
      console.log('New cover image uploaded:', updateData.coverImageUrl);
    }

    // Prepare the update object
    const updateFields = {
      slug: updateData.slug || post.slug,
      tags: updateData.tags !== undefined ? updateData.tags : post.tags,
      coverImageUrl: updateData.coverImageUrl !== undefined ? updateData.coverImageUrl : post.coverImageUrl,
      titleML: updateData.titleML || post.titleML,
      summaryML: updateData.summaryML || post.summaryML,
      contentML: updateData.contentML || post.contentML,
      authorName: updateData.authorName !== undefined ? updateData.authorName : post.authorName,
      seo: updateData.seo || post.seo,
      isPublished: updateData.isPublished !== undefined ? 
        (updateData.isPublished === true || updateData.isPublished === 'true') : post.isPublished,
      updatedByAdminId: req.user?._id || req.user?.id
    };

    // Handle publishedAt based on isPublished
    if (updateData.isPublished === true && !post.publishedAt) {
      updateFields.publishedAt = new Date();
    } else if (updateData.isPublished === false) {
      updateFields.publishedAt = null;
    }

    // Remove undefined fields
    Object.keys(updateFields).forEach(key => 
      updateFields[key] === undefined && delete updateFields[key]
    );

    console.log('Final update fields:', updateFields);

    // Update the blog post
    const updatedPost = await BlogPost.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    res.json({ post: updatedPost });
  } catch (error) {
    console.error('Blog update error:', error);
    res.status(400).json({ 
      message: "Validation error", 
      issues: error.issues || error.message 
    });
  }
}

async function adminListBlog(req, res) {
  const q = {};
  if (req.query.published === "true") q.isPublished = true;
  if (req.query.published === "false") q.isPublished = false;
  
  // Add search functionality
  if (req.query.search) {
    q.$or = [
      { 'titleML.en': { $regex: req.query.search, $options: 'i' } },
      { 'titleML.de': { $regex: req.query.search, $options: 'i' } },
      { 'titleML.tr': { $regex: req.query.search, $options: 'i' } },
      { slug: { $regex: req.query.search, $options: 'i' } }
    ];
  }

  const items = await BlogPost.find(q).sort({ createdAt: -1 }).lean();
  res.json({ items, total: items.length });
}

async function adminPublishBlog(req, res) {
  const post = await BlogPost.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Blog post not found" });
  post.isPublished = true;
  post.publishedAt = new Date();
  post.updatedByAdminId = req.user._id;
  await post.save();
  res.json({ post });
}

async function adminUnpublishBlog(req, res) {
  const post = await BlogPost.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Blog post not found" });
  post.isPublished = false;
  post.publishedAt = null;
  post.updatedByAdminId = req.user._id;
  await post.save();
  res.json({ post });
}

/** BANNERS **/
const bannerCreateSchema = z.object({
  placement: z.string().min(2),
  priority: z.number().int().optional(),

  imageUrl: z.string().min(5),
  imageUrlMobile: z.string().optional(),

  titleML: mlSchema,
  subtitleML: mlSchema,
  ctaTextML: mlSchema,
  ctaUrl: z.string().optional(),

  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

// In adminCreateBanner function, update the logging:

const adminCreateBanner = async (req, res) => {
    try {
        console.log('=== BANNER CREATION DEBUG ===');
        console.log('Request body:', req.body);
        console.log('Request files:', req.files);
        
        let bannerData;
        
        // Parse the data from FormData
        if (req.body.data) {
            try {
                bannerData = JSON.parse(req.body.data);
                console.log('Parsed banner data:', bannerData);
            } catch (e) {
                console.error('JSON parse error:', e);
                return res.status(400).json({ 
                    message: 'Invalid banner data format',
                    error: e.message 
                });
            }
        } else {
            bannerData = req.body;
            console.log('Using body directly:', bannerData);
        }

        // Prepare banner data for database
        const bannerPayload = {
            placement: bannerData.placement || 'HOME_TOP',
            priority: parseInt(bannerData.priority) || 0,
            titleML: {
                en: bannerData.titleML?.en || '',
                de: bannerData.titleML?.de || '',
                tr: bannerData.titleML?.tr || ''
            },
            subtitleML: {
                en: bannerData.subtitleML?.en || '',
                de: bannerData.subtitleML?.de || '',
                tr: bannerData.subtitleML?.tr || ''
            },
            ctaTextML: {
                en: bannerData.ctaTextML?.en || '',
                de: bannerData.ctaTextML?.de || '',
                tr: bannerData.ctaTextML?.tr || ''
            },
            ctaUrl: bannerData.ctaUrl || '',
            startAt: bannerData.startAt || null,
            endAt: bannerData.endAt || null,
            isActive: bannerData.isActive === true || bannerData.isActive === 'true',
            createdByAdminId: req.user?._id
        };

        // Add image paths from uploaded files
        if (req.files) {
            if (req.files.image && req.files.image[0]) {
                // Use simple path without /api/v1 prefix
                bannerPayload.imageUrl = `/uploads/banners/${req.files.image[0].filename}`;
                console.log('✅ Image saved to:', req.files.image[0].path);
                console.log('✅ Image URL set to:', bannerPayload.imageUrl);
            }
            
            if (req.files.imageMobile && req.files.imageMobile[0]) {
                bannerPayload.imageUrlMobile = `/uploads/banners/${req.files.imageMobile[0].filename}`;
                console.log('✅ Mobile Image saved to:', req.files.imageMobile[0].path);
                console.log('✅ Mobile Image URL set to:', bannerPayload.imageUrlMobile);
            }
        }

        // Validate required fields
        if (!bannerPayload.imageUrl) {
            return res.status(400).json({ message: 'Image is required' });
        }

        console.log('Final banner payload:', bannerPayload);

        // Save to database
        const Banner = require('../models/Banner');
        const banner = new Banner(bannerPayload);
        await banner.save();

        console.log('✅ Banner saved to database with ID:', banner._id);

        res.status(201).json({
            message: 'Banner created successfully',
            banner
        });

    } catch (error) {
        console.error('=== BANNER CREATION ERROR ===');
        console.error(error);
        res.status(500).json({ 
            message: 'Failed to create banner',
            error: error.message 
        });
    }
};

const bannerUpdateSchema = bannerCreateSchema.partial();

async function adminUpdateBanner(req, res) {
  try {
    console.log('=== BANNER UPDATE DEBUG ===');
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);
    
    const banner = await Banner.findById(req.params.id);
    if (!banner) return res.status(404).json({ message: "Banner not found" });

    // Parse the data from FormData
    let updateData = {};
    if (req.body.data) {
      try {
        updateData = JSON.parse(req.body.data);
        console.log('Parsed update data:', updateData);
      } catch (e) {
        console.error('JSON parse error:', e);
        return res.status(400).json({ 
          message: "Invalid JSON data",
          error: e.message 
        });
      }
    } else {
      updateData = req.body;
    }

    const files = req.files;
    
    // Handle file uploads
    if (files) {
      if (files.image && files.image[0]) {
        updateData.imageUrl = `/uploads/banners/${files.image[0].filename}`;
        console.log('New image uploaded:', updateData.imageUrl);
      }
      if (files.imageMobile && files.imageMobile[0]) {
        updateData.imageUrlMobile = `/uploads/banners/${files.imageMobile[0].filename}`;
        console.log('New mobile image uploaded:', updateData.imageUrlMobile);
      }
    }

    // Prepare the update object - don't try to parse fields that are already objects
    const updateFields = {
      placement: updateData.placement,
      priority: updateData.priority !== undefined ? Number(updateData.priority) : banner.priority,
      imageUrl: updateData.imageUrl || banner.imageUrl,
      imageUrlMobile: updateData.imageUrlMobile !== undefined ? updateData.imageUrlMobile : banner.imageUrlMobile,
      titleML: updateData.titleML || banner.titleML,
      subtitleML: updateData.subtitleML || banner.subtitleML,
      ctaTextML: updateData.ctaTextML || banner.ctaTextML,
      ctaUrl: updateData.ctaUrl !== undefined ? updateData.ctaUrl : banner.ctaUrl,
      startAt: updateData.startAt !== undefined ? (updateData.startAt || null) : banner.startAt,
      endAt: updateData.endAt !== undefined ? (updateData.endAt || null) : banner.endAt,
      isActive: updateData.isActive !== undefined ? 
        (updateData.isActive === true || updateData.isActive === 'true') : banner.isActive,
      updatedByAdminId: req.user?._id || req.user?.id
    };

    // Remove undefined fields
    Object.keys(updateFields).forEach(key => 
      updateFields[key] === undefined && delete updateFields[key]
    );

    console.log('Final update fields:', updateFields);

    // Update the banner
    const updatedBanner = await Banner.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    res.json({ banner: updatedBanner });
  } catch (error) {
    console.error('Banner update error:', error);
    res.status(400).json({ 
      message: "Validation error", 
      issues: error.issues || error.message 
    });
  }
}

async function adminListBanners(req, res) {
  const q = {};
  if (req.query.placement) q.placement = req.query.placement;
  if (req.query.active === "true") q.isActive = true;
  if (req.query.active === "false") q.isActive = false;

  const items = await Banner.find(q).sort({ placement: 1, priority: -1, createdAt: -1 }).lean();
  res.json({ items });
}

async function adminActivateBanner(req, res) {
  const banner = await Banner.findById(req.params.id);
  if (!banner) return res.status(404).json({ message: "Banner not found" });
  banner.isActive = true;
  banner.updatedByAdminId = req.user._id;
  await banner.save();
  res.json({ banner });
}

async function adminDeactivateBanner(req, res) {
  const banner = await Banner.findById(req.params.id);
  if (!banner) return res.status(404).json({ message: "Banner not found" });
  banner.isActive = false;
  banner.updatedByAdminId = req.user._id;
  await banner.save();
  res.json({ banner });
}

module.exports = {
  adminCreatePage, adminUpdatePage, adminListPages, adminGetPage, adminPublishPage, adminUnpublishPage,
  adminCreateBlog, adminUpdateBlog, adminListBlog, adminPublishBlog, adminUnpublishBlog,
  adminCreateBanner, adminUpdateBanner, adminListBanners, adminActivateBanner, adminDeactivateBanner, adminDeletePage, adminDeleteBlog, adminDeleteBanner
};
