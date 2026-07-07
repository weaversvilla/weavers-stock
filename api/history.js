// /api/history.js — Serve stock_value_history.csv as JSON, auth-gated

const COOKIE_NAME   = "wv_auth";
const SESSION_TOKEN = "wv_stock_authenticated_2026";
const GITHUB_REPO   = "weaversvilla/weavers-stock";
const GITHUB_BRANCH = "main";
const GITHUB_FILE   = "python/stock_value_history.csv";

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  });
  return out;
}

module.exports = async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[COOKIE_NAME] !== SESSION_TOKEN) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  const token = process.env.GH_PAT;
  if (!token) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "GH_PAT not configured" }));
  }

  try {
    const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_FILE}`;
    const ghRes = await fetch(url, { headers: { Authorization: `token ${token}` } });

    if (ghRes.status === 404) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ rows: [] }));
    }
    if (!ghRes.ok) throw new Error(`GitHub ${ghRes.status}`);

    const csvText = await ghRes.text();
    const lines = csvText.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const cols = line.split(",");
      const row = {};
      headers.forEach((h, i) => {
        const v = cols[i];
        row[h] = (h === "date") ? v : Number(v) || 0;
      });
      return row;
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, private");
    return res.end(JSON.stringify({ rows }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: e.message }));
  }
};
