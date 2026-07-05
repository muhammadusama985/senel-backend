function notFound(req, res) {
  res.status(404).json({ message: "Route not found" });
}

function errorHandler(err, req, res, next) {
  // Zod errors -> 400 with issues
  if (err?.name === "ZodError") {
    return res.status(400).json({ message: "Validation error", issues: err.issues });
  }

  // Mongoose validation errors -> 400 with field details
  if (err?.name === "ValidationError") {
    const fields = err.errors
      ? Object.fromEntries(
          Object.entries(err.errors).map(([k, v]) => [k, v.message || String(v)])
        )
      : undefined;
    console.error("[errorHandler] Mongoose ValidationError:", err.message, fields);
    return res.status(400).json({
      message: err.message || "Validation error",
      validationErrors: fields,
    });
  }

  // Mongoose CastError (invalid ObjectId etc.) -> 400
  if (err?.name === "CastError") {
    return res.status(400).json({ message: `Invalid ${err.path}: ${err.value}` });
  }

  // Duplicate key error -> 409
  if (err?.code === 11000) {
    return res.status(409).json({
      message: "Duplicate key",
      keyValue: err.keyValue,
    });
  }

  console.error("[errorHandler]", err);
  res.status(500).json({ message: "Internal server error" });
}

module.exports = { notFound, errorHandler };