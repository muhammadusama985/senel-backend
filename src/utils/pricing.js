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
 * Build the per-combination key used by combinationOffsets. The order of
 * `attributeTitles` MUST be stable (e.g. sorted alphabetically or in the
 * order the vendor defined them).
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
 * Look up the OFFSET (relative to base combination) for the currently selected
 * attributes. Returns 0 if not set / not finite / no combination selected yet.
 *
 * The effective unit price for a tier is: tier.unitPrice + offset,
 * floored at minEffectiveUnitPrice.
 */
function getCombinationOffset(combinationOffsets, selectedAttributes, attributeTitles) {
  if (!combinationOffsets) return 0;
  const key = buildCombinationKey(selectedAttributes, attributeTitles);
  if (!key) return 0;
  const num = Number(combinationOffsets[key]);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Resolve the effective tier for the given quantity, applying the
 * combination offset (relative to base) and flooring at
 * minEffectiveUnitPrice. Pure flat model: no percentages.
 *
 *   effective_unit_price = max(floor, tier.unitPrice + combinationOffset)
 *
 * Returns the base tier object with `unitPrice` overridden to the effective
 * price, or null when there are no usable tiers.
 */
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

  const floor = Math.max(0, Number(product?.minEffectiveUnitPrice) || 0);
  const offset = getCombinationOffset(
    product?.combinationOffsets,
    selectedAttributes,
    attributeTitles
  );
  const effectivePrice = Math.max(floor, Number(baseTier.unitPrice) + offset);
  return { ...baseTier, unitPrice: effectivePrice };
}

module.exports = {
  normalizeTiers,
  getTierPrice,
  buildCombinationKey,
  getCombinationOffset,
};