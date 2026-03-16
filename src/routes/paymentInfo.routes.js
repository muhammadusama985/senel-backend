const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { getBankTransferInfo } = require("../controllers/publicPaymentInfo.controller");

router.get("/payment-info/bank-transfer", asyncHandler(getBankTransferInfo));

module.exports = router;