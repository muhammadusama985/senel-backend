const { z } = require("zod");
const ShippingCompany = require("../models/ShippingCompany");
const AuditLog = require("../models/AuditLog");

const createShippingCompanySchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).transform(v => v.toLowerCase().trim()),
  description: z.string().optional(),
  logoUrl: z.string().optional(),
  trackingUrlTemplate: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  contactInfo: z.object({
    email: z.string().optional(),
    phone: z.string().optional(),
    website: z.string().optional(),
  }).optional(),
});

const updateShippingCompanySchema = z.object({
  name: z.string().min(2).optional(),
  code: z.string().min(2).transform(v => v.toLowerCase().trim()).optional(),
  description: z.string().optional(),
  logoUrl: z.string().optional(),
  trackingUrlTemplate: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  contactInfo: z.object({
    email: z.string().optional(),
    phone: z.string().optional(),
    website: z.string().optional(),
  }).optional(),
});

async function adminCreateShippingCompany(req, res) {
  const body = createShippingCompanySchema.parse(req.body);

  const existing = await ShippingCompany.findOne({ code: body.code });
  if (existing) {
    return res.status(409).json({ message: "Shipping company with this code already exists" });
  }

  const company = await ShippingCompany.create({
    name: body.name,
    code: body.code,
    description: body.description || "",
    logoUrl: body.logoUrl || "",
    trackingUrlTemplate: body.trackingUrlTemplate || "",
    isActive: body.isActive ?? true,
    sortOrder: body.sortOrder ?? 0,
    contactInfo: body.contactInfo || {},
  });

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "SHIPPING_COMPANY_CREATED",
    entityType: "ShippingCompany",
    entityId: company._id,
    meta: { name: company.name, code: company.code },
  });

  res.status(201).json({ shippingCompany: company });
}

async function adminListShippingCompanies(req, res) {
  const { activeOnly } = req.query;
  const query = {};
  
  if (activeOnly === "true") {
    query.isActive = true;
  }

  const companies = await ShippingCompany.find(query)
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  res.json({ shippingCompanies: companies });
}

async function adminGetShippingCompany(req, res) {
  const company = await ShippingCompany.findById(req.params.companyId);
  if (!company) {
    return res.status(404).json({ message: "Shipping company not found" });
  }
  res.json({ shippingCompany: company });
}

async function adminUpdateShippingCompany(req, res) {
  const body = updateShippingCompanySchema.parse(req.body);
  const company = await ShippingCompany.findById(req.params.companyId);
  
  if (!company) {
    return res.status(404).json({ message: "Shipping company not found" });
  }

  if (body.code && body.code !== company.code) {
    const existing = await ShippingCompany.findOne({ code: body.code, _id: { $ne: company._id } });
    if (existing) {
      return res.status(409).json({ message: "Shipping company with this code already exists" });
    }
  }

  if (body.name !== undefined) company.name = body.name;
  if (body.code !== undefined) company.code = body.code;
  if (body.description !== undefined) company.description = body.description;
  if (body.logoUrl !== undefined) company.logoUrl = body.logoUrl;
  if (body.trackingUrlTemplate !== undefined) company.trackingUrlTemplate = body.trackingUrlTemplate;
  if (body.isActive !== undefined) company.isActive = body.isActive;
  if (body.sortOrder !== undefined) company.sortOrder = body.sortOrder;
  if (body.contactInfo !== undefined) company.contactInfo = body.contactInfo;

  await company.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "SHIPPING_COMPANY_UPDATED",
    entityType: "ShippingCompany",
    entityId: company._id,
    meta: { updates: body },
  });

  res.json({ shippingCompany: company });
}

async function adminDeleteShippingCompany(req, res) {
  const company = await ShippingCompany.findByIdAndDelete(req.params.companyId);
  
  if (!company) {
    return res.status(404).json({ message: "Shipping company not found" });
  }

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "SHIPPING_COMPANY_DELETED",
    entityType: "ShippingCompany",
    entityId: company._id,
    meta: { name: company.name, code: company.code },
  });

  res.json({ ok: true });
}

module.exports = {
  adminCreateShippingCompany,
  adminListShippingCompanies,
  adminGetShippingCompany,
  adminUpdateShippingCompany,
  adminDeleteShippingCompany,
};