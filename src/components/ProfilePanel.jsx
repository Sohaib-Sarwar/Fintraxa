import { useState, useMemo } from 'react';
import {
  Drawer, Box, Typography, IconButton, Avatar, Divider, Button,
  Select, MenuItem, FormControl, InputLabel, TextField, Chip, Dialog,
  DialogTitle, DialogContent, DialogActions, CircularProgress,
  useTheme, Switch,
} from '@mui/material';
import {
  Close, CalendarMonth, Email, Badge, Tag,
  DarkModeRounded, LightModeRounded,
  PowerSettingsNewRounded as LogoutIcon,
  Add, DeleteOutline, Edit,
  Work, Computer, TrendingUp, Business, CardGiftcard, AttachMoney,
  Restaurant, DirectionsCar, ShoppingBag, Receipt, SportsEsports,
  LocalHospital, School, Home, ShoppingCart, AccountBalance, ShowChart,
  MoreHoriz, Savings, Shield, LocalGroceryStore, Movie,
  Category as CategoryIcon, Pets, Flight, FitnessCenter, CreditCard,
  Checkroom, PhoneAndroid, Build, VolunteerActivism, LocalCafe,
  LocalLaundryService, SelfImprovement, ChildCare, Handyman, Redeem,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore, CURRENCIES } from '../store/appStore';
import { format } from 'date-fns';

/* ── Icon picker map ── */
const ICON_OPTIONS = {
  Work, Computer, TrendingUp, Business, CardGiftcard, AttachMoney,
  Restaurant, DirectionsCar, ShoppingBag, Receipt, SportsEsports,
  LocalHospital, School, Home, ShoppingCart, AccountBalance, ShowChart,
  MoreHoriz, Savings, Shield, LocalGroceryStore, Movie,
  Pets, Flight, FitnessCenter, CreditCard, Checkroom, PhoneAndroid,
  Build, VolunteerActivism, LocalCafe, LocalLaundryService,
  SelfImprovement, ChildCare, Handyman, Redeem,
};

