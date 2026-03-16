const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");

/**
 * Ensure wallet exists.
 */
async function ensureWallet(vendorId, session) {
  let wallet = await Wallet.findOne({ vendorId }).session(session || null);
  if (!wallet) {
    wallet = await Wallet.create([{ vendorId, balance: 0 }], session ? { session } : undefined);
    wallet = Array.isArray(wallet) ? wallet[0] : wallet;
  }
  return wallet;
}

/**
 * Append a ledger transaction and update wallet balance atomically in the same transaction/session.
 * amount: +credit, -debit
 * referenceType/referenceId enable idempotency and traceability.
 */
async function applyTransaction({
  vendorId,
  kind,
  amount,
  note = "",
  referenceType = "",
  referenceId = null,
  createdByAdminId = null,
  session,
}) {
  const wallet = await ensureWallet(vendorId, session);

  const newBalance = Number((wallet.balance + amount).toFixed(2));
  if (newBalance < 0) {
    const err = new Error("Insufficient wallet balance");
    err.statusCode = 400;
    throw err;
  }

  // Create ledger entry first (can fail if unique idempotency hits)
  const txDocs = await WalletTransaction.create(
    [
      {
        walletId: wallet._id,
        vendorId,
        kind,
        amount: Number(amount.toFixed(2)),
        balanceAfter: newBalance,
        note,
        referenceType,
        referenceId,
        createdByAdminId,
      },
    ],
    session ? { session } : undefined
  );

  // Update wallet cached balance
  wallet.balance = newBalance;
  await wallet.save(session ? { session } : undefined);

  return { wallet, tx: txDocs[0] };
}

module.exports = { ensureWallet, applyTransaction };