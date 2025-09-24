
const { getEnvIds, fetchDatabase } = require("../_lib/notion");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const ids = getEnvIds();
    if (!ids.ordersDB) return res.status(500).json({ ok:false, success:false, error:"MISSING_DB_ID", which:"orders" });
    const items = await fetchDatabase(ids.ordersDB, { pageSize: 50 });
    return res.json({
      ok: true,
      success: true,
      count: items.length,
      items,
      orders: items,
    });
  } catch (err) {
    return res.status(500).json({ ok:false, success:false, error: String((err && err.code) || (err && err.message) || err) });
  }
};
