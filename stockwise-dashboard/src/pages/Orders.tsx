import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ShoppingCart, CheckCircle2, Clock, Loader2, XCircle, ChevronRight } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi, Order } from '@/services/api';
import { OrderExtractor } from '@/components/orders/OrderExtractor';
import { useToast } from '@/components/ui/use-toast';

// ── Status pipeline ────────────────────────────────────────────────
const PIPELINE: Order['status'][] = ['pending', 'processing', 'completed'];

const STATUS_META: Record<Order['status'], { label: string; icon: React.ElementType; color: string; bg: string }> = {
  pending:    { label: 'Pending',    icon: Clock,        color: 'text-warning',     bg: 'bg-warning/10' },
  processing: { label: 'Processing', icon: Loader2,      color: 'text-info',        bg: 'bg-info/10' },
  completed:  { label: 'Completed',  icon: CheckCircle2, color: 'text-success',     bg: 'bg-success/10' },
  cancelled:  { label: 'Cancelled',  icon: XCircle,      color: 'text-destructive', bg: 'bg-destructive/10' },
};

// What actions are available from each status
const NEXT_ACTIONS: Record<Order['status'], { label: string; next: Order['status']; variant: 'default' | 'destructive' | 'outline' }[]> = {
  pending:    [
    { label: 'Start Processing', next: 'processing', variant: 'default' },
    { label: 'Cancel Order',     next: 'cancelled',  variant: 'destructive' },
  ],
  processing: [
    { label: 'Mark as Completed', next: 'completed', variant: 'default' },
    { label: 'Cancel Order',      next: 'cancelled',  variant: 'destructive' },
  ],
  completed:  [],
  cancelled:  [],
};

function StatusStepper({ status }: { status: Order['status'] }) {
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive font-medium">
        <XCircle className="h-3.5 w-3.5" />
        Order Cancelled
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {PIPELINE.map((step, i) => {
        const meta = STATUS_META[step];
        const Icon = meta.icon;
        const currentIdx = PIPELINE.indexOf(status);
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;

        return (
          <div key={step} className="flex items-center gap-1">
            <div className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all',
              isActive  ? `${meta.bg} ${meta.color}` :
              isDone    ? 'bg-success/10 text-success' :
                          'bg-muted/50 text-muted-foreground/50'
            )}>
              <Icon className={cn('h-3 w-3', isActive && step === 'processing' && 'animate-spin')} />
              <span className="hidden sm:inline">{meta.label}</span>
            </div>
            {i < PIPELINE.length - 1 && (
              <ChevronRight className={cn('h-3 w-3 flex-shrink-0', isDone ? 'text-success' : 'text-muted-foreground/30')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Orders() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.getAll().then(r => r.data),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Order['status'] }) =>
      ordersApi.update(id, { status }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['analytics', 'activities'] });
      toast({ title: `Order marked as ${res.data.status}` });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast({
        title: 'Could not update order',
        description: err?.response?.data?.message ?? 'Something went wrong',
        variant: 'destructive',
      });
    },
  });

  const statuses = ['all', 'pending', 'processing', 'completed', 'cancelled'] as const;
  const filtered = statusFilter === 'all'
    ? orders
    : orders.filter(o => o.status === (statusFilter as Order['status']));

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="text-muted-foreground text-sm mt-1">{orders.length} total orders</p>
      </div>

      {/* AI Order Extractor */}
      {isAdmin && (
        <OrderExtractor
          onOrderCreated={() => queryClient.invalidateQueries({ queryKey: ['orders'] })}
        />
      )}

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize',
              statusFilter === s
                ? 'gradient-purple text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {s} {s !== 'all' && `(${orders.filter(o => o.status === (s as Order['status'])).length})`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mr-3" />
          Loading orders…
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map((order, i) => {
              const actions = isAdmin ? NEXT_ACTIONS[order.status] : [];
              const isUpdating = updateStatus.isPending && updateStatus.variables?.id === order._id;

              return (
                <motion.div
                  key={order._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-xl bg-card border border-border/50 card-shadow overflow-hidden hover:card-shadow-hover transition-shadow"
                >
                  {/* Header row */}
                  <button
                    onClick={() => setExpandedId(expandedId === order._id ? null : order._id)}
                    className="w-full p-4 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-semibold">{order.orderId}</span>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{order.customer} · {order.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      {isAdmin && <span className="text-sm font-bold">${order.total.toLocaleString()}</span>}
                      <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expandedId === order._id && 'rotate-180')} />
                    </div>
                  </button>

                  {/* Progress bar */}
                  <div className="px-4 pb-3">
                    <div className="flex items-center gap-3">
                      <Progress value={order.progress} className="h-1.5 flex-1" />
                      <span className="text-xs text-muted-foreground w-8">{order.progress}%</span>
                    </div>
                  </div>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {expandedId === order._id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 border-t border-border/50 pt-4 space-y-4">

                          {/* Status pipeline stepper */}
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <StatusStepper status={order.status} />
                          </div>

                          {/* Order items */}
                          <div>
                            <h4 className="text-xs font-medium text-muted-foreground mb-2">Order Items</h4>
                            <div className="space-y-2">
                              {order.items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/30">
                                  <span>{item.name}</span>
                                  <div className="flex items-center gap-4">
                                    <span className="text-muted-foreground">×{item.qty}</span>
                                    {isAdmin && <span className="font-medium">${(item.qty * item.price).toFixed(2)}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {isAdmin && (
                              <div className="flex justify-between mt-3 pt-2 border-t border-border/30">
                                <span className="text-sm font-medium">Total</span>
                                <span className="text-sm font-bold">${order.total.toLocaleString()}</span>
                              </div>
                            )}
                          </div>

                          {/* Action buttons — admin only, only for non-terminal orders */}
                          {isAdmin && actions.length > 0 && (
                            <div className="flex items-center gap-2 pt-1 flex-wrap">
                              <span className="text-xs text-muted-foreground mr-1">Move to:</span>
                              {actions.map(action => (
                                <Button
                                  key={action.next}
                                  size="sm"
                                  variant={action.variant}
                                  disabled={isUpdating}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateStatus.mutate({ id: order._id, status: action.next });
                                  }}
                                  className={cn(
                                    'h-7 text-xs',
                                    action.next === 'completed' && 'gradient-purple text-primary-foreground hover:opacity-90 border-0'
                                  )}
                                >
                                  {isUpdating ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    action.label
                                  )}
                                </Button>
                              ))}
                            </div>
                          )}

                          {/* Terminal state message */}
                          {isAdmin && actions.length === 0 && (
                            <p className="text-xs text-muted-foreground italic">
                              {order.status === 'completed'
                                ? 'This order has been delivered and closed.'
                                : 'This order was cancelled and cannot be changed.'}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No orders found</p>
              <p className="text-xs mt-1">Try selecting a different status filter</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
