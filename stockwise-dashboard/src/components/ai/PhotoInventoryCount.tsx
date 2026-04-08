import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, Upload, X, Loader2, CheckCircle, AlertTriangle,
  XCircle, Eye, BarChart2, Info, RotateCcw, Flag, Layers,
} from 'lucide-react';
import { inventoryApi, photoCountApi, PhotoCountResult } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

// ─── Constants ────────────────────────────────────────────────────────────────

const REGIONS = [
  { id: 'dist-north', name: 'North Region' },
  { id: 'dist-south', name: 'South Region' },
  { id: 'dist-east',  name: 'East Region'  },
  { id: 'dist-west',  name: 'West Region'  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const severityConfig = {
  ok:       { color: 'text-green-400',  bg: 'bg-green-500/10  border-green-500/30',  icon: CheckCircle,     label: 'Within Tolerance' },
  medium:   { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', icon: AlertTriangle,   label: 'Minor Discrepancy' },
  high:     { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', icon: AlertTriangle,   label: 'Significant Gap' },
  critical: { color: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/30',    icon: XCircle,         label: 'Critical — Audit Required' },
  unknown:  { color: 'text-muted-foreground', bg: 'bg-muted/30 border-border',       icon: Info,            label: 'Unknown' },
};

const conditionLabels: Record<string, string> = {
  organized:    'Organized',
  messy:        'Messy',
  partial_view: 'Partial View',
  empty:        'Empty',
  unknown:      'Unknown',
};

function formatDiff(diff: number | null): string {
  if (diff === null) return '—';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

// ─── Result Card ──────────────────────────────────────────────────────────────

function ResultCard({
  result, onReset,
}: { result: PhotoCountResult; onReset: () => void }) {
  const { toast } = useToast();
  const cfg        = severityConfig[result.discrepancy.severity] ?? severityConfig.unknown;
  const SevIcon    = cfg.icon;
  const diff       = result.discrepancy.units;
  const confidence = result.aiAnalysis.confidence;

  function handleFlag() {
    toast({
      title:       'Flagged for Audit',
      description: `${result.product.name} at ${result.location.distributorName} has been flagged for a stock audit.`,
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{result.product.name}</p>
          <p className="text-xs text-muted-foreground">
            {result.product.sku} · {result.location.distributorName}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Main comparison: System vs Counted */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-[11px] text-muted-foreground mb-1">System Says</p>
          <p className="text-2xl font-bold">{result.systemCount}</p>
          <p className="text-[11px] text-muted-foreground">units</p>
        </div>

        <div className={`rounded-lg border p-3 ${cfg.bg}`}>
          <p className="text-[11px] text-muted-foreground mb-1">Difference</p>
          <p className={`text-2xl font-bold ${cfg.color}`}>
            {formatDiff(diff)}
          </p>
          <p className={`text-[11px] font-medium ${cfg.color}`}>
            {result.discrepancy.percentage !== null
              ? `${result.discrepancy.percentage > 0 ? '+' : ''}${result.discrepancy.percentage}%`
              : '—'}
          </p>
        </div>

        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-[11px] text-muted-foreground mb-1">AI Counted</p>
          <p className="text-2xl font-bold">
            {result.aiAnalysis.counted ?? '—'}
          </p>
          <p className="text-[11px] text-muted-foreground">units</p>
        </div>
      </div>

      {/* Visual discrepancy bar */}
      {result.aiAnalysis.counted !== null && result.systemCount > 0 && (
        <div>
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
            <span>0</span>
            <span>System: {result.systemCount}</span>
          </div>
          <div className="relative h-3 bg-muted rounded-full overflow-hidden">
            {/* System count bar (baseline) */}
            <div className="absolute inset-0 bg-muted-foreground/20 rounded-full" />
            {/* AI counted bar */}
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                result.discrepancy.severity === 'critical' ? 'bg-red-500' :
                result.discrepancy.severity === 'high'     ? 'bg-orange-500' :
                result.discrepancy.severity === 'medium'   ? 'bg-yellow-500' :
                'bg-green-500'
              }`}
              style={{
                width: `${Math.min(100, (result.aiAnalysis.counted / result.systemCount) * 100)}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
            <span className={cfg.color}>Counted: {result.aiAnalysis.counted}</span>
            {result.discrepancy.percentage !== null && (
              <span className={cfg.color}>{Math.abs(result.discrepancy.percentage)}% variance</span>
            )}
          </div>
        </div>
      )}

      {/* Severity badge + message */}
      <div className={`rounded-lg border p-3 ${cfg.bg}`}>
        <div className="flex items-start gap-2">
          <SevIcon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${cfg.color}`} />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
              <Badge variant="outline" className={`text-[10px] border-current ${cfg.color}`}>
                {result.discrepancy.severity.toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{result.discrepancy.alertMessage}</p>
            <p className="text-xs text-muted-foreground italic">
              → {result.discrepancy.recommendation}
            </p>
          </div>
        </div>
      </div>

      {/* AI Analysis Details */}
      <div className="rounded-lg bg-muted/20 border border-border/40 p-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Eye className="h-3 w-3" /> AI Analysis Details
        </p>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          {/* Confidence */}
          <div>
            <p className="text-muted-foreground">Confidence</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${Math.round((confidence ?? 0) * 100)}%` }}
                />
              </div>
              <span className="font-medium tabular-nums">
                {confidence !== null ? `${Math.round(confidence * 100)}%` : '—'}
              </span>
            </div>
          </div>

          {/* Shelf condition */}
          <div>
            <p className="text-muted-foreground">Shelf Condition</p>
            <p className="font-medium mt-0.5 capitalize">
              {conditionLabels[result.aiAnalysis.shelfCondition] ?? result.aiAnalysis.shelfCondition}
            </p>
          </div>

          {/* Last updated */}
          <div>
            <p className="text-muted-foreground">Last System Update</p>
            <p className="font-medium mt-0.5">
              {result.meta.daysSinceLastUpdate === 0
                ? 'Today'
                : `${result.meta.daysSinceLastUpdate} day(s) ago`}
            </p>
          </div>

          {/* Model */}
          <div>
            <p className="text-muted-foreground">AI Model</p>
            <p className="font-medium mt-0.5">{result.meta.model}</p>
          </div>
        </div>

        {/* Section-by-section breakdown */}
        {result.aiAnalysis.sectionCounts && (
          <div className="pt-1 border-t border-border/30">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Section breakdown: </span>
              {result.aiAnalysis.sectionCounts}
            </p>
          </div>
        )}

        {/* Counting method */}
        {result.aiAnalysis.countingMethod && (
          <div className="pt-1 border-t border-border/30">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Method: </span>
              {result.aiAnalysis.countingMethod}
            </p>
          </div>
        )}

        {/* AI notes */}
        {result.aiAnalysis.notes && (
          <div className="pt-1 border-t border-border/30">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Notes: </span>
              {result.aiAnalysis.notes}
            </p>
          </div>
        )}

        {/* Tokens used */}
        {result.meta.tokensUsed && (
          <p className="text-[11px] text-muted-foreground/50 text-right">
            {result.meta.tokensUsed} tokens used
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {result.discrepancy.severity !== 'ok' && result.discrepancy.severity !== 'unknown' && (
          <Button
            size="sm"
            variant="destructive"
            className="flex-1 text-xs h-8"
            onClick={handleFlag}
          >
            <Flag className="h-3.5 w-3.5 mr-1.5" />
            Flag for Audit
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs h-8"
          onClick={onReset}
        >
          <Camera className="h-3.5 w-3.5 mr-1.5" />
          New Scan
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({
  preview, onFile, onRemove,
}: {
  preview: string | null;
  onFile: (f: File) => void;
  onRemove: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };

  if (preview) {
    return (
      <div className="relative rounded-xl overflow-hidden border border-border/50 bg-muted/20">
        <img src={preview} alt="Shelf preview" className="w-full h-52 object-cover" />
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 h-7 w-7 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background transition-colors border border-border"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="absolute bottom-2 left-2">
          <Badge variant="secondary" className="text-[11px] bg-background/80 backdrop-blur">
            <CheckCircle className="h-2.5 w-2.5 mr-1 text-green-400" />
            Photo ready
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`h-52 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-border'
      }`}
    >
      <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center">
        <Upload className={`h-5 w-5 ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">Drop shelf photo here</p>
        <p className="text-xs text-muted-foreground mt-0.5">or click to browse</p>
      </div>
      <div className="flex gap-2">
        <Badge variant="outline" className="text-[11px]">JPEG</Badge>
        <Badge variant="outline" className="text-[11px]">PNG</Badge>
        <Badge variant="outline" className="text-[11px]">WebP</Badge>
        <Badge variant="outline" className="text-[11px]">Max 10MB</Badge>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}

// Camera button — separate so it captures from device camera on mobile
function CameraButton({ onFile }: { onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full text-xs h-9 border-dashed"
        onClick={() => ref.current?.click()}
      >
        <Camera className="h-3.5 w-3.5 mr-1.5" />
        Use Camera (mobile)
      </Button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PhotoInventoryCount() {
  const { toast } = useToast();

  // Form state
  const [file,          setFile]          = useState<File | null>(null);
  const [preview,       setPreview]       = useState<string | null>(null);
  const [productId,     setProductId]     = useState('');
  const [distributorId, setDistributorId] = useState('dist-north');

  // Result state
  const [result,       setResult]       = useState<PhotoCountResult | null>(null);
  const [isAnalyzing,  setIsAnalyzing]  = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // Scan history (session-only)
  const [history, setHistory] = useState<Array<{
    productName: string; distributorName: string;
    diff: number | null; severity: string; at: string;
  }>>([]);

  // Fetch inventory for product selector
  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn:  () => inventoryApi.getAll().then(r => r.data),
    staleTime: 60_000,
  });

  function handleFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
  }

  function handleRemove() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  function handleReset() {
    handleRemove();
    setProductId('');
    setDistributorId('dist-north');
  }

  async function handleAnalyze() {
    if (!file)        return toast({ title: 'No photo selected', description: 'Please upload or take a shelf photo first.', variant: 'destructive' });
    if (!productId)   return toast({ title: 'No product selected', description: 'Select the product you are counting.', variant: 'destructive' });

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.append('image',          file);
      form.append('productId',      productId);
      form.append('distributorId',  distributorId);
      form.append('distributorName', REGIONS.find(r => r.id === distributorId)?.name ?? distributorId);

      const { data } = await photoCountApi.analyze(form);
      setResult(data);

      // Add to session history
      setHistory(prev => [{
        productName:     data.product.name,
        distributorName: data.location.distributorName,
        diff:            data.discrepancy.units,
        severity:        data.discrepancy.severity,
        at:              new Date().toLocaleTimeString(),
      }, ...prev.slice(0, 9)]);

    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.message ?? 'Analysis failed.';
      setError(msg);
      toast({ title: 'Analysis Failed', description: msg, variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  }

  const canAnalyze = !!file && !!productId && !isAnalyzing;

  return (
    <div className="rounded-xl bg-card border border-border/50 p-5 card-shadow space-y-5">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold">Photo Inventory Count</h3>
          <Badge variant="outline" className="text-[11px] border-blue-500/30 text-blue-400">
            Llama 4 Vision · Groq
          </Badge>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-default" />
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs text-xs">
            Upload a photo of a warehouse shelf. GPT-4o Vision counts the units and
            compares with the system record to flag discrepancies.
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Left: Setup form ── */}
        <div className="space-y-3">
          {/* Product selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Product to Count
            </label>
            <select
              value={productId}
              onChange={e => setProductId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select a product...</option>
              {inventory.map(item => (
                <option key={item._id} value={item._id}>
                  {item.name} — {item.quantity} units ({item.status})
                </option>
              ))}
            </select>
          </div>

          {/* Region selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Distributor / Region
            </label>
            <select
              value={distributorId}
              onChange={e => setDistributorId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {REGIONS.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Upload zone */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Shelf Photo
            </label>
            <UploadZone preview={preview} onFile={handleFile} onRemove={handleRemove} />
          </div>

          {/* Camera button */}
          {!preview && <CameraButton onFile={handleFile} />}

          {/* Analyze button */}
          <Button
            className="w-full h-10 text-sm font-medium"
            disabled={!canAnalyze}
            onClick={handleAnalyze}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analysing with GPT-4o…
              </>
            ) : (
              <>
                <BarChart2 className="h-4 w-4 mr-2" />
                Analyse Photo
              </>
            )}
          </Button>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* ── Right: Result / placeholder ── */}
        <div>
          <AnimatePresence mode="wait">
            {isAnalyzing && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center gap-4 py-12 text-muted-foreground"
              >
                <div className="relative">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <Camera className="h-4 w-4 absolute inset-0 m-auto text-primary/70" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium">GPT-4o is counting…</p>
                  <p className="text-xs">Analysing shelf layout and identifying units</p>
                </div>
              </motion.div>
            )}

            {!isAnalyzing && result && (
              <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ResultCard result={result} onReset={handleReset} />
              </motion.div>
            )}

            {!isAnalyzing && !result && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground border-2 border-dashed border-border/30 rounded-xl"
              >
                <Camera className="h-10 w-10 text-muted-foreground/30" />
                <div className="text-center space-y-1 max-w-48">
                  <p className="text-sm font-medium">Results appear here</p>
                  <p className="text-xs">
                    Select a product, choose a region, upload a photo and click Analyse
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 text-[11px] mt-3 w-full px-2">
                  <p className="text-muted-foreground/60 font-medium uppercase tracking-wide text-[10px]">Photo tips for best accuracy</p>
                  {[
                    { ok: true,  tip: 'Capture the full shelf — all rows visible' },
                    { ok: true,  tip: 'Shoot straight-on, not at an angle' },
                    { ok: true,  tip: 'Good lighting — avoid harsh shadows' },
                    { ok: true,  tip: 'Product labels/logos facing the camera' },
                    { ok: false, tip: 'Avoid blurry or very dark images' },
                    { ok: false, tip: 'Avoid photos with only 1–2 items visible' },
                  ].map(({ ok, tip }) => (
                    <div key={tip} className="flex items-center gap-1.5">
                      {ok
                        ? <CheckCircle className="h-3 w-3 text-green-400/70 flex-shrink-0" />
                        : <XCircle    className="h-3 w-3 text-red-400/60  flex-shrink-0" />}
                      <span className="text-muted-foreground/60">{tip}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Scan history ── */}
      {history.length > 0 && (
        <div className="pt-4 border-t border-border/30">
          <div className="flex items-center gap-1.5 mb-2">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Recent Scans (this session)
            </p>
          </div>
          <div className="space-y-1">
            {history.map((h, i) => {
              const hcfg = severityConfig[h.severity] ?? severityConfig.unknown;
              const HIcon = hcfg.icon;
              return (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/20 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <HIcon className={`h-3 w-3 flex-shrink-0 ${hcfg.color}`} />
                    <span className="font-medium truncate">{h.productName}</span>
                    <span className="text-muted-foreground">· {h.distributorName}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`font-bold ${hcfg.color}`}>
                      {h.diff !== null ? (h.diff > 0 ? `+${h.diff}` : h.diff) : '—'}
                    </span>
                    <span className="text-muted-foreground/50">{h.at}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
