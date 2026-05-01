/**
 * Normalize language code (en, de, tr, etc.)
 */
function normalizeLang(raw) {
  const v = String(raw || "en").toLowerCase().replace("_", "-");
  const base = v.split("-")[0];
  const supported = ["en", "de", "tr", "fr", "es"];
  return supported.includes(base) ? base : "en";
}

/**
 * Detect language from request
 */
function detectLanguage(req) {
  // 1) query parameter ?lang=
  if (req.query?.lang) return normalizeLang(req.query.lang);

  // 2) Custom language header
  const customHeader = req.headers["x-lang"] || req.headers["x-language"];
  if (customHeader) {
    return normalizeLang(customHeader);
  }

  // 3) Accept-Language header
  const header = req.headers["accept-language"];
  if (header) {
    const first = String(header).split(",")[0];
    return normalizeLang(first);
  }

  // 4) Default to English
  return "en";
}

/**
 * Middleware to attach language to request
 */
function attachLang(req, res, next) {
  req.lang = detectLanguage(req);
  next();
}

module.exports = { attachLang, normalizeLang, detectLanguage };
