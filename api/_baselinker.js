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
    if (i + BATCH < productIds.length) await sleep(650);
  }
  return allData;
}

// Fetch ALL confirmed orders from a date onwards
// Returns flat array of orders with their products
// Uses date_confirmed pagination as per BL docs
async function getOrdersSince(dateFrom) {
  let allOrders = [];
  let dateConfirmedFrom = dateFrom;

  while (true) {
    const data = await blCall("getOrders", {
      date_confirmed_from: dateConfirmedFrom,
      get_unconfirmed_orders: false,
    });

    const orders = data.orders || [];
    if (orders.length === 0) break;

    allOrders = allOrders.concat(orders);

    if (orders.length < 100) break;

    // Next page: use last order's confirmed date + 1 second
    const lastDate = orders[orders.length - 1].date_confirmed;
    if (!lastDate || lastDate <= dateConfirmedFrom) break;
    dateConfirmedFrom = lastDate + 1;
    await sleep(650);
  }

  return allOrders;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function daysAgoTimestamp(days) { return Math.floor(Date.now() / 1000) - days * 86400; }
function todayTimestamp() { return Math.floor(Date.now() / 1000); }

module.exports = {
  blCall,
  getAllInventoryProducts,
  getInventoryStock,
  getOrdersSince,
  daysAgoTimestamp,
  todayTimestamp,
  sleep,
};
