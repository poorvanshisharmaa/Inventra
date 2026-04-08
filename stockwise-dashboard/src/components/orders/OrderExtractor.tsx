/**
 * OrderExtractor — paste an email / WhatsApp message → AI extracts an order draft.
 *
 * Flow:
 *  1. User pastes raw text (email, WhatsApp, chat)
 *  2. POST /api/orders/extract  → Llama 3.3-70B JSON mode returns structured draft
 *  3. Editable form pre-filled with matched products/quantities/customer
 *  4. User confirms → POST /api/orders  (creates real order)
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, AlertTriangle, CheckCircle2, Loader2,
  Trash2, Plus, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { orderExtractApi, ordersApi, ExtractedOrder, ExtractedOrderItem } from '@/services/api';

// ─── helpers ──────────────────────────────────────────────────────────────────
function newOrderId() {
  return 'ORD-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ─── Editable line item ────────────────────────────────────────────────────────
interface LineItem {
  name:     string;
  qty:      number;
  price:    number;
  sku:      string;
  matched:  boolean;
}

function lineFromExtracted(item: ExtractedOrderItem): LineItem {
  return {
    name:    item.matchedName ?? item.rawName,
    qty:     item.quantity,
    price:   item.matchedPrice ?? 0,
    sku:     item.matchedSku   ?? '',
    matched: !!item.matchedName,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
interface OrderExtractorProps {
  onOrderCreated?: () => void;
}

export function OrderExtractor({ onOrderCreated }: OrderExtractorProps) {
  const [open,     setOpen]     = useState(false);
  const [rawText,  setRawText]  = useState('');
  const [draft,    setDraft]    = useState<ExtractedOrder | null>(null);

  // Editable form state
  const [customer, setCustomer] = useState('');
  const [date,     setDate]     = useState(todayStr());
  const [urgent,   setUrgent]   = useState(false);
  const [items,    setItems]    = useState<LineItem[]>([]);
  const [notes,    setNotes]    = useState('');
  const [success,  setSuccess]  = useState(false);
  const [extractionErr, setExtractionErr] = useState('');

  const queryClient = useQueryClient();

  // ── Extract mutation ─────────────────────────────────────────────────────
  const extractMut = useMutation({
    mutationFn: () => orderExtractApi.extract(rawText),
    onSuccess: ({ data }) => {
      setDraft(data);
      setCustomer(data.customer !== 'Unknown' ? data.customer : '');
      setDate(data.requestedDate ?? todayStr());
      setUrgent(data.isUrgent);
      setNotes(data.notes);
      setItems(data.items.map(lineFromExtracted));
      setExtractionErr('');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setExtractionErr(err?.response?.data?.message ?? 'Extraction failed. Try again.');
    },
  });

  // ── Create order mutation ────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: () => {
      const total = items.reduce((s, i) => s + i.qty * i.price, 0);
      return ordersApi.create({
        orderId:  newOrderId(),
        customer: customer || 'Unknown Customer',
        items:    items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
        total:    +total.toFixed(2),
        status:   urgent ? 'processing' : 'pending',
        progress: urgent ? 10 : 0,
        date,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSuccess(true);
      onOrderCreated?.();
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        setDraft(null);
        setRawText('');
        setItems([]);
      }, 2000);
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setExtractionErr(err?.response?.data?.message ?? 'Failed to create order.');
    },
  });

  // ── Item editing helpers ─────────────────────────────────────────────────
  const updateItem = (i: number, field: keyof LineItem, val: string | number | boolean) =>
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));

  const removeItem = (i: number) =>
    setItems(prev => prev.filter((_, idx) => idx !== i));

  const addItem = () =>
    setItems(prev => [...prev, { name: '', qty: 1, price: 0, sku: '', matched: false }]);

  const total = items.reduce((s, i) => s + i.qty * (i.price || 0), 0);
  const hasUnmatched = items.some(i => !i.matched);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl bg-card border border-border/50 card-shadow overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg gradient-purple flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">AI Order Extractor</p>
            <p className="text-xs text-muted-foreground">Paste an email or WhatsApp message → auto-fill order</p>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40 p-4 space-y-4">

              {success ? (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center justify-center py-8 gap-3"
                >
                  <CheckCircle2 className="h-10 w-10 text-green-400" />
                  <p className="text-sm font-semibold">Order Created!</p>
                  <p className="text-xs text-muted-foreground">The order has been added to the system.</p>
                </motion.div>
              ) : (
                <>
                  {/* Step 1: paste text */}
                  {!draft && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Paste email / WhatsApp / message
                        </label>
                        <textarea
                          value={rawText}
                          onChange={e => setRawText(e.target.value)}
                          placeholder={`E.g.\n\nHi, this is John from TechCorp.\nWe need 10 units of Laptop Pro and 5 Wireless Keyboards urgently.\nPlease deliver by April 15.\n\nThanks`}
                          rows={6}
                          className="w-full rounded-lg bg-muted/40 border border-border/50 px-3 py-2.5 text-sm resize-none
                            focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                        />
                      </div>

                      {extractionErr && (
                        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-destructive">{extractionErr}</p>
                        </div>
                      )}

                      <Button
                        className="w-full gradient-purple text-primary-foreground h-9 text-sm gap-2"
                        onClick={() => extractMut.mutate()}
                        disabled={!rawText.trim() || extractMut.isPending}
                      >
                        {extractMut.isPending ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Extracting…</>
                        ) : (
                          <><Zap className="h-4 w-4" /> Extract Order with AI</>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Step 2: editable draft */}
                  {draft && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      {/* Confidence banner */}
                      {draft.confidence != null && (
                        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs
                          ${draft.confidence > 0.7
                            ? 'bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400'
                            : 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400'
                          }`}>
                          {draft.confidence > 0.7
                            ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                            : <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                          }
                          {draft.confidence > 0.7
                            ? `High confidence (${Math.round(draft.confidence * 100)}%) — review and confirm`
                            : `Low confidence (${Math.round(draft.confidence * 100)}%) — ${draft.extractionNotes}`
                          }
                        </div>
                      )}

                      {hasUnmatched && (
                        <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
                          <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-yellow-600 dark:text-yellow-400">
                            Some products couldn't be matched to inventory. Please review and set a price manually.
                          </p>
                        </div>
                      )}

                      {/* Customer + Date */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Customer</label>
                          <input
                            value={customer}
                            onChange={e => setCustomer(e.target.value)}
                            placeholder="Customer name"
                            className="w-full rounded-lg bg-muted/40 border border-border/50 px-3 py-2 text-sm
                              focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Order Date</label>
                          <input
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="w-full rounded-lg bg-muted/40 border border-border/50 px-3 py-2 text-sm
                              focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                      </div>

                      {/* Urgent flag */}
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <div
                          onClick={() => setUrgent(u => !u)}
                          className={`h-4 w-7 rounded-full transition-colors ${urgent ? 'bg-primary' : 'bg-muted'} relative`}
                        >
                          <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${urgent ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                        </div>
                        <span className="text-xs font-medium">Urgent / Rush Order</span>
                        {urgent && <span className="text-[10px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded font-semibold">URGENT</span>}
                      </label>

                      {/* Line items */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Line Items</label>
                          <button
                            onClick={addItem}
                            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                          >
                            <Plus className="h-3 w-3" /> Add item
                          </button>
                        </div>

                        {/* Header row */}
                        <div className="grid grid-cols-12 gap-2 text-[11px] text-muted-foreground font-medium px-1">
                          <div className="col-span-5">Product</div>
                          <div className="col-span-2 text-center">Qty</div>
                          <div className="col-span-3 text-right">Price ($)</div>
                          <div className="col-span-2" />
                        </div>

                        <AnimatePresence>
                          {items.map((item, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 8 }}
                              className={`grid grid-cols-12 gap-2 items-center rounded-lg p-2
                                ${item.matched ? 'bg-green-500/5 border border-green-500/15' : 'bg-muted/30 border border-border/30'}`}
                            >
                              <div className="col-span-5">
                                <input
                                  value={item.name}
                                  onChange={e => updateItem(idx, 'name', e.target.value)}
                                  placeholder="Product name"
                                  className="w-full bg-transparent text-xs focus:outline-none"
                                />
                                {item.sku && (
                                  <p className="text-[10px] text-muted-foreground">{item.sku}</p>
                                )}
                              </div>
                              <div className="col-span-2">
                                <input
                                  type="number"
                                  min={1}
                                  value={item.qty}
                                  onChange={e => updateItem(idx, 'qty', parseInt(e.target.value) || 1)}
                                  className="w-full bg-transparent text-xs text-center focus:outline-none"
                                />
                              </div>
                              <div className="col-span-3">
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={item.price}
                                  onChange={e => updateItem(idx, 'price', parseFloat(e.target.value) || 0)}
                                  className="w-full bg-transparent text-xs text-right focus:outline-none"
                                />
                              </div>
                              <div className="col-span-2 flex justify-end">
                                <button
                                  onClick={() => removeItem(idx)}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>

                        {items.length === 0 && (
                          <div className="text-xs text-muted-foreground text-center py-3">
                            No items. Click "Add item" to add one manually.
                          </div>
                        )}
                      </div>

                      {/* Notes */}
                      {notes && (
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">AI Notes</label>
                          <p className="text-xs bg-muted/30 rounded-lg p-2.5 text-muted-foreground">{notes}</p>
                        </div>
                      )}

                      {/* Total */}
                      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2.5">
                        <span className="text-sm font-medium">Estimated Total</span>
                        <span className="text-sm font-bold">${total.toFixed(2)}</span>
                      </div>

                      {extractionErr && (
                        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-destructive">{extractionErr}</p>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs h-9"
                          onClick={() => { setDraft(null); setExtractionErr(''); }}
                        >
                          ← Re-paste
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 gradient-purple text-primary-foreground text-xs h-9 gap-1.5"
                          onClick={() => createMut.mutate()}
                          disabled={createMut.isPending || items.length === 0}
                        >
                          {createMut.isPending ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…</>
                          ) : (
                            <><CheckCircle2 className="h-3.5 w-3.5" /> Confirm &amp; Create Order</>
                          )}
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
