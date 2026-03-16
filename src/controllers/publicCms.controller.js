const Page = require("../models/Page");
const BlogPost = require("../models/BlogPost");
const Banner = require("../models/Banner");
const { normalizeLang, pickLang } = require("../utils/i18n");

const STATIC_PAGE_PRESETS = {
  about: { en: "About Us", de: "Über Uns", tr: "Hakkımızda" },
  contact: { en: "Contact", de: "Kontakt", tr: "İletişim" },
  faq: { en: "FAQ", de: "FAQ", tr: "SSS" },
  help: { en: "Help Center", de: "Hilfezentrum", tr: "Yardım Merkezi" },
  shipping: { en: "Shipping Information", de: "Versandinformationen", tr: "Kargo Bilgileri" },
  returns: { en: "Returns", de: "Rücksendungen", tr: "İadeler" },
  terms: { en: "Terms & Conditions", de: "Allgemeine Geschäftsbedingungen", tr: "Şartlar ve Koşullar" },
  privacy: { en: "Privacy Policy", de: "Datenschutzrichtlinie", tr: "Gizlilik Politikası" },
};

function mapML(doc, lang) {
  return {
    ...doc,
    title: pickLang(doc.titleML, lang),
    content: pickLang(doc.contentML, lang),
    summary: doc.summaryML ? pickLang(doc.summaryML, lang) : undefined,
    body: doc.bodyML ? pickLang(doc.bodyML, lang) : undefined,
    subtitle: doc.subtitleML ? pickLang(doc.subtitleML, lang) : undefined,
    ctaText: doc.ctaTextML ? pickLang(doc.ctaTextML, lang) : undefined,
  };
}

async function getPageBySlug(req, res) {
  const lang = normalizeLang(req.query.lang);
  const slug = String(req.params.slug || "").toLowerCase();

  const page = await Page.findOne({ slug, isPublished: true }).lean();
  if (!page) {
    const preset = STATIC_PAGE_PRESETS[slug];
    if (!preset) return res.status(404).json({ message: "Page not found" });
    return res.json({
      page: {
        slug,
        title: preset[lang] || preset.en,
        content: "",
        seo: {
          metaTitle: preset[lang] || preset.en,
          metaDescription: "",
          keywords: [],
        },
        publishedAt: null,
        isConfigured: false,
      },
    });
  }

  res.json({
    page: {
      slug: page.slug,
      title: pickLang(page.titleML, lang),
      content: pickLang(page.contentML, lang),
      seo: {
        metaTitle: pickLang(page.seo?.metaTitleML, lang),
        metaDescription: pickLang(page.seo?.metaDescriptionML, lang),
        keywords: page.seo?.keywords || [],
      },
      publishedAt: page.publishedAt,
      isConfigured: true,
    },
  });
}

async function listBlog(req, res) {
  const lang = normalizeLang(req.query.lang);
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 50);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    BlogPost.find({ isPublished: true }).sort({ publishedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    BlogPost.countDocuments({ isPublished: true }),
  ]);

  const mapped = items.map((p) => ({
    slug: p.slug,
    coverImageUrl: p.coverImageUrl,
    tags: p.tags || [],
    title: pickLang(p.titleML, lang),
    summary: pickLang(p.summaryML, lang),
    publishedAt: p.publishedAt,
    authorName: p.authorName || "",
  }));

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items: mapped });
}

async function getBlogBySlug(req, res) {
  const lang = normalizeLang(req.query.lang);
  const slug = String(req.params.slug || "").toLowerCase();

  const p = await BlogPost.findOne({ slug, isPublished: true }).lean();
  if (!p) return res.status(404).json({ message: "Blog post not found" });

  res.json({
    post: {
      slug: p.slug,
      coverImageUrl: p.coverImageUrl,
      tags: p.tags || [],
      title: pickLang(p.titleML, lang),
      summary: pickLang(p.summaryML, lang),
      content: pickLang(p.contentML, lang),
      publishedAt: p.publishedAt,
      authorName: p.authorName || "",
      seo: {
        metaTitle: pickLang(p.seo?.metaTitleML, lang),
        metaDescription: pickLang(p.seo?.metaDescriptionML, lang),
        keywords: p.seo?.keywords || [],
      },
    },
  });
}

async function listBanners(req, res) {
  const lang = normalizeLang(req.query.lang);
  const placement = String(req.query.placement || "").trim();

  const q = {
    isActive: true,
  };
  if (placement) {
    q.placement = placement;
  }

  const items = await Banner.find(q).sort({ priority: -1, createdAt: -1 }).lean();

  const mapped = items.map((b) => ({
    id: b._id,
    placement: b.placement,
    priority: b.priority,
    imageUrl: b.imageUrl,
    imageUrlMobile: b.imageUrlMobile,
    title: pickLang(b.titleML, lang),
    subtitle: pickLang(b.subtitleML, lang),
    ctaText: pickLang(b.ctaTextML, lang),
    ctaUrl: b.ctaUrl,
  }));

  res.json({ items: mapped });
}

module.exports = { getPageBySlug, listBlog, getBlogBySlug, listBanners };
