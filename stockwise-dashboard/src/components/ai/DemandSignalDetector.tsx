/**
 * DemandSignalDetector — "Read the world, predict your demand"
 *
 * Displays:
 *  - Summary bar: total signals, hot categories, weather snapshot
 *  - 30-day scrollable timeline with event pins
 *  - Signal cards grouped by urgency
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, RefreshCw, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronUp, Cloud, CalendarDays, Sparkles,
  AlertTriangle, Info, Zap, Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { demandSignalsApi, DemandSignal, DemandSignalResponse } from '@/services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  weather: 'bg-sky-500/15 border-sky-500/30 text-sky-400',
  event:   'bg-purple-500/15 border-purple-500/30 text-purple-400',
  news:    'bg-blue-500/15 border-blue-500/30 text-blue-400',
  holiday: 'bg-pink-500/15 border-pink-500/30 text-pink-400',
  season:  'bg-orange-500/15 border-orange-500/30 text-orange-400',
};

const URGENCY_RING: Record<string, string> = {
  critical: 'border-red-500/50 shadow-red-500/10',
  high:     'border-orange-500/40 shadow-orange-500/10',
  medium:   'border-yellow-500/30 shadow-yellow-500/5',
  low:      'border-border/40',
};

const URGENCY_DOT: Record<string, string> = {
  critical: 'bg-red-500 animate-pulse',
  high:     'bg-orange-500',
  medium:   'bg-yellow-500',
  low:      'bg-green-500',
};

const URGENCY_LABEL: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  high:     'bg-orange-500/15 text-orange-400 border-orange-500/30',
  medium:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  low:      'bg-green-500/15 text-green-400 border-green-500/30',
};

function relativeDate(daysUntil: number, endDate: string | null): string {
  if (daysUntil === 0) return 'Ongoing';
  if (daysUntil === 1) return 'Tomorrow';
  if (daysUntil <= 7)  return `In ${daysUntil} days`;
  if (daysUntil <= 14) return 'Next week';
  if (daysUntil <= 21) return 'In 2–3 weeks';
  return `In ~${Math.round(daysUntil / 7)} weeks`;
}

function ImpactChip({ direction, pct }: { direction: string; pct: number }) {
  const up  = direction === 'up';
  const dn  = direction === 'down';
  const cls = up ? 'text-green-400 bg-green-500/10 border-green-500/20'
            : dn ? 'text-red-400 bg-red-500/10 border-red-500/20'
            :       'text-muted-foreground bg-muted border-border/30';
  const Icon = up ? TrendingUp : dn ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      <Icon className="h-3 w-3" />
      {up ? '+' : dn ? '-' : ''}{Math.abs(pct)}%
    </span>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────
function DemandTimeline({ data, onDayClick, selectedDay }: {
  data: DemandSignalResponse;
  onDayClick: (date: string) => void;
  selectedDay: string | null;
}) {
  const today = new Date();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">30-Day Demand Calendar</span>
        </div>
        <span className="text-xs text-muted-foreground">Click a highlighted day to filter signals</span>
      </div>

      {/* Scrollable timeline */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-1 min-w-max">
          {Array.from({ length: 31 }, (_, i) => {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            const calDay  = data.calendar.find(c => c.date === dateStr);
            const hasSignals = !!calDay;
            const isToday    = i === 0;
            const isSelected = selectedDay === dateStr;
            const topUrgency = calDay?.signals[0]?.urgency;

            const dotCls = topUrgency === 'critical' ? 'bg-red-500'
              : topUrgency === 'high'   ? 'bg-orange-500'
              : topUrgency === 'medium' ? 'bg-yellow-500'
              : 'bg-primary';

            return (
              <button
                key={dateStr}
                onClick={() => hasSignals && onDayClick(isSelected ? '' : dateStr)}
                className={`flex flex-col items-center gap-1 p-1.5 rounded-lg transition-all min-w-[36px]
                  ${isToday ? 'bg-primary/20 ring-1 ring-primary/40' : ''}
                  ${isSelected ? 'bg-primary/30 ring-2 ring-primary' : ''}
                  ${hasSignals && !isSelected ? 'hover:bg-muted/60 cursor-pointer' : ''}
                  ${!hasSignals ? 'opacity-40 cursor-default' : ''}
                `}
              >
                <span className="text-[10px] text-muted-foreground font-medium">
                  {d.toLocaleDateString('en', { weekday: 'narrow' })}
                </span>
                <span className={`text-xs font-bold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                  {d.getDate()}
                </span>
                {hasSignals ? (
                  <div className="flex gap-0.5 flex-wrap justify-center max-w-[32px]">
                    {calDay!.signals.slice(0, 3).map((s, si) => (
                      <div key={si} className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
                    ))}
                  </div>
                ) : (
                  <div className="h-1.5 w-1.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        {[
          { cls: 'bg-red-500',    label: 'Critical' },
          { cls: 'bg-orange-500', label: 'High' },
          { cls: 'bg-yellow-500', label: 'Medium' },
        ].map(({ cls, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`h-2 w-2 rounded-full ${cls}`} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Weather snapshot bar ─────────────────────────────────────────────────────
function WeatherBar({ data }: { data: DemandSignalResponse }) {
  if (!data.weatherSnapshot?.length) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Cloud className="h-3.5 w-3.5 text-sky-400 flex-shrink-0" />
      <span className="text-xs text-muted-foreground mr-1">Live weather:</span>
      {data.weatherSnapshot.map(w => (
        <div key={w.city} className="flex items-center gap-1 text-xs bg-sky-500/10 border border-sky-500/20 rounded-full px-2 py-0.5">
          <span className="font-medium text-sky-400">{w.city}</span>
          <span className="text-muted-foreground">{w.tempC}°C · {w.desc.split(' ').slice(0, 2).join(' ')}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Signal Card ──────────────────────────────────────────────────────────────
function SignalCard({ signal, index }: { signal: DemandSignal; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`rounded-xl border bg-card card-shadow overflow-hidden transition-shadow hover:card-shadow-hover ${URGENCY_RING[signal.urgency]}`}
    >
      <button
        className="w-full p-4 flex items-start gap-3 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Icon */}
        <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-xl flex-shrink-0 mt-0.5">
          {signal.icon}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold truncate">{signal.title}</span>
            <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full border capitalize ${TYPE_COLORS[signal.type] ?? TYPE_COLORS.news}`}>
              {signal.type}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Urgency dot + relative time */}
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${URGENCY_DOT[signal.urgency]}`} />
              {relativeDate(signal.daysUntil, signal.endDate)}
            </span>

            {/* Impact chip */}
            <ImpactChip direction={signal.impactDirection} pct={signal.impactPercent} />

            {/* Region */}
            <span className="text-xs text-muted-foreground hidden sm:block">📍 {signal.region}</span>
          </div>

          {/* Affected categories */}
          <div className="flex gap-1 flex-wrap mt-2">
            {signal.affectedCategories.slice(0, 4).map(cat => (
              <span key={cat} className="text-[11px] bg-muted/60 text-muted-foreground px-2 py-0.5 rounded-full border border-border/40">
                {cat}
              </span>
            ))}
            {signal.affectedCategories.length > 4 && (
              <span className="text-[11px] text-muted-foreground">+{signal.affectedCategories.length - 4} more</span>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className={`text-[11px] font-medium border px-2 py-0.5 rounded-full capitalize ${URGENCY_LABEL[signal.urgency]}`}>
            {signal.urgency}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-default">
                <Info className="h-3 w-3" />{Math.round(signal.confidence * 100)}%
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">Confidence: {Math.round(signal.confidence * 100)}%</TooltipContent>
          </Tooltip>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border/40 pt-3 space-y-3">
              {/* Description */}
              <p className="text-sm text-muted-foreground leading-relaxed">{signal.description}</p>

              {/* Recommendation box */}
              <div className="rounded-lg bg-primary/5 border border-primary/15 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Zap className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-primary mb-1">Action Required</p>
                    <p className="text-xs text-foreground/80">{signal.actionRequired}</p>
                  </div>
                </div>
                <div className="border-t border-primary/10 pt-2">
                  <p className="text-xs text-muted-foreground">{signal.recommendation}</p>
                </div>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                <span>📍 {signal.region}</span>
                {signal.startDate && <span>📅 From {new Date(signal.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                {signal.endDate && <span>→ {new Date(signal.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function DemandSignalDetector() {
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [typeFilter,  setTypeFilter]  = useState<string>('all');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['demand-signals'],
    queryFn:  () => demandSignalsApi.get().then(r => r.data),
    staleTime: 4 * 60 * 60 * 1000,   // 4 hours — matches server cache
  });

  const clearMut = useMutation({
    mutationFn: () => demandSignalsApi.clearCache(),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['demand-signals'] }),
  });

  // ── Filter signals ──────────────────────────────────────────────────────────
  const allSignals  = data?.signals ?? [];
  const dayFiltered = selectedDay
    ? allSignals.filter(s => {
        if (!s.startDate) return false;
        const start = new Date(s.startDate);
        const end   = s.endDate ? new Date(s.endDate) : start;
        const sel   = new Date(selectedDay);
        return sel >= start && sel <= end;
      })
    : allSignals;

  const typeOptions = ['all', ...Array.from(new Set(allSignals.map(s => s.type)))];
  const filtered    = typeFilter === 'all' ? dayFiltered : dayFiltered.filter(s => s.type === typeFilter);

  const criticalCount = allSignals.filter(s => s.urgency === 'critical').length;
  const highCount     = allSignals.filter(s => s.urgency === 'high').length;

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-xl bg-card border border-border/50 card-shadow p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-muted animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-48 bg-muted rounded animate-pulse" />
            <div className="h-3 w-32 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-16 bg-muted/40 rounded-xl animate-pulse" />)}
        </div>
        <div className="h-20 bg-muted/30 rounded-xl animate-pulse" />
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-muted/30 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-card border border-destructive/30 card-shadow p-6">
        <div className="flex items-center gap-3 mb-3">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <span className="font-semibold text-sm">Failed to load demand signals</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {(error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Unknown error. Check GROQ_API_KEY in server .env.'}
        </p>
        <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['demand-signals'] })}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-xl bg-card border border-border/50 card-shadow overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="p-4 border-b border-border/40 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl gradient-purple flex items-center justify-center">
              <Globe className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">External Demand Signal Detector</h3>
                {data.source === 'cache' && (
                  <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">CACHED</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground italic">"Read the world, predict your demand"</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs flex-shrink-0"
            onClick={() => clearMut.mutate()}
            disabled={clearMut.isPending}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${clearMut.isPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* AI Summary */}
        <div className="mt-3 rounded-lg bg-primary/8 border border-primary/15 px-3 py-2">
          <div className="flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/80 leading-relaxed">{data.summary}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* ── KPI chips row ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm">
            <Flame className="h-4 w-4 text-orange-400" />
            <span className="font-bold">{allSignals.length}</span>
            <span className="text-muted-foreground text-xs">signals detected</span>
          </div>
          {criticalCount > 0 && (
            <span className="flex items-center gap-1 text-xs bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              {criticalCount} critical
            </span>
          )}
          {highCount > 0 && (
            <span className="flex items-center gap-1 text-xs bg-orange-500/10 border border-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-medium">
              {highCount} high priority
            </span>
          )}
          {data.hotCategories?.length > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <TrendingUp className="h-3.5 w-3.5 text-green-400" />
              <span className="text-muted-foreground">Hot:</span>
              {data.hotCategories.map(c => (
                <span key={c} className="bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded-full">{c}</span>
              ))}
            </div>
          )}
          {data.riskCategories?.length > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
              <span className="text-muted-foreground">Risk:</span>
              {data.riskCategories.map(c => (
                <span key={c} className="bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-full">{c}</span>
              ))}
            </div>
          )}
        </div>

        {/* ── Weather bar ────────────────────────────────────────────────────── */}
        <WeatherBar data={data} />

        {/* ── 30-day timeline ────────────────────────────────────────────────── */}
        <DemandTimeline
          data={data}
          onDayClick={setSelectedDay}
          selectedDay={selectedDay}
        />

        {/* ── Filters ────────────────────────────────────────────────────────── */}
        <div className="flex gap-2 flex-wrap items-center">
          {typeOptions.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all border
                ${typeFilter === t
                  ? 'gradient-purple text-primary-foreground border-transparent'
                  : 'bg-muted/40 text-muted-foreground border-border/30 hover:bg-muted/60'
                }`}
            >
              {t}
            </button>
          ))}
          {selectedDay && (
            <button
              onClick={() => setSelectedDay('')}
              className="px-2 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all"
            >
              📅 {new Date(selectedDay).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ×
            </button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} of {allSignals.length} signals
          </span>
        </div>

        {/* ── Signal cards ───────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((signal, i) => (
              <SignalCard key={signal.id} signal={signal} index={i} />
            ))}
          </AnimatePresence>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Globe className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">No signals match the current filter</p>
              <p className="text-xs mt-1">Try selecting a different type or clearing the date filter</p>
            </div>
          )}
        </div>

        {/* ── Footer meta ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/30 pt-3">
          <span>
            Sources: Groq Llama 3.3-70B · wttr.in · Computed calendar
            {data.meta?.tokensUsed ? ` · ${data.meta.tokensUsed} tokens` : ''}
          </span>
          <span>
            Updated {new Date(data.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
}
