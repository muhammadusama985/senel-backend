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

function getTierPrice(priceTiers, qty) {
  const tiers = normalizeTiers(priceTiers);
  if (!tiers.length) return null;

  // Apply the highest tier where minQty <= qty
  let applied = null;
  for (const t of tiers) {
    if (qty >= t.minQty) applied = t;
    else break;
  }
  return applied || tiers[0]; // fallback to first tier if qty smaller (but MOQ should block)
}

module.exports = { normalizeTiers, getTierPrice };