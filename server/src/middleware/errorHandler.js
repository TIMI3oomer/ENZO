// CHECKPOINT NOTE (server/src/middleware/errorHandler.js):
// Centralized error handling so every route can just `throw` or call
// `next(err)` instead of repeating try/catch + response formatting
// everywhere. In production it deliberately hides internal error details
// (stack traces, raw DB errors) from the response — only the message is
// shown, and only because our own route handlers throw clean, safe
// messages on purpose (see routes/orders.js for an example).
export function errorHandler(err, _req, res, _next) {
  console.error(err);
  const status = err.status || 500;
  const message = status === 500 ? "Something went wrong" : err.message;
  res.status(status).json({ error: message });
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: "Not found" });
}
