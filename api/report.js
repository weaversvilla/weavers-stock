// api/report.js — with in-memory cache to prevent rate limit hammering

const {
  getAllInventoryProducts,
  getInventoryStock,
  getOrdersSince,
  daysAgoTimestamp,
  todayTimestamp,
} = require("./_baselinker");

const {
  aggregateOrderSales,
  aggregateOrderReturns,
  calcProductMetrics,
  isDeadStock,
} = require("./_velocity");

const INVENTORY_ID = parseInt(process.env.BL_INVENTORY_ID || "1257");
const WAREHOUSE_ID = parseInt(process.env.BL_WAREHOUSE_ID || "9001890");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

// In-memory cache (lives for the duration of the Vercel function instance)
let cache = { data: null, timestamp: 0 };

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Force refresh param: /api/report?refresh=1
  const forceRefresh = req.query?.refresh === "1";

  // Return cached data if fresh
  const now = Date.now();
  if (!forceRefresh && cache.data && (now - cache.timestamp) < CACHE_TTL_MS) {
    console.log("Returning cached report.");
    return res.status(200).json({
      ...cache.data,
      cached: true,
      cachedAt: new Date(cache.timestamp).toISOString(),
    });
  }

  try {
    const from90 = daysAgoTimestamp(90);

    console.log("Fetching products...");
    const productList = await getAllInventoryProducts(INVENTORY_ID);
    const productIds  = Object.keys(productList).map(Number);
    console.log(`${productIds.length} products. Fetching stock...`);
    const stockData = await getInventoryStock(INVENTORY_ID, productIds);

    console.log("Fetching 90 days of orders...");
    const orders90 = await getOrdersSince(from90);
    console.log(`${orders90.length} orders fetched.`);

    const ts = {
      d7:  daysAgoTimestamp(7),
      d15: daysAgoTimestamp(15),
      d30: daysAgoTimestamp(30),
    };

    const ordersIn = {
      d7:  orders90.filter(o => (o.date_confirmed || o.date_add) >= ts.d7),
      d15: orders90.filter(o => (o.date_confirmed || o.date_add) >= ts.d15),
      d30: orders90.filter(o => (o.date_confirmed || o.date_add) >= ts.d30),
      d90: orders90,
    };

    const regularOrders = {
      d7:  ordersIn.d7.filter(o => o.order_source !== "order_return"),
      d15: ordersIn.d15.filter(o => o.order_source !== "order_return"),
      d30: ordersIn.d30.filter(o => o.order_source !== "order_return"),
      d90: ordersIn.d90.filter(o => o.order_source !== "order_return"),
    };

    const returnOrders = {
      d7:  ordersIn.d7.filter(o => o.order_source === "order_return"),
      d15: ordersIn.d15.filter(o => o.order_source === "order_return"),
      d30: ordersIn.d30.filter(o => o.order_source === "order_return"),
      d90: ordersIn.d90.filter(o => o.order_source === "order_return"),
    };

    const sales = {
      d7:  aggregateOrderSales(regularOrders.d7),
      d15: aggregateOrderSales(regularOrders.d15),
      d30: aggregateOrderSales(regularOrders.d30),
      d90: aggregateOrderSales(regularOrders.d90),
    };

    const returns = {
      d7:  aggregateOrderReturns(returnOrders.d7),
      d15: aggregateOrderReturns(returnOrders.d15),
      d30: aggregateOrderReturns(returnOrders.d30),
      d90: aggregateOrderReturns(returnOrders.d90),
    };

    const report = [];

    for (const [productIdStr, product] of Object.entries(productList)) {
      const productId    = parseInt(productIdStr);
      const sku          = product.sku || productIdStr;
      const name         = product.name || "Unknown";
      const currentStock = getWarehouseStock(stockData[productId], WAREHOUSE_ID);

      const netSales = {
        d7:  Math.max(0, (sales.d7[sku]?.total  || 0) - (returns.d7[sku]  || 0)),
        d15: Math.max(0, (sales.d15[sku]?.total || 0) - (returns.d15[sku] || 0)),
        d30: Math.max(0, (sales.d30[sku]?.total || 0) - (returns.d30[sku] || 0)),
        d90: Math.max(0, (sales.d90[sku]?.total || 0) - (returns.d90[sku] || 0)),
      };

      const platformSales = {
        amazon:   sales.d30[sku]?.amazon   || 0,
        flipkart: sales.d30[sku]?.flipkart || 0,
        myntra:   sales.d30[sku]?.myntra   || 0,
        ajio:     sales.d30[sku]?.ajio     || 0,
        others:   sales.d30[sku]?.others   || 0,
      };

      const metrics   = calcProductMetrics(currentStock, netSales);
      const deadStock = isDeadStock(currentStock, netSales.d30);

      report.push({
        productId, sku, name, currentStock,
        netSales,
        grossSales: {
          d7:  sales.d7[sku]?.total  || 0,
          d15: sales.d15[sku]?.total || 0,
          d30: sales.d30[sku]?.total || 0,
          d90: sales.d90[sku]?.total || 0,
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

    const ORDER = { OUT_OF_STOCK: 0, CRITICAL: 1, LOW: 2, WATCH: 3, HEALTHY: 4 };
    report.sort((a, b) => {
      if (a.isDeadStock !== b.isDeadStock) return a.isDeadStock ? 1 : -1;
      return (ORDER[a.status] ?? 5) - (ORDER[b.status] ?? 5);
    });

    const result = {
      summary: {
        total:       report.length,
        outOfStock:  report.filter(p => p.status === "OUT_OF_STOCK").length,
        critical:    report.filter(p => p.status === "CRITICAL").length,
        low:         report.filter(p => p.status === "LOW").length,
        watch:       report.filter(p => p.status === "WATCH").length,
        healthy:     report.filter(p => p.status === "HEALTHY").length,
        deadStock:   report.filter(p => p.isDeadStock).length,
        generatedAt: new Date().toISOString(),
      },
      products: report,
    };

    // Store in cache
    cache = { data: result, timestamp: Date.now() };

    return res.status(200).json(result);

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
