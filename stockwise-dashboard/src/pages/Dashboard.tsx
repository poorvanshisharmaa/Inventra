import { Package, ShoppingCart, AlertTriangle, DollarSign, Clock, CheckCircle2, Loader2, XCircle, ClipboardList } from 'lucide-react';
import { KPICard } from '@/components/KPICard';
import { motion } from 'framer-motion';
import { StatusBadge } from '@/components/StatusBadge';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { ShoppingBag, PackageCheck, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi, ordersApi, inventoryApi, restockApi, Activity } from '@/services/api';
import { QueryError } from '@/components/ErrorBoundary';
import { cn } from '@/lib/utils';

const activityIcons = { order: ShoppingBag, stock: PackageCheck, alert: AlertTriangle, user: User };

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  return `${Math.floor(hrs / 24)} day(s) ago`;
}

const ORDER_STATUS_CONFIG = [
  { status: 'pending',    label: 'Pending',    icon: Clock,         color: 'text-warning',     bg: 'bg-warning/10' },
  { status: 'processing', label: 'Processing', icon: Loader2,       color: 'text-info',        bg: 'bg-info/10' },
  { status: 'completed',  label: 'Delivered',  icon: CheckCircle2,  color: 'text-success',     bg: 'bg-success/10' },
  { status: 'cancelled',  label: 'Cancelled',  icon: XCircle,       color: 'text-destructive', bg: 'bg-destructive/10' },
] as const;

