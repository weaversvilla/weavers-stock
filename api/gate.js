// /api/gate.js — Vercel Node.js Serverless Function
// Handles: GET "/" (show login or dashboard), POST "/" (process login)

const fs = require("fs");
const path = require("path");

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const USERNAME      = "weavers";
const PASSWORD      = "villa2026";   // ← Change this before pushing
const COOKIE_NAME    = "wv_auth";
const SESSION_TOKEN  = "wv_stock_authenticated_2026";
const MAX_AGE        = 3650 * 24 * 60 * 60; // 10 years — effectively permanent
// ─────────────────────────────────────────────────────────────────────────────

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  });
  return out;
}

const LOGIN_HTML = (showError) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <meta name="mobile-web-app-capable" content="yes"/>
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
  <meta name="apple-mobile-web-app-title" content="WV Stock"/>
  <meta name="theme-color" content="#0a0a0f"/>
  <title>Weavers Villa — Login</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0a0a0f;color:#f0f0f8;font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#111118;border:1px solid #1e1e2e;border-radius:16px;padding:40px 36px;width:100%;max-width:380px;box-shadow:0 24px 64px rgba(0,0,0,0.5)}
    .logo{font-size:24px;font-weight:800;color:#f0f0f8;letter-spacing:-0.5px}
    .tagline{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#f0a500;margin-top:4px;margin-bottom:36px}
    label{display:block;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#5a5a7a;margin-bottom:8px}
    input{width:100%;background:#0a0a0f;border:1px solid #2a2a3a;border-radius:8px;padding:12px 14px;color:#f0f0f8;font-size:15px;outline:none;transition:border-color 0.2s;margin-bottom:20px}
    input:focus{border-color:#f0a500}
    button{width:100%;background:#f0a500;color:#0a0a0f;border:none;border-radius:8px;padding:14px;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:opacity 0.2s}
    button:hover{opacity:0.9}
    .error{background:rgba(224,92,92,0.1);border:1px solid rgba(224,92,92,0.3);border-radius:8px;padding:12px 14px;color:#e05c5c;font-size:13px;margin-bottom:20px;display:${showError ? "block" : "none"}}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Weavers Villa</div>
    <div class="tagline">Stock Intelligence</div>
    <div class="error">Incorrect username or password</div>
    <form method="POST" action="/">
      <label>Username</label>
      <input type="text" name="u" autocomplete="username" autofocus required/>
      <label>Password</label>
      <input type="password" name="p" autocomplete="current-password" required/>
      <button type="submit">Sign In →</button>
    </form>
  </div>
</body>
</html>`;

module.exports = async (req, res) => {
  // ── Handle login form submission ────────────────────────────────────────
  if (req.method === "POST") {
    let body = req.body;

    // Fallback manual parse if Vercel didn't auto-parse the body
    if (!body || typeof body !== "object") {
      const raw = await new Promise((resolve) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => resolve(data));
      });
      body = Object.fromEntries(new URLSearchParams(raw));
    }

    const u = (body.u || "").trim();
    const p = (body.p || "").trim();

    if (u === USERNAME && p === PASSWORD) {
      res.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=${SESSION_TOKEN}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`
      );
      res.statusCode = 302;
      res.setHeader("Location", "/");
      return res.end();
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(LOGIN_HTML(true));
  }

  // ── GET — check auth cookie ──────────────────────────────────────────────
  const cookies = parseCookies(req.headers.cookie);

  if (cookies[COOKIE_NAME] === SESSION_TOKEN) {
    // Authenticated — serve the dashboard HTML
    try {
      const html = fs.readFileSync(
        path.join(process.cwd(), "public", "index.html"),
        "utf-8"
      );
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(html);
    } catch (e) {
      res.statusCode = 500;
      return res.end("Dashboard file not found. Contact admin.");
    }
  }

  // Not authenticated — show login
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.end(LOGIN_HTML(false));
};
