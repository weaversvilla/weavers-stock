# Weavers Villa — Stock Intelligence
## Complete Setup Guide

---

## STEP 1 — Get Your Document Series IDs from Baselinker

Before deploying, you need 3 series IDs from BL.

1. Log into Baselinker → **Inventory** → **Documents**
2. Click on **Series** (top right or settings icon)
3. Find these 3 series and note their numeric IDs:
   - **GI** (Goods Issued) → your sales documents
   - **IGR** (Internal Goods Received) → return receipts
   - **IGI** (Internal Goods Issued) → QC bad write-offs
4. Update `.env.example` with those IDs

---

## STEP 2 — Create GitHub Repository

1. Go to **github.com** → Sign In → **New Repository**
2. Name it: `weavers-stock`
3. Keep it **Private**
4. Click **Create repository**
5. Upload all files from this folder to the repo (drag & drop in GitHub UI)

---

## STEP 3 — Deploy to Vercel

1. Go to **vercel.com** → Sign up with your GitHub account
2. Click **Add New Project**
3. Import your `weavers-stock` GitHub repo
4. Before clicking Deploy, go to **Environment Variables** and add:

   | Key | Value |
   |-----|-------|
   | `BASELINKER_API_TOKEN` | your actual BL token |
   | `BL_INVENTORY_ID` | `1257` |
   | `BL_WAREHOUSE_ID` | `9001890` |

   That's it — no series IDs needed. Documents are filtered by type automatically.

5. Click **Deploy**
6. Your URL will be something like `weavers-stock.vercel.app`

---

## STEP 4 — Open the Dashboard

1. Open `public/index.html` in Chrome
2. First time: enter your Vercel URL (e.g. `https://weavers-stock.vercel.app`)
3. Click **Save & Launch Dashboard**
4. Click **Refresh** — data loads live from Baselinker

---

## STEP 5 — Set Up Daily Email (Python Script)

### Install Python
Download from python.org if not installed. Check: open CMD → type `python --version`

### Install dependencies
Open Command Prompt:
```
pip install requests
```

### Configure the script
Open `python/daily_report.py` and update:
```python
VERCEL_URL     = "https://weavers-stock.vercel.app"  # your actual URL
GMAIL_APP_PASS = "xxxx xxxx xxxx xxxx"               # see below
```

### Get Gmail App Password
1. Go to myaccount.google.com → Security
2. Enable **2-Step Verification** (required)
3. Search for **App Passwords**
4. Create one: App = Mail, Device = Windows PC
5. Copy the 16-character password → paste into script

### Test the script
```
python python/daily_report.py
```
You should receive an email within 30 seconds.

### Schedule via Windows Task Scheduler
1. Open **Task Scheduler** (search in Start menu)
2. Click **Create Basic Task**
3. Name: `Weavers Stock Report`
4. Trigger: **Daily** at **8:00 AM**
5. Action: **Start a program**
6. Program: `python`
7. Arguments: `C:\path\to\weavers-stock\python\daily_report.py`
8. Click Finish

---

## STEP 6 — Verify Platform Source IDs

The dashboard shows platform breakdowns (Amazon/Flipkart/Myntra).
These are mapped by BL order source IDs in `api/_velocity.js`:

```js
const PLATFORM_MAP = {
  amazon:   [1, 8],   // ← update with your actual BL source IDs
  flipkart: [2, 9],
  myntra:   [3, 10],
};
```

To find your source IDs:
1. In Baselinker → Orders → filter by one platform
2. Open any order → check the `order_source_id` field in the API response
3. Update the PLATFORM_MAP accordingly

---

## Seasonal Multiplier (Use Before Winter 2026)

In the dashboard: use the **Seasonal Multiplier** slider (0.5× to 5×)
- Normal season: 1.0×
- Pre-winter stocking: set to 2.5–3.5× in September
- This multiplies all suggested order quantities

In the Python email script: update `SEASONAL_MULT = 2.5` in `daily_report.py`

---

## Files Reference

```
weavers-stock/
├── vercel.json              — Vercel routing config
├── package.json             — Node dependencies
├── .env.example             — Environment variables template
├── api/
│   ├── _baselinker.js       — BL API helper (shared)
│   ├── _velocity.js         — Velocity calculation engine
│   ├── report.js            — Main report endpoint
│   └── snapshot.js          — Seasonality snapshot endpoint
├── public/
│   └── index.html           — React dashboard (runs in browser)
└── python/
    └── daily_report.py      — Daily email script
        velocity_history.csv — Auto-created, grows daily (seasonality data)
```

---

## Velocity Formula Reference

```
Daily Velocity = (7d_avg × 0.40) + (15d_avg × 0.30) + (30d_avg × 0.20) + (90d_avg × 0.10)

Net Sales = Goods Issued qty − IGR qty (customer returns only, identified by return tag)

Days Remaining = Current Stock ÷ Daily Velocity

Suggested Order = max(0, ceil((90 − Days Remaining) × Daily Velocity)) × Seasonal Multiplier
```

---

## Support

Any issues: check Vercel Function Logs (Vercel Dashboard → your project → Functions tab)
