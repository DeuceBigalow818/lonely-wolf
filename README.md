# 🐺 Lonely Wolf

**Be a cabal on your own** — MOTO Pack Intelligence on OPNet Bitcoin L1.

> ⚡ Real-time whale tracking • Pack pattern detection • AI oracle analysis • New projects & farms scanner • Block-by-block mainnet crawler

---

## Features

- 🐾 **117 wallets** — top MOTO holders + confirmed OrangePill burners
- 🧠 **Pack Pattern Engine** — detects mass buys, farm migrations, burn waves, coordinated moves
- 🌱 **New Projects & Farms** — auto-detects new contract deployments, staking pools on OPNet
- ⛏ **Block-by-Block Scanner** — sequential mainnet block crawler for deep chain analysis
- 🕸 **Trail Graph** — SVG interaction network of wolf-to-wolf on-chain connections
- 🔮 **AI Oracle** — Claude-powered deep analysis per wallet and per detected pattern
- 🐺 **OP Wallet Paywall** — $30 one-time lifetime access via BTC or MOTO payment

## Access & Payment

- **$30 one-time payment** — pay once, access forever with your wallet
- **Two payment methods**: BTC (30,000 sats) or MOTO (500 MOTO)
- Access stored permanently in browser localStorage per wallet
- Owner wallet whitelisted for free access

---

## Deploy Guide

### Step 1 — Push to GitHub

```bash
# Create a new repo on github.com, then:
git init
git add .
git commit -m "🐺 Lonely Wolf v1.1"
git branch -M main
git remote add origin https://github.com/DeuceBigalow818/lonely-wolf.git
git push -u origin main
```

### Step 2 — Deploy to Vercel (pick ONE method)

#### Option A — Vercel Dashboard (easiest)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import** → select your `lonely-wolf` repo
3. Framework will auto-detect as **Vite**
4. Click **Deploy**
5. Done! Your site is live at `lonely-wolf-xxx.vercel.app`

#### Option B — Vercel CLI (from terminal)

```bash
npm install -g vercel
vercel login
vercel --prod
```

That's it. One command deploys.

#### Option C — Auto-deploy via GitHub Actions

This repo includes `.github/workflows/deploy.yml` — auto-deploys on every push to `main`.

**Setup (one time):**

1. Go to [vercel.com/account/tokens](https://vercel.com/account/tokens) → create a token
2. Run locally once: `vercel link` → copy `orgId` and `projectId` from `.vercel/project.json`
3. In GitHub repo → **Settings → Secrets → Actions** → add:

| Secret | Value |
|--------|-------|
| `VERCEL_TOKEN` | Your Vercel token |
| `VERCEL_ORG_ID` | From `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | From `.vercel/project.json` |

Now every `git push` to `main` auto-deploys. ✅

---

## Local Development

```bash
# Install
npm install

# Run dev server
npm run dev
# → http://localhost:3000

# Build for production
npm run build
npm run preview
```

---

## File Structure

```
lonely-wolf/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions auto-deploy
├── public/
│   └── wolf.svg                # Favicon
├── src/
│   ├── App.jsx                 # Main app (all logic + UI)
│   └── main.jsx                # React entry point
├── .gitignore
├── index.html                  # HTML shell
├── package.json
├── vercel.json                 # Vercel config + headers
├── vite.config.js              # Vite config
└── README.md
```

---

## Configuration

At the top of `src/App.jsx`:

```js
// Payment fees — adjust as prices change
const ACCESS_FEE_BTC_SATS = 30000n;       // ~$30 at BTC $100k
const ACCESS_FEE_MOTO = 50000000000n;     // 500 MOTO (8 decimals)
const ACCESS_FEE_MOTO_DISPLAY = "500";
const ACCESS_FEE_DISPLAY = "$30";

// Whitelist — wallets with free access
const _wl = ["bc1pgcqnysetzcufk3ytpwxq24zr59frluqyfyg270kkv8njwkzqgekqh7mg0g"];

// Scanning
const SCAN_INTERVAL = 18000;              // Auto-scan every 18s
const BLOCK_SCAN_BATCH = 5;               // Blocks per batch
```

---

## License

MIT — build on top of this freely.

---

*Built on OPNet Bitcoin L1 • Powered by the MOTO community • 🐺 Be a cabal on your own*
