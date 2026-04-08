import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle, Info, XCircle, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, Notification } from '@/services/api';
import { Button } from '@/components/ui/button';

const typeConfig = {
  warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
  success: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10' },
  info: { icon: Info, color: 'text-info', bg: 'bg-info/10' },
  error: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
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

export default function Notifications() {
  const qc = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.getAll().then(r => r.data),
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = notifications.filter((n: Notification) => !n.read).length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground text-sm mt-1">{notifications.length} alerts{unread > 0 && `, ${unread} unread`}</p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
            Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mr-3" />
          Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n: Notification, i: number) => {
            const config = typeConfig[n.type];
            const Icon = config.icon;
            return (
              <motion.div
                key={n._id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className={cn(
                  'flex items-start gap-3 p-4 rounded-xl bg-card border card-shadow hover:card-shadow-hover transition-shadow cursor-pointer',
                  n.read ? 'border-border/30 opacity-60' : 'border-border/50'
                )}
                onClick={() => !n.read && markOne.mutate(n._id)}
              >
                <div className={cn('h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0', config.bg)}>
                  <Icon className={cn('h-4 w-4', config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.read && (
                  <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {!isLoading && notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Bell className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">No notifications</p>
        </div>
      )}
    </div>
  );
}
