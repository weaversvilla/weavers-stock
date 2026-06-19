// /api/data.js — Vercel Node.js Serverless Function
// Serves report_data.json from the PRIVATE GitHub repo, but only to
// visitors who have a valid auth cookie. The data never touches the
// public internet unauthenticated.

const COOKIE_NAME   = "wv_auth";
const SESSION_TOKEN  = "wv_stock_authenticated_2026";

const GITHUB_REPO   = "weaversvilla/weavers-stock";
const GITHUB_BRANCH = "main";
const GITHUB_FILE   = "public/report_data.json";

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
    return res.end(JSON.stringify({ error: "Server misconfigured: GH_PAT env var missing" }));
  }

  try {
    const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_FILE}`;
    const ghRes = await fetch(url, {
      headers: { Authorization: `token ${token}` },
    });

    if (!ghRes.ok) {
      res.statusCode = ghRes.status;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: `GitHub fetch failed: ${ghRes.status}` }));
    }

    const text = await ghRes.text();
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, private");
    return res.end(text);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: e.message }));
  }
};
