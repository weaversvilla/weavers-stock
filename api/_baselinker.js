// api/_baselinker.js — shared BL API caller

const BL_API_URL = "https://api.baselinker.com/connector.php";
const TOKEN = process.env.BASELINKER_API_TOKEN;

async function blCall(method, parameters = {}) {
  const body = new URLSearchParams({
    token: TOKEN,
    method,
    parameters: JSON.stringify(parameters),
  });
  const res = await fetch(BL_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json();
  if (data.status !== "SUCCESS") {
    throw new Error(`BL API error [${method}]: ${data.error_message || JSON.stringify(data)}`);
  }
  return data;
}

// Fetch ALL inventory products with pagination
async function getAllInventoryProducts(inventoryId) {
  let page = 1;
  let allProducts = {};
  while (true) {
    const data = await blCall("getInventoryProductsList", { inventory_id: inventoryId, page });
    const products = data.products || {};
    const keys = Object.keys(products);
    if (keys.length === 0) break;
    Object.assign(allProducts, products);
    if (keys.length < 1000) break;
    page++;
  }
  return allProducts;
}

// Fetch stock levels in batches of 200
async function getInventoryStock(inventoryId, productIds) {
  const BATCH = 200;
  let allData = {};
  for (let i = 0; i < productIds.length; i += BATCH) {
    const batch = productIds.slice(i, i + BATCH);
    const data = await blCall("getInventoryProductsData", {
      inventory_id: inventoryId,
      products: batch,
    });
    Object.assign(allData, data.products || {});
    if (i + BATCH < productIds.length) await sleep(700);
  }
  return allData;
}

// Fetch document items directly by doc_type and date range
// Uses getInventoryDocumentItems — the correct BL API method
// Returns flat array of items with doc metadata attached
async function getDocumentItemsByType(docType, dateFrom, dateTo) {
  // Step 1: get document list
  let page = 1;
  let allDocs = [];
  while (true) {
    const data = await blCall("getInventoryDocuments", {
      doc_type:  docType,
      date_from: dateFrom,
      date_to:   dateTo,
      page,
    });
    const docs = data.documents || [];
    allDocs = allDocs.concat(docs);
    if (docs.length < 100) break;
    page++;
    await sleep(600);
  }

  if (allDocs.length === 0) return [];

  // Step 2: fetch items for each document in batches of 10
  const allItems = [];
  const BATCH = 10;
  for (let i = 0; i < allDocs.length; i += BATCH) {
    const batch = allDocs.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (doc) => {
        try {
          const data = await blCall("getInventoryDocumentItems", { document_id: doc.document_id });
          const items = data.items || [];
          return items.map(item => ({
            sku:          item.product_sku || "",
            product_id:   item.product_id,
            quantity:     parseInt(item.quantity) || 0,
            doc_date:     doc.date || doc.document_date || 0,
            doc_id:       doc.document_id,
            doc_type:     docType,
            issued_for:   doc.issued_for || "",
          }));
        } catch { return []; }
      })
    );
    results.forEach(r => allItems.push(...r));
    if (i + BATCH < allDocs.length) await sleep(400);
  }
  return allItems;
}

// Fetch orders for platform breakdown (last 30 days)
// Returns map: { sku → { amazon, flipkart, myntra, ajio, others } }
async function getOrderPlatformBreakdown(dateFrom, platformMap) {
  const breakdown = {}; // sku → platform counts

  let dateConfirmedFrom = dateFrom;
  while (true) {
    const data = await blCall("getOrders", {
      date_confirmed_from: dateConfirmedFrom,
      get_unconfirmed_orders: false,
    });
    const orders = data.orders || [];
    if (orders.length === 0) break;

    for (const order of orders) {
      const sourceId = order.order_source_id;
      const platform = getPlatformName(sourceId, platformMap);

      for (const product of order.products || []) {
        const sku = product.sku || "";
        if (!sku) continue;
        if (!breakdown[sku]) {
          breakdown[sku] = { amazon: 0, flipkart: 0, myntra: 0, ajio: 0, others: 0 };
        }
        const qty = parseInt(product.quantity) || 0;
        if (breakdown[sku][platform] !== undefined) {
          breakdown[sku][platform] += qty;
        }
      }
    }

    if (orders.length < 100) break;
    // Use last order's date_confirmed + 1 for next page
    const lastDate = orders[orders.length - 1].date_confirmed;
    if (!lastDate || lastDate <= dateConfirmedFrom) break;
    dateConfirmedFrom = lastDate + 1;
    await sleep(600);
  }
  return breakdown;
}

function getPlatformName(sourceId, platformMap) {
  for (const [name, ids] of Object.entries(platformMap)) {
    if (ids.includes(sourceId)) return name;
  }
  return "others";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function daysAgoTimestamp(days) {
  return Math.floor(Date.now() / 1000) - days * 86400;
}

function todayTimestamp() {
  return Math.floor(Date.now() / 1000);
}

module.exports = {
  blCall,
  getAllInventoryProducts,
  getInventoryStock,
  getDocumentItemsByType,
  getOrderPlatformBreakdown,
  getPlatformName,
  daysAgoTimestamp,
  todayTimestamp,
  sleep,
};
