import { useNavigate } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Bell, AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, Notification } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { VoiceAssistant } from '@/components/voice/VoiceAssistant';

interface AppLayoutProps {
  children: React.ReactNode;
}

const typeIcon: Record<string, React.ElementType> = {
  warning: AlertTriangle,
  error:   XCircle,
  success: CheckCircle,
  info:    Info,
};

const typeColor: Record<string, string> = {
  warning: 'text-yellow-400',
  error:   'text-red-400',
  success: 'text-green-400',
  info:    'text-blue-400',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min  = Math.floor(diff / 60_000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NotificationBell() {
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey:       ['notifications'],
    queryFn:        () => notificationsApi.getAll().then(r => r.data),
    refetchInterval: 30_000,   // poll every 30 s for near-real-time updates
    staleTime:       15_000,
  });

  const unread  = notifications.filter((n: Notification) => !n.read);
  const preview = unread.slice(0, 5);  // show up to 5 in dropdown

  const markAllMut = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markOneMut = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-lg">
          <Bell className={`h-4 w-4 ${unread.length > 0 ? 'text-foreground' : 'text-muted-foreground'}`} />
          {unread.length > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 flex items-center justify-center text-[10px] bg-destructive border-background border-2 pointer-events-none">
              {unread.length > 99 ? '99+' : unread.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold">Notifications</span>
            {unread.length > 0 && (
              <Badge variant="secondary" className="text-xs h-5 px-1.5">
                {unread.length} new
              </Badge>
            )}
          </div>
          {unread.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-muted-foreground hover:text-foreground px-2"
              onClick={() => markAllMut.mutate()}
              disabled={markAllMut.isPending}
            >
              Mark all read
            </Button>
          )}
        </div>

        {/* Notification list */}
        <div className="max-h-72 overflow-y-auto">
          {isLoading && (
            <div className="space-y-2 p-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 rounded-md bg-muted/40 animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && preview.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <CheckCircle className="h-6 w-6 text-green-400" />
              <p className="text-xs">You're all caught up!</p>
            </div>
          )}

          {preview.map((n: Notification) => {
            const Icon  = typeIcon[n.type]  ?? Info;
            const color = typeColor[n.type] ?? 'text-muted-foreground';
            return (
              <div
                key={n._id}
                className="flex gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer border-b border-border/30 last:border-0"
                onClick={() => markOneMut.mutate(n._id)}
              >
                <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-snug">{n.message}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{timeAgo(n.createdAt)}</p>
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-border/50 p-2">
          <Button
            variant="ghost"
            className="w-full text-xs h-8 text-muted-foreground hover:text-foreground"
            onClick={() => navigate('/notifications')}
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth();
  const initial  = user?.name?.charAt(0).toUpperCase() ?? 'U';

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border/50 px-4 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9" />
            </div>
            <div className="flex items-center gap-2">
              <VoiceAssistant />
              <NotificationBell />
              <ThemeToggle />
              <div className="h-8 w-8 rounded-full gradient-purple flex items-center justify-center text-xs font-bold text-primary-foreground ml-1">
                {initial}
              </div>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
