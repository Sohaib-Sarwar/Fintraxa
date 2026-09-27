import { useState, useMemo } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button, Alert, Autocomplete,
  CircularProgress, Chip, Dialog, DialogContent,
  useTheme, useMediaQuery, InputAdornment, Divider,
} from '@mui/material';
import {
  Wallet, CheckCircleRounded, InfoOutlined, TrendingUpRounded,
  SearchRounded, CalendarTodayRounded, AccountBalanceWalletRounded,
  ReceiptLongRounded, SavingsRounded, ArrowForwardRounded,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { mufapAPI } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { formatCurrency, formatNumber, shortFundName } from '../../lib/formatters';

export default function AddFund() {
  const user = useAuthStore((s) => s.user);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery('(max-width:768px)');
  const queryClient = useQueryClient();

  const [selectedFund, setSelectedFund] = useState(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  /* Free cash query */
  const { data: freeCashData } = useQuery({
    queryKey: ['mf-free-cash', user?.id],
    queryFn: async () => {
      const { data: cats } = await supabase.from('categories').select('id').ilike('name', '%Investment - Mutual Funds%');
      const catIds = (cats || []).map((c) => c.id);
      let deposited = 0;
      if (catIds.length > 0) {
        const { data: txns } = await supabase.from('income_expense_transactions')
          .select('amount').eq('user_id', user.id).eq('type', 'debit').in('category_id', catIds);
        deposited = (txns || []).reduce((s, t) => s + Number(t.amount), 0);
      }
      const { data: mfTxns } = await supabase.from('mutual_fund_transactions')
        .select('investment_amount, type').eq('user_id', user.id);
      let bought = 0, sold = 0;
      (mfTxns || []).forEach((t) => { if (t.type === 'buy') bought += Number(t.investment_amount); else sold += Number(t.investment_amount); });
      return { deposited, bought, sold, freeCash: deposited - bought + sold };
    },
    enabled: !!user,
  });
  const freeCash = freeCashData?.freeCash ?? 0;

  /* Preload all funds once, then filter client-side for instant search */
  const { data: allFundsData, isLoading: loadingAllFunds } = useQuery({
    queryKey: ['mufap-funds'],
    queryFn: () => mufapAPI.getFunds({ limit: 5000 }),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const fundOptions = useMemo(() => {
    if (!allFundsData?.data) return [];
    const list = allFundsData.data;
    if (!search || search.length < 2) return [];
    const q = search.toLowerCase();
    return list
      .filter((f) => f.fund_name?.toLowerCase().includes(q)
        || f.category?.toLowerCase().includes(q)
        || f.amc?.toLowerCase().includes(q))
      .sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.fund_name.localeCompare(b.fund_name))
      .slice(0, 100);
  }, [allFundsData, search]);

  const offerPrice = selectedFund?.offer_price || selectedFund?.nav || 0;
  const units = offerPrice > 0 && Number(amount) > 0 ? Number(amount) / offerPrice : 0;
  const numAmount = Number(amount) || 0;
  const overBudget = numAmount > freeCash;

  /* Save mutation */
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('mutual_fund_transactions').insert({
        user_id: user.id,
        // `slug` is the service's stable identifier and the path segment that
        // addresses the fund's own endpoint — keep it, not the display name,
        // so a later MUFAP rename does not orphan the holding.
        fund_id: selectedFund.slug || selectedFund.fund_name,
        fund_name: selectedFund.fund_name,
        fund_category: selectedFund.category || 'Uncategorized',
        investment_amount: numAmount,
        nav: selectedFund.nav,
        units,
        type: 'buy',
        date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSnackbar('Fund purchased successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['mf-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['mf-free-cash'] });
      queryClient.invalidateQueries({ queryKey: ['home-mf-txns'] });
      setSelectedFund(null);
      setAmount('');
      setSearch('');
      setConfirmOpen(false);
    },
    onError: (e) => showSnackbar(e.message, 'error'),
  });

  const canSubmit = selectedFund && numAmount > 0 && !overBudget && date;
  const handleSubmit = () => { if (canSubmit) setConfirmOpen(true); };

  return (
    <Box sx={{ pb: isMobile ? 1 : 0 }}>
      <Typography sx={{ fontSize: isMobile ? '1.2rem' : '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', mb: isMobile ? 2 : 3 }}>
        Add Fund
      </Typography>

      {/* Free Cash Card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card sx={{
          mb: 2, overflow: 'hidden',
          bgcolor: isDark ? '#111' : '#fafafa',
          border: `1.5px solid ${isDark ? '#333' : '#d4d4d4'}`,
        }}>
          <CardContent sx={{ p: isMobile ? 1.5 : 2, '&:last-child': { pb: isMobile ? 1.5 : 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{
                width: 38, height: 38, borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              }}>
                <Wallet sx={{ fontSize: 18, color: 'text.secondary' }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Available Free Cash
                </Typography>
                <Typography sx={{ fontSize: '1.2rem', fontWeight: 700, color: 'text.primary', fontFeatureSettings: '"tnum"' }} className="currency">
                  {formatCurrency(freeCash)}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </motion.div>

      {overBudget && (
        <Alert severity="error" icon={<InfoOutlined />} sx={{ mb: 2, borderRadius: 2.5, fontSize: '0.75rem' }}>
          Amount exceeds free cash. Deposit more under "Investment - Mutual Funds" category first.
        </Alert>
      )}

      {/* Form Card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card>
          <CardContent sx={{ p: isMobile ? 1.5 : 2.5 }}>
            {/* Fund Search — instant client-side filtering */}
            <Autocomplete
              options={fundOptions}
              getOptionLabel={(o) => o.fund_name || ''}
              groupBy={(o) => o.category || 'Other'}
              value={selectedFund}
              onChange={(_, v) => setSelectedFund(v)}
              inputValue={search}
              onInputChange={(_, v) => setSearch(v)}
              loading={loadingAllFunds}
              filterOptions={(x) => x}
              renderInput={(params) => (
                <TextField {...params} label="Search Fund" placeholder="Type fund name…"
                  fullWidth sx={{ mb: 2 }}
                  slotProps={{ input: { ...params.InputProps,
                    startAdornment: <InputAdornment position="start"><SearchRounded sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment>,
                    endAdornment: (
                      <>{loadingAllFunds && <CircularProgress size={16} />}{params.InputProps.endAdornment}</>
                    ),
                  } }} />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option.slug || option.fund_name}>
                  <Box sx={{ width: '100%', py: 0.25 }}>
                    <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: '0.78rem' }}>{option.fund_name}</Typography>
                    <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>
                      NAV {formatNumber(option.nav, 4)} · Offer {formatNumber(option.offer_price, 4)}
                    </Typography>
                  </Box>
                </li>
              )}
              isOptionEqualToValue={(o, v) => (o.slug || o.fund_name) === (v.slug || v.fund_name)}
              noOptionsText={search.length < 2 ? 'Type at least 2 characters…' : 'No funds found'}
            />

            {/* Selected fund quick info */}
            <AnimatePresence>
              {selectedFund && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <Box sx={{
                    p: 2, borderRadius: 2.5, mb: 2,
                    bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                      <Box sx={{
                        width: 36, height: 36, borderRadius: 2,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                        fontWeight: 800, fontSize: 10, color: isDark ? '#fff' : '#000', flexShrink: 0,
                      }}>
                        {shortFundName(selectedFund.fund_name)}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }} noWrap>{selectedFund.fund_name}</Typography>
                        <Chip size="small" label={selectedFund.category || 'Uncategorized'}
                          sx={{ fontSize: '0.58rem', height: 18, mt: 0.25, bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }} />
                      </Box>
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
                      {[
                        { label: 'NAV', value: formatNumber(selectedFund.nav, 4) },
                        { label: 'Offer Price', value: formatNumber(offerPrice, 4) },
                        { label: 'Repurchase', value: formatNumber(selectedFund.repurchase_price || selectedFund.nav, 4) },
                      ].map((item) => (
                        <Box key={item.label}>
                          <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 500 }}>
                            {item.label}
                          </Typography>
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, fontFeatureSettings: '"tnum"' }}>
                            {item.value}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Amount */}
            <TextField label="Investment Amount" type="number" value={amount}
              onChange={(e) => setAmount(e.target.value)} fullWidth sx={{ mb: 2 }}
              error={overBudget}
              slotProps={{ input: {
                startAdornment: <InputAdornment position="start"><AccountBalanceWalletRounded sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment>,
              } }}
              helperText={overBudget ? 'Exceeds free cash' : units > 0 ? `≈ ${formatNumber(units, 4)} units at ${formatNumber(offerPrice, 4)}/unit` : ''}
            />

            {/* Date */}
            <TextField label="Date" type="date" value={date}
              onChange={(e) => setDate(e.target.value)} fullWidth sx={{ mb: 2.5 }}
              slotProps={{ input: {
                startAdornment: <InputAdornment position="start"><CalendarTodayRounded sx={{ fontSize: 16, color: 'text.disabled' }} /></InputAdornment>,
              } }}
            />

            {/* Units preview */}
            <AnimatePresence>
              {units > 0 && !overBudget && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <Box sx={{
                    p: 1.5, borderRadius: 2.5, mb: 2,
                    bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                    display: 'flex', alignItems: 'center', gap: 1,
                  }}>
                    <TrendingUpRounded sx={{ fontSize: 18, color: isDark ? '#fff' : '#000' }} />
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'text.primary' }}>
                      {formatNumber(units, 4)} units @ {formatNumber(offerPrice, 4)}/unit
                    </Typography>
                  </Box>
                </motion.div>
              )}
            </AnimatePresence>

            <Button fullWidth variant="contained" size="large" disabled={!canSubmit || saveMutation.isPending}
              onClick={handleSubmit}
              sx={{
                bgcolor: isDark ? '#fff' : '#000',
                color: isDark ? '#000' : '#fff',
                borderRadius: 3, fontWeight: 700, fontSize: '0.82rem',
                py: 1.5, textTransform: 'none',
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.85)' },
                '&.Mui-disabled': {
                  bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  color: 'text.disabled',
                },
              }}
              startIcon={saveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <CheckCircleRounded />}>
              {saveMutation.isPending ? 'Saving…' : 'Buy Fund'}
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Confirmation Dialog (B&W theme) ── */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: 4,
              overflow: 'hidden',
              bgcolor: isDark ? '#0a0a0a' : '#fff',
            },
          },
        }}
      >
        <DialogContent sx={{ p: 0 }}>
          {/* Header */}
          <Box sx={{
            p: 3, pb: 2,
            bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
            textAlign: 'center',
          }}>
            <Box sx={{
              width: 52, height: 52, borderRadius: '50%', mx: 'auto', mb: 1.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            }}>
              <ReceiptLongRounded sx={{ fontSize: 26, color: isDark ? '#fff' : '#000' }} />
            </Box>
            <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, mb: 0.25 }}>Confirm Purchase</Typography>
            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
              Review the details below
            </Typography>
          </Box>

          {/* Fund Info */}
          <Box sx={{ p: 3, pb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <Box sx={{
                width: 40, height: 40, borderRadius: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                fontWeight: 800, fontSize: 10, color: isDark ? '#fff' : '#000',
              }}>
                {shortFundName(selectedFund?.fund_name)}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }} noWrap>{selectedFund?.fund_name}</Typography>
                <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>{selectedFund?.category}</Typography>
              </Box>
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* Details grid */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.5 }}>
              {[
                { icon: AccountBalanceWalletRounded, label: 'Amount', value: formatCurrency(numAmount) },
                { icon: SavingsRounded, label: 'Units', value: formatNumber(units, 4) },
                { icon: TrendingUpRounded, label: 'Offer Price', value: formatNumber(offerPrice, 4) },
                { icon: Wallet, label: 'Remaining Cash', value: formatCurrency(freeCash - numAmount) },
              ].map((item) => (
                <Box key={item.label} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Box sx={{
                    width: 28, height: 28, borderRadius: '8px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  }}>
                    <item.icon sx={{ fontSize: 14, color: 'text.secondary' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      {item.label}
                    </Typography>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, fontFeatureSettings: '"tnum"' }} className="currency">
                      {item.value}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Actions */}
          <Box sx={{ display: 'flex', gap: 1.5, p: 3, pt: 1.5 }}>
            <Button fullWidth onClick={() => setConfirmOpen(false)}
              sx={{
                borderRadius: 2.5, py: 1.2, textTransform: 'none', fontWeight: 600, fontSize: '0.78rem',
                color: 'text.secondary',
                bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' },
              }}
            >
              Cancel
            </Button>
            <Button fullWidth onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
              endIcon={saveMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <ArrowForwardRounded sx={{ fontSize: 16 }} />}
              sx={{
                borderRadius: 2.5, py: 1.2, textTransform: 'none', fontWeight: 700, fontSize: '0.78rem',
                bgcolor: isDark ? '#fff' : '#000',
                color: isDark ? '#000' : '#fff',
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.85)' },
                '&.Mui-disabled': { bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', color: 'text.disabled' },
              }}
            >
              {saveMutation.isPending ? 'Processing…' : 'Confirm Purchase'}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
