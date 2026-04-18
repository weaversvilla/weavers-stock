// api/report.js — main serverless endpoint
// GET /api/report

const {
  getAllInventoryProducts,
  getInventoryStock,
  getDocumentItemsByType,
  getOrderPlatformBreakdown,
  daysAgoTimestamp,
  todayTimestamp,
  sleep,
} = require("./_baselinker");

const {
  aggregateSales,
  aggregateReturns,
  calcProductMetrics,
  isDeadStock,
  PLATFORM_MAP,
} = require("./_velocity");

const INVENTORY_ID = parseInt(process.env.BL_INVENTORY_ID || "1257");
const WAREHOUSE_ID = parseInt(process.env.BL_WAREHOUSE_ID || "9001890");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const now      = todayTimestamp();
    const from90   = daysAgoTimestamp(90);
    const from30   = daysAgoTimestamp(30);

    // ── 1. Products + Stock ──────────────────────────────────────────────
    console.log("Fetching products...");
    const productList = await getAllInventoryProducts(INVENTORY_ID);
    const productIds  = Object.keys(productList).map(Number);
    console.log(`${productIds.length} products found. Fetching stock...`);
    const stockData   = await getInventoryStock(INVENTORY_ID, productIds);

    // ── 2. Sales document items (type: order) — 90 days ─────────────────
    console.log("Fetching sales document items...");
    const salesItems = await getDocumentItemsByType("order", from90, now);
    console.log(`${salesItems.length} sales line items fetched.`);

    // ── 3. Return document items (type: return) — 90 days ───────────────
    console.log("Fetching return document items...");
    const returnItems = await getDocumentItemsByType("return", from90, now);
    console.log(`${returnItems.length} return line items fetched.`);

    // ── 4. Platform breakdown from orders — 30 days ──────────────────────
    console.log("Fetching platform breakdown from orders...");
    const platformBreakdown = await getOrderPlatformBreakdown(from30, PLATFORM_MAP);

    // ── 5. Slice into time windows ───────────────────────────────────────
    const ts = {
      d7:  daysAgoTimestamp(7),
      d15: daysAgoTimestamp(15),
      d30: from30,
    };

    const sales = {
      d7:  aggregateSales(salesItems.filter(i => i.doc_date >= ts.d7)),
      d15: aggregateSales(salesItems.filter(i => i.doc_date >= ts.d15)),
      d30: aggregateSales(salesItems.filter(i => i.doc_date >= ts.d30)),
      d90: aggregateSales(salesItems),
    };
    const returns = {
      d7:  aggregateReturns(returnItems.filter(i => i.doc_date >= ts.d7)),
      d15: aggregateReturns(returnItems.filter(i => i.doc_date >= ts.d15)),
      d30: aggregateReturns(returnItems.filter(i => i.doc_date >= ts.d30)),
      d90: aggregateReturns(returnItems),
    };

    // ── 6. Build product report ──────────────────────────────────────────
    const report = [];

    for (const [productIdStr, product] of Object.entries(productList)) {
      const productId    = parseInt(productIdStr);
      const sku          = product.sku || productIdStr;
      const name         = product.name || "Unknown";
      const currentStock = getWarehouseStock(stockData[productId], WAREHOUSE_ID);

      const netSales = {
        d7:  Math.max(0, (sales.d7[sku]  || 0) - (returns.d7[sku]  || 0)),
        d15: Math.max(0, (sales.d15[sku] || 0) - (returns.d15[sku] || 0)),
        d30: Math.max(0, (sales.d30[sku] || 0) - (returns.d30[sku] || 0)),
        d90: Math.max(0, (sales.d90[sku] || 0) - (returns.d90[sku] || 0)),
      };

      const platformSales = platformBreakdown[sku] || {
        amazon: 0, flipkart: 0, myntra: 0, ajio: 0, others: 0,
      };

      const metrics   = calcProductMetrics(currentStock, netSales);
      const deadStock = isDeadStock(currentStock, netSales.d30);

      report.push({
        productId,
        sku,
        name,
        currentStock,
        netSales,
        grossSales: {
          d7:  sales.d7[sku]  || 0,
          d15: sales.d15[sku] || 0,
          d30: sales.d30[sku] || 0,
          d90: sales.d90[sku] || 0,
        },
        returns: {
          d7:  returns.d7[sku]  || 0,
          d15: returns.d15[sku] || 0,
          d30: returns.d30[sku] || 0,
          d90: returns.d90[sku] || 0,
        },
        platformSales,
        ...metrics,
        isDeadStock: deadStock,
      });
    }

    // Sort: urgent → healthy → dead stock last
    const ORDER = { OUT_OF_STOCK: 0, CRITICAL: 1, LOW: 2, WATCH: 3, HEALTHY: 4 };
    report.sort((a, b) => {
      if (a.isDeadStock !== b.isDeadStock) return a.isDeadStock ? 1 : -1;
      return (ORDER[a.status] ?? 5) - (ORDER[b.status] ?? 5);
    });

    const summary = {
      total:       report.length,
      outOfStock:  report.filter(p => p.status === "OUT_OF_STOCK").length,
      critical:    report.filter(p => p.status === "CRITICAL").length,
      low:         report.filter(p => p.status === "LOW").length,
      watch:       report.filter(p => p.status === "WATCH").length,
      healthy:     report.filter(p => p.status === "HEALTHY").length,
      deadStock:   report.filter(p => p.isDeadStock).length,
      generatedAt: new Date().toISOString(),
    };

    return res.status(200).json({ summary, products: report });

  } catch (err) {
    console.error("Report error:", err);
    return res.status(500).json({ error: err.message });
  }
};

function getWarehouseStock(stockInfo, warehouseId) {
  if (!stockInfo) return 0;
  const w = stockInfo.stock || {};
  return parseInt(w[warehouseId] || w["bl_" + warehouseId] || w[String(warehouseId)] || 0);
}
