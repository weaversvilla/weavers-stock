// api/snapshot.js — save daily velocity snapshot to Vercel KV or return for local CSV
// POST /api/snapshot  body: { products: [...] }
// Returns the snapshot data formatted for CSV append

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { products } = req.body;
    if (!products || !Array.isArray(products)) {
      return res.status(400).json({ error: "products array required" });
    }

    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const snapshot = products.map((p) => ({
      date,
      sku: p.sku,
      name: p.name,
      currentStock: p.currentStock,
      dailyVelocity: p.dailyVelocity,
      netSales7d: p.netSales?.d7 || 0,
      netSales15d: p.netSales?.d15 || 0,
      netSales30d: p.netSales?.d30 || 0,
      netSales90d: p.netSales?.d90 || 0,
      status: p.status,
      daysRemaining: p.daysRemaining,
      suggestedOrder: p.suggestedOrder,
    }));

    // Return CSV rows for the Python script to append locally
    const csvHeader = Object.keys(snapshot[0]).join(",");
    const csvRows = snapshot.map((row) => Object.values(row).join(",")).join("\n");

    return res.status(200).json({
      date,
      count: snapshot.length,
      csvHeader,
      csvRows,
      snapshot,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
