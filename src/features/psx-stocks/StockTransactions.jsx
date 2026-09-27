import { useState, useRef, useMemo } from 'react';
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
import { formatCurrency, formatDate, formatNumber } from '../../lib/formatters';
import FintraxaLogo from '../../components/FintraxaLogo';
import StockLogo from '../../components/StockLogo';
import { getStockName } from '../../lib/stockMeta';

const BUY_COLOR = '#15803d';
const SELL_COLOR = '#b91c1c';

/* TransactionRow with swipe gestures — mirrors Finance Transactions */
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

  const isBuy = txn.type === 'buy';
  const color = isBuy ? BUY_COLOR : SELL_COLOR;
  const amount = Number(txn.price) * Number(txn.quantity);

  const deleteProgress = Math.min(Math.max(offset / 80, 0), 1);
  const editProgress = Math.min(Math.max(-offset / 80, 0), 1);

  return (
    <Box sx={{ position: 'relative', mb: 0.5, overflow: 'hidden', borderRadius: 3 }}>
      {/* Swipe backgrounds (mobile) */}
      {isMobile && (
        <>
          <Box sx={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'flex-start', px: 2.5,
            bgcolor: `rgba(220,38,38,${0.08 + deleteProgress * 0.92})`, borderRadius: 3,
          }}>
            <DeleteOutline sx={{
              color: '#dc2626', fontSize: 22,
              opacity: 0.4 + deleteProgress * 0.6,
              transform: `scale(${0.8 + deleteProgress * 0.2})`,
              transition: swiping ? 'none' : 'all 0.3s ease',
            }} />
          </Box>
          <Box sx={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'flex-end', px: 2.5,
            bgcolor: `rgba(5,150,105,${0.06 + editProgress * 0.14})`, borderRadius: 3,
          }}>
            <EditOutlined sx={{
              color: '#059669', fontSize: 20,
              opacity: 0.4 + editProgress * 0.6,
              transform: `scale(${0.8 + editProgress * 0.2})`,
              transition: swiping ? 'none' : 'all 0.3s ease',
            }} />
          </Box>
        </>
      )}

      <Card {...handlers} onClick={() => isMobile && onView(txn)}
        sx={{
          transform: `translateX(${offset}px)`,
          transition: offset === 0 ? 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
          cursor: isMobile ? 'pointer' : 'default',
          boxShadow: 'none',
        }}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <StockLogo symbol={txn.symbol} size="sm" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.2 }} noWrap>
                {txn.symbol}
              </Typography>
              <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', lineHeight: 1.2 }} noWrap>
                {getStockName(txn.symbol, txn.company_name)}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.15 }} noWrap>
              {formatDate(txn.date)} · {formatNumber(txn.quantity, 2)} @ {formatNumber(txn.price, 2)}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, fontFeatureSettings: '"tnum"', color }} className="currency">
              {isBuy ? '-' : '+'}{formatCurrency(amount)}
            </Typography>
            <Chip label={isBuy ? 'BUY' : 'SELL'} size="small"
              sx={{ fontSize: '0.52rem', height: 18, fontWeight: 700, bgcolor: `${color}14`, color, mt: 0.25 }} />
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

