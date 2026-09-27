import { useState, useCallback, useRef, useMemo } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, IconButton, Grid, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, MenuItem,
  Select, FormControl, InputLabel, InputAdornment, Skeleton, useMediaQuery, useTheme,
} from '@mui/material';
import {
  Search, Edit, Delete, FilterList, Download,
  Close, ReceiptLong, DeleteOutline, EditOutlined,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSwipeable } from 'react-swipeable';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { formatCurrency, formatDate } from '../../lib/formatters';
import FintraxaLogo from '../../components/FintraxaLogo';
import CategoryIcon from '../../lib/categoryIcons';

const INCOME_COLOR = '#059669';
const EXPENSE_COLOR = '#dc2626';

/*  TransactionRow with swipe gestures  */
function TransactionRow({ txn, onEdit, onDelete, onView, isMobile, isDark }) {
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const handlers = useSwipeable({
    onSwiping: (e) => {
      if (!isMobile) return;
      setSwiping(true);
      const clamp = Math.max(-80, Math.min(80, e.deltaX));
      setOffset(clamp);
    },
    onSwipedLeft: () => {
      if (!isMobile) return;
      if (offset < -40) onEdit(txn);
      setOffset(0);
      setTimeout(() => setSwiping(false), 300);
    },
    onSwipedRight: () => {
      if (!isMobile) return;
      if (offset > 40) onDelete(txn.id);
      setOffset(0);
      setTimeout(() => setSwiping(false), 300);
    },
    onTouchEndOrOnMouseUp: () => { setOffset(0); setTimeout(() => setSwiping(false), 300); },
    preventScrollOnSwipe: true,
    trackMouse: false,
  });

  const isCredit = txn.type === 'credit';
  const color = isCredit ? INCOME_COLOR : EXPENSE_COLOR;

  /* Swipe progress 0→1 for each direction */
  const deleteProgress = Math.min(Math.max(offset / 80, 0), 1);
  const editProgress = Math.min(Math.max(-offset / 80, 0), 1);

  return (
    <Box sx={{ position: 'relative', mb: 0.75, overflow: 'hidden', borderRadius: 3 }}>
      {/* Swipe backgrounds (mobile) */}
      {isMobile && (
        <>
          {/* Delete - right swipe - red */}
          <Box sx={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'flex-start', px: 2.5,
            bgcolor: `rgba(220,38,38,${0.08 + deleteProgress * 0.92})`,
            borderRadius: 3,
          }}>
            <DeleteOutline sx={{
              color: '#dc2626',
              fontSize: 22,
              opacity: 0.4 + deleteProgress * 0.6,
              transform: `scale(${0.8 + deleteProgress * 0.2})`,
              transition: swiping ? 'none' : 'all 0.3s ease',
            }} />
          </Box>
          {/* Edit - left swipe - green */}
          <Box sx={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'flex-end', px: 2.5,
            bgcolor: `rgba(5,150,105,${0.06 + editProgress * 0.14})`,
            borderRadius: 3,
          }}>
            <EditOutlined sx={{
              color: '#059669',
              fontSize: 20,
              opacity: 0.4 + editProgress * 0.6,
              transform: `scale(${0.8 + editProgress * 0.2})`,
              transition: swiping ? 'none' : 'all 0.3s ease',
            }} />
          </Box>
        </>
      )}

      {/* Card */}
      <Card {...handlers} onClick={() => isMobile && onView(txn)}
        sx={{
          transform: `translateX(${offset}px)`,
          transition: offset === 0 ? 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
          cursor: isMobile ? 'pointer' : 'default',
          boxShadow: 'none',
        }}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Category Icon */}
          <Box sx={{
            width: 38, height: 38, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            flexShrink: 0,
          }}>
            <CategoryIcon name={txn.categories?.icon} categoryName={txn.categories?.name} sx={{ fontSize: 18, color: isDark ? '#e5e5e5' : '#333', opacity: 0.85 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.2 }} noWrap>
              {txn.categories?.name || 'Uncategorized'}
            </Typography>
            <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.15 }} noWrap>
              {formatDate(txn.date)}{txn.notes ? ' \u00b7 ' + txn.notes : ''}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Typography sx={{
              fontSize: '0.85rem', fontWeight: 700, fontFeatureSettings: '"tnum"', color,
            }} className="currency">
              {isCredit ? '+' : '-'}{formatCurrency(txn.amount)}
            </Typography>
          </Box>
          {/* Desktop action icons */}
          {!isMobile && (
            <Box sx={{ display: 'flex', gap: 0.25, ml: 0.5 }}>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onView(txn); }}
                sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>
                <ReceiptLong sx={{ fontSize: 16 }} />
              </IconButton>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEdit(txn); }}
                sx={{ color: 'text.secondary', '&:hover': { color: '#059669' } }}>
                <Edit sx={{ fontSize: 16 }} />
              </IconButton>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(txn.id); }}
                sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}>
                <Delete sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default function Transactions() {
  const user = useAuthStore((s) => s.user);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const showConfirm = useAppStore((s) => s.showConfirm);
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width:768px)');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const slipRef = useRef(null);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [editTxn, setEditTxn] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [viewTxn, setViewTxn] = useState(null);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['ie-all-transactions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('income_expense_transactions')
        .select('*, categories(name, icon)')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  /* Build category list with icon info for filter dropdown */
  const categoryList = useMemo(() => {
    const map = new Map();
    transactions.forEach((t) => {
      if (t.categories?.name && !map.has(t.categories.name)) {
        map.set(t.categories.name, { name: t.categories.name, icon: t.categories.icon });
      }
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [transactions]);
  const categoryNames = categoryList.map((c) => c.name);

  const filtered = transactions.filter((t) => {
    const q = search.toLowerCase();
    const matchText = !q || t.categories?.name?.toLowerCase().includes(q)
      || t.notes?.toLowerCase().includes(q) || String(t.amount).includes(q);
    const matchType = filterType === 'all' || t.type === filterType;
    const matchCategory = filterCategory === 'all' || t.categories?.name === filterCategory;
    const matchDate = (!dateFrom || t.date >= dateFrom) && (!dateTo || t.date <= dateTo);
    return matchText && matchType && matchCategory && matchDate;
  });

  const activeFilterCount = [filterType !== 'all', filterCategory !== 'all', !!dateFrom, !!dateTo].filter(Boolean).length;

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('income_expense_transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ie-all-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['ie-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['ie-free-cash'] });
      queryClient.invalidateQueries({ queryKey: ['mf-free-cash'] });
      queryClient.invalidateQueries({ queryKey: ['stock-free-cash'] });
      queryClient.invalidateQueries({ queryKey: ['home-ie-txns'] });
      queryClient.invalidateQueries({ queryKey: ['home-ie-txns-all'] });
      showSnackbar('Deleted', 'success');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, amount, notes }) => {
      const { error } = await supabase.from('income_expense_transactions')
        .update({ amount: parseFloat(amount), notes: notes || null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ie-all-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['ie-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['ie-free-cash'] });
      queryClient.invalidateQueries({ queryKey: ['mf-free-cash'] });
      queryClient.invalidateQueries({ queryKey: ['stock-free-cash'] });
      queryClient.invalidateQueries({ queryKey: ['home-ie-txns'] });
      queryClient.invalidateQueries({ queryKey: ['home-ie-txns-all'] });
      setEditTxn(null);
      showSnackbar('Updated', 'success');
    },
  });

  const handleDelete = (id) =>
    showConfirm('Delete Transaction', 'This action cannot be undone. Are you sure?', () => deleteMutation.mutate(id));
  const handleEdit = (txn) => { setEditTxn(txn); setEditAmount(String(txn.amount)); setEditNotes(txn.notes || ''); };

  const downloadSlip = async () => {
    if (!slipRef.current) return;
    try {
      const canvas = await html2canvas(slipRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = 'transaction-' + (viewTxn?.id?.slice(0, 8) || 'receipt') + '.png';
      link.href = canvas.toDataURL();
      link.click();
      showSnackbar('Receipt downloaded', 'success');
    } catch (e) { showSnackbar('Download failed', 'error'); }
  };

  const clearFilters = () => {
    setFilterType('all');
    setFilterCategory('all');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2, letterSpacing: '-0.01em' }}>
        Transactions
      </Typography>

      {/* Search + Filter Toggle */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        <TextField fullWidth size="small" placeholder="Search by category, notes, amount..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>,
          }}
        />
        <IconButton onClick={() => setShowFilters(!showFilters)}
          sx={{
            border: 1, borderColor: showFilters ? (isDark ? '#fff' : '#111') : 'divider',
            borderRadius: 2.5, width: 40, height: 40,
            bgcolor: showFilters ? (isDark ? '#fff' : '#111') : 'transparent',
            color: showFilters ? (isDark ? '#000' : '#fff') : 'text.secondary',
            '&:hover': { bgcolor: showFilters ? (isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)') : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') },
            position: 'relative',
          }}>
          <FilterList sx={{ fontSize: 18 }} />
          {activeFilterCount > 0 && !showFilters && (
            <Box sx={{
              position: 'absolute', top: -4, right: -4, width: 16, height: 16,
              borderRadius: '50%', bgcolor: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff',
              fontSize: '0.55rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {activeFilterCount}
            </Box>
          )}
        </IconButton>
      </Box>

      {/* Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
            <Card sx={{ p: 2, mb: 1.5 }}>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 6, md: 3 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Type</InputLabel>
                    <Select value={filterType} label="Type" onChange={(e) => setFilterType(e.target.value)}>
                      <MenuItem value="all">All</MenuItem>
                      <MenuItem value="credit">Income</MenuItem>
                      <MenuItem value="debit">Expense</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Category</InputLabel>
                    <Select value={filterCategory} label="Category" onChange={(e) => setFilterCategory(e.target.value)}>
                      <MenuItem value="all">All Categories</MenuItem>
                      {categoryList.map((c) => (
                        <MenuItem key={c.name} value={c.name}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CategoryIcon name={c.icon} categoryName={c.name} sx={{ fontSize: 15, color: 'text.secondary', opacity: 0.7 }} />
                            <span>{c.name}</span>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <TextField fullWidth size="small" label="From" type="date" value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <TextField fullWidth size="small" label="To" type="date" value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} />
                </Grid>
              </Grid>
              {activeFilterCount > 0 && (
                <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
                  <Chip label="Clear filters" size="small" onClick={clearFilters}
                    sx={{ fontSize: '0.65rem', height: 24 }} />
                </Box>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 1 }}>
        {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
      </Typography>

      {isLoading ? (
        Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="rounded" height={60} sx={{ mb: 0.75 }} />)
      ) : filtered.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>No transactions found</Typography>
        </Card>
      ) : (
        filtered.map((txn) => (
          <TransactionRow key={txn.id} txn={txn} onEdit={handleEdit} onDelete={handleDelete}
            onView={setViewTxn} isMobile={isMobile} isDark={isDark} />
        ))
      )}

      {/*  View / Receipt Dialog  */}
      <Dialog open={Boolean(viewTxn)} onClose={() => setViewTxn(null)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600, fontSize: '0.9rem' }}>
          Transaction Receipt
          <IconButton onClick={() => setViewTxn(null)} size="small"><Close sx={{ fontSize: 18 }} /></IconButton>
        </DialogTitle>
        <DialogContent>
          {viewTxn && (
            <Box ref={slipRef} sx={{
              p: 3, borderRadius: 3,
              bgcolor: isDark ? '#1a1a1a' : '#fff',
              border: '1px solid',
              borderColor: isDark ? '#2a2a2a' : '#f0f0f0',
            }}>
              {/* Header */}
              <Box sx={{ textAlign: 'center', mb: 2.5, pb: 2, borderBottom: '2px dashed', borderColor: isDark ? '#333' : '#e2e8f0' }}>
                <FintraxaLogo size={28} sx={{ mx: 'auto', mb: 0.5 }} />
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'text.primary' }}>Fintraxa</Typography>
                <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Transaction Receipt
                </Typography>
              </Box>

              {/* Icon + Amount */}
              <Box sx={{ textAlign: 'center', mb: 2.5, py: 1 }}>
                <Box sx={{
                  width: 44, height: 44, borderRadius: '12px', mx: 'auto', mb: 1.5,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: viewTxn.type === 'credit'
                    ? (isDark ? 'rgba(5,150,105,0.15)' : 'rgba(5,150,105,0.08)')
                    : (isDark ? 'rgba(220,38,38,0.15)' : 'rgba(220,38,38,0.08)'),
                }}>
                  <CategoryIcon name={viewTxn.categories?.icon} categoryName={viewTxn.categories?.name}
                    sx={{ fontSize: 22, color: viewTxn.type === 'credit' ? INCOME_COLOR : EXPENSE_COLOR }} />
                </Box>
                <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', mb: 0.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {viewTxn.type === 'credit' ? 'Income' : 'Expense'}
                </Typography>
                <Typography sx={{
                  fontSize: '1.5rem', fontWeight: 800,
                  color: viewTxn.type === 'credit' ? INCOME_COLOR : EXPENSE_COLOR,
                }}>
                  {viewTxn.type === 'credit' ? '+' : '-'}{formatCurrency(viewTxn.amount)}
                </Typography>
              </Box>

              {/* Details rows */}
              {[
                ['Category', viewTxn.categories?.name || 'Uncategorized'],
                ['Date', formatDate(viewTxn.date)],
                ...(viewTxn.notes ? [['Notes', viewTxn.notes]] : []),
              ].map(([k, v]) => (
                <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{k}</Typography>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.primary', maxWidth: 200, textAlign: 'right' }}>
                    {v}
                  </Typography>
                </Box>
              ))}

              {/* Footer */}
              <Box sx={{ mt: 2, pt: 1.5, borderTop: '2px dashed', borderColor: isDark ? '#333' : '#e2e8f0', textAlign: 'center' }}>
                <Typography sx={{ fontSize: '0.52rem', color: 'text.secondary', letterSpacing: '0.04em' }}>
                  ID: {viewTxn.id.slice(0, 8).toUpperCase()}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={downloadSlip} variant="outlined" size="small"
            startIcon={<Download sx={{ fontSize: 16 }} />}
            sx={{ borderRadius: 2, fontSize: '0.75rem', color: isDark ? '#fff' : '#111', borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)', '&:hover': { borderColor: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)', bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' } }}>
            Download
          </Button>
        </DialogActions>
      </Dialog>

      {/*  Edit Dialog  */}
      <Dialog open={Boolean(editTxn)} onClose={() => setEditTxn(null)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 600, fontSize: '0.9rem' }}>Edit Transaction</DialogTitle>
        <DialogContent>
          {editTxn && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, mt: 1, p: 1.5, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.04)' : '#f8f9fa' }}>
              <Box sx={{
                width: 34, height: 34, borderRadius: '10px', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                bgcolor: editTxn.type === 'credit'
                  ? (isDark ? 'rgba(5,150,105,0.12)' : 'rgba(5,150,105,0.08)')
                  : (isDark ? 'rgba(220,38,38,0.12)' : 'rgba(220,38,38,0.08)'),
              }}>
                <CategoryIcon name={editTxn.categories?.icon} categoryName={editTxn.categories?.name}
                  sx={{ fontSize: 16, color: editTxn.type === 'credit' ? INCOME_COLOR : EXPENSE_COLOR }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>{editTxn.categories?.name || 'Uncategorized'}</Typography>
                <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>{formatDate(editTxn.date)}</Typography>
              </Box>
            </Box>
          )}
          <TextField fullWidth label="Amount" type="number" value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)} sx={{ mb: 2 }}
            InputProps={{ startAdornment: <InputAdornment position="start">Rs</InputAdornment> }} />
          <TextField fullWidth label="Notes" value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)} multiline rows={2} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setEditTxn(null)} color="inherit"
            sx={{ flex: 1, fontSize: '0.8rem', borderRadius: 2.5, py: 1.1, fontWeight: 600, bgcolor: isDark ? 'rgba(255,255,255,0.06)' : '#f5f5f5' }}>
            Cancel
          </Button>
          <Button variant="contained" sx={{ flex: 1, fontSize: '0.8rem', borderRadius: 2.5, py: 1.1, fontWeight: 600, bgcolor: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff', '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)' } }} onClick={() =>
            updateMutation.mutate({ id: editTxn.id, amount: editAmount, notes: editNotes })
          }>Save Changes</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
