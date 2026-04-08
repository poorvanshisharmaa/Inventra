import { Package, ShoppingCart, AlertTriangle, DollarSign } from 'lucide-react';
import { KPICard } from '@/components/KPICard';
import { motion } from 'framer-motion';
import { StatusBadge } from '@/components/StatusBadge';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { ShoppingBag, PackageCheck, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi, ordersApi, inventoryApi, Activity } from '@/services/api';

const activityIcons = {
  order: ShoppingBag,
  stock: PackageCheck,
  alert: AlertTriangle,
  user: User,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  return `${Math.floor(hrs / 24)} day(s) ago`;
}

export default function Dashboard() {
  const { isAdmin } = useAuth();

  const { data: summary } = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => analyticsApi.summary().then(r => r.data),
    enabled: isAdmin,
  });

  const { data: inventoryTrendData = [] } = useQuery({
    queryKey: ['analytics', 'inventory-trends'],
    queryFn: () => analyticsApi.inventoryTrends().then(r => r.data),
    enabled: isAdmin,
  });

  const { data: orderVolumeData = [] } = useQuery({
    queryKey: ['analytics', 'order-volume'],
    queryFn: () => analyticsApi.orderVolume().then(r => r.data),
    enabled: isAdmin,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['analytics', 'activities'],
    queryFn: () => analyticsApi.activities().then(r => r.data),
    enabled: isAdmin,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.getAll().then(r => r.data),
  });

  // Distributors fetch inventory to compute their own KPIs
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => inventoryApi.getAll().then(r => r.data),
    enabled: !isAdmin,
  });

  const activeOrders = orders.filter(o => ['pending', 'processing'].includes(o.status)).length;
  const distTotalInventory = inventoryItems.reduce((sum, i) => sum + i.quantity, 0);
  const distLowStock = inventoryItems.filter(i => i.status === 'low').length;

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isAdmin ? 'Full overview of your inventory and orders' : 'Your distribution overview'}
        </p>
      </div>

      {/* KPI Cards */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
        <KPICard
          title="Total Inventory"
          value={isAdmin ? (summary?.totalInventory ?? 0) : distTotalInventory}
          icon={Package}
          gradient="purple"
          change={isAdmin ? '+12.5% from last month' : `${inventoryItems.length} product lines`}
          changeType="positive"
          delay={0}
        />
        <KPICard
          title="Active Orders"
          value={isAdmin ? (summary?.activeOrders ?? activeOrders) : activeOrders}
          icon={ShoppingCart}
          gradient="info"
          change="pending + processing"
          changeType="positive"
          delay={1}
        />
        <KPICard
          title="Low Stock Alerts"
          value={isAdmin ? (summary?.lowStockAlerts ?? 0) : distLowStock}
          icon={AlertTriangle}
          gradient="warning"
          change="items below reorder level"
          changeType={distLowStock > 0 || (summary?.lowStockAlerts ?? 0) > 0 ? 'negative' : 'neutral'}
          delay={2}
        />
        {isAdmin && (
          <KPICard
            title="Revenue (MTD)"
            value={summary?.revenueMTD ?? 0}
            prefix="$"
            icon={DollarSign}
            gradient="success"
            change="+8.2% vs last month"
            changeType="positive"
            delay={3}
          />
        )}
      </div>

      {/* Charts - admin only */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-xl bg-card border border-border/50 p-5 card-shadow"
          >
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

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-xl bg-card border border-border/50 p-5 card-shadow"
          >
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
      )}

      {/* Recent Orders + Activity */}
      <div className={`grid grid-cols-1 ${isAdmin ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-4`}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className={`${isAdmin ? 'lg:col-span-2' : ''} rounded-xl bg-card border border-border/50 p-5 card-shadow`}
        >
          <h3 className="text-sm font-semibold mb-4">Recent Orders</h3>
          <div className="space-y-3">
            {orders.slice(0, 5).map((order) => (
              <div key={order._id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0">
                    <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{order.orderId}</p>
                    <p className="text-xs text-muted-foreground truncate">{order.customer}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {isAdmin && <span className="text-sm font-medium">${order.total.toLocaleString()}</span>}
                  <StatusBadge status={order.status} />
                </div>
              </div>
            ))}
            {orders.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No orders yet</p>
            )}
          </div>
        </motion.div>

        {/* Activity Feed - admin only */}
        {isAdmin && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="rounded-xl bg-card border border-border/50 p-5 card-shadow"
          >
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
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