export default function ProfilePanel({ open, onClose }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const currency = useAppStore((s) => s.currency);
  const setCurrency = useAppStore((s) => s.setCurrency);
  const [pendingCurrency, setPendingCurrency] = useState(null);
  const [saving, setSaving] = useState(false);

  /* ── Category management state ── */
  const queryClient = useQueryClient();
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editCat, setEditCat] = useState(null); // null = add, object = edit
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState('expense');
  const [catIcon, setCatIcon] = useState('Category');

  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ['categories', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from('categories').select('*').eq('user_id', user.id).order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const saveCatMutation = useMutation({
    mutationFn: async ({ id, name, type, icon }) => {
      if (id) {
        const { error } = await supabase.from('categories').update({ name, type, icon }).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('categories').insert({ user_id: user.id, name, type, icon, is_default: false });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setCatDialogOpen(false);
      useAppStore.getState().showSnackbar(editCat ? 'Category updated' : 'Category added', 'success');
    },
    onError: (e) => useAppStore.getState().showSnackbar(e.message, 'error'),
  });

  const deleteCatMutation = useMutation({
    mutationFn: async (id) => {
      // Check if category is used by any transactions
      const { count } = await supabase.from('income_expense_transactions')
        .select('id', { count: 'exact', head: true }).eq('category_id', id);
      if (count > 0) throw new Error(`Cannot delete — ${count} transaction(s) use this category. Reassign them first.`);
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      useAppStore.getState().showSnackbar('Category deleted', 'success');
    },
    onError: (e) => useAppStore.getState().showSnackbar(e.message, 'error'),
  });

  const openAddCat = () => {
    setEditCat(null); setCatName(''); setCatType('expense'); setCatIcon('Category'); setCatDialogOpen(true);
  };
  const openEditCat = (cat) => {
    setEditCat(cat); setCatName(cat.name); setCatType(cat.type === 'income' ? 'income' : 'expense'); setCatIcon(cat.icon || 'Category'); setCatDialogOpen(true);
  };

  const incomeCategories = useMemo(() => categories.filter((c) => c.type === 'income' || c.type === 'credit'), [categories]);
  const expenseCategories = useMemo(() => categories.filter((c) => c.type === 'expense' || c.type === 'debit'), [categories]);

  const fullName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const joinedDate = user?.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '—';
  const accountId = user?.id?.slice(0, 8)?.toUpperCase() || '—';

  const displayCurrency = pendingCurrency ?? currency;
  const hasChanges = pendingCurrency !== null && pendingCurrency !== currency;

  const handleCurrencyChange = (e) => {
    setPendingCurrency(e.target.value);
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    await setCurrency(pendingCurrency, user?.id);
    // Fetch fresh exchange rates for the new currency
    try { await useAppStore.getState().fetchExchangeRates(); } catch {}
    setPendingCurrency(null);
    setSaving(false);
    useAppStore.getState().showSnackbar('Currency updated successfully!', 'success');
  };

  const detailRows = [
    { icon: <Badge sx={{ fontSize: 16 }} />, label: 'Name', value: fullName },
    { icon: <Email sx={{ fontSize: 16 }} />, label: 'Email', value: user?.email || '—' },
    { icon: <Tag sx={{ fontSize: 16 }} />, label: 'Account ID', value: accountId },
    { icon: <CalendarMonth sx={{ fontSize: 16 }} />, label: 'Joined', value: joinedDate },
  ];

  return (
    <>
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{ zIndex: 1400 }}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 360 },
          bgcolor: 'background.default',
          backgroundImage: 'none',
          borderLeft: `1px solid ${isDark ? '#1c1c1c' : '#f0f0f0'}`,
          zIndex: 1400,
        },
      }}
      slotProps={{ backdrop: { sx: { zIndex: 1400 } } }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 2.5, py: 2,
          borderBottom: `1px solid ${isDark ? '#1c1c1c' : '#f0f0f0'}`,
        }}>
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Profile</Typography>
          <IconButton onClick={onClose} size="small">
            <Close sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 3, '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}>
          {/* Avatar + Name */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Avatar sx={{
                width: 64, height: 64, mx: 'auto', mb: 1.5,
                bgcolor: isDark ? '#fff' : '#111',
                color: isDark ? '#000' : '#fff',
                fontSize: '1.4rem', fontWeight: 700,
              }}>
                {fullName[0]?.toUpperCase()}
              </Avatar>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, mb: 0.25 }}>
                {fullName}
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                {user?.email}
              </Typography>
            </Box>
          </motion.div>

          {/* User Details */}
          <Typography sx={{
            fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'text.secondary', mb: 1.5,
          }}>
            Account Details
          </Typography>

          <Box sx={{
            bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderRadius: 3, overflow: 'hidden',
            border: `1px solid ${isDark ? '#1c1c1c' : '#f0f0f0'}`,
            mb: 3,
          }}>
            {detailRows.map((row, i) => (
              <Box key={row.label} sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: 2, py: 1.5,
                borderBottom: i < detailRows.length - 1 ? `1px solid ${isDark ? '#1c1c1c' : '#f0f0f0'}` : 'none',
              }}>
                <Box sx={{
                  width: 28, height: 28, borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  color: 'text.secondary', flexShrink: 0,
                }}>
                  {row.icon}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', fontWeight: 500 }}>
                    {row.label}
                  </Typography>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.value}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>

          <Divider sx={{ mb: 3 }} />

          {/* Preferences */}
          <Typography sx={{
            fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'text.secondary', mb: 1.5,
          }}>
            Preferences
          </Typography>

          {/* Theme toggle */}
          <Box sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            px: 2, py: 1.5, mb: 1.5,
            bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderRadius: 2.5,
            border: `1px solid ${isDark ? '#1c1c1c' : '#f0f0f0'}`,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{
                width: 28, height: 28, borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              }}>
                {isDark ? <DarkModeRounded sx={{ fontSize: 16, color: 'text.secondary' }} />
                  : <LightModeRounded sx={{ fontSize: 16, color: 'text.secondary' }} />}
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>
                  {isDark ? 'Dark Mode' : 'Light Mode'}
                </Typography>
                <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>
                  Toggle theme appearance
                </Typography>
              </Box>
            </Box>
            <Switch
              checked={isDark}
              onChange={toggleTheme}
              size="small"
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked': { color: '#fff' },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#333' },
                '& .MuiSwitch-track': { bgcolor: '#ccc' },
              }}
            />
          </Box>

          {/* Currency selector */}
          <Box sx={{
            px: 2, py: 1.5,
            bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderRadius: 2.5,
            border: `1px solid ${isDark ? '#1c1c1c' : '#f0f0f0'}`,
          }}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ fontSize: '0.82rem' }}>Currency</InputLabel>
              <Select
                value={displayCurrency}
                label="Currency"
                onChange={handleCurrencyChange}
                sx={{ fontSize: '0.82rem' }}
                MenuProps={{ disablePortal: true }}
              >
                {Object.entries(CURRENCIES).map(([code, info]) => (
                  <MenuItem key={code} value={code} sx={{ fontSize: '0.82rem' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, width: 24 }}>
                        {info.symbol}
                      </Typography>
                      <Typography sx={{ fontSize: '0.78rem' }}>
                        {code} — {info.name}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Save Button */}
          {hasChanges && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <Button
                fullWidth
                onClick={handleSave}
                disabled={saving}
                sx={{
                  mt: 2, py: 1.25, borderRadius: 2.5,
                  bgcolor: isDark ? '#fff' : '#111',
                  color: isDark ? '#000' : '#fff',
                  fontWeight: 700, fontSize: '0.8rem',
                  textTransform: 'none',
                  '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.85)' },
                  '&.Mui-disabled': { opacity: 0.5 },
                }}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </motion.div>
          )}

          <Divider sx={{ my: 3 }} />

          {/* ── Custom Categories ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography sx={{
              fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'text.secondary',
            }}>
              Categories
            </Typography>
            <IconButton size="small" onClick={openAddCat}
              sx={{
                width: 26, height: 26, borderRadius: 1.5,
                bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              }}>
              <Add sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>

          {/* Income categories */}
          <Typography sx={{ fontSize: '0.58rem', fontWeight: 600, color: '#15803d', mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Income
          </Typography>
          <Box sx={{
            bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderRadius: 2.5, overflow: 'hidden', mb: 2,
            border: `1px solid ${isDark ? '#1c1c1c' : '#f0f0f0'}`,
          }}>
            {incomeCategories.length === 0 && (
              <Typography sx={{ px: 2, py: 1.5, fontSize: '0.68rem', color: 'text.secondary', fontStyle: 'italic' }}>
                No income categories
              </Typography>
            )}
            {incomeCategories.map((cat, i) => {
              const IconComp = ICON_OPTIONS[cat.icon] || CategoryIcon;
              return (
                <Box key={cat.id} sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.2,
                  borderBottom: i < incomeCategories.length - 1 ? `1px solid ${isDark ? '#1c1c1c' : '#f0f0f0'}` : 'none',
                }}>
                  <Box sx={{
                    width: 28, height: 28, borderRadius: '8px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: 'rgba(21,128,61,0.1)', color: '#15803d',
                  }}>
                    <IconComp sx={{ fontSize: 15 }} />
                  </Box>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, flex: 1 }}>{cat.name}</Typography>
                  <IconButton size="small" onClick={() => openEditCat(cat)} sx={{ width: 24, height: 24 }}>
                    <Edit sx={{ fontSize: 12, color: 'text.secondary' }} />
                  </IconButton>
                  {!cat.name?.startsWith('Investment -') && (
                    <IconButton size="small" onClick={() => deleteCatMutation.mutate(cat.id)} sx={{ width: 24, height: 24 }}>
                      <DeleteOutline sx={{ fontSize: 13, color: '#b91c1c' }} />
                    </IconButton>
                  )}
                </Box>
              );
            })}
          </Box>

          {/* Expense categories */}
          <Typography sx={{ fontSize: '0.58rem', fontWeight: 600, color: '#b91c1c', mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Expense
          </Typography>
          <Box sx={{
            bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderRadius: 2.5, overflow: 'hidden', mb: 2,
            border: `1px solid ${isDark ? '#1c1c1c' : '#f0f0f0'}`,
          }}>
            {expenseCategories.length === 0 && (
              <Typography sx={{ px: 2, py: 1.5, fontSize: '0.68rem', color: 'text.secondary', fontStyle: 'italic' }}>
                No expense categories
              </Typography>
            )}
            {expenseCategories.map((cat, i) => {
              const IconComp = ICON_OPTIONS[cat.icon] || CategoryIcon;
              return (
                <Box key={cat.id} sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.2,
                  borderBottom: i < expenseCategories.length - 1 ? `1px solid ${isDark ? '#1c1c1c' : '#f0f0f0'}` : 'none',
                }}>
                  <Box sx={{
                    width: 28, height: 28, borderRadius: '8px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: 'rgba(185,28,28,0.1)', color: '#b91c1c',
                  }}>
                    <IconComp sx={{ fontSize: 15 }} />
                  </Box>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, flex: 1 }}>{cat.name}</Typography>
                  <IconButton size="small" onClick={() => openEditCat(cat)} sx={{ width: 24, height: 24 }}>
                    <Edit sx={{ fontSize: 12, color: 'text.secondary' }} />
                  </IconButton>
                  {!cat.name?.startsWith('Investment -') && (
                    <IconButton size="small" onClick={() => deleteCatMutation.mutate(cat.id)} sx={{ width: 24, height: 24 }}>
                      <DeleteOutline sx={{ fontSize: 13, color: '#b91c1c' }} />
                    </IconButton>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Sign Out */}
        <Box sx={{ px: 2.5, py: 2, borderTop: `1px solid ${isDark ? '#1c1c1c' : '#f0f0f0'}` }}>
          <Button
            fullWidth
            onClick={() => { signOut(); onClose(); }}
            startIcon={<LogoutIcon sx={{ fontSize: 16 }} />}
            sx={{
              py: 1, borderRadius: 2.5,
              color: '#ef4444', fontWeight: 600, fontSize: '0.78rem',
              textTransform: 'none',
              border: '1px solid rgba(239,68,68,0.2)',
              '&:hover': { bgcolor: 'rgba(239,68,68,0.06)' },
            }}
          >
            Sign Out
          </Button>
        </Box>
      </Box>
    </Drawer>

      {/* ── Add / Edit Category Dialog ── */}
      <Dialog open={catDialogOpen} onClose={() => setCatDialogOpen(false)} maxWidth="xs" fullWidth
        sx={{ zIndex: 1500 }}
        slotProps={{ backdrop: { sx: { zIndex: 1500 } } }}
        PaperProps={{ sx: { borderRadius: 4, zIndex: 1500 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '0.9rem', pb: 0.5 }}>
          {editCat ? 'Edit Category' : 'Add Category'}
        </DialogTitle>
        <DialogContent>
          <TextField fullWidth size="small" label="Category Name" value={catName}
            onChange={(e) => setCatName(e.target.value)} sx={{ mt: 1.5, mb: 2 }}
            disabled={editCat?.name?.startsWith('Investment -')} />

          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel sx={{ fontSize: '0.82rem' }}>Type</InputLabel>
            <Select value={catType} label="Type" onChange={(e) => setCatType(e.target.value)} sx={{ fontSize: '0.82rem' }}
              disabled={editCat?.name?.startsWith('Investment -')}>
              <MenuItem value="income" sx={{ fontSize: '0.82rem' }}>Income</MenuItem>
              <MenuItem value="expense" sx={{ fontSize: '0.82rem' }}>Expense</MenuItem>
            </Select>
          </FormControl>

          <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: 'text.secondary', mb: 1 }}>
            Choose Icon
          </Typography>
          <Box sx={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.75, mb: 1,
            maxHeight: 180, overflowY: 'auto', p: 0.5,
            '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none',
          }}>
            {Object.entries(ICON_OPTIONS).map(([name, Comp]) => (
              <Box
                key={name}
                onClick={() => setCatIcon(name)}
                sx={{
                  width: 36, height: 36, borderRadius: 2, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid',
                  borderColor: catIcon === name ? (isDark ? '#fff' : '#111') : 'transparent',
                  bgcolor: catIcon === name
                    ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')
                    : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                  transition: 'all 0.15s',
                  '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' },
                }}
              >
                <Comp sx={{ fontSize: 18, color: catIcon === name ? 'text.primary' : 'text.secondary' }} />
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setCatDialogOpen(false)} color="inherit"
            sx={{ flex: 1, fontSize: '0.78rem', borderRadius: 2.5, py: 1, fontWeight: 600, bgcolor: isDark ? 'rgba(255,255,255,0.06)' : '#f5f5f5' }}>
            Cancel
          </Button>
          <Button
            disabled={!catName.trim() || saveCatMutation.isPending}
            onClick={() => saveCatMutation.mutate({ id: editCat?.id, name: catName.trim(), type: catType, icon: catIcon })}
            variant="contained"
            sx={{
              flex: 1, fontSize: '0.78rem', borderRadius: 2.5, py: 1, fontWeight: 600,
              bgcolor: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff',
              '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.85)' },
            }}>
            {saveCatMutation.isPending ? <CircularProgress size={16} /> : editCat ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
