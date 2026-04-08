import axios from 'axios';

// In production (Vercel) VITE_API_URL points to the Render backend.
// Locally the Vite proxy handles /api → localhost:3001.
const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({ baseURL });

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('inventra_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If we get 401 back, clear local auth state
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('inventra_token');
      localStorage.removeItem('inventra_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Auth ──────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: { email: string; name: string; role: string } }>('/auth/login', { email, password }),
  me: () => api.get<{ email: string; name: string; role: string }>('/auth/me'),
};

// ── Inventory ─────────────────────────────────────────────────────
export interface InventoryItem {
  _id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  reorderLevel: number;
  price: number;
  status: 'healthy' | 'medium' | 'low';
  updatedAt: string;
}

export const inventoryApi = {
  getAll: () => api.get<InventoryItem[]>('/inventory'),
  create: (data: Omit<InventoryItem, '_id' | 'status' | 'updatedAt'>) => api.post<InventoryItem>('/inventory', data),
  update: (id: string, data: Partial<InventoryItem>) => api.patch<InventoryItem>(`/inventory/${id}`, data),
  remove: (id: string) => api.delete(`/inventory/${id}`),
};

// ── Orders ────────────────────────────────────────────────────────
export interface OrderItem { name: string; qty: number; price: number }
export interface Order {
  _id: string;
  orderId: string;
  customer: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  progress: number;
  date: string;
}

export const ordersApi = {
  getAll: () => api.get<Order[]>('/orders'),
  create: (data: Omit<Order, '_id'>) => api.post<Order>('/orders', data),
  update: (id: string, data: Partial<Order>) => api.patch<Order>(`/orders/${id}`, data),
  remove: (id: string) => api.delete(`/orders/${id}`),
};

// ── Notifications ─────────────────────────────────────────────────
export interface Notification {
  _id: string;
  type: 'warning' | 'info' | 'success' | 'error';
  message: string;
  read: boolean;
  createdAt: string;
}

export const notificationsApi = {
  getAll: () => api.get<Notification[]>('/notifications'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

// ── Analytics ─────────────────────────────────────────────────────
export interface AnalyticsSummary {
  totalInventory: number;
  activeOrders: number;
  lowStockAlerts: number;
  revenueMTD: number;
}

export interface TrendPoint { month: string; electronics: number; accessories: number; furniture: number }
export interface VolumePoint { month: string; orders: number; revenue: number }
export interface CategoryBreakdown { name: string; value: number; color: string }

export interface Activity {
  _id: string;
  action: string;
  detail: string;
  icon: 'order' | 'stock' | 'alert' | 'user';
  createdAt: string;
}

export const analyticsApi = {
  summary: () => api.get<AnalyticsSummary>('/analytics/summary'),
  inventoryTrends: () => api.get<TrendPoint[]>('/analytics/inventory-trends'),
  orderVolume: () => api.get<VolumePoint[]>('/analytics/order-volume'),
  activities: () => api.get<Activity[]>('/analytics/activities'),
  categoryBreakdown: () => api.get<CategoryBreakdown[]>('/analytics/category-breakdown'),
};

// ── AI Intelligence ───────────────────────────────────────────────────────────

export interface AnomalyResult {
  productId: string; productName: string;
  distributorId: string; distributorName: string;
  anomalyScore: number; severity: 'critical' | 'high' | 'medium' | 'low';
  isAnomaly: boolean; unexplainedLoss: number; avgDailySales: number;
  explanation: string; reasons: string[]; confidenceScore: number;
}
export interface AnomalyResponse {
  status: string; algorithm: string; totalAnalyzed: number;
  anomaliesFound: number; source?: string; results: AnomalyResult[];
}

export interface StockoutResult {
  productId: string; productName: string;
  distributorId: string; distributorName: string;
  currentStock: number; avgDailySales: number; daysToStockout: number;
  urgency: 'critical' | 'high' | 'medium' | 'low'; color: string;
  trend: 'increasing' | 'decreasing' | 'stable'; trendSlope: number;
  confidenceScore: number; explanation: string; recommendation: string;
}
export interface StockoutResponse {
  status: string; algorithm: string; totalProducts: number;
  criticalCount: number; highCount: number; source?: string;
  results: StockoutResult[];
}

export interface DemandSurgeResult {
  productId: string; productName: string; region: string;
  surgeScore: number; growthRate: number;
  intensity: 'explosive' | 'strong' | 'moderate' | 'mild';
  isSurge: boolean; recentAvgDemand: number; baselineAvgDemand: number;
  trendSlope: number; zScore: number; confidenceScore: number;
  explanation: string; recommendation: string;
}
export interface DemandSurgeResponse {
  status: string; algorithm: string; windowDays: number;
  totalAnalyzed: number; surgesDetected: number; source?: string;
  results: DemandSurgeResult[];
}

export interface RebalanceSuggestion {
  id: string; productId: string; productName: string;
  fromDistributorId: string; fromDistributorName: string;
  toDistributorId: string; toDistributorName: string;
  transferQuantity: number; fromCurrentStock: number; fromStockAfter: number;
  toCurrentStock: number; toStockAfter: number;
  costSaving: number; urgency: 'critical' | 'high' | 'medium';
  fromDaysCover: number; toDaysCover: number;
  explanation: string; status: 'pending' | 'approved' | 'completed';
}
export interface RebalanceResponse {
  status: string; algorithm: string; suggestionsCount: number;
  estimatedTotalSavings: number; source?: string;
  suggestions: RebalanceSuggestion[];
}

export interface AIStatus {
  aiService: { online: boolean; url: string };
  cacheEntries: number;
}

export const aiApi = {
  anomalies:            () => api.get<AnomalyResponse>('/ai/anomalies'),
  stockoutPredictions:  () => api.get<StockoutResponse>('/ai/stockout-predictions'),
  demandSurges:         () => api.get<DemandSurgeResponse>('/ai/demand-surges'),
  rebalanceSuggestions: () => api.get<RebalanceResponse>('/ai/rebalance-suggestions'),
  status:               () => api.get<AIStatus>('/ai/status'),
  clearCache:           () => api.delete('/ai/cache'),
};

// ── Photo Inventory Count (GPT-4o Vision) ─────────────────────────────────────

export interface PhotoCountResult {
  product: {
    id: string; name: string; sku: string; category: string; status: string;
  };
  location: { distributorId: string; distributorName: string };
  systemCount: number;
  aiAnalysis: {
    counted: number | null;
    sectionCounts: string;
    confidence: number | null;
    countingMethod: string;
    shelfCondition: 'organized' | 'messy' | 'partial_view' | 'empty' | 'unknown';
    productVisible: boolean;
    notes: string;
  };
  discrepancy: {
    units: number | null;
    percentage: number | null;
    severity: 'ok' | 'medium' | 'high' | 'critical' | 'unknown';
    alertMessage: string;
    recommendation: string;
  };
  meta: {
    daysSinceLastUpdate: number;
    lastUpdated: string;
    model: string;
    tokensUsed: number | null;
    analyzedAt: string;
  };
}

export const photoCountApi = {
  analyze: (formData: FormData) =>
    api.post<PhotoCountResult>('/photo-count', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// ── Voice Assistant ───────────────────────────────────────────────────────────

export interface VoiceTranscribeResult { transcript: string }
export interface VoiceExecuteResult {
  transcript: string;
  toolCalled:  string | null;
  toolArgs:    Record<string, unknown> | null;
  toolResult:  unknown;
  reply:       string;
}

export const voiceApi = {
  transcribe: (formData: FormData) =>
    api.post<VoiceTranscribeResult>('/voice/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  execute: (transcript: string) =>
    api.post<VoiceExecuteResult>('/voice/execute', { transcript }),
};

// ── Order Extraction ──────────────────────────────────────────────────────────

export interface ExtractedOrderItem {
  rawName:      string;
  matchedName:  string | null;
  matchedSku:   string | null;
  matchedPrice: number | null;
  quantity:     number;
  subtotal:     number | null;
}
export interface ExtractedOrder {
  customer:        string;
  requestedDate:   string | null;
  isUrgent:        boolean;
  notes:           string;
  items:           ExtractedOrderItem[];
  estimatedTotal:  number;
  confidence:      number | null;
  extractionNotes: string;
  meta: { model: string; tokensUsed: number | null; extractedAt: string };
}

export const orderExtractApi = {
  extract: (text: string) => api.post<ExtractedOrder>('/orders/extract', { text }),
};

// ── Demand Signal Detector ────────────────────────────────────────────────────

export interface DemandSignal {
  id:                  string;
  type:                'weather' | 'event' | 'news' | 'holiday' | 'season';
  title:               string;
  description:         string;
  icon:                string;
  startDate:           string;
  endDate:             string | null;
  daysUntil:           number;
  region:              string;
  affectedCategories:  string[];
  impactDirection:     'up' | 'down' | 'neutral';
  impactPercent:       number;
  confidence:          number;
  urgency:             'critical' | 'high' | 'medium' | 'low';
  actionRequired:      string;
  recommendation:      string;
}

export interface CalendarDay {
  date:        string;
  daysFromNow: number;
  signals:     { id: string; icon: string; urgency: string; title: string }[];
}

export interface WeatherSnapshot {
  city:       string;
  tempC:      number;
  feelsLikeC: number;
  humidity:   number;
  desc:       string;
  maxTempC:   number;
  minTempC:   number;
}

export interface DemandSignalResponse {
  signals:         DemandSignal[];
  calendar:        CalendarDay[];
  summary:         string;
  hotCategories:   string[];
  riskCategories:  string[];
  weatherSnapshot: WeatherSnapshot[];
  generatedAt:     string;
  source:          'live' | 'cache';
  meta:            { model: string; tokensUsed: number | null };
}

export const demandSignalsApi = {
  get:        () => api.get<DemandSignalResponse>('/demand-signals'),
  clearCache: () => api.delete('/demand-signals/cache'),
};
