#!/usr/bin/env python3
"""
Weavers Villa — Daily Stock Intelligence Email
Runs via Windows Task Scheduler every morning at 8am IST
Sends HTML report to weavers.villa@gmail.com
Appends velocity snapshot to local CSV for seasonality tracking
"""

import json
import csv
import os
import smtplib
import urllib.request
import urllib.error
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

# ─── CONFIG ──────────────────────────────────────────────────────────────────
VERCEL_URL     = "https://your-app.vercel.app"   # ← update after Vercel deploy
GMAIL_FROM     = "weavers.villa@gmail.com"
GMAIL_TO       = "weavers.villa@gmail.com"
GMAIL_APP_PASS = "xxxx xxxx xxxx xxxx"           # ← Gmail App Password (not your login password)
SNAPSHOT_CSV   = Path(__file__).parent / "velocity_history.csv"
SEASONAL_MULT  = 1.0   # Change to 2.5 in September before winter season
# ─────────────────────────────────────────────────────────────────────────────

STATUS_EMOJI = {
    "OUT_OF_STOCK": "🔴",
    "CRITICAL":     "🟠",
    "LOW":          "🟡",
    "WATCH":        "🔵",
    "HEALTHY":      "🟢",
}

STATUS_COLOR = {
    "OUT_OF_STOCK": "#e05c5c",
    "CRITICAL":     "#f07830",
    "LOW":          "#f0a500",
    "WATCH":        "#a0a0ff",
    "HEALTHY":      "#5ce0a0",
}

def fetch_report():
    url = f"{VERCEL_URL}/api/report"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())

def apply_seasonal(products, mult):
    if mult == 1.0:
        return products
    for p in products:
        p["adjustedOrder"] = round(p.get("suggestedOrder", 0) * mult)
    return products

