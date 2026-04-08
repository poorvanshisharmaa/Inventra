import { cn } from '@/lib/utils';

type Status = 'healthy' | 'medium' | 'low' | 'pending' | 'processing' | 'completed' | 'cancelled';

const statusConfig: Record<Status, { label: string; className: string }> = {
  healthy: { label: 'Healthy', className: 'bg-success/10 text-success border-success/20' },
  medium: { label: 'Medium', className: 'bg-warning/10 text-warning border-warning/20' },
  low: { label: 'Low Stock', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  pending: { label: 'Pending', className: 'bg-warning/10 text-warning border-warning/20' },
  processing: { label: 'Processing', className: 'bg-info/10 text-info border-info/20' },
  completed: { label: 'Completed', className: 'bg-success/10 text-success border-success/20' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground border-border' },
};

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
      config.className,
      className
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', {
        'bg-success': status === 'healthy' || status === 'completed',
        'bg-warning': status === 'medium' || status === 'pending',
        'bg-destructive': status === 'low',
        'bg-info': status === 'processing',
        'bg-muted-foreground': status === 'cancelled',
      })} />
      {config.label}
    </span>
  );
}
