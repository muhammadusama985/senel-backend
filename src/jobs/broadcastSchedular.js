const BroadcastCampaign = require("../models/BroadcastCampaign");
const { adminSendCampaign } = require("../controllers/broadcast.controller");

/**
 * If you don’t have a job runner, you can call this in a setInterval at app start.
 * Better: run as separate worker process.
 */
async function runBroadcastScheduler({ fakeReqFactory, fakeResFactory }) {
  const now = new Date();

  const due = await BroadcastCampaign.find({
    status: "scheduled",
    scheduledAt: { $lte: now },
  }).select({ _id: 1 }).lean();

  for (const c of due) {
    // Create mock req/res that call adminSendCampaign
    // Or just extract sending logic into a service and call it here.
    const req = fakeReqFactory(c._id);
    const res = fakeResFactory();
    // eslint-disable-next-line no-await-in-loop
    await adminSendCampaign(req, res);
  }
}

module.exports = { runBroadcastScheduler };