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
function applyAdjustment(tier, adjustment) {
  const adj = Number(adjustment);
  if (!Number.isFinite(adj) || adj === 0) return tier;
  const adjustedUnitPrice = Math.max(0, Number(tier.unitPrice) + adj);
  return { ...tier, unitPrice: adjustedUnitPrice };
}

function getTierPrice(priceTiers, qty, selectedAttributes, attributeAdjustments) {
  const tiers = normalizeTiers(priceTiers);
  if (!tiers.length) return null;

  // Apply the highest tier where minQty <= qty
  let applied = null;
  for (const t of tiers) {
    if (qty >= t.minQty) applied = t;
    else break;
  }
  const baseTier = applied || tiers[0];
  const totalAdjustment = computeAttributeAdjustment(attributeAdjustments, selectedAttributes);
  return applyAdjustment(baseTier, totalAdjustment);
}

module.exports = { normalizeTiers, getTierPrice, applyAdjustment, computeAttributeAdjustment };