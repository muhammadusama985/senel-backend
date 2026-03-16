const dotenv = require("dotenv");

function loadEnv() {
  dotenv.config();
  if (!process.env.MONGODB_URI) throw new Error("Missing MONGODB_URI");
  if (!process.env.JWT_ACCESS_SECRET) throw new Error("Missing JWT_ACCESS_SECRET");
}

module.exports = { loadEnv };