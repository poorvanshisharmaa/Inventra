import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle, TrendingUp, Package, ArrowRightLeft,
  RefreshCw, Info, Zap, CheckCircle, XCircle, Clock,
  ChevronDown, ChevronUp, Flame, Activity,
} from 'lucide-react';
import { aiApi, AnomalyResult, StockoutResult, DemandSurgeResult, RebalanceSuggestion } from '@/services/api';
import { PhotoInventoryCount } from '@/components/ai/PhotoInventoryCount';
import { DemandSignalDetector } from '@/components/ai/DemandSignalDetector';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: 'bg-red-500/15 text-red-400 border-red-500/30',
    high:     'bg-orange-500/15 text-orange-400 border-orange-500/30',
    medium:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    low:      'bg-green-500/15 text-green-400 border-green-500/30',
    explosive:'bg-red-500/15 text-red-400 border-red-500/30',
    strong:   'bg-orange-500/15 text-orange-400 border-orange-500/30',
    moderate: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    mild:     'bg-blue-500/15 text-blue-400 border-blue-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[severity] || 'bg-muted text-muted-foreground border-border'}`}>
      {severity}
    </span>
  );
}

function ScoreBar({ score, color }: { score: number; color?: string }) {
  const pct = Math.round(score * 100);
  const cls = color === 'red' || pct >= 80
    ? 'bg-red-500'
    : pct >= 60 ? 'bg-orange-500'
    : pct >= 40 ? 'bg-yellow-500'
    : 'bg-green-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

function ConfidencePill({ score }: { score: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-default">
          <Info className="h-3 w-3" />
          {Math.round(score * 100)}% confidence
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        Confidence reflects data quantity &amp; quality. Higher = more historical records available.
      </TooltipContent>
    </Tooltip>
  );
}

function UrgencyDot({ urgency }: { urgency: string }) {
  const cls = urgency === 'critical' ? 'bg-red-500 animate-pulse'
    : urgency === 'high'     ? 'bg-orange-500'
    : urgency === 'medium'   ? 'bg-yellow-500'
    : 'bg-green-500';
  return <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${cls}`} />;
}

function StockoutCountdown({ days }: { days: number }) {
  const cls = days <= 2 ? 'text-red-400' : days <= 5 ? 'text-orange-400' : days <= 10 ? 'text-yellow-400' : 'text-green-400';
  return (
    <span className={`font-bold tabular-nums ${cls}`}>
      {days <= 0 ? 'OUT' : `${days}d`}
    </span>
  );
}

// ─── Section: Summary KPI Cards ───────────────────────────────────────────────

function AISummaryCards({
  anomalyCount, criticalStockouts, surgesDetected, transferSuggestions,
}: { anomalyCount: number; criticalStockouts: number; surgesDetected: number; transferSuggestions: number }) {
  const cards = [
    { label: 'Anomalies Detected', value: anomalyCount,       icon: AlertTriangle,  color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
    { label: 'Critical Stockouts', value: criticalStockouts,  icon: Package,        color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
    { label: 'Demand Surges',      value: surgesDetected,     icon: TrendingUp,     color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
    { label: 'Transfer Suggestions',value: transferSuggestions,icon: ArrowRightLeft,color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c, i) => (
        <motion.div key={c.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
          className={`rounded-xl border p-4 ${c.bg}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">{c.label}</span>
            <c.icon className={`h-4 w-4 ${c.color}`} />
          </div>
          <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Panel 1: Anomaly Alerts ──────────────────────────────────────────────────

function AnomalyAlertsPanel() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['ai', 'anomalies'],
    queryFn: () => aiApi.anomalies().then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const alerts = data?.results.filter(r => r.isAnomaly) ?? [];

  return (
    <div className="rounded-xl bg-card border border-border/50 p-5 card-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <h3 className="text-sm font-semibold">Inventory Loss Detection</h3>
          {data && (
            <Badge variant="outline" className="text-xs border-red-500/30 text-red-400">
              {data.anomaliesFound} flagged
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{data?.algorithm}</span>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && alerts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <CheckCircle className="h-8 w-8 mb-2 text-green-400" />
          <p className="text-sm">No anomalies detected — inventory looks healthy</p>
        </div>
      )}

      <div className="space-y-2">
        {alerts.map((a: AnomalyResult) => {
          const key = `${a.productId}_${a.distributorId}`;
          const isOpen = expanded === key;
          return (
            <div key={key}
              className={`rounded-lg border transition-colors cursor-pointer ${
                a.severity === 'critical' ? 'border-red-500/40 bg-red-500/5'
                : a.severity === 'high'   ? 'border-orange-500/40 bg-orange-500/5'
                : 'border-yellow-500/30 bg-yellow-500/5'
              }`}
              onClick={() => setExpanded(isOpen ? null : key)}
            >
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <UrgencyDot urgency={a.severity} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{a.productName}</p>
                    <p className="text-xs text-muted-foreground">{a.distributorName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-400">{Math.round(a.anomalyScore * 100)}%</p>
                    <p className="text-xs text-muted-foreground">score</p>
                  </div>
                  <SeverityBadge severity={a.severity} />
                  {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
              </div>

              {isOpen && (
                <div className="px-3 pb-3 space-y-2 border-t border-border/30 pt-2">
                  <ScoreBar score={a.anomalyScore} color="red" />
                  <p className="text-xs text-muted-foreground">{a.explanation}</p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="rounded bg-muted/40 p-2">
                      <p className="text-xs text-muted-foreground">Unexplained Loss</p>
                      <p className="text-sm font-bold text-red-400">{a.unexplainedLoss} units</p>
                    </div>
                    <div className="rounded bg-muted/40 p-2">
                      <p className="text-xs text-muted-foreground">Avg Daily Sales</p>
                      <p className="text-sm font-bold">{a.avgDailySales} units/day</p>
                    </div>
                  </div>
                  {a.reasons.length > 1 && (
                    <ul className="space-y-1 mt-1">
                      {a.reasons.map((r, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                          <span className="text-orange-400 flex-shrink-0">•</span>{r}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex justify-between items-center pt-1">
                    <ConfidencePill score={a.confidenceScore} />
                    <span className="text-xs text-muted-foreground italic">Why flagged: Z-score &gt; 1.5σ</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isLoading && data && (
        <p className="text-xs text-muted-foreground mt-3 text-right">
          {data.totalAnalyzed} product-distributor pairs analysed
        </p>
      )}
    </div>
  );
}

// ─── Panel 2: Stockout Predictions ───────────────────────────────────────────

function StockoutPredictionPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['ai', 'stockout'],
    queryFn: () => aiApi.stockoutPredictions().then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const urgent = data?.results.filter(r => r.urgency !== 'low') ?? [];

  const trendIcon = (t: string) =>
    t === 'increasing' ? <TrendingUp className="h-3 w-3 text-red-400" />
    : t === 'decreasing' ? <TrendingUp className="h-3 w-3 text-green-400 rotate-180" />
    : <Activity className="h-3 w-3 text-muted-foreground" />;

  return (
    <div className="rounded-xl bg-card border border-border/50 p-5 card-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-orange-400" />
          <h3 className="text-sm font-semibold">Stockout Predictions</h3>
          {data && (
            <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-400">
              {data.criticalCount} critical
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{data?.algorithm}</span>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />)}
        </div>
      )}

      {!isLoading && urgent.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Package className="h-8 w-8 mb-2 text-green-400" />
          <p className="text-sm">All products have sufficient stock levels</p>
        </div>
      )}

      <div className="space-y-2">
        {urgent.slice(0, 12).map((item: StockoutResult) => (
          <div key={`${item.productId}_${item.distributorId}`}
            className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <UrgencyDot urgency={item.urgency} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate">{item.productName}</p>
                  {trendIcon(item.trend)}
                </div>
                <p className="text-xs text-muted-foreground">{item.distributorName} · {item.currentStock} units</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <StockoutCountdown days={item.daysToStockout} />
                <p className="text-xs text-muted-foreground">{item.avgDailySales}/day</p>
              </div>
              <SeverityBadge severity={item.urgency} />
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 pt-3 border-t border-border/30">
        {[
          { label: '≤2d Critical', color: 'bg-red-500' },
          { label: '≤5d High',     color: 'bg-orange-500' },
          { label: '≤10d Medium',  color: 'bg-yellow-500' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${l.color}`} />
            <span className="text-xs text-muted-foreground">{l.label}</span>
          </div>
        ))}
      </div>

      {data && (
        <div className="mt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs text-muted-foreground cursor-default underline decoration-dotted">
                How is this calculated?
              </p>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              days_to_stockout = current_stock ÷ weighted_avg_daily_sales.
              Recent sales are weighted more heavily (exponential decay).
              Trend adjustment applied when demand is accelerating.
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

// ─── Panel 3: Demand Surge Early Warning ─────────────────────────────────────

function DemandSurgePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['ai', 'demand-surges'],
    queryFn: () => aiApi.demandSurges().then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const surges = data?.results.filter(r => r.isSurge) ?? [];
  const others = data?.results.filter(r => !r.isSurge).slice(0, 3) ?? [];

  return (
    <div className="rounded-xl bg-card border border-border/50 p-5 card-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-yellow-400" />
          <h3 className="text-sm font-semibold">Demand Surge Early Warning</h3>
          {data && (
            <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-400">
              {data.surgesDetected} surging
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{data?.algorithm}</span>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />)}
        </div>
      )}

      {surges.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Trending Now</p>
          <div className="space-y-2">
            {surges.map((s: DemandSurgeResult) => (
              <div key={`${s.productId}_${s.region}`}
                className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Flame className="h-3.5 w-3.5 text-yellow-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{s.productName}</p>
                        <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          Trending
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{s.region}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-yellow-400">+{s.growthRate}%</p>
                    <SeverityBadge severity={s.intensity} />
                  </div>
                </div>
                <div className="mt-2">
                  <ScoreBar score={s.surgeScore} />
                  <p className="text-xs text-muted-foreground mt-1">{s.explanation}</p>
                  <div className="flex justify-between items-center mt-1">
                    <ConfidencePill score={s.confidenceScore} />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-muted-foreground cursor-default underline decoration-dotted">
                          Why flagged?
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        {s.recommendation}. Z-score: {s.zScore}σ vs 7-day baseline.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Monitoring</p>
          <div className="space-y-1">
            {others.map((s: DemandSurgeResult) => (
              <div key={`${s.productId}_${s.region}`}
                className="flex items-center justify-between p-2 rounded bg-muted/20">
                <div className="flex items-center gap-2 min-w-0">
                  <TrendingUp className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{s.productName}</span>
                  <span className="text-xs text-muted-foreground">· {s.region}</span>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {s.growthRate > 0 ? '+' : ''}{s.growthRate}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && surges.length === 0 && others.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <TrendingUp className="h-8 w-8 mb-2 text-blue-400" />
          <p className="text-sm">No demand surges detected — demand is stable</p>
        </div>
      )}
    </div>
  );
}

// ─── Panel 4: Rebalancing Suggestions ────────────────────────────────────────

function RebalancingPanel() {
  const { toast } = useToast();
  const [approved, setApproved] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['ai', 'rebalance'],
    queryFn: () => aiApi.rebalanceSuggestions().then(r => r.data),
    staleTime: 5 * 60_000,
  });

  function handleApprove(id: string, suggestion: RebalanceSuggestion) {
    setApproved(prev => new Set([...prev, id]));
    toast({
      title: 'Transfer Approved',
      description: `${suggestion.transferQuantity} units of ${suggestion.productName} from ${suggestion.fromDistributorName} → ${suggestion.toDistributorName}`,
    });
  }

  const suggestions = data?.suggestions ?? [];

  return (
    <div className="rounded-xl bg-card border border-border/50 p-5 card-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold">Cross-Distributor Rebalancing</h3>
          {data && (
            <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-400">
              {data.suggestionsCount} transfers
            </Badge>
          )}
        </div>
        {data && (
          <span className="text-xs text-green-400 font-medium">
            Save ${data.estimatedTotalSavings.toLocaleString()}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-muted/30 animate-pulse" />)}
        </div>
      )}

      {!isLoading && suggestions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <CheckCircle className="h-8 w-8 mb-2 text-green-400" />
          <p className="text-sm">Inventory is well-balanced across all distributors</p>
        </div>
      )}

      <div className="space-y-3">
        {suggestions.map((s: RebalanceSuggestion) => {
          const isApproved = approved.has(s.id);
          return (
            <div key={s.id}
              className={`rounded-lg border p-3 transition-colors ${
                isApproved ? 'border-green-500/40 bg-green-500/5 opacity-70'
                : s.urgency === 'critical' ? 'border-red-500/30 bg-red-500/5'
                : s.urgency === 'high'     ? 'border-orange-500/30 bg-orange-500/5'
                : 'border-border/50 bg-muted/20'
              }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-muted-foreground">{s.id}</span>
                    <SeverityBadge severity={s.urgency} />
                    {isApproved && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle className="h-3 w-3" /> Approved
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold">{s.productName}</p>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{s.fromDistributorName}</span>
                    <ArrowRightLeft className="h-3 w-3 flex-shrink-0" />
                    <span className="font-medium text-foreground">{s.toDistributorName}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div className="rounded bg-muted/40 p-1.5 text-center">
                      <p className="text-xs text-muted-foreground">Transfer</p>
                      <p className="text-sm font-bold text-blue-400">{s.transferQuantity}</p>
                    </div>
                    <div className="rounded bg-muted/40 p-1.5 text-center">
                      <p className="text-xs text-muted-foreground">Cover (src→dst)</p>
                      <p className="text-sm font-bold">{s.fromDaysCover}d → {s.toDaysCover}d</p>
                    </div>
                    <div className="rounded bg-muted/40 p-1.5 text-center">
                      <p className="text-xs text-muted-foreground">Saves</p>
                      <p className="text-sm font-bold text-green-400">${s.costSaving}</p>
                    </div>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-muted-foreground mt-2 cursor-default line-clamp-1 underline decoration-dotted">
                        {s.explanation}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-sm text-xs">
                      {s.explanation}. Greedy matching algorithm minimises total stock imbalance.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Button
                  size="sm"
                  variant={isApproved ? 'outline' : 'default'}
                  disabled={isApproved}
                  onClick={() => handleApprove(s.id, s)}
                  className="flex-shrink-0 text-xs h-8"
                >
                  {isApproved ? <CheckCircle className="h-3.5 w-3.5 mr-1" /> : <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />}
                  {isApproved ? 'Approved' : 'Approve'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {data && suggestions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/30">
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs text-muted-foreground cursor-default underline decoration-dotted">
                Algorithm: {data.algorithm}
              </p>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              Greedy matching: distributors with excess stock (&gt;120% target) are matched
              to those with shortage (&lt;80% target). Most urgent deficits are filled first.
              Saves $0.80/unit vs placing new purchase orders.
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

function AIStatusBar({ onRefresh }: { onRefresh: () => void }) {
  const { data } = useQuery({
    queryKey: ['ai', 'status'],
    queryFn: () => aiApi.status().then(r => r.data),
    refetchInterval: 30_000,
  });

  // Log AI service status to console only — not shown in UI
  useEffect(() => {
    if (!data) return;
    const status = data.aiService?.online ? 'Online' : 'Offline (JS fallback active)';
    const cached = data.cacheEntries ?? 0;
    console.info(`[Inventra AI] Python AI Service: ${status} · ${cached} cached result(s)`);
  }, [data]);

  const qc = useQueryClient();
  const clearMut = useMutation({
    mutationFn: () => aiApi.clearCache(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai'] });
      onRefresh();
    },
  });

  return (
    <div className="flex justify-end rounded-lg bg-muted/30 border border-border/40 px-3 py-1.5">
      <Button size="sm" variant="ghost" className="h-7 text-xs"
        onClick={() => clearMut.mutate()} disabled={clearMut.isPending}>
        {clearMut.isPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
        Refresh AI
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AIIntelligence() {
  const qc = useQueryClient();

  const { data: anomalyData } = useQuery({
    queryKey: ['ai', 'anomalies'],
    queryFn: () => aiApi.anomalies().then(r => r.data),
    staleTime: 5 * 60_000,
  });
  const { data: stockoutData } = useQuery({
    queryKey: ['ai', 'stockout'],
    queryFn: () => aiApi.stockoutPredictions().then(r => r.data),
    staleTime: 5 * 60_000,
  });
  const { data: surgeData } = useQuery({
    queryKey: ['ai', 'demand-surges'],
    queryFn: () => aiApi.demandSurges().then(r => r.data),
    staleTime: 5 * 60_000,
  });
  const { data: rebalanceData } = useQuery({
    queryKey: ['ai', 'rebalance'],
    queryFn: () => aiApi.rebalanceSuggestions().then(r => r.data),
    staleTime: 5 * 60_000,
  });

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ['ai'] });
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">AI Intelligence</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Proactive anomaly detection, stockout forecasting, demand surge alerts &amp; inventory rebalancing — powered by ML algorithms.
        </p>
      </div>

      {/* AI Service Status */}
      <AIStatusBar onRefresh={handleRefresh} />

      {/* Summary KPI Cards */}
      <AISummaryCards
        anomalyCount={anomalyData?.anomaliesFound ?? 0}
        criticalStockouts={stockoutData?.criticalCount ?? 0}
        surgesDetected={surgeData?.surgesDetected ?? 0}
        transferSuggestions={rebalanceData?.suggestionsCount ?? 0}
      />

      {/* Top row: Anomalies + Stockouts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <AnomalyAlertsPanel />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <StockoutPredictionPanel />
        </motion.div>
      </div>

      {/* Bottom row: Demand Surge + Rebalancing */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <DemandSurgePanel />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
          <RebalancingPanel />
        </motion.div>
      </div>

      {/* External Demand Signal Detector — full width */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
        <DemandSignalDetector />
      </motion.div>

      {/* Photo Inventory Count — full width */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}>
        <PhotoInventoryCount />
      </motion.div>
    </div>
  );
}
