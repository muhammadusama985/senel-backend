function notFound(req, res) {
  res.status(404).json({ message: "Route not found" });
}

function errorHandler(err, req, res, next) {
  // Zod errors etc.
  const status = err?.name === "ZodError" ? 400 : 500;
  const message = status === 400 ? "Validation error" : "Internal server error";

  if (status === 400) {
    return res.status(400).json({ message, issues: err.issues });
  }

  console.error(err);
  res.status(500).json({ message });
}

module.exports = { notFound, errorHandler };