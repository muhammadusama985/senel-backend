const { getSettings } = require("../services/platformSettings.service");

async function getBankTransferInfo(req, res) {
  const settings = await getSettings();
  const bt = settings.bankTransfer || {};
  res.json({
    enabled: !!bt.enabled,
    bankName: bt.bankName || "",
    accountTitle: bt.accountTitle || "",
    accountNumber: bt.accountNumber || "",
    iban: bt.iban || "",
    swift: bt.swift || "",
    instructions: bt.instructions || "",
  });
}

module.exports = { getBankTransferInfo };