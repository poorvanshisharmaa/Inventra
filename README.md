# Inventra

**AI-powered inventory and warehouse management for distributed retail operations.**

Inventra gives admins and distributors a unified platform to manage stock across multiple regions, process orders intelligently, detect anomalies, and forecast demand — powered by Groq LLMs and a FastAPI ML microservice.

---

## Features

### For Admins
- **Dashboard** — KPI cards, stock heatmap, order pipeline, activity feed
- **Inventory Management** — Full CRUD, category/status filters, reorder warnings
- **Order Management** — Create, update, and track orders through their lifecycle
- **Analytics** — 6-month inventory trends, order volume, category breakdown, top/bottom performers
- **AI Intelligence** — Four ML modules running in parallel (see AI section below)
- **Photo Stock Count** — Upload a shelf photo; Llama 4 Scout Vision counts units and flags discrepancies
- **Restock Requests** — Approve, reject, or fulfill distributor restock requests (auto-updates inventory on fulfillment)

### For Distributors
- **AI Order Extractor** — Paste any email or WhatsApp message; Llama 3.3 extracts a structured order draft (customer, SKUs, quantities, urgency) ready to confirm in one click
- **Voice Assistant** — Record a question; Whisper transcribes it, Llama executes the right tool and replies in natural language
- **Demand Signals** — Live weather for 4 cities, 60-day event/holiday calendar, AI-powered demand correlation with action items
- **Restock Requests** — Raise requests that admins action from their dashboard

### Shared
- **Notifications** — Real-time alerts for stock warnings, order updates, and system events
- **Role-based access** — JWT auth with `admin` and `distributor` roles enforced on every endpoint

---

## AI Capabilities

| Module | Model | What it does |
|---|---|---|
| **Order Extractor** | Llama 3.3-70B (JSON mode) | Parses natural-language messages into structured orders matched to real SKUs |
| **Photo Inventory Count** | Llama 4 Scout 17B (vision) | Counts items from a shelf photo and reports discrepancies against system records |
| **Voice Assistant** | Whisper Large v3 Turbo + Llama 3.3-70B (function calling) | Speech-to-text → intent parsing → tool execution → natural language reply |
| **Anomaly Detection** | Z-score statistical analysis | Flags inventory loss exceeding expected sales velocity — catches shrinkage and theft |
| **Stockout Prediction** | Exponentially-weighted sales velocity | Forecasts days-to-stockout per product per distributor |
| **Demand Surge Detection** | Moving average + OLS slope | Identifies demand spikes ahead of time |
| **Rebalancing Suggestions** | Greedy surplus-deficit matching | Recommends inter-distributor stock transfers to optimise network coverage |
| **Demand Signal Correlation** | Llama 3.3-70B + live weather (wttr.in) | Links upcoming holidays, events, and weather conditions to specific product demand |

