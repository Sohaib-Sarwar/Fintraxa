# Fintraxa

**Personal Finance & Investment Management Platform**

A full-featured PWA for tracking income/expenses, mutual fund portfolios, and PSX stock holdings — built with React 19, Material UI v7, and Supabase.

---

## Features

| Module | Capabilities |
|---|---|
| **Home** | Aggregated dashboard across all asset classes with total portfolio value, allocation breakdown |
| **Personal Finance** | Income/expense tracking, category management with icons, monthly analytics, balance trends |
| **Mutual Funds** | Buy/sell fund units, live NAV from MUFAP, portfolio dashboard, gain/loss analytics, growth charts |
| **PSX Stocks** | Trade PSX equities, live prices via Fintraxa API, broker fee calculation, favorites, portfolio analytics |

### Additional

- **PWA** — installable on mobile (Android/iOS) via Chrome "Add to Home Screen" with native-like experience
- **Safe areas** — optimized for camera cutouts (notch) and gesture navigation bars
- **Dark / Light mode** — system-aware with manual toggle
- **Offline support** — service worker with stale-while-revalidate for fund data, network-first for stock prices
- **Mobile-first** — glassmorphic bottom navigation, swipeable sub-pages, responsive stat cards

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19, Vite 7 |
| UI | Material UI v7, Framer Motion, Recharts |
| Backend | Supabase (Auth + Postgres + RLS) |
| State | TanStack Query v5, Zustand v5 |
| PWA | vite-plugin-pwa, Workbox |
| Deploy | Docker (nginx), Railway |

---

## Project Structure

```
src/
├── App.jsx                  # Root with routing, global dialogs
├── main.jsx                 # Entry point, QueryClient config
├── theme.js                 # MUI light/dark theme builder
├── index.css                # Global styles, safe areas
├── components/
│   ├── layout/
│   │   └── AppLayout.jsx    # Desktop navbar + sidebar, mobile bottom nav
│   ├── FintraxaLogo.jsx     # SVG logo component
│   ├── InstallPrompt.jsx    # PWA install banner
│   ├── ProfilePanel.jsx     # User profile, theme, categories
│   ├── SubNav.jsx           # Section sub-navigation pills
│   └── SwipeablePages.jsx   # Mobile swipe between sub-pages
├── features/
│   ├── auth/AuthPage.jsx    # Login / Sign-up
│   ├── home/
│   │   ├── Dashboard.jsx    # Aggregated portfolio overview
│   │   └── useAggregatedAssets.js
│   ├── income-expense/
│   │   ├── Dashboard.jsx    # IE stats, pie chart, trends
│   │   ├── AddTransaction.jsx
│   │   └── Transactions.jsx # History with filters, edit, delete
│   ├── mutual-funds/
│   │   ├── MFSection.jsx    # Swipeable wrapper
│   │   ├── Dashboard.jsx    # MF portfolio, holdings, growth chart
│   │   ├── AddFund.jsx      # Search MUFAP, buy/sell
│   │   └── Analytics.jsx    # Allocation, gain/loss, monthly trend
│   └── psx-stocks/
│       ├── PSXSection.jsx   # Swipeable wrapper
│       ├── Dashboard.jsx    # Stock portfolio, pie, growth chart
│       ├── SharesPage.jsx   # Browse PSX, trade, favorites
│       ├── StockTransactions.jsx
│       └── Analytics.jsx    # Gain/loss, allocation, monthly trend
├── lib/
│   ├── supabase.js          # Supabase client singleton
│   ├── api.js               # Fintraxa API helpers (PSX, MUFAP)
│   ├── formatters.js        # Currency, percent, broker fee
│   ├── categoryIcons.jsx    # Icon picker data
│   └── syncFundsStocks.js   # Fund/stock reference sync
└── store/
    ├── appStore.js           # Theme, currency, snackbar, confirm
    └── authStore.js          # User session, auth listeners
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project

### Setup

```bash
# Clone
git clone https://github.com/transfinancial/fintraxa.git
cd fintraxa

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials:
#   VITE_SUPABASE_URL=https://your-project.supabase.co
#   VITE_SUPABASE_ANON_KEY=your-anon-key

# Run database migrations (in Supabase SQL Editor, execute in order):
#   1. supabase/migrations/20250301000000_portfolio_tracker_schema.sql
#   2. supabase/migrations/20250301100000_funds_stocks_reference.sql

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Build

```bash
npm run build    # Output in dist/
npm run preview  # Preview production build locally
```

---

## Docker

```bash
# Build image
docker build \
  --build-arg VITE_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=your-anon-key \
  -t fintraxa .

# Run container
docker run -p 8080:8080 fintraxa
```

---

## Deploy to Railway

1. Push code to GitHub:
   ```bash
   git remote add origin https://github.com/transfinancial/fintraxa.git
   git push -u origin main
   ```

2. Go to [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub Repo**

3. Select the `transfinancial/fintraxa` repository

4. Railway auto-detects the `Dockerfile` and `railway.json`

5. Add **environment variables** in Railway dashboard → **Variables**:
   | Variable | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |

6. Click **Deploy** — Railway builds the Docker image and serves via nginx

7. Add a custom domain or use the Railway-provided `*.up.railway.app` URL

> **Note:** `VITE_` variables are baked into the frontend at build time. If you change them, trigger a redeploy.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `PORT` | No | Server port (default: `8080`, auto-set by Railway) |

---

## License

Private — All rights reserved.
