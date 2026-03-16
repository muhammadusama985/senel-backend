const mongoose = require("mongoose");

async function connectDB() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");
}

module.exports = { connectDB };