**Graceful fallback** — if the Python AI service times out, the Node.js backend runs equivalent JS implementations automatically. ML results are cached (10-minute TTL for predictions, 4-hour for demand signals).

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Framer Motion, TanStack Query, Recharts, React Router v6 |
| **Backend** | Node.js, Express.js, MongoDB + Mongoose, JWT, Multer |
| **AI Service** | Python, FastAPI, Uvicorn, Pydantic |
| **LLM Provider** | [Groq](https://console.groq.com) (Llama 3.3-70B, Llama 4 Scout, Whisper Large v3 Turbo) |

---

## Project Structure

```
Inventra/
├── server/                  # Express API
│   └── src/
│       ├── config/          # MongoDB connection
│       ├── middleware/       # JWT auth guards
│       ├── models/          # Mongoose schemas
│       ├── routes/          # 11 route modules
│       └── seed/            # Demo data scripts
│
├── stockwise-dashboard/     # React + Vite frontend
│   └── src/
│       ├── components/      # UI components (shadcn/ui + custom)
│       ├── pages/           # Page-level components
│       ├── services/        # Axios API client
│       └── contexts/        # Auth state
│
└── ai-service/              # FastAPI ML microservice
    └── main.py              # Anomaly, stockout, surge, rebalance endpoints
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB (local or Atlas)
- A free [Groq API key](https://console.groq.com/keys)

---

### 1. Backend

```bash
cd server
npm install
```

Create `server/.env`:

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/inventra
JWT_SECRET=change_this_in_production
NODE_ENV=development
AI_SERVICE_URL=http://localhost:5001
GROQ_API_KEY=gsk_...
ALLOWED_ORIGINS=http://localhost:5173
```

Seed the database with demo data:

```bash
npm run seed        # Products, orders, demo users
npm run seed:ai     # Synthetic sales/inventory logs for AI modules (optional)
```

Start the server:

```bash
npm run dev         # Development (nodemon)
npm start           # Production
```

Runs on `http://localhost:3001`.

---

### 2. AI Service

```bash
cd ai-service
pip install -r requirements.txt
python main.py
```

Runs on `http://localhost:5001`. If the service is unavailable, the backend falls back to JS implementations automatically.

---

### 3. Frontend

```bash
cd stockwise-dashboard
npm install
npm run dev
```

Runs on `http://localhost:5173`. The Vite dev server proxies `/api/*` to the backend.

---

### Demo Credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@inventra.com` | `admin123` |
| Distributor | `distributor@inventra.com` | `dist123` |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login → JWT token |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/inventory` | List inventory items |
| `POST` | `/api/inventory` | Create item (admin) |
| `PATCH` | `/api/inventory/:id` | Update item (admin) |
| `DELETE` | `/api/inventory/:id` | Delete item (admin) |
| `GET` | `/api/orders` | List orders |
| `POST` | `/api/orders` | Create order |
| `PATCH` | `/api/orders/:id` | Update status (admin) |
| `POST` | `/api/orders/extract` | AI order extraction from raw text |
| `GET` | `/api/analytics/summary` | Dashboard KPIs |
| `GET` | `/api/analytics/inventory-trends` | 6-month category trends |
| `GET` | `/api/ai/anomalies` | Inventory anomaly detection |
| `GET` | `/api/ai/stockout-predictions` | Days-to-stockout forecasts |
| `GET` | `/api/ai/demand-surges` | Demand spike detection |
| `GET` | `/api/ai/rebalance-suggestions` | Cross-distributor transfer recommendations |
| `POST` | `/api/photo-count` | Photo-based stock count (image upload) |
| `POST` | `/api/voice/transcribe` | Audio → transcript (Whisper) |
| `POST` | `/api/voice/execute` | Transcript → tool execution → reply |
| `GET` | `/api/demand-signals` | Live weather + events + AI correlation |
| `GET` | `/api/restock-requests` | List restock requests |
| `POST` | `/api/restock-requests` | Raise a restock request |
| `PATCH` | `/api/restock-requests/:id` | Approve / fulfill (admin) |
| `GET` | `/api/notifications` | List notifications |
| `PATCH` | `/api/notifications/:id/read` | Mark as read |

---

## Role Permissions

| Feature | Admin | Distributor |
|---|---|---|
| Inventory — view | ✓ | ✓ |
| Inventory — create / edit / delete | ✓ | — |
| Orders — view all | ✓ | — |
| Orders — create | ✓ | ✓ |
| Orders — update status | ✓ | — |
| Analytics | ✓ | — |
| AI Intelligence (4 modules) | ✓ | — |
| Photo Stock Count | ✓ | — |
| AI Order Extractor | — | ✓ |
| Voice Assistant | ✓ | ✓ |
| Demand Signals | ✓ | ✓ |
| Restock Requests — raise | — | ✓ |
| Restock Requests — approve / fulfill | ✓ | — |
| Notifications | ✓ | ✓ |

---

## License

MIT
