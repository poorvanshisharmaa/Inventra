import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowUpDown, Package, Edit2, Check, X, Plus, SendHorizonal, ClipboardList, RefreshCw } from 'lucide-react';
import { QueryError } from '@/components/ErrorBoundary';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, restockApi, InventoryItem, RestockRequest } from '@/services/api';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

type SortKey = 'name' | 'quantity' | 'price';
type SortDir = 'asc' | 'desc';

/** Auto-generate a SKU from product name: e.g. "Wireless Keyboard" → "WK-384" */
function generateSKU(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(w => w[0].toUpperCase())
    .join('');
  const num = String(Math.floor(Math.random() * 900) + 100);
  return `${initials || 'PR'}-${num}`;
}

const REQUEST_STATUS_STYLE: Record<RestockRequest['status'], string> = {
  pending:   'bg-warning/10 text-warning',
  approved:  'bg-info/10 text-info',
  rejected:  'bg-destructive/10 text-destructive',
  fulfilled: 'bg-success/10 text-success',
};

export default function Inventory() {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', sku: '', category: '', quantity: 0, reorderLevel: 10, price: 0 });
  const [skuManual, setSkuManual] = useState(false);

  // Restock request state (distributor)
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [requestQty, setRequestQty] = useState(1);
  const [requestNotes, setRequestNotes] = useState('');
  const [requestFulfillment, setRequestFulfillment] = useState<'central' | 'transfer'>('central');

  // Admin restock panel
  const [showRequests, setShowRequests] = useState(false);
  const [adminNote, setAdminNote] = useState<Record<string, string>>({});
  const [approvedQty, setApprovedQty] = useState<Record<string, number>>({});

  const { data: items = [], isLoading, isError: invError, refetch: refetchInv } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => inventoryApi.getAll().then(r => r.data),
    staleTime: 60_000,
  });

  const { data: restockRequests = [] } = useQuery({
    queryKey: ['restock-requests'],
    queryFn: () => restockApi.getAll().then(r => r.data),
  });

  const pendingRequestCount = restockRequests.filter(r => r.status === 'pending').length;

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InventoryItem> }) => inventoryApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); setEditingId(null); },
    onError: () => toast({ title: 'Update failed', variant: 'destructive' }),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof newItem) => inventoryApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setShowAddForm(false);
      setNewItem({ name: '', sku: '', category: '', quantity: 0, reorderLevel: 10, price: 0 });
      toast({ title: 'Product added' });
    },
    onError: () => toast({ title: 'Failed to add product', variant: 'destructive' }),
  });

  const raiseRequestMutation = useMutation({
    mutationFn: ({ productId, qty, notes, fulfillmentType }: { productId: string; qty: number; notes: string; fulfillmentType: 'central' | 'transfer' }) =>
      restockApi.create({ productId, requestedQty: qty, notes, fulfillmentType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restock-requests'] });
      setRequestingId(null);
      setRequestQty(1);
      setRequestNotes('');
      toast({ title: 'Restock request submitted', description: 'Admin will review your request.' });
    },
    onError: () => toast({ title: 'Failed to submit request', variant: 'destructive' }),
  });

  const updateRequestMutation = useMutation({
    mutationFn: ({ id, status, note, qty }: { id: string; status: RestockRequest['status']; note?: string; qty?: number }) =>
      restockApi.update(id, { status, adminNote: note, approvedQty: qty }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restock-requests'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: () => toast({ title: 'Action failed', variant: 'destructive' }),
  });

  const categories = useMemo(() => [...new Set(items.map(i => i.category))], [items]);

  const filtered = useMemo(() => {
    let result = items.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) || item.sku.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchSearch && matchCategory && matchStatus;
    });
    return [...result].sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name') return a.name.localeCompare(b.name) * mul;
      return ((a[sortKey] as number) - (b[sortKey] as number)) * mul;
    });
  }, [items, search, categoryFilter, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const startEdit = (item: InventoryItem) => { setEditingId(item._id); setEditQty(item.quantity); };
  const saveEdit = (id: string) => updateMutation.mutate({ id, data: { quantity: editQty } });
  const stockBarWidth = (qty: number, max: number) => Math.min((qty / max) * 100, 100);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground text-sm mt-1">{items.length} products tracked</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRequests(v => !v)}
                className="relative"
              >
                <ClipboardList className="h-4 w-4 mr-2" />
                Restock Requests
                {pendingRequestCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-[10px] text-white flex items-center justify-center font-bold">
                    {pendingRequestCount}
                  </span>
                )}
              </Button>
              <Button
                className="gradient-purple text-primary-foreground hover:opacity-90 transition-opacity"
                onClick={() => setShowAddForm(v => !v)}
              >
                <Plus className="h-4 w-4 mr-2" /> Add Product
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Admin: Add Product form */}
      <AnimatePresence>
        {showAddForm && isAdmin && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl bg-card border border-border/50 p-5 card-shadow overflow-hidden"
          >
            <h3 className="text-sm font-semibold mb-4">New Product</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* Name — triggers SKU auto-generation */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Name</label>
                <Input placeholder="Product name" value={newItem.name} className="h-8 text-sm"
                  onChange={e => {
                    const name = e.target.value;
                    setNewItem(p => ({ ...p, name, sku: skuManual ? p.sku : generateSKU(name) }));
                  }} />
              </div>
              {/* SKU — auto-generated, refresh or edit manually */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium">SKU <span className="text-muted-foreground font-normal">(auto)</span></label>
                  {!skuManual && <span className="text-[10px] text-primary cursor-pointer hover:underline" onClick={() => setSkuManual(true)}>edit</span>}
                </div>
                <div className="relative">
                  <Input placeholder="Auto-generated" value={newItem.sku} readOnly={!skuManual}
                    onChange={e => setNewItem(p => ({ ...p, sku: e.target.value }))}
                    className={cn('h-8 text-sm font-mono pr-7', !skuManual && 'bg-muted/40 cursor-default')} />
                  {!skuManual && (
                    <button type="button" title="Regenerate SKU"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setNewItem(p => ({ ...p, sku: generateSKU(p.name) }))}>
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              {/* Category */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Category</label>
                <Input placeholder="e.g. Electronics" value={newItem.category} className="h-8 text-sm"
                  onChange={e => setNewItem(p => ({ ...p, category: e.target.value }))} />
              </div>
              {(['quantity', 'reorderLevel', 'price'] as const).map(field => (
                <div key={field} className="space-y-1">
                  <label className="text-xs font-medium capitalize">{field === 'reorderLevel' ? 'Reorder Level' : field}</label>
                  <Input type="number" value={newItem[field]}
                    onChange={e => setNewItem(p => ({ ...p, [field]: Number(e.target.value) }))} className="h-8 text-sm" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Button size="sm" onClick={() => createMutation.mutate(newItem)} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Adding…' : 'Add Product'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin: Restock Requests Panel */}
      <AnimatePresence>
        {showRequests && isAdmin && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl bg-card border border-border/50 card-shadow overflow-hidden"
          >
            <div className="p-5 border-b border-border/50">
              <h3 className="text-sm font-semibold">Restock Requests from Distributors</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{restockRequests.length} total · {pendingRequestCount} pending</p>
            </div>
            <div className="divide-y divide-border/30">
              {restockRequests.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No restock requests yet</p>
              )}
              {restockRequests.map(req => (
                <div key={req._id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{req.productName}</span>
                        <span className="text-xs font-mono text-muted-foreground">{req.sku}</span>
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', REQUEST_STATUS_STYLE[req.status])}>
                          {req.status}
                        </span>
                        {req.fulfillmentType === 'transfer' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            Cross-distribution
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        From <strong>{req.distributorName}</strong> · Current stock: {req.currentStock} · Requested: {req.requestedQty} units
                      </p>
                      {req.notes && <p className="text-xs text-muted-foreground italic mt-0.5">"{req.notes}"</p>}
                      {req.sourceDistributor && (
                        <p className="text-xs text-primary mt-0.5">Transfer from: {req.sourceDistributor}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Admin actions for pending requests */}
                  {req.status === 'pending' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        type="number"
                        placeholder={`Qty (requested: ${req.requestedQty})`}
                        className="h-7 w-40 text-xs"
                        value={approvedQty[req._id] ?? req.requestedQty}
                        onChange={e => setApprovedQty(p => ({ ...p, [req._id]: Number(e.target.value) }))}
                      />
                      <Input
                        placeholder="Admin note (optional)"
                        className="h-7 flex-1 min-w-32 text-xs"
                        value={adminNote[req._id] ?? ''}
                        onChange={e => setAdminNote(p => ({ ...p, [req._id]: e.target.value }))}
                      />
                      <Button size="sm" className="h-7 text-xs gradient-purple text-primary-foreground border-0 hover:opacity-90"
                        onClick={() => updateRequestMutation.mutate({ id: req._id, status: 'fulfilled', note: adminNote[req._id], qty: approvedQty[req._id] ?? req.requestedQty })}>
                        Fulfill
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => updateRequestMutation.mutate({ id: req._id, status: 'approved', note: adminNote[req._id], qty: approvedQty[req._id] ?? req.requestedQty })}>
                        Approve
                      </Button>
                      <Button size="sm" variant="destructive" className="h-7 text-xs"
                        onClick={() => updateRequestMutation.mutate({ id: req._id, status: 'rejected', note: adminNote[req._id] })}>
                        Reject
                      </Button>
                    </div>
                  )}

                  {/* Approved but not yet fulfilled */}
                  {req.status === 'approved' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Approved qty: {req.approvedQty ?? req.requestedQty}</span>
                      <Button size="sm" className="h-7 text-xs gradient-purple text-primary-foreground border-0 hover:opacity-90"
                        onClick={() => updateRequestMutation.mutate({ id: req._id, status: 'fulfilled', qty: req.approvedQty ?? req.requestedQty })}>
                        Mark Fulfilled
                      </Button>
                    </div>
                  )}

                  {req.adminNote && (
                    <p className="text-xs text-muted-foreground">Admin note: {req.adminNote}</p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Distributor: My Requests summary */}
      {!isAdmin && restockRequests.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-xl bg-card border border-border/50 p-4 card-shadow">
          <h3 className="text-sm font-semibold mb-3">My Restock Requests</h3>
          <div className="space-y-2">
            {restockRequests.slice(0, 5).map(req => (
              <div key={req._id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/30">
                <div className="min-w-0">
                  <span className="font-medium truncate">{req.productName}</span>
                  <span className="text-xs text-muted-foreground ml-2">×{req.requestedQty}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {req.fulfillmentType === 'transfer' && (
                    <span className="text-xs text-primary">cross-dist</span>
                  )}
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', REQUEST_STATUS_STYLE[req.status])}>
                    {req.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search products or SKU..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low Stock</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="rounded-xl bg-card border border-border/50 overflow-hidden card-shadow">
        {invError ? (
          <QueryError message="Could not load inventory data." onRetry={refetchInv} />
        ) : isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mr-3" />
            Loading inventory…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left text-xs font-medium text-muted-foreground p-4 cursor-pointer select-none" onClick={() => toggleSort('name')}>
                    <span className="flex items-center gap-1">Product <ArrowUpDown className="h-3 w-3" /></span>
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">SKU</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Category</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4 cursor-pointer select-none" onClick={() => toggleSort('quantity')}>
                    <span className="flex items-center gap-1">Stock <ArrowUpDown className="h-3 w-3" /></span>
                  </th>
                  {isAdmin && (
                    <th className="text-left text-xs font-medium text-muted-foreground p-4 cursor-pointer select-none" onClick={() => toggleSort('price')}>
                      <span className="flex items-center gap-1">Price <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                  )}
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Status</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Updated</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4"></th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filtered.map((item, i) => (
                    <>
                      <motion.tr
                        key={item._id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className="border-b border-border/30 hover:bg-muted/20 transition-colors group"
                      >
                        <td className="p-4"><span className="text-sm font-medium">{item.name}</span></td>
                        <td className="p-4 text-sm text-muted-foreground font-mono">{item.sku}</td>
                        <td className="p-4 text-sm text-muted-foreground">{item.category}</td>
                        <td className="p-4">
                          {editingId === item._id ? (
                            <Input type="number" value={editQty} onChange={e => setEditQty(Number(e.target.value))} className="w-20 h-7 text-sm" />
                          ) : (
                            <div className="space-y-1">
                              <span className="text-sm font-medium">{item.quantity}</span>
                              <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${item.status === 'healthy' ? 'bg-success' : item.status === 'medium' ? 'bg-warning' : 'bg-destructive'}`}
                                  style={{ width: `${stockBarWidth(item.quantity, 350)}%` }} />
                              </div>
                            </div>
                          )}
                        </td>
                        {isAdmin && <td className="p-4 text-sm font-medium">${item.price.toFixed(2)}</td>}
                        <td className="p-4"><StatusBadge status={item.status} /></td>
                        <td className="p-4 text-xs text-muted-foreground">{new Date(item.updatedAt).toLocaleDateString()}</td>
                        <td className="p-4">
                          {isAdmin ? (
                            editingId === item._id ? (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEdit(item._id)} disabled={updateMutation.isPending}><Check className="h-3 w-3" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                              </div>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => startEdit(item)}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            )
                          ) : (
                            /* Distributor: Request Restock button */
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary"
                              onClick={() => { setRequestingId(requestingId === item._id ? null : item._id); setRequestQty(item.reorderLevel); }}
                            >
                              <SendHorizonal className="h-3 w-3 mr-1" /> Request
                            </Button>
                          )}
                        </td>
                      </motion.tr>

                      {/* Inline request form for distributor */}
                      {!isAdmin && requestingId === item._id && (
                        <tr key={`${item._id}-form`} className="border-b border-border/30 bg-muted/10">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="flex flex-wrap items-end gap-3">
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Quantity needed</label>
                                <Input type="number" value={requestQty} onChange={e => setRequestQty(Number(e.target.value))} className="h-7 w-24 text-sm" min={1} />
                              </div>
                              <div className="space-y-1 flex-1 min-w-40">
                                <label className="text-xs text-muted-foreground">Notes (optional)</label>
                                <Input value={requestNotes} onChange={e => setRequestNotes(e.target.value)} placeholder="e.g. urgent, event this weekend" className="h-7 text-sm" />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Fulfillment type</label>
                                <Select value={requestFulfillment} onValueChange={(v) => setRequestFulfillment(v as 'central' | 'transfer')}>
                                  <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="central">Central Warehouse</SelectItem>
                                    <SelectItem value="transfer">Cross-Distribution</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" className="h-7 text-xs gradient-purple text-primary-foreground border-0 hover:opacity-90"
                                  disabled={raiseRequestMutation.isPending}
                                  onClick={() => raiseRequestMutation.mutate({ productId: item._id, qty: requestQty, notes: requestNotes, fulfillmentType: requestFulfillment })}>
                                  {raiseRequestMutation.isPending ? 'Sending…' : 'Submit Request'}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setRequestingId(null)}>Cancel</Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">No products found</p>
            <p className="text-xs mt-1">Try adjusting your search or filters</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
