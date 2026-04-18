// api/_velocity.js — velocity calculation engine

const WEIGHTS     = { d7: 0.40, d15: 0.30, d30: 0.20, d90: 0.10 };
const TARGET_DAYS = 90;

const PLATFORM_MAP = {
  amazon:   [443, 445, 537],
  flipkart: [1414],
  myntra:   [1492],
  ajio:     [1548],
  others:   [1636, 1601, 9000337],
};

// Build per-SKU sales map from orders
// Returns { sku: { total, amazon, flipkart, myntra, ajio, others } }
function aggregateOrderSales(orders) {
  const sales = {};

  for (const order of orders) {
    const platform = getPlatformName(order.order_source_id);

    for (const product of order.products || []) {
      const sku = product.sku || "";
      if (!sku) continue;

      if (!sales[sku]) {
        sales[sku] = { total: 0, amazon: 0, flipkart: 0, myntra: 0, ajio: 0, others: 0 };
      }

      const qty = parseInt(product.quantity) || 0;
      sales[sku].total += qty;
      sales[sku][platform] = (sales[sku][platform] || 0) + qty;
    }
  }

  return sales;
}

// Build per-SKU returns map
// Only counts orders where order_source = "order_return" or status indicates return
// In BL, returns processed through Returns panel come back as negative order_source
// We identify them by order_source field value
function aggregateOrderReturns(orders) {
  const returns = {};

  for (const order of orders) {
    // BL marks return orders with order_source = "order_return"
    if (order.order_source !== "order_return") continue;

    for (const product of order.products || []) {
      const sku = product.sku || "";
      if (!sku) continue;
      const qty = parseInt(product.quantity) || 0;
      returns[sku] = (returns[sku] || 0) + qty;
    }
  }

  return returns;
}

function getPlatformName(sourceId) {
  for (const [name, ids] of Object.entries(PLATFORM_MAP)) {
    if (ids.includes(sourceId)) return name;
  }
  return "others";
}

// Weighted daily velocity across 4 windows
function calcVelocity(netSales) {
  const { d7, d15, d30, d90 } = netSales;
  const avgs = { d7: d7/7, d15: d15/15, d30: d30/30, d90: d90/90 };
  const hasData = { d7: d7>0, d15: d15>0, d30: d30>0, d90: d90>0 };

  const totalWeight = Object.entries(WEIGHTS)
    .filter(([k]) => hasData[k])
    .reduce((s, [,v]) => s + v, 0);

  if (totalWeight === 0) return 0;

  const weighted =
    (hasData.d7  ? avgs.d7  * WEIGHTS.d7  : 0) +
    (hasData.d15 ? avgs.d15 * WEIGHTS.d15 : 0) +
    (hasData.d30 ? avgs.d30 * WEIGHTS.d30 : 0) +
    (hasData.d90 ? avgs.d90 * WEIGHTS.d90 : 0);

  return Math.max(0, weighted / totalWeight);
}

function calcProductMetrics(currentStock, netSales) {
  const velocity      = calcVelocity(netSales);
  const daysRemaining = velocity > 0 ? currentStock / velocity : null;
  const suggestedOrder = velocity > 0
    ? Math.max(0, Math.ceil((TARGET_DAYS - (daysRemaining || 0)) * velocity))
    : 0;

  return {
    dailyVelocity:  parseFloat(velocity.toFixed(3)),
    daysRemaining:  daysRemaining !== null ? parseFloat(daysRemaining.toFixed(1)) : null,
    suggestedOrder,
    status: getStatus(currentStock, daysRemaining),
  };
}

function getStatus(stock, daysRemaining) {
  if (stock <= 0)             return "OUT_OF_STOCK";
  if (daysRemaining === null) return "HEALTHY";
  if (daysRemaining <= 7)     return "CRITICAL";
  if (daysRemaining <= 15)    return "LOW";
  if (daysRemaining <= 30)    return "WATCH";
  return "HEALTHY";
}

function isDeadStock(stock, netSales30d) {
  return stock > 0 && netSales30d <= 0;
}

module.exports = {
  aggregateOrderSales,
  aggregateOrderReturns,
  calcVelocity,
  calcProductMetrics,
  isDeadStock,
  getPlatformName,
  TARGET_DAYS,
  PLATFORM_MAP,
};
