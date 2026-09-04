import app from "../src/app.js";

// CHECKPOINT NOTE (server/api/index.js):
// Vercel's Node.js runtime treats any file in /api as a serverless
// function. An Express app is itself a valid request handler function
// `(req, res) => {}`, so exporting it directly here is all Vercel needs —
// no adapter/wrapper library required. Every request to this backend's
// Vercel deployment (any path) is routed here by vercel.json.
export default app;
