const { getSettings } = require("./platformSettings.service");

/**
 * Calculates tax for checkout.
 * @param {Object} params
 * @param {Number} params.subtotal
 * @param {Number} params.shippingTotal
 * @param {String} params.country
 */
async function calculateTax({ subtotal, shippingTotal = 0, country }) {
  const settings = await getSettings();
  const taxConfig = settings.tax || {};

  if (!taxConfig.enabled) {
    return {
      taxRate: 0,
      taxAmount: 0,
      taxableAmount: 0,
    };
  }

  // Determine rate (country override > default)
  let rate = Number(taxConfig.defaultRate || 0);

  if (Array.isArray(taxConfig.countryRates)) {
    const match = taxConfig.countryRates.find(
      (r) => r.country?.toLowerCase() === country?.toLowerCase()
    );
    if (match) rate = Number(match.rate || 0);
  }

  const rateDecimal = rate / 100;

  let taxableAmount = subtotal;

  if (taxConfig.applyOnShipping) {
    taxableAmount += shippingTotal;
  }

  let taxAmount = 0;

  if (taxConfig.mode === "exclusive") {
    taxAmount = taxableAmount * rateDecimal;
  } else {
    // inclusive tax: price already includes tax
    taxAmount = taxableAmount - taxableAmount / (1 + rateDecimal);
  }

  taxAmount = Number(taxAmount.toFixed(2));

  return {
    taxRate: rate,
    taxAmount,
    taxableAmount,
  };
}

module.exports = { calculateTax };