export default function StockTransactions() {
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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [editTxn, setEditTxn] = useState(null);
  const [editPrice, setEditPrice] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editFee, setEditFee] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [viewTxn, setViewTxn] = useState(null);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['stock-transactions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_transactions').select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  /* ── Unique symbols for search helper ── */
  const symbolList = useMemo(() => {
    return [...new Set(transactions.map((t) => t.symbol?.toUpperCase()))].sort();
  }, [transactions]);

  const filtered = transactions.filter((t) => {
    const q = search.toLowerCase();
    const matchText = !q || t.symbol?.toLowerCase().includes(q)
      || t.company_name?.toLowerCase().includes(q) || String(t.price).includes(q);
    const matchType = filterType === 'all' || t.type === filterType;
    const matchDate = (!dateFrom || t.date >= dateFrom) && (!dateTo || t.date <= dateTo);
    return matchText && matchType && matchDate;
  });

  const activeFilterCount = [filterType !== 'all', !!dateFrom, !!dateTo].filter(Boolean).length;

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('stock_transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stock-free-cash'] });
      queryClient.invalidateQueries({ queryKey: ['home-st-txns'] });
      showSnackbar('Deleted', 'success');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, price, quantity, fee }) => {
      const { error } = await supabase.from('stock_transactions')
        .update({ price: parseFloat(price), quantity: parseFloat(quantity), fee: parseFloat(fee) || 0 }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stock-free-cash'] });
      queryClient.invalidateQueries({ queryKey: ['home-st-txns'] });
      setEditTxn(null);
      showSnackbar('Updated', 'success');
    },
  });

  const handleDelete = (id) =>
    showConfirm('Delete Trade', 'This action cannot be undone. Are you sure?', () => deleteMutation.mutate(id));
  const handleEdit = (txn) => {
    setEditTxn(txn);
    setEditPrice(String(txn.price));
    setEditQty(String(txn.quantity));
    setEditFee(String(txn.fee || 0));
    setEditNotes(txn.notes || '');
  };

  const downloadSlip = async () => {
    if (!slipRef.current) return;
    try {
      const canvas = await html2canvas(slipRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = 'trade-' + (viewTxn?.id?.slice(0, 8) || 'receipt') + '.png';
      link.href = canvas.toDataURL();
      link.click();
      showSnackbar('Receipt downloaded', 'success');
    } catch (e) { showSnackbar('Download failed', 'error'); }
  };

  const clearFilters = () => {
    setFilterType('all');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <Box sx={{ pb: isMobile ? 1 : 0 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 1.5, letterSpacing: '-0.01em', fontSize: isMobile ? '1.2rem' : undefined }}>
        Trades
      </Typography>

      {/* Search + Filter Toggle */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        <TextField fullWidth size="small" placeholder="Search by symbol, company, price..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> }}
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
                <Grid size={{ xs: 6, md: 4 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Type</InputLabel>
                    <Select value={filterType} label="Type" onChange={(e) => setFilterType(e.target.value)}>
                      <MenuItem value="all">All</MenuItem>
                      <MenuItem value="buy">Buy</MenuItem>
                      <MenuItem value="sell">Sell</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6, md: 4 }}>
                  <TextField fullWidth size="small" label="From" type="date" value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid size={{ xs: 6, md: 4 }}>
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
        {filtered.length} trade{filtered.length !== 1 ? 's' : ''}
      </Typography>

      {isLoading ? (
        Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="rounded" height={60} sx={{ mb: 0.75 }} />)
      ) : filtered.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>No trades found</Typography>
        </Card>
      ) : (
        filtered.map((txn) => (
          <TransactionRow key={txn.id} txn={txn} onEdit={handleEdit} onDelete={handleDelete}
            onView={setViewTxn} isMobile={isMobile} isDark={isDark} />
        ))
      )}

      {/* View / Receipt Dialog */}
      <Dialog open={Boolean(viewTxn)} onClose={() => setViewTxn(null)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600, fontSize: '0.9rem' }}>
          Trade Receipt
          <IconButton onClick={() => setViewTxn(null)} size="small"><Close sx={{ fontSize: 18 }} /></IconButton>
        </DialogTitle>
        <DialogContent>
          {viewTxn && (() => {
            const isBuy = viewTxn.type === 'buy';
            const accentColor = isBuy ? BUY_COLOR : SELL_COLOR;
            const subtotal = Number(viewTxn.price) * Number(viewTxn.quantity);
            const fee = Number(viewTxn.fee || 0);
            const total = isBuy ? subtotal + fee : subtotal - fee;
            return (
              <Box ref={slipRef} sx={{
                borderRadius: 3, overflow: 'hidden',
                bgcolor: isDark ? '#111' : '#fff',
                border: '1px solid', borderColor: isDark ? '#222' : '#eee',
              }}>
                {/* Accent top strip */}
                <Box sx={{ height: 4, bgcolor: accentColor }} />

                {/* Header: Fintraxa branding */}
                <Box sx={{ px: 2.5, pt: 2, pb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <FintraxaLogo size={22} />
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 700 }}>Fintraxa</Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.5rem', color: 'text.secondary', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                    Trade Receipt
                  </Typography>
                </Box>

                {/* Hero: Stock logo + symbol + amount side-by-side */}
                <Box sx={{
                  mx: 2.5, mb: 2, p: 2, borderRadius: 2.5,
                  bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  display: 'flex', alignItems: 'center', gap: 1.5,
                }}>
                  <StockLogo symbol={viewTxn.symbol} size="lg" />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.15 }}>
                      <Typography sx={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.01em' }}>{viewTxn.symbol}</Typography>
                      <Chip label={isBuy ? 'BUY' : 'SELL'} size="small" sx={{
                        height: 18, fontSize: '0.5rem', fontWeight: 700,
                        bgcolor: `${accentColor}14`, color: accentColor,
                      }} />
                    </Box>
                    <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }} noWrap>
                      {getStockName(viewTxn.symbol, viewTxn.company_name)}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: accentColor, fontFeatureSettings: '"tnum"', lineHeight: 1.1 }}>
                      {formatCurrency(total)}
                    </Typography>
                    <Typography sx={{ fontSize: '0.5rem', color: 'text.secondary', mt: 0.15 }}>
                      {isBuy ? 'Total Cost' : 'Net Received'}
                    </Typography>
                  </Box>
                </Box>

                {/* Detail rows */}
                <Box sx={{ px: 2.5, pb: 1 }}>
                  {[
                    { label: 'Quantity', value: `${formatNumber(viewTxn.quantity, 2)} shares` },
                    { label: 'Price per share', value: `Rs ${formatNumber(viewTxn.price, 2)}` },
                    { label: 'Subtotal', value: `Rs ${formatNumber(subtotal, 2)}` },
                    { label: 'Broker Fee', value: `${isBuy ? '+' : '−'}Rs ${formatNumber(fee, 2)}` },
                  ].map((row) => (
                    <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.6, borderBottom: '1px solid', borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}>
                      <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>{row.label}</Typography>
                      <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{row.value}</Typography>
                    </Box>
                  ))}
                  {/* Total row */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.8, mt: 0.25 }}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700 }}>{isBuy ? 'Total Cost' : 'Net Received'}</Typography>
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: accentColor, fontFeatureSettings: '"tnum"' }}>Rs {formatNumber(total, 2)}</Typography>
                  </Box>
                </Box>

                {/* Footer */}
                <Box sx={{
                  mx: 2.5, mb: 2, mt: 1, pt: 1.5,
                  borderTop: '1.5px dashed', borderColor: isDark ? '#2a2a2a' : '#e5e5e5',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <Typography sx={{ fontSize: '0.5rem', color: 'text.secondary' }}>
                    {formatDate(viewTxn.date)}
                  </Typography>
                  <Typography sx={{ fontSize: '0.5rem', color: 'text.secondary', letterSpacing: '0.03em' }}>
                    ID: {viewTxn.id.slice(0, 8).toUpperCase()}
                  </Typography>
                </Box>
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={downloadSlip} variant="outlined" size="small"
            startIcon={<Download sx={{ fontSize: 16 }} />}
            sx={{
              borderRadius: 2, fontSize: '0.75rem',
              color: isDark ? '#fff' : '#111',
              borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
              '&:hover': { borderColor: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)', bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' },
            }}>
            Download
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={Boolean(editTxn)} onClose={() => setEditTxn(null)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 600, fontSize: '0.9rem' }}>Edit Trade</DialogTitle>
        <DialogContent>
          {editTxn && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, mt: 1, p: 1.5, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.04)' : '#f8f9fa' }}>
              <Box>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>{editTxn.symbol}</Typography>
                <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>{formatDate(editTxn.date)} · {editTxn.type?.toUpperCase()}</Typography>
              </Box>
            </Box>
          )}
          <TextField fullWidth label="Price" type="number" value={editPrice}
            onChange={(e) => setEditPrice(e.target.value)} sx={{ mb: 2 }}
            InputProps={{ startAdornment: <InputAdornment position="start">Rs</InputAdornment> }} />
          <TextField fullWidth label="Quantity" type="number" value={editQty}
            onChange={(e) => setEditQty(e.target.value)} sx={{ mb: 2 }}
            inputProps={{ step: '0.01' }} />
          <TextField fullWidth label="Broker Fee" type="number" value={editFee}
            onChange={(e) => setEditFee(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start">Rs</InputAdornment> }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setEditTxn(null)} color="inherit"
            sx={{ flex: 1, fontSize: '0.8rem', borderRadius: 2.5, py: 1.1, fontWeight: 600, bgcolor: isDark ? 'rgba(255,255,255,0.06)' : '#f5f5f5' }}>
            Cancel
          </Button>
          <Button variant="contained"
            sx={{ flex: 1, fontSize: '0.8rem', borderRadius: 2.5, py: 1.1, fontWeight: 600, bgcolor: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff', '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)' } }}
            onClick={() => updateMutation.mutate({ id: editTxn.id, price: editPrice, quantity: editQty, fee: editFee })}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
