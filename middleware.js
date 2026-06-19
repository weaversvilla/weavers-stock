import { next } from "@vercel/edge";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const USERNAME      = "weavers";
const PASSWORD      = "villa2026";  // ← Change this before pushing
const COOKIE_NAME   = "wv_auth";
const SESSION_TOKEN = "wv_stock_authenticated_2026";
const MAX_AGE       = 3650 * 24 * 60 * 60; // 10 years in seconds
// ─────────────────────────────────────────────────────────────────────────────

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
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
    .error{background:rgba(224,92,92,0.1);border:1px solid rgba(224,92,92,0.3);border-radius:8px;padding:12px 14px;color:#e05c5c;font-size:13px;margin-bottom:20px;display:none}
    .error.show{display:block}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Weavers Villa</div>
    <div class="tagline">Stock Intelligence</div>
    <div class="error" id="err">Incorrect username or password</div>
    <form method="POST" action="/__wvauth__/login">
      <label>Username</label>
      <input type="text" name="u" autocomplete="username" autofocus required/>
      <label>Password</label>
      <input type="password" name="p" autocomplete="current-password" required/>
      <button type="submit">Sign In →</button>
    </form>
  </div>
  <script>
    if(new URLSearchParams(location.search).get('e'))
      document.getElementById('err').classList.add('show');
  </script>
</body>
</html>`;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};

export default async function middleware(request) {
  const url  = new URL(request.url);
  const path = url.pathname;

  // Handle login POST
  if (path === "/__wvauth__/login" && request.method === "POST") {
    const body   = await request.text();
    const params = new URLSearchParams(body);
    const u      = params.get("u")?.trim() || "";
    const p      = params.get("p")?.trim() || "";

    if (u === USERNAME && p === PASSWORD) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: new URL("/", request.url).toString(),
          "Set-Cookie": `${COOKIE_NAME}=${SESSION_TOKEN}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`,
        },
      });
    }

    const loginUrl = new URL("/", request.url);
    loginUrl.searchParams.set("e", "1");
    return new Response(null, {
      status: 302,
      headers: { Location: loginUrl.toString() },
    });
  }

  // Check auth cookie
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").filter(Boolean).map(c => {
      const idx = c.indexOf("=");
      return [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
    })
  );

  if (cookies[COOKIE_NAME] === SESSION_TOKEN) {
    return next(); // Authenticated — continue to the requested page
  }

  // Show login page
  return new Response(LOGIN_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
