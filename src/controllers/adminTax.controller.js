const { z } = require("zod");
const { getSettings, updateSettings } = require("../services/platformSettings.service");

async function getTaxSettings(req, res) {
  const settings = await getSettings();
  res.json({ tax: settings.tax || {} });
}

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["exclusive", "inclusive"]).optional(),
  defaultRate: z.number().min(0).max(100).optional(),
  applyOnShipping: z.boolean().optional(),
  countryRates: z.array(
    z.object({
      country: z.string(),
      rate: z.number().min(0).max(100),
    })
  ).optional(),
});

async function updateTaxSettings(req, res) {
  const body = updateSchema.parse(req.body);

  const updated = await updateSettings({
    tax: body,
  });

  res.json({ tax: updated.tax });
}

module.exports = {
  getTaxSettings,
  updateTaxSettings,
};