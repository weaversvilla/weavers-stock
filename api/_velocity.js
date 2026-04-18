// api/_velocity.js — velocity calculation engine

const WEIGHTS    = { d7: 0.40, d15: 0.30, d30: 0.20, d90: 0.10 };
const TARGET_DAYS = 90;

const PLATFORM_MAP = {
  amazon:   [443, 445, 537],
  flipkart: [1414],
  myntra:   [1492],
  ajio:     [1548],
  others:   [1636, 1601, 9000337],
};

// Aggregate sales from document items → { sku: totalQty }
function aggregateSales(items) {
  const sales = {};
  for (const item of items) {
    const sku = item.sku;
    if (!sku) continue;
    sales[sku] = (sales[sku] || 0) + item.quantity;
  }
  return sales;
}

// Aggregate returns from "return" type document items
// Only count items where issued_for starts with "return" → customer return
// Blank issued_for = internal stock adjustment → excluded
function aggregateReturns(items) {
  const returns = {};
  for (const item of items) {
    const issuedFor = (item.issued_for || "").toLowerCase().trim();
    if (!issuedFor.startsWith("return")) continue;
    const sku = item.sku;
    if (!sku) continue;
    returns[sku] = (returns[sku] || 0) + item.quantity;
  }
  return returns;
}

// Weighted daily velocity across 4 windows
function calcVelocity(netSales) {
  const { d7, d15, d30, d90 } = netSales;
  const avgs = {
    d7:  d7  / 7,
    d15: d15 / 15,
    d30: d30 / 30,
    d90: d90 / 90,
  };
  const hasData = { d7: d7 > 0, d15: d15 > 0, d30: d30 > 0, d90: d90 > 0 };
  const totalWeight = Object.entries(WEIGHTS)
    .filter(([k]) => hasData[k])
    .reduce((s, [, v]) => s + v, 0);
  if (totalWeight === 0) return 0;

  const weighted =
    (hasData.d7  ? avgs.d7  * WEIGHTS.d7  : 0) +
    (hasData.d15 ? avgs.d15 * WEIGHTS.d15 : 0) +
    (hasData.d30 ? avgs.d30 * WEIGHTS.d30 : 0) +
    (hasData.d90 ? avgs.d90 * WEIGHTS.d90 : 0);

  return Math.max(0, weighted / totalWeight);
}

function calcProductMetrics(currentStock, netSales) {
  const velocity     = calcVelocity(netSales);
  const daysRemaining = velocity > 0 ? currentStock / velocity : null;
  const suggestedOrder = velocity > 0
    ? Math.max(0, Math.ceil((TARGET_DAYS - (daysRemaining || 0)) * velocity))
    : 0;

  return {
    dailyVelocity: parseFloat(velocity.toFixed(3)),
    daysRemaining: daysRemaining !== null ? parseFloat(daysRemaining.toFixed(1)) : null,
    suggestedOrder,
    status: getStatus(currentStock, daysRemaining),
  };
}

function getStatus(stock, daysRemaining) {
  if (stock <= 0)              return "OUT_OF_STOCK";
  if (daysRemaining === null)  return "HEALTHY"; // in stock, no recent sales
  if (daysRemaining <= 7)      return "CRITICAL";
  if (daysRemaining <= 15)     return "LOW";
  if (daysRemaining <= 30)     return "WATCH";
  return "HEALTHY";
}

function isDeadStock(stock, netSales30d) {
  return stock > 0 && netSales30d <= 0;
}

module.exports = {
  aggregateSales,
  aggregateReturns,
  calcVelocity,
  calcProductMetrics,
  isDeadStock,
  TARGET_DAYS,
  PLATFORM_MAP,
};