def append_snapshot(products):
    file_exists = SNAPSHOT_CSV.exists()
    today = datetime.now().strftime("%Y-%m-%d")

    with open(SNAPSHOT_CSV, "a", newline="", encoding="utf-8") as f:
        fieldnames = ["date","sku","name","currentStock","dailyVelocity",
                      "netSales7d","netSales15d","netSales30d","netSales90d",
                      "status","daysRemaining","suggestedOrder"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        for p in products:
            writer.writerow({
                "date":          today,
                "sku":           p.get("sku",""),
                "name":          p.get("name",""),
                "currentStock":  p.get("currentStock", 0),
                "dailyVelocity": p.get("dailyVelocity", 0),
                "netSales7d":    p.get("netSales",{}).get("d7",0),
                "netSales15d":   p.get("netSales",{}).get("d15",0),
                "netSales30d":   p.get("netSales",{}).get("d30",0),
                "netSales90d":   p.get("netSales",{}).get("d90",0),
                "status":        p.get("status",""),
                "daysRemaining": p.get("daysRemaining",""),
                "suggestedOrder":p.get("suggestedOrder", 0),
            })
    print(f"✅ Snapshot appended to {SNAPSHOT_CSV} ({len(products)} rows)")

def build_html_email(data, mult):
    summary = data["summary"]
    products = data["products"]
    now = datetime.now().strftime("%d %b %Y, %I:%M %p IST")

    # Sections to highlight
    urgent = [p for p in products if p["status"] in ("OUT_OF_STOCK","CRITICAL") and not p.get("isDeadStock")]
    low    = [p for p in products if p["status"] in ("LOW","WATCH") and not p.get("isDeadStock")]
    dead   = [p for p in products if p.get("isDeadStock")]

    def pct(n, total):
        return f"{round(100*n/total)}%" if total else "0%"

    def order_cell(p, mult):
        qty = round(p.get("suggestedOrder", 0) * mult)
        if qty == 0:
            return '<td style="color:#666;">—</td>'
        color = "#e05c5c" if p["status"] in ("OUT_OF_STOCK","CRITICAL") else "#f0a500"
        return f'<td style="font-weight:700;color:{color};">{qty}</td>'

    def platform_cell(p):
        parts = []
        ps = p.get("platformSales", {})
        if ps.get("amazon",0)>0:   parts.append(f'<span style="color:#ff9900;">AM:{ps["amazon"]}</span>')
        if ps.get("flipkart",0)>0: parts.append(f'<span style="color:#2f74ff;">FL:{ps["flipkart"]}</span>')
        if ps.get("myntra",0)>0:   parts.append(f'<span style="color:#ff3f6c;">MY:{ps["myntra"]}</span>')
        if ps.get("ajio",0)>0:     parts.append(f'<span style="color:#00c896;">AJ:{ps["ajio"]}</span>')
        if ps.get("others",0)>0:   parts.append(f'<span style="color:#a0a0a0;">OT:{ps["others"]}</span>')
        return " ".join(parts) if parts else "—"

    def product_rows(plist, limit=50):
        rows = ""
        for p in plist[:limit]:
            status = p["status"]
            color = STATUS_COLOR.get(status, "#999")
            emoji = STATUS_EMOJI.get(status, "⚪")
            days = f'{p["daysRemaining"]}d' if p.get("daysRemaining") is not None else "∞"
            rows += f"""
            <tr style="border-bottom:1px solid #1e1e2e;">
              <td style="color:{color};font-weight:700;">{emoji} {status.replace("_"," ")}</td>
              <td style="font-family:monospace;font-size:12px;color:#888;">{p.get("sku","")}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">{p.get("name","")[:35]}</td>
              <td style="text-align:right;font-family:monospace;">{p.get("currentStock",0)}</td>
              <td style="text-align:right;color:{color};font-family:monospace;">{days}</td>
              <td style="text-align:right;font-family:monospace;">{p.get("dailyVelocity",0)}</td>
              <td style="text-align:right;font-family:monospace;">{p.get("netSales",{}).get("d7",0)}</td>
              <td style="text-align:right;font-family:monospace;">{p.get("netSales",{}).get("d30",0)}</td>
              <td style="font-size:11px;">{platform_cell(p)}</td>
              {order_cell(p, mult)}
            </tr>"""
        return rows

    seasonal_note = f'<p style="color:#f0a500;margin:8px 0 0;">⚡ Seasonal multiplier active: {mult}× applied to order quantities.</p>' if mult != 1.0 else ""

    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="background:#0a0a0f;color:#f0f0f8;font-family:'Segoe UI',sans-serif;margin:0;padding:0;">
<div style="max-width:900px;margin:0 auto;padding:32px 24px;">

  <!-- Header -->
  <div style="margin-bottom:32px;">
    <div style="font-size:24px;font-weight:800;letter-spacing:-0.5px;">Weavers Villa</div>
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#f0a500;margin-top:4px;">Daily Stock Intelligence — {now}</div>
    {seasonal_note}
  </div>

  <!-- Summary pills -->
  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:32px;">
    <div style="background:#1a0a0a;border:1px solid #3a1515;border-radius:10px;padding:16px 20px;min-width:110px;">
      <div style="font-size:32px;font-weight:800;color:#e05c5c;">{summary["outOfStock"]}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-top:4px;">Out of Stock</div>
    </div>
    <div style="background:#1a1000;border:1px solid #3a2a00;border-radius:10px;padding:16px 20px;min-width:110px;">
      <div style="font-size:32px;font-weight:800;color:#f07830;">{summary["critical"]}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-top:4px;">Critical &lt;7d</div>
    </div>
    <div style="background:#1a1500;border:1px solid #3a3000;border-radius:10px;padding:16px 20px;min-width:110px;">
      <div style="font-size:32px;font-weight:800;color:#f0a500;">{summary["low"]}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-top:4px;">Low &lt;15d</div>
    </div>
    <div style="background:#0a1000;border:1px solid #1a3a1a;border-radius:10px;padding:16px 20px;min-width:110px;">
      <div style="font-size:32px;font-weight:800;color:#5ce0a0;">{summary["healthy"]}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-top:4px;">Healthy</div>
    </div>
    <div style="background:#111118;border:1px solid #2a2a3a;border-radius:10px;padding:16px 20px;min-width:110px;">
      <div style="font-size:32px;font-weight:800;color:#5a5a7a;">{summary["deadStock"]}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-top:4px;">Dead Stock</div>
    </div>
  </div>

  <!-- Urgent table -->
  {'<div style="margin-bottom:32px;"><div style="font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#e05c5c;margin-bottom:12px;">🔴 Urgent — Order Immediately</div>' + _table(product_rows(urgent)) + '</div>' if urgent else ''}

  <!-- Low / Watch table -->
  {'<div style="margin-bottom:32px;"><div style="font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#f0a500;margin-bottom:12px;">🟡 Low & Watch — Plan Orders</div>' + _table(product_rows(low)) + '</div>' if low else ''}

  <!-- Dead stock -->
  {'<div style="margin-bottom:32px;"><div style="font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5a5a7a;margin-bottom:12px;">💀 Dead Stock — Zero Sales 30d</div>' + _dead_table(dead) + '</div>' if dead else ''}

  <div style="font-size:12px;color:#333;margin-top:32px;border-top:1px solid #1a1a2a;padding-top:16px;">
    Generated by Weavers Villa Stock Intelligence · Inventory ID 1257 · {summary["total"]} SKUs tracked
  </div>
</div>
</body>
</html>"""
    return html

def _table(rows):
    return f"""
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#111118;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#1a1a26;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#5a5a7a;">
          <th style="padding:10px 14px;text-align:left;">Status</th>
          <th style="padding:10px 14px;text-align:left;">SKU</th>
          <th style="padding:10px 14px;text-align:left;">Product</th>
          <th style="padding:10px 14px;text-align:right;">Stock</th>
          <th style="padding:10px 14px;text-align:right;">Days</th>
          <th style="padding:10px 14px;text-align:right;">Vel/d</th>
          <th style="padding:10px 14px;text-align:right;">7d</th>
          <th style="padding:10px 14px;text-align:right;">30d</th>
          <th style="padding:10px 14px;text-align:left;">Platforms</th>
          <th style="padding:10px 14px;text-align:right;">Order</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
    </div>"""

def _dead_table(dead):
    rows = ""
    for p in dead[:30]:
        rows += f"""
        <tr style="border-bottom:1px solid #1e1e2e;opacity:0.6;">
          <td style="padding:10px 14px;font-family:monospace;font-size:12px;color:#5a5a7a;">{p.get("sku","")}</td>
          <td style="padding:10px 14px;">{p.get("name","")[:40]}</td>
          <td style="padding:10px 14px;text-align:right;font-family:monospace;">{p.get("currentStock",0)}</td>
          <td style="padding:10px 14px;text-align:right;font-family:monospace;color:#5a5a7a;">0 sales</td>
        </tr>"""
    return f"""
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#111118;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#1a1a26;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#5a5a7a;">
          <th style="padding:10px 14px;text-align:left;">SKU</th>
          <th style="padding:10px 14px;text-align:left;">Product</th>
          <th style="padding:10px 14px;text-align:right;">Stock</th>
          <th style="padding:10px 14px;text-align:right;">30d Sales</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
    </div>"""

def send_email(subject, html_body):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = GMAIL_FROM
    msg["To"]      = GMAIL_TO
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(GMAIL_FROM, GMAIL_APP_PASS)
        server.sendmail(GMAIL_FROM, GMAIL_TO, msg.as_string())
    print(f"✅ Email sent to {GMAIL_TO}")

def main():
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting daily stock report...")

    print("Fetching report from Vercel...")
    data = fetch_report()
    products = data["products"]
    summary  = data["summary"]

    print(f"Got {len(products)} products. OOS:{summary['outOfStock']} Critical:{summary['critical']} Low:{summary['low']}")

    # Append snapshot for seasonality tracking
    append_snapshot(products)

    # Apply seasonal multiplier
    products = apply_seasonal(products, SEASONAL_MULT)

    # Build and send email
    urgent_count = summary["outOfStock"] + summary["critical"]
    subject = f"🔴 {urgent_count} Urgent | 🟡 {summary['low']} Low | Weavers Stock Report {datetime.now().strftime('%d %b')}"
    if urgent_count == 0:
        subject = f"✅ Stock OK | 🟡 {summary['low']} Low | Weavers Stock Report {datetime.now().strftime('%d %b')}"

    html = build_html_email(data, SEASONAL_MULT)
    send_email(subject, html)
    print("Done.")

if __name__ == "__main__":
    main()
