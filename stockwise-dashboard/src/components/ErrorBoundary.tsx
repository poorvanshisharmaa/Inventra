import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props { children: React.ReactNode; fallback?: React.ReactNode }
interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center p-6">
        <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <p className="font-semibold">Something went wrong</p>
          <p className="text-sm text-muted-foreground mt-1">{this.state.error?.message ?? 'An unexpected error occurred'}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => this.setState({ hasError: false })}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" /> Try again
        </Button>
      </div>
    );
  }
}

/** Inline error card for query errors inside a page section */
export function QueryError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="h-5 w-5 text-destructive" />
      </div>
      <div>
        <p className="text-sm font-medium">Failed to load data</p>
        <p className="text-xs text-muted-foreground mt-0.5">{message ?? 'Check your connection and try again'}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" /> Retry
        </Button>
      )}
    </div>
  );
}
