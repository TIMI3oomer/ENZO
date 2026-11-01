import app from "./app.js";

// CHECKPOINT NOTE (server/src/index.js):
// LOCAL DEVELOPMENT ONLY. This file is never used on Vercel -- see
// server/api/index.js for the Vercel entry point, which imports the same
// app.js but lets Vercel manage the actual request handling instead of
// calling .listen().
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`[ENZO server] listening on port ${port}`));
