// CodeVault/api/[...all].js
function loadApp() {
  return require('../index.js'); // أو ../server.js لو هو اللي بيصدّر app
}
module.exports = (req, res) => {
  try {
    const app = loadApp();
    return app(req, res);
  } catch (e) {
    console.error('APP_LOAD_FAILED', e);
    res.status(500).json({ ok: false, error: 'APP_LOAD_FAILED' });
  }
};
