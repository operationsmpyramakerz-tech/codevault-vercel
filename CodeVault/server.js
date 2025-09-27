// CodeVault/server.js
// Adapter that exports the Express app for Vercel serverless,
// and starts a local server when run directly.

const app = require("./index.js");

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`[CodeVault] Local server running on http://localhost:${port}`);
  });
}

module.exports = app;
