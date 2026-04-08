import { cn } from '@/lib/utils';

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl bg-card border border-border/50 p-5 space-y-3', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-4 w-24 shimmer rounded" />
          <div className="h-7 w-32 shimmer rounded" />
          <div className="h-3 w-20 shimmer rounded" />
        </div>
        <div className="h-10 w-10 shimmer rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 p-4 border-b border-border/50">
      <div className="h-4 w-32 shimmer rounded" />
      <div className="h-4 w-20 shimmer rounded" />
      <div className="h-4 w-24 shimmer rounded" />
      <div className="h-4 w-16 shimmer rounded" />
      <div className="h-5 w-20 shimmer rounded-full" />
    </div>
  );
}
