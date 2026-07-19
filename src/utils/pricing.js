function normalizeTiers(priceTiers) {
  const tiers = [...(priceTiers || [])]
    .map((t) => ({ minQty: Number(t.minQty), unitPrice: Number(t.unitPrice) }))
    .filter((t) => Number.isFinite(t.minQty) && Number.isFinite(t.unitPrice) && t.minQty > 0)
    .sort((a, b) => a.minQty - b.minQty);

  // Merge duplicates by keeping the last one (or you can reject duplicates)
  const dedup = [];
  for (const t of tiers) {
    const prev = dedup[dedup.length - 1];
    if (prev && prev.minQty === t.minQty) {
      prev.unitPrice = t.unitPrice;
    } else {
      dedup.push(t);
    }
  }
  return dedup;
}

/**
 * Build the per-combination key used by variantAdjustments /
 * variantPercentAdjustments. The order of `attributeTitles` MUST be stable
 * (e.g. sorted alphabetically or in the order the vendor defined them).
 */
function buildCombinationKey(selectedAttributes, attributeTitles) {
  if (!selectedAttributes || !Array.isArray(attributeTitles)) return '';
  return attributeTitles
    .map((t) => {
      const v = selectedAttributes[t];
      return v == null || v === '' ? '' : String(v);
    })
    .filter((part) => part !== '')
    .join('|');
}

/**
 * Look up the per-combination FLAT adjustment for the currently selected
 * attributes. Returns 0 if not set / not finite.
 */
function getVariantFlatAdjustment(variantAdjustments, selectedAttributes, attributeTitles) {
  if (!variantAdjustments) return 0;
  const key = buildCombinationKey(selectedAttributes, attributeTitles);
  if (!key) return 0;
  const num = Number(variantAdjustments[key]);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Look up the per-combination PERCENTAGE adjustment (e.g. -20 = -20%). Returns 0
 * if not set / not finite.
 */
function getVariantPercentAdjustment(variantPercentAdjustments, selectedAttributes, attributeTitles) {
  if (!variantPercentAdjustments) return 0;
  const key = buildCombinationKey(selectedAttributes, attributeTitles);
  if (!key) return 0;
  const num = Number(variantPercentAdjustments[key]);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Resolve the effective combined variant adjustment for the given selected
 * attributes, preferring the modern per-combination map (variantAdjustments)
 * and falling back to the legacy per-attribute sum if the new map is empty.
 *
 * If variantPercentAdjustments is provided, the flat adjustment is layered
 * on top of the percentage-based adjustment.
 *
 * Returns a plain number (may be negative or positive).
 */
function resolveVariantAdjustment(product, selectedAttributes, attributeTitles) {
  const newMap = product?.variantAdjustments;
  const percentMap = product?.variantPercentAdjustments;

  if (newMap && Object.keys(newMap).length > 0) {
    const flat = getVariantFlatAdjustment(newMap, selectedAttributes, attributeTitles);
    const pct = getVariantPercentAdjustment(percentMap, selectedAttributes, attributeTitles);
    return flat + pct;
  }

  // Legacy fallback: sum per-option adjustments.
  return computeAttributeAdjustment(product?.attributeAdjustments, selectedAttributes);
}

/**
 * Compute the combined price adjustment for a given set of selected attributes.
 * For each (attributeName, value) pair in `selectedAttributes`, look up the
 * adjustment in `attributeAdjustments[attributeName][value]`. Missing entries
 * contribute 0. The total adjustment is the sum of all such values.
 *
 * @param {Object} attributeAdjustments  e.g. { Color: { Green: -10 }, Size: { Small: -20 } }
 * @param {Object} selectedAttributes    e.g. { Color: 'Green', Size: 'Small' }
 * @returns {number} Sum of all selected attribute-value adjustments (>= 0 clamped).
 */
function computeAttributeAdjustment(attributeAdjustments, selectedAttributes) {
  if (!attributeAdjustments || !selectedAttributes) return 0;
  let total = 0;
  for (const [attrName, attrValue] of Object.entries(selectedAttributes)) {
    if (attrValue == null || attrValue === '') continue;
    const attrMap = attributeAdjustments[attrName];
    if (!attrMap || typeof attrMap !== 'object') continue;
    const raw = attrMap[attrValue];
    const num = Number(raw);
    if (Number.isFinite(num)) total += num;
  }
  // Allow negative adjustments, but cap the EFFECTIVE unitPrice at 0 elsewhere.
  return total;
}

/**
 * Apply an adjustment to a tier's unitPrice. Negative adjustments can drive
 * the price to 0 (clamped).
 */
function applyAdjustment(tier, adjustment, minEffectiveUnitPrice = 0) {
  const adj = Number(adjustment);
  if (!Number.isFinite(adj) || adj === 0) return tier;
  const floor = Math.max(0, Number(minEffectiveUnitPrice) || 0);
  const adjustedUnitPrice = Math.max(floor, Number(tier.unitPrice) + adj);
  return { ...tier, unitPrice: adjustedUnitPrice };
}

/**
 * Apply a percentage adjustment (e.g. -20 = -20%) on top of the tier's
 * unitPrice, then add the flat adjustment. Result is floored at
 * minEffectiveUnitPrice (default 0).
 */
function applyPercentAndFlat(tier, percent, flat, minEffectiveUnitPrice = 0) {
  const basePrice = Number(tier.unitPrice);
  const floor = Math.max(0, Number(minEffectiveUnitPrice) || 0);
  const p = Number.isFinite(Number(percent)) ? Number(percent) : 0;
  const f = Number.isFinite(Number(flat)) ? Number(flat) : 0;
  const adjusted = basePrice * (1 + p / 100) + f;
  return { ...tier, unitPrice: Math.max(floor, adjusted) };
}

function getTierPrice(priceTiers, qty, product, selectedAttributes, attributeTitles) {
  const tiers = normalizeTiers(priceTiers);
  if (!tiers.length) return null;

  // Apply the highest tier where minQty <= qty
  let applied = null;
  for (const t of tiers) {
    if (qty >= t.minQty) applied = t;
    else break;
  }
  const baseTier = applied || tiers[0];
  const floor = product?.minEffectiveUnitPrice ?? 0;

  // Prefer per-combination map; fall back to legacy per-attribute sum.
  const newMap = product?.variantAdjustments;
  if (newMap && Object.keys(newMap).length > 0) {
    const flat = getVariantFlatAdjustment(newMap, selectedAttributes, attributeTitles);
    const pct = getVariantPercentAdjustment(product?.variantPercentAdjustments, selectedAttributes, attributeTitles);
    return applyPercentAndFlat(baseTier, pct, flat, floor);
  }

  const totalAdjustment = computeAttributeAdjustment(product?.attributeAdjustments, selectedAttributes);
  return applyAdjustment(baseTier, totalAdjustment, floor);
}

module.exports = {
  normalizeTiers,
  getTierPrice,
  applyAdjustment,
  applyPercentAndFlat,
  computeAttributeAdjustment,
  buildCombinationKey,
  getVariantFlatAdjustment,
  getVariantPercentAdjustment,
  resolveVariantAdjustment,
};