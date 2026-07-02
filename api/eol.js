// /api/eol.js — Read and write EOL SKU list from private GitHub repo

const COOKIE_NAME   = "wv_auth";
const SESSION_TOKEN = "wv_stock_authenticated_2026";
const GITHUB_REPO   = "weaversvilla/weavers-stock";
const GITHUB_BRANCH = "main";
const GITHUB_FILE   = "data/eol_skus.json";

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
  // Auth check
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

  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
  const headers = {
    Authorization: `token ${token}`,
    Accept:        "application/vnd.github.v3+json",
    "User-Agent":  "weavers-stock",
    "Content-Type":"application/json",
  };

  // ── GET — fetch current EOL list ─────────────────────────────────────────
  if (req.method === "GET") {
    try {
      const ghRes = await fetch(apiUrl, { headers });

      // File doesn't exist yet — return empty list
      if (ghRes.status === 404) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ skus: [], updated_at: null }));
      }

      if (!ghRes.ok) throw new Error(`GitHub ${ghRes.status}`);
      const file = await ghRes.json();
      const content = JSON.parse(Buffer.from(file.content, "base64").toString("utf-8"));
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(content));
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // ── POST — save updated EOL list ─────────────────────────────────────────
  if (req.method === "POST") {
    try {
      // Parse request body
      let body = req.body;
      if (!body || typeof body !== "object") {
        const raw = await new Promise((resolve) => {
          let data = "";
          req.on("data", (chunk) => (data += chunk));
          req.on("end", () => resolve(data));
        });
        body = JSON.parse(raw);
      }

      const skus       = Array.isArray(body.skus) ? body.skus : [];
      const updated_at = new Date().toISOString();
      const newContent = JSON.stringify({ skus, updated_at }, null, 2);
      const encoded    = Buffer.from(newContent).toString("base64");

      // Get current SHA (needed to update file in GitHub)
      let sha = null;
      const existing = await fetch(apiUrl, { headers });
      if (existing.ok) {
        const existingFile = await existing.json();
        sha = existingFile.sha;
      }

      // Commit the updated file
      const payload = {
        message:  `Update EOL SKUs — ${updated_at}`,
        content:  encoded,
        branch:   GITHUB_BRANCH,
        ...(sha ? { sha } : {}),
      };

      const putRes = await fetch(apiUrl, {
        method:  "PUT",
        headers,
        body:    JSON.stringify(payload),
      });

      if (!putRes.ok) {
        const err = await putRes.text();
        throw new Error(`GitHub PUT failed: ${putRes.status} — ${err}`);
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true, skus, updated_at }));
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  res.statusCode = 405;
  res.end("Method not allowed");
};
