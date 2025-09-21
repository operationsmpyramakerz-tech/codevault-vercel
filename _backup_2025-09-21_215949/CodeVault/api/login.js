// CodeVault/api/login.js
// الملف ده بيحوّل أي طلب /api/login إلى تطبيق Express بتاعنا
const app = require("../server.js");
module.exports = (req, res) => app(req, res);