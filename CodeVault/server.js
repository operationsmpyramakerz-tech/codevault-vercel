// CodeVault/server.js
// يحمّل تطبيق Express من index.js ويرجّعه للفانكشن السيرفرلس
const app = require("./index.js");

// نخليه دالة async عشان المتحوّل في [[...slug]].js يقدر يستدعيه
module.exports = async () => app;