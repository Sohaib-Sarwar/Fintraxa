import { useState, useMemo } from 'react';
import {
  Box, TextField, Button, Typography, Card, CardContent,
  Select, FormControl, InputLabel, InputAdornment, MenuItem,
  Grid, Alert, useTheme, useMediaQuery, Dialog, DialogTitle,
  DialogContent, DialogActions, ListItemIcon, ListItemText, IconButton,
} from '@mui/material';
import {
  ArrowDownward, ArrowUpward,
  AccountBalanceWallet, ReceiptLong,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../lib/formatters';
import { format } from 'date-fns';
import CategoryIcon, { DEFAULT_CATEGORIES } from '../../lib/categoryIcons';

export default function AddTransaction() {
  const user = useAuthStore((s) => s.user);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery('(max-width:768px)');

  const [type, setType] = useState('debit');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('categories').select('*').eq('user_id', user.id).order('name');
      if (error) throw error;

      /* Seed missing default categories (upsert with ignoreDuplicates to prevent dupes) */
      const existingNames = new Set(data.map((c) => c.name.toLowerCase()));
      const missing = DEFAULT_CATEGORIES.filter((c) => !existingNames.has(c.name.toLowerCase()));
      if (missing.length > 0) {
        const rows = missing.map((c) => ({ ...c, user_id: user.id, is_default: true }));
        const { data: seeded, error: seedErr } = await supabase
          .from('categories').upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true }).select();
        if (!seedErr && seeded?.length) {
          return [...data, ...seeded].sort((a, b) => a.name.localeCompare(b.name));
        }
      }
      return data;
    },
    enabled: !!user?.id,
  });

  const filteredCategories = useMemo(() =>
    categories.filter((c) => {
      if (type === 'debit') return c.type === 'expense' || c.type === 'debit';
      if (type === 'credit') return c.type === 'income' || c.type === 'credit';
      return true;
    }), [categories, type]);

  const selectedCat = categories.find((c) => c.id === categoryId);
  const isInvestmentCat = selectedCat?.name?.startsWith('Investment -');

  const { data: freeCashData } = useQuery({
    queryKey: ['ie-free-cash', user?.id, selectedCat?.name],
    queryFn: async () => {
      if (!isInvestmentCat) return null;
      const isMF = selectedCat.name.includes('Mutual Funds');

      // Find ALL matching investment category IDs (same logic as MF/PSX sections)
      const { data: cats } = await supabase.from('categories').select('id')
        .ilike('name', isMF ? '%Investment - Mutual Funds%' : '%Investment - Stocks%');
      const catIds = (cats || []).map((c) => c.id);

      let deposited = 0;
      if (catIds.length > 0) {
        const { data: ieTxns } = await supabase.from('income_expense_transactions')
          .select('amount').eq('user_id', user.id).eq('type', 'debit').in('category_id', catIds);
        deposited = (ieTxns || []).reduce((s, t) => s + Number(t.amount), 0);
      }

      if (isMF) {
        const { data: mfTxns } = await supabase.from('mutual_fund_transactions')
          .select('investment_amount, type').eq('user_id', user.id);
        let bought = 0, sold = 0;
        (mfTxns || []).forEach((t) => {
          if (t.type === 'buy') bought += Number(t.investment_amount);
          else sold += Number(t.investment_amount);
        });
        return { deposited, bought, sold, freeCash: deposited - bought + sold };
      } else {
        const { data: stTxns } = await supabase.from('stock_transactions')
          .select('price, quantity, type, fee').eq('user_id', user.id);
        let bought = 0, sold = 0, totalFees = 0;
        (stTxns || []).forEach((t) => {
          const amt = Number(t.price) * Number(t.quantity);
          const fee = Number(t.fee) || 0;
          totalFees += fee;
          if (t.type === 'buy') { bought += amt; }
          else sold += amt;
        });
        return { deposited, bought, sold, totalFees, freeCash: deposited - bought - totalFees + sold };
      }
    },
    enabled: !!user?.id && !!isInvestmentCat,
  });

  const saveMutation = useMutation({
    mutationFn: async (txn) => {
      const { error } = await supabase.from('income_expense_transactions').insert(txn);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ie-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['ie-all-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['ie-free-cash'] });
      queryClient.invalidateQueries({ queryKey: ['mf-free-cash'] });
      queryClient.invalidateQueries({ queryKey: ['stock-free-cash'] });
      queryClient.invalidateQueries({ queryKey: ['home-ie-txns'] });
      queryClient.invalidateQueries({ queryKey: ['home-ie-txns-all'] });
      showSnackbar('Transaction saved!', 'success');
      setAmount('');
      setCategoryId('');
      setNotes('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setShowConfirmDialog(false);
    },
    onError: (err) => { showSnackbar(err.message, 'error'); setShowConfirmDialog(false); },
  });

  const handleSubmit = () => {
    if (!categoryId || !amount) {
      showSnackbar('Please select category and enter amount', 'error');
      return;
    }
    setShowConfirmDialog(true);
  };

  const confirmSave = () => {
    saveMutation.mutate({
      user_id: user.id,
      category_id: categoryId,
      type,
      amount: parseFloat(amount),
      date,
      notes: notes.trim() || null,
    });
  };

  const isExpense = type === 'debit';
  const accentColor = isExpense ? '#dc2626' : '#059669';

  return (
    <Box sx={{ maxWidth: 540, mx: 'auto', ...(isMobile ? {} : { display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 100px)' }) }}>

      <Box sx={{ mb: isMobile ? 3 : 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography sx={{ fontSize: isMobile ? '1.4rem' : '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            New Transaction
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.25 }}>
            Record your income or expense
          </Typography>
        </Box>
        {isMobile && (
          <IconButton
            onClick={() => navigate('/transactions')}
            sx={{
              width: 40, height: 40, borderRadius: '12px',
              bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
              '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)' },
            }}
          >
            <ReceiptLong sx={{ fontSize: 20, color: 'text.primary' }} />
          </IconButton>
        )}
      </Box>

      {/* Type Toggle */}
      <Box sx={{ display: 'flex', gap: 1, mb: isMobile ? 3 : 2, p: 0.5, borderRadius: 3, bgcolor: isDark ? 'rgba(255,255,255,0.04)' : '#f5f5f5' }}>
        {[
          { key: 'debit', label: 'Expense', Icon: ArrowDownward, color: '#dc2626' },
          { key: 'credit', label: 'Income', Icon: ArrowUpward, color: '#059669' },
        ].map(({ key, label, Icon, color }) => (
          <Box
            key={key}
            onClick={() => { setType(key); setCategoryId(''); }}
            sx={{
              flex: 1, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 1, borderRadius: 2.5, cursor: 'pointer', transition: 'all 0.2s ease',
              bgcolor: type === key ? (isDark ? 'background.paper' : '#fff') : 'transparent',
              boxShadow: type === key ? (isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.06)') : 'none',
              border: type === key ? '1.5px solid ' + color + '30' : '1.5px solid transparent',
            }}
          >
            <Box sx={{
              width: 28, height: 28, borderRadius: '8px', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              bgcolor: type === key ? color + '14' : 'transparent',
            }}>
              <Icon sx={{ fontSize: 16, color: type === key ? color : 'text.secondary' }} />
            </Box>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: type === key ? color : 'text.secondary' }}>
              {label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Form Card */}
      <Card sx={{ mb: isMobile ? 3 : 2, overflow: 'visible', ...(isMobile ? {} : { flex: 1 }) }}>
        <CardContent sx={{ p: isMobile ? 2.5 : 2.5, '&:last-child': { pb: isMobile ? 2.5 : 2.5 } }}>
          {/* Amount hero input */}
          <Box sx={{ textAlign: 'center', mb: isMobile ? 3 : 2, pt: isMobile ? 1 : 0.5 }}>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mb: 1, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
              Amount
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
              <Typography sx={{ fontSize: '1.5rem', fontWeight: 300, color: 'text.secondary' }}>Rs</Typography>
              <TextField
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                placeholder="0"
                variant="standard"
                inputProps={{ min: 0, style: { fontSize: '2.2rem', fontWeight: 700, textAlign: 'center', color: accentColor } }}
                sx={{
                  maxWidth: 200,
                  '& .MuiInput-underline:before': { borderBottom: 'none' },
                  '& .MuiInput-underline:hover:before': { borderBottom: 'none' },
                  '& .MuiInput-underline:after': { borderBottom: '2px solid ' + accentColor },
                }}
              />
            </Box>
          </Box>

          {/* Category Select */}
          <FormControl fullWidth sx={{ mb: isMobile ? 2.5 : 2 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={categoryId}
              label="Category"
              onChange={(e) => setCategoryId(e.target.value)}
              renderValue={(val) => {
                const cat = categories.find((c) => c.id === val);
                if (!cat) return '';
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CategoryIcon name={cat.icon} categoryName={cat.name} sx={{ fontSize: 18, color: 'text.secondary' }} />
                    <span>{cat.name}</span>
                  </Box>
                );
              }}
            >
              {filteredCategories.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Box sx={{
                      width: 30, height: 30, borderRadius: '8px', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    }}>
                      <CategoryIcon name={c.icon} categoryName={c.name} sx={{ fontSize: 16, color: isExpense ? '#dc2626' : '#059669', opacity: 0.8 }} />
                    </Box>
                  </ListItemIcon>
                  <ListItemText primary={c.name} primaryTypographyProps={{ sx: { fontSize: '0.82rem', fontWeight: 500 } }} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Investment hint */}
          <AnimatePresence>
            {isInvestmentCat && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <Alert severity="info" icon={<AccountBalanceWallet sx={{ fontSize: 18 }} />}
                  sx={{ mb: 2, borderRadius: 2, fontSize: '0.75rem' }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                    Deposits free cash for {selectedCat.name.includes('Mutual Funds') ? 'mutual fund' : 'stock'} investments.
                  </Typography>
                  {freeCashData && (
                    <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', mt: 0.25 }}>
                      Current free cash: {formatCurrency(freeCashData.freeCash)}
                    </Typography>
                  )}
                </Alert>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Date */}
          <TextField fullWidth label="Date" type="date" value={date}
            onChange={(e) => setDate(e.target.value)} sx={{ mb: isMobile ? 2.5 : 2 }}
            InputLabelProps={{ shrink: true }} />

          {/* Notes */}
          <TextField fullWidth label="Notes (optional)" value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline rows={isMobile ? 2 : 1} sx={{ mb: 0 }}
            placeholder="Add a note about this transaction..."
          />
        </CardContent>
      </Card>

      {/* Submit */}
      <Button fullWidth variant="contained" size="large" onClick={handleSubmit}
        disabled={saveMutation.isPending || !categoryId || !amount}
        sx={{
          py: 1.75, borderRadius: 3, fontSize: '0.88rem', fontWeight: 700,
          bgcolor: accentColor,
          '&:hover': { bgcolor: isExpense ? '#b91c1c' : '#047857' },
          '&.Mui-disabled': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' },
        }}>
        {saveMutation.isPending ? 'Saving...' : 'Save ' + (isExpense ? 'Expense' : 'Income')}
      </Button>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onClose={() => setShowConfirmDialog(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 4, p: 0 } }}>
        <DialogContent sx={{ pt: 4, pb: 2 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Box sx={{
              width: 44, height: 44, borderRadius: '12px', display: 'flex',
              alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2,
              bgcolor: accentColor + '10',
            }}>
              {selectedCat ? (
                <CategoryIcon name={selectedCat.icon} categoryName={selectedCat.name} sx={{ fontSize: 22, color: accentColor }} />
              ) : (
                <AccountBalanceWallet sx={{ fontSize: 22, color: accentColor }} />
              )}
            </Box>
            <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, mb: 0.5, lineHeight: 1, color: accentColor, fontFeatureSettings: '"tnum"' }}>
              {isExpense ? '-' : '+'}{amount ? formatCurrency(parseFloat(amount)) : 'Rs 0'}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.primary', fontWeight: 500, mt: 0.5 }}>
              {selectedCat?.name || 'Unknown Category'}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.25 }}>
              {date}{notes ? ' · ' + notes : ''}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={() => setShowConfirmDialog(false)} color="inherit"
            sx={{ flex: 1, borderRadius: 2.5, py: 1.2, fontSize: '0.82rem', fontWeight: 600, bgcolor: isDark ? 'rgba(255,255,255,0.06)' : '#f5f5f5' }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={confirmSave} disabled={saveMutation.isPending}
            sx={{
              flex: 1, borderRadius: 2.5, py: 1.2, fontSize: '0.82rem', fontWeight: 600,
              bgcolor: accentColor,
              '&:hover': { bgcolor: isExpense ? '#b91c1c' : '#047857' },
            }}>
            {saveMutation.isPending ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
