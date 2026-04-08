import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/services/api';

export default function Analytics() {
  const { data: inventoryTrendData = [] } = useQuery({
    queryKey: ['analytics', 'inventory-trends'],
    queryFn: () => analyticsApi.inventoryTrends().then(r => r.data),
  });

  const { data: orderVolumeData = [] } = useQuery({
    queryKey: ['analytics', 'order-volume'],
    queryFn: () => analyticsApi.orderVolume().then(r => r.data),
  });

  const { data: pieData = [] } = useQuery({
    queryKey: ['analytics', 'category-breakdown'],
    queryFn: () => analyticsApi.categoryBreakdown().then(r => r.data),
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">Insights into your business performance</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl bg-card border border-border/50 p-5 card-shadow">
          <h3 className="text-sm font-semibold mb-4">Revenue Over Time</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={orderVolumeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(99, 55%, 45%)" strokeWidth={2.5} dot={{ r: 4, fill: 'hsl(99, 55%, 45%)' }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl bg-card border border-border/50 p-5 card-shadow">
          <h3 className="text-sm font-semibold mb-4">Inventory by Category</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value">
                {pieData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2 flex-wrap">
            {pieData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-muted-foreground">{d.name} ({d.value}%)</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="lg:col-span-2 rounded-xl bg-card border border-border/50 p-5 card-shadow">
          <h3 className="text-sm font-semibold mb-4">Stock Levels by Category</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={inventoryTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
              <Bar dataKey="electronics" fill="hsl(99, 55%, 45%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="accessories" fill="hsl(210, 55%, 53%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="furniture" fill="hsl(337, 80%, 41%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="lg:col-span-2 rounded-xl bg-card border border-border/50 p-5 card-shadow">
          <h3 className="text-sm font-semibold mb-4">Order Volume Trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={orderVolumeData}>
              <defs>
                <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(210, 55%, 53%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(210, 55%, 53%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
              <Area type="monotone" dataKey="orders" stroke="hsl(210, 55%, 53%)" fill="url(#ordersGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    </div>
  );
}
