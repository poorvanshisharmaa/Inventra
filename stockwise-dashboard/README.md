# Inventra — Intelligent Inventory Management System

> A full-stack MERN inventory platform with role-based access, real-time analytics, and AI-powered intelligence for modern supply chains.

**Live Demo:** [inventra-dashboard.vercel.app](https://inventra-dashboard.vercel.app)

| Role | Email | Password |
|------|-------|----------|
| Admin / Management | `admin@inventra.com` | `admin123` |
| Distributor | `distributor@inventra.com` | `dist123` |

---

## Screenshots

| Dashboard | Inventory | AI Intelligence |
|-----------|-----------|-----------------|
| ![Dashboard](https://placehold.co/400x250/1a1a2e/7c3aed?text=Dashboard) | ![Inventory](https://placehold.co/400x250/1a1a2e/7c3aed?text=Inventory) | ![AI](https://placehold.co/400x250/1a1a2e/7c3aed?text=AI+Intelligence) |

---

## Features

### Core
- **Role-Based Access Control** — Admin sees revenue, analytics, AI insights; Distributors see inventory and orders only
- **Dashboard** — Live KPI cards (inventory count, active orders, low-stock alerts, MTD revenue), trend charts, recent orders, activity feed
- **Inventory Management** — Search, filter, sort, inline quantity editing with auto stock-status recalculation
- **Order Management** — Expandable order cards with progress tracking, status filtering
- **Notifications** — Real-time alerts for low stock, order updates, warehouse sync errors; mark-read support
- **Analytics** — Revenue over time, order volume, stock levels by category (Line, Bar, Pie, Area charts)
- **Dark / Light Mode** — Persistent theme toggle

### AI Intelligence (Admin only)
- **Anomaly Detection** — Flags unusual inventory discrepancies and unexplained stock losses
- **Stockout Predictions** — Forecasts days-to-stockout per product with urgency scoring
- **Demand Surge Detection** — Identifies products with abnormal demand spikes
- **Inventory Rebalancing** — Suggests stock transfers between distributors to optimize coverage
- **Photo Inventory Count** — Upload a shelf photo; AI counts visible units and flags discrepancies (Llama 4 Vision via Groq)
- **Voice Assistant** — Speak commands like "show low stock" or "create order for 50 keyboards"
- **AI Order Extraction** — Paste a WhatsApp/email order in plain text; AI parses it into a structured order
- **Demand Signal Detector** — Live weather, events, and seasonal signals mapped to affected product categories

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| State / Data | TanStack React Query, React Router v6 |
| Animations | Framer Motion |
| Charts | Recharts |
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| Auth | JWT (JSON Web Tokens), bcrypt |
| AI / Vision | Groq SDK (Llama 4 Scout Vision) |
| Deployment | Vercel (frontend) · Render (backend) · MongoDB Atlas (database) |

---

## Project Structure

```
Inventra/
├── stockwise-dashboard/        # React + Vite frontend
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/              # Route-level page components
│   │   ├── contexts/           # AuthContext (JWT session)
│   │   ├── services/api.ts     # Axios API client (typed)
│   │   └── hooks/              # Custom React hooks
│   └── vercel.json
│
└── server/                     # Express + MongoDB backend
    ├── src/
    │   ├── models/             # Mongoose schemas (User, InventoryItem, Order, …)
    │   ├── routes/             # REST API route handlers
    │   ├── middleware/auth.js  # JWT protect + adminOnly guards
    │   ├── seed/seed.js        # Database seeder
    │   └── index.js            # App entry point
    └── render.yaml
```

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/auth/me` | JWT | Get current user |
| GET | `/api/inventory` | JWT | List all inventory items |
| POST | `/api/inventory` | Admin | Add new product |
| PATCH | `/api/inventory/:id` | Admin | Update quantity / fields |
| GET | `/api/orders` | JWT | List all orders |
| PATCH | `/api/orders/:id` | Admin | Update order status |
| POST | `/api/orders/extract` | Admin | AI-parse plain-text order |
| GET | `/api/notifications` | JWT | Get notifications |
| PATCH | `/api/notifications/read-all` | JWT | Mark all as read |
| GET | `/api/analytics/summary` | Admin | KPI summary |
| GET | `/api/analytics/inventory-trends` | Admin | 6-month trend data |
| GET | `/api/ai/anomalies` | Admin | Anomaly detection results |
| GET | `/api/ai/stockout-predictions` | Admin | Stockout forecast |
| GET | `/api/ai/demand-surges` | Admin | Demand spike detection |
| GET | `/api/ai/rebalance-suggestions` | Admin | Rebalancing suggestions |
| POST | `/api/photo-count` | Admin | Vision-based shelf count |
| POST | `/api/voice/execute` | Admin | Execute voice command |
| GET | `/api/demand-signals` | Admin | Live demand signals |

---

## Running Locally

### Prerequisites
- Node.js 18+
- MongoDB running locally (`brew services start mongodb-community`)

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/inventra-server.git
git clone https://github.com/YOUR_USERNAME/stockwise-dashboard.git
```

### 2. Backend
```bash
cd server
cp .env.example .env        # fill in MONGODB_URI, JWT_SECRET
npm install
npm run seed                # seeds demo data
npm run dev                 # starts on port 3001
```

### 3. Frontend
```bash
cd stockwise-dashboard
npm install
npm run dev                 # starts on http://localhost:8080
```

### Environment Variables

**Backend (`server/.env`)**
```
PORT=3001
MONGODB_URI=mongodb://localhost:27017/inventra
JWT_SECRET=your_secret_here
NODE_ENV=development
GROQ_API_KEY=gsk_...        # optional — needed for photo count & voice
```

**Frontend (`stockwise-dashboard/.env.local`)**
```
# Leave blank for local dev (Vite proxy handles it)
# VITE_API_URL=https://your-render-backend.onrender.com
```

---

## Deployment (Free Tier)

| Service | Platform | Notes |
|---------|----------|-------|
| Database | MongoDB Atlas M0 | 512 MB free |
| Backend | Render | Free web service, spins up on first request |
| Frontend | Vercel | Free hobby plan |

See [`render.yaml`](./server/render.yaml) for backend config. Set `VITE_API_URL` on Vercel to your Render backend URL.

---

## Demo Credentials

These credentials are seeded automatically and are safe to share publicly:

| Role | Email | Password | Access |
|------|-------|----------|--------|
| **Admin** | `admin@inventra.com` | `admin123` | Full access — dashboard, analytics, AI, all CRUD |
| **Distributor** | `distributor@inventra.com` | `dist123` | Inventory view, orders, notifications |

---

## License

MIT — feel free to fork, extend, and use as a starter for your own projects.
