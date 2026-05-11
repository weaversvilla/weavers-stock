import { NextResponse } from "next/server";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const USERNAME      = "weavers.villa@gmail.com";
const PASSWORD      = "rad786rtt";
const COOKIE_NAME   = "wv_auth";
const SESSION_TOKEN = "wv_stock_authenticated_2026";
const REMEMBER_DAYS = 3650;  // 10 years — effectively permanent
const SESSION_DAYS  = 3650;  // Same — no expiry
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
    body{
      background:#0a0a0f;
      color:#f0f0f8;
      font-family:'Segoe UI',system-ui,sans-serif;
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:24px;
    }
    .card{
      background:#111118;
      border:1px solid #1e1e2e;
      border-radius:16px;
      padding:40px 36px;
      width:100%;
      max-width:400px;
      box-shadow:0 24px 64px rgba(0,0,0,0.5);
    }
    .logo{
      font-size:24px;
      font-weight:800;
      color:#f0f0f8;
      letter-spacing:-0.5px;
    }
    .tagline{
      font-size:11px;
      letter-spacing:3px;
      text-transform:uppercase;
      color:#f0a500;
      margin-top:4px;
      margin-bottom:36px;
    }
    label{
      display:block;
      font-size:11px;
      letter-spacing:1.5px;
      text-transform:uppercase;
      color:#5a5a7a;
      margin-bottom:8px;
    }
    input[type=text],input[type=password]{
      width:100%;
      background:#0a0a0f;
      border:1px solid #2a2a3a;
      border-radius:8px;
      padding:12px 14px;
      color:#f0f0f8;
      font-size:15px;
      outline:none;
      transition:border-color 0.2s;
      margin-bottom:20px;
    }
    input[type=text]:focus,input[type=password]:focus{
      border-color:#f0a500;
    }
    .remember{display:none}
    button{
      width:100%;
      background:#f0a500;
      color:#0a0a0f;
      border:none;
      border-radius:8px;
      padding:14px;
      font-size:14px;
      font-weight:700;
      letter-spacing:1px;
      text-transform:uppercase;
      cursor:pointer;
      transition:opacity 0.2s,transform 0.1s;
    }
    button:hover{opacity:0.9}
    button:active{transform:scale(0.98)}
    .error{
      background:rgba(224,92,92,0.1);
      border:1px solid rgba(224,92,92,0.3);
      border-radius:8px;
      padding:12px 14px;
      color:#e05c5c;
      font-size:13px;
      margin-bottom:20px;
      display:none;
    }
    .error.show{display:block}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Weavers Villa</div>
    <div class="tagline">Stock Intelligence</div>
    <div class="error" id="err">Incorrect username or password</div>
    <form method="POST" action="/__auth__/login">
      <label>Username</label>
      <input type="text" name="username" autocomplete="username" autofocus required/>
      <label>Password</label>
      <input type="password" name="password" autocomplete="current-password" required/>
      <label class="remember">
        <input type="checkbox" name="remember" value="1"/>
        <span>Remember me for 30 days</span>
      </label>
      <button type="submit">Sign In →</button>
    </form>
  </div>
  <script>
    const p = new URLSearchParams(window.location.search);
    if(p.get('error')) document.getElementById('err').classList.add('show');
  </script>
</body>
</html>`;

export const config = {
  matcher: ["/((?!__auth__|_next/static|_next/image|favicon.ico).*)"],
};

export default function middleware(req) {
  const url  = req.nextUrl.clone();
  const path = url.pathname;

  // ── Handle login form POST ────────────────────────────────────────────────
  if (path === "/__auth__/login" && req.method === "POST") {
    return handleLogin(req);
  }

  // ── Handle logout ─────────────────────────────────────────────────────────
  if (path === "/__auth__/logout") {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  // ── Check auth cookie ─────────────────────────────────────────────────────
  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie?.value === SESSION_TOKEN) {
    return NextResponse.next();
  }

  // ── Not authenticated — show login page ───────────────────────────────────
  return new NextResponse(LOGIN_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

async function handleLogin(req) {
  const body     = await req.text();
  const params   = new URLSearchParams(body);
  const username = params.get("username")?.trim() || "";
  const password = params.get("password")?.trim() || "";
  const remember = params.get("remember") === "1";

  if (username === USERNAME && password === PASSWORD) {
    const days = remember ? REMEMBER_DAYS : SESSION_DAYS;
    const res  = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set(COOKIE_NAME, SESSION_TOKEN, {
      httpOnly: true,
      secure:   true,
      sameSite: "lax",
      maxAge:   days * 24 * 60 * 60,
      path:     "/",
    });
    return res;
  }

  // Wrong credentials
  const loginUrl = new URL("/", req.url);
  loginUrl.searchParams.set("error", "1");
  return NextResponse.redirect(loginUrl);
}
