// CodeVault/api/index.js
const app = require("../server.js");

// Vercel Serverless handler
module.exports = (req, res) => app(req, res);