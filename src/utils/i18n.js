function normalizeLang(lang) {
  const v = String(lang || "en").toLowerCase();
  if (["en", "de", "tr"].includes(v)) return v;
  return "en";
}
function pickLang(ml, lang = "en") {
  if (!ml || typeof ml !== "object") return "";
  return ml[lang] || ml.en || "";
}
module.exports = { normalizeLang, pickLang };