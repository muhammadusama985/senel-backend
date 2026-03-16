function normalizeML(input = {}) {
  return {
    en: String(input.en || "").trim(),
    de: String(input.de || "").trim(),
    tr: String(input.tr || "").trim(),
  };
}

function hasAnyML(input = {}) {
  const ml = normalizeML(input);
  return !!(ml.en || ml.de || ml.tr);
}

function resolveML(input = {}, lang = "en", fallback = "") {
  const ml = normalizeML(input);
  return ml[lang] || ml.en || ml.de || ml.tr || fallback || "";
}

module.exports = {
  normalizeML,
  hasAnyML,
  resolveML,
};
