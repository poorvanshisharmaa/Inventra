import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowUpDown, Package, Edit2, Check, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, InventoryItem } from '@/services/api';
import { useToast } from '@/components/ui/use-toast';

type SortKey = 'name' | 'quantity' | 'price';
type SortDir = 'asc' | 'desc';

export default function Inventory() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(0);

  // Add Product modal state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', sku: '', category: '', quantity: 0, reorderLevel: 10, price: 0 });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => inventoryApi.getAll().then(r => r.data),
  });

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

  const categories = useMemo(() => [...new Set(items.map(i => i.category))], [items]);

  const filtered = useMemo(() => {
    let result = items.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) || item.sku.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchSearch && matchCategory && matchStatus;
    });
    result = [...result].sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name') return a.name.localeCompare(b.name) * mul;
      return ((a[sortKey] as number) - (b[sortKey] as number)) * mul;
    });
    return result;
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground text-sm mt-1">{items.length} products tracked</p>
        </div>
        {isAdmin && (
          <Button
            className="gradient-purple text-primary-foreground hover:opacity-90 transition-opacity"
            onClick={() => setShowAddForm(v => !v)}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Product
          </Button>
        )}
      </div>

      {/* Add Product form */}
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
              {(['name', 'sku', 'category'] as const).map(field => (
                <div key={field} className="space-y-1">
                  <label className="text-xs font-medium capitalize">{field}</label>
                  <Input
                    placeholder={field}
                    value={newItem[field]}
                    onChange={e => setNewItem(p => ({ ...p, [field]: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
              {(['quantity', 'reorderLevel', 'price'] as const).map(field => (
                <div key={field} className="space-y-1">
                  <label className="text-xs font-medium capitalize">{field === 'reorderLevel' ? 'Reorder Level' : field}</label>
                  <Input
                    type="number"
                    value={newItem[field]}
                    onChange={e => setNewItem(p => ({ ...p, [field]: Number(e.target.value) }))}
                    className="h-8 text-sm"
                  />
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
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="rounded-xl bg-card border border-border/50 overflow-hidden card-shadow">
        {isLoading ? (
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
                  {isAdmin && <th className="text-left text-xs font-medium text-muted-foreground p-4"></th>}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filtered.map((item, i) => (
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
                              <div
                                className={`h-full rounded-full transition-all ${item.status === 'healthy' ? 'bg-success' : item.status === 'medium' ? 'bg-warning' : 'bg-destructive'}`}
                                style={{ width: `${stockBarWidth(item.quantity, 350)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      {isAdmin && <td className="p-4 text-sm font-medium">${item.price.toFixed(2)}</td>}
                      <td className="p-4"><StatusBadge status={item.status} /></td>
                      <td className="p-4 text-xs text-muted-foreground">
                        {new Date(item.updatedAt).toLocaleDateString()}
                      </td>
                      {isAdmin && (
                        <td className="p-4">
                          {editingId === item._id ? (
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEdit(item._id)} disabled={updateMutation.isPending}><Check className="h-3 w-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                            </div>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => startEdit(item)}>
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          )}
                        </td>
                      )}
                    </motion.tr>
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