// ── Admin Dashboard ────────────────────────────────────────────────
function AdminDashboard() {
  const { data: summary, isError: summaryError, refetch: refetchSummary } = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => analyticsApi.summary().then(r => r.data),
    staleTime: 2 * 60_000,
  });

  const { data: inventoryTrendData = [] } = useQuery({
    queryKey: ['analytics', 'inventory-trends'],
    queryFn: () => analyticsApi.inventoryTrends().then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const { data: orderVolumeData = [] } = useQuery({
    queryKey: ['analytics', 'order-volume'],
    queryFn: () => analyticsApi.orderVolume().then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['analytics', 'activities'],
    queryFn: () => analyticsApi.activities().then(r => r.data),
    staleTime: 60_000,
  });

  const { data: orders = [], isError: ordersError, refetch: refetchOrders } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.getAll().then(r => r.data),
    staleTime: 30_000,
  });

  if (summaryError) return <QueryError message="Could not load analytics" onRetry={refetchSummary} />;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Inventory"  value={summary?.totalInventory ?? 0}  icon={Package}      gradient="purple"  change="+12.5% from last month" changeType="positive" delay={0} />
        <KPICard title="Active Orders"    value={summary?.activeOrders ?? 0}    icon={ShoppingCart} gradient="info"    change="pending + processing"   changeType="positive" delay={1} />
        <KPICard title="Low Stock Alerts" value={summary?.lowStockAlerts ?? 0}  icon={AlertTriangle} gradient="warning" change="items below reorder level" changeType={summary?.lowStockAlerts ? 'negative' : 'neutral'} delay={2} />
        <KPICard title="Revenue (MTD)"    value={summary?.revenueMTD ?? 0}      prefix="$" icon={DollarSign} gradient="success" change="+8.2% vs last month" changeType="positive" delay={3} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="rounded-xl bg-card border border-border/50 p-5 card-shadow">
          <h3 className="text-sm font-semibold mb-4">Inventory Trends</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={inventoryTrendData}>
              <defs>
                <linearGradient id="colorElectronics" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(99, 55%, 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(99, 55%, 45%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAccessories" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(210, 55%, 53%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(210, 55%, 53%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
              <Area type="monotone" dataKey="electronics" stroke="hsl(99, 55%, 45%)" fill="url(#colorElectronics)" strokeWidth={2} />
              <Area type="monotone" dataKey="accessories" stroke="hsl(210, 55%, 53%)" fill="url(#colorAccessories)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="rounded-xl bg-card border border-border/50 p-5 card-shadow">
          <h3 className="text-sm font-semibold mb-4">Order Volume</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={orderVolumeData}>
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(99, 55%, 45%)" />
                  <stop offset="100%" stopColor="hsl(210, 55%, 53%)" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
              <Bar dataKey="orders" fill="url(#barGradient)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Recent Orders + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="lg:col-span-2 rounded-xl bg-card border border-border/50 p-5 card-shadow">
          <h3 className="text-sm font-semibold mb-4">Recent Orders</h3>
          {ordersError ? (
            <QueryError message="Could not load orders" onRetry={refetchOrders} />
          ) : (
            <div className="space-y-3">
              {orders.slice(0, 5).map(order => (
                <div key={order._id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <ShoppingBag className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{order.orderId}</p>
                      <p className="text-xs text-muted-foreground truncate">{order.customer}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm font-medium">${order.total.toLocaleString()}</span>
                    <StatusBadge status={order.status} />
                  </div>
                </div>
              ))}
              {orders.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No orders yet</p>}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
          className="rounded-xl bg-card border border-border/50 p-5 card-shadow">
          <h3 className="text-sm font-semibold mb-4">Activity Feed</h3>
          <div className="space-y-4">
            {activities.slice(0, 5).map((activity: Activity) => {
              const IconComp = activityIcons[activity.icon];
              return (
                <div key={activity._id} className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <IconComp className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{activity.action}</p>
                    <p className="text-xs text-muted-foreground truncate">{activity.detail}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">{timeAgo(activity.createdAt)}</p>
                  </div>
                </div>
              );
            })}
            {activities.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No recent activity</p>}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ── Distributor Dashboard ──────────────────────────────────────────
function DistributorDashboard() {
  const { data: orders = [], isError: ordersError, isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.getAll().then(r => r.data),
    staleTime: 30_000,
  });

  const { data: inventoryItems = [], isLoading: invLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => inventoryApi.getAll().then(r => r.data),
    staleTime: 60_000,
  });

  const { data: restockRequests = [] } = useQuery({
    queryKey: ['restock-requests'],
    queryFn: () => restockApi.getAll().then(r => r.data),
    staleTime: 30_000,
  });

  const totalInventory = inventoryItems.reduce((s, i) => s + i.quantity, 0);
  const lowStock = inventoryItems.filter(i => i.status === 'low');
  const byStatus = ORDER_STATUS_CONFIG.map(cfg => ({
    ...cfg,
    count: orders.filter(o => o.status === cfg.status).length,
  }));
  const pendingRequests = restockRequests.filter(r => r.status === 'pending').length;
  const fulfilledRequests = restockRequests.filter(r => r.status === 'fulfilled').length;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard
          title="Total Inventory"
          value={invLoading ? 0 : totalInventory}
          icon={Package}
          gradient="purple"
          change={`${inventoryItems.length} product lines`}
          changeType="positive"
          delay={0}
        />
        <KPICard
          title="Active Orders"
          value={ordersLoading ? 0 : orders.filter(o => ['pending', 'processing'].includes(o.status)).length}
          icon={ShoppingCart}
          gradient="info"
          change="pending + processing"
          changeType="positive"
          delay={1}
        />
        <KPICard
          title="Low Stock Alerts"
          value={invLoading ? 0 : lowStock.length}
          icon={AlertTriangle}
          gradient="warning"
          change={lowStock.length > 0 ? 'Raise restock requests' : 'All levels healthy'}
          changeType={lowStock.length > 0 ? 'negative' : 'neutral'}
          delay={2}
        />
      </div>

      {/* Order Status Breakdown */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="rounded-xl bg-card border border-border/50 p-5 card-shadow">
        <h3 className="text-sm font-semibold mb-4">Order Summary</h3>
        {ordersError ? (
          <QueryError message="Could not load orders" onRetry={refetchOrders} />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {byStatus.map(({ status, label, icon: Icon, color, bg, count }) => (
                <div key={status} className={cn('rounded-xl p-4 flex flex-col gap-2', bg)}>
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', color, status === 'processing' && 'animate-spin')} />
                    <span className={cn('text-xs font-medium', color)}>{label}</span>
                  </div>
                  <p className="text-2xl font-bold">{count}</p>
                </div>
              ))}
            </div>

            {/* Recent orders list */}
            <h4 className="text-xs font-medium text-muted-foreground mb-3">Recent orders</h4>
            <div className="space-y-2">
              {orders.slice(0, 6).map(order => (
                <div key={order._id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <ShoppingBag className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{order.orderId}</p>
                      <p className="text-xs text-muted-foreground">{order.customer} · {order.date}</p>
                    </div>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
              ))}
              {orders.length === 0 && !ordersLoading && (
                <p className="text-sm text-muted-foreground text-center py-4">No orders yet</p>
              )}
            </div>
          </>
        )}
      </motion.div>

      {/* Bottom row: Low Stock + Restock Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Low stock items */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="rounded-xl bg-card border border-border/50 p-5 card-shadow">
          <h3 className="text-sm font-semibold mb-4">Low Stock Items</h3>
          {lowStock.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
              <CheckCircle2 className="h-8 w-8 text-success opacity-60" />
              <p className="text-sm">All stock levels are healthy</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lowStock.map(item => (
                <div key={item._id} className="flex items-center justify-between p-3 rounded-lg bg-destructive/5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-destructive">{item.quantity} left</p>
                    <p className="text-xs text-muted-foreground">reorder at {item.reorderLevel}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Restock request summary */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="rounded-xl bg-card border border-border/50 p-5 card-shadow">
          <h3 className="text-sm font-semibold mb-4">My Restock Requests</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-warning/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <ClipboardList className="h-4 w-4 text-warning" />
                <span className="text-xs font-medium text-warning">Pending</span>
              </div>
              <p className="text-2xl font-bold">{pendingRequests}</p>
            </div>
            <div className="rounded-xl bg-success/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-xs font-medium text-success">Fulfilled</span>
              </div>
              <p className="text-2xl font-bold">{fulfilledRequests}</p>
            </div>
          </div>
          <div className="space-y-2">
            {restockRequests.slice(0, 4).map(req => (
              <div key={req._id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-sm">
                <span className="truncate font-medium">{req.productName}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">×{req.requestedQty}</span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize',
                    req.status === 'pending'   ? 'bg-warning/10 text-warning' :
                    req.status === 'fulfilled' ? 'bg-success/10 text-success' :
                    req.status === 'approved'  ? 'bg-info/10 text-info' :
                                                  'bg-destructive/10 text-destructive'
                  )}>{req.status}</span>
                </div>
              </div>
            ))}
            {restockRequests.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No requests yet — use Inventory page to raise one</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { isAdmin } = useAuth();
  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isAdmin ? 'Full overview of your inventory and orders' : 'Your distribution overview'}
        </p>
      </div>
      {isAdmin ? <AdminDashboard /> : <DistributorDashboard />}
    </div>
  );
}
