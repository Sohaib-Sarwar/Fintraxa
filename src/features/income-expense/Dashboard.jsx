import { useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Box, Card, CardContent, Typography, Grid, Skeleton, IconButton,
  useMediaQuery, useTheme, Fab, Chip,
} from '@mui/material';
import {
  ChevronLeft, ChevronRight, AccountBalanceWallet, TrendingUp,
  TrendingDown, ShowChart, ArrowForward, Add,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useSwipeable } from 'react-swipeable';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { startOfMonth, endOfMonth, subMonths, addMonths, format } from 'date-fns';
import CategoryIcon from '../../lib/categoryIcons';
import { CountUp } from '../../components/motion';
import { pieSector, makeOuterLabel, DonutCenter } from '../../components/charts';

/* Colorful pie palette (similar to the shared design) */
const PIE_COLORS = ['#f472b6', '#fbbf24', '#60a5fa', '#a78bfa', '#34d399', '#fb923c', '#f87171', '#818cf8'];
const INCOME_COLOR = '#059669';
const EXPENSE_COLOR = '#dc2626';



/** Short category name: take first letter of each word, max 5 chars */
function shortCatName(name) {
  if (!name) return '?';
  // Use initials for multi-word names
  const words = name.trim().split(/\s+/);
  if (words.length > 1) {
    return words.map((w) => w[0]?.toUpperCase()).join('').slice(0, 5);
  }
  // Single word: truncate to 5 chars
  return name.slice(0, 5);
}

/* Percentage + name, drawn around the ring while nothing is hovered. */
const renderOuterLabel = makeOuterLabel((p) => p.shortName || p.name);

export default function IEDashboard() {
  const user = useAuthStore((s) => s.user);
  const isMobile = useMediaQuery('(max-width:768px)');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeIdx, setActiveIdx] = useState(-1);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const prevMonthStart = startOfMonth(subMonths(currentDate, 1));
  const prevMonthEnd = endOfMonth(subMonths(currentDate, 1));

  /* Forward navigation was unbounded — you could page into months that
     cannot contain a transaction and stare at an empty dashboard wondering
     whether the data had failed to load. */
  const atCurrentMonth = useMemo(
    () => format(currentDate, 'yyyy-MM') >= format(new Date(), 'yyyy-MM'),
    [currentDate],
  );
  const goNext = useCallback(
    () => setCurrentDate((d) => (format(d, 'yyyy-MM') >= format(new Date(), 'yyyy-MM') ? d : addMonths(d, 1))),
    [],
  );
  const goPrev = useCallback(() => setCurrentDate((d) => subMonths(d, 1)), []);
  const handlers = useSwipeable({ onSwipedLeft: goNext, onSwipedRight: goPrev, preventScrollOnSwipe: true });

  /* ── Current month transactions ── */
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['ie-transactions', user?.id, format(monthStart, 'yyyy-MM')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('income_expense_transactions')
        .select('*, categories(name, icon)')
        .eq('user_id', user.id)
        .gte('date', format(monthStart, 'yyyy-MM-dd'))
        .lte('date', format(monthEnd, 'yyyy-MM-dd'))
        .order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  /* ── Previous month for PNL ── */
  const { data: prevTransactions = [] } = useQuery({
    queryKey: ['ie-transactions-prev', user?.id, format(prevMonthStart, 'yyyy-MM')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('income_expense_transactions')
        .select('amount, type')
        .eq('user_id', user.id)
        .gte('date', format(prevMonthStart, 'yyyy-MM-dd'))
        .lte('date', format(prevMonthEnd, 'yyyy-MM-dd'));
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const stats = useMemo(() => {
    const income = transactions.filter((t) => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
    const expense = transactions.filter((t) => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
    const prevIncome = prevTransactions.filter((t) => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
    const prevExpense = prevTransactions.filter((t) => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
    const balance = income - expense;
    const prevBalance = prevIncome - prevExpense;
    // null, not 0: "no previous month to compare with" and "exactly flat" are
    // different answers, and showing the second for the first is a lie.
    const pnlChange = prevTransactions.length === 0 || prevBalance === 0
      ? null
      : ((balance - prevBalance) / Math.abs(prevBalance)) * 100;
    return { income, expense, balance, prevIncome, prevExpense, pnlChange };
  }, [transactions, prevTransactions]);

  /* ── Expense breakdown pie data ── */
  const expensePieData = useMemo(() => {
    const map = {};
    const iconMap = {};
    transactions.filter((t) => t.type === 'debit').forEach((t) => {
      const name = t.categories?.name || 'Other';
      map[name] = (map[name] || 0) + Number(t.amount);
      if (t.categories?.icon) iconMap[name] = t.categories.icon;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({
        name, value,
        shortName: shortCatName(name),
        icon: iconMap[name] || '📦',
        color: PIE_COLORS[i % PIE_COLORS.length],
      }));
  }, [transactions]);

  const recentTransactions = transactions.slice(0, 5);

  /* ── Stat card definitions (Home Dashboard style) ── */
  const pnlColor = (stats.pnlChange ?? 0) >= 0 ? '#15803d' : '#b91c1c';
  const statCards = [
    { label: 'Balance', amount: stats.balance, icon: AccountBalanceWallet, highlight: true },
    { label: 'Income', amount: stats.income, icon: TrendingUp },
    { label: 'Expense', amount: stats.expense, icon: TrendingDown },
    // A month with no prior month to compare against is not a 0% change; the
    // card said "+0.0%" where the honest answer is that there is no basis yet.
    stats.pnlChange === null
      ? { label: 'PNL', value: '—', icon: ShowChart }
      : {
        label: 'PNL',
        amount: stats.pnlChange,
        format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
        icon: ShowChart,
        color: pnlColor,
      },
  ];

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={28} width={180} sx={{ mx: 'auto', mb: 2.5 }} />
        {isMobile ? (
          <Skeleton variant="rounded" height={130} sx={{ mb: 2 }} />
        ) : (
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {[1, 2, 3, 4].map((i) => <Grid size={{ xs: 6, md: 3 }} key={i}><Skeleton variant="rounded" height={90} /></Grid>)}
          </Grid>
        )}
        <Skeleton variant="rounded" height={200} />
      </Box>
    );
  }

  return (
    <Box {...handlers} sx={{ pb: isMobile ? 1 : 0 }}>

      {/* ── Month Navigation ── */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: { xs: 1.5, md: 2.5 },
        mb: isMobile ? 2 : 3.5, mt: 1, py: isMobile ? 0.75 : 1.5,
      }}>
        <IconButton onClick={goPrev}
          aria-label="Previous month"
          sx={{
            width: { xs: 40, md: 44 }, height: { xs: 40, md: 44 },
            borderRadius: '50%',
            bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
            backdropFilter: 'blur(8px)',
            transition: 'all 0.25s cubic-bezier(.4,0,.2,1)',
            '&:hover': {
              bgcolor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
              transform: 'scale(1.1) translateX(-2px)',
              boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.1)',
            },
            '&:active': { transform: 'scale(0.95)' },
          }}>
          <ChevronLeft sx={{ fontSize: { xs: 22, md: 26 } }} />
        </IconButton>

        <AnimatePresence mode="wait">
          <motion.div key={format(currentDate, 'yyyy-MM')}
            initial={{ opacity: 0, scale: 0.92, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}>
            <Box sx={{ textAlign: 'center', minWidth: { xs: 160, md: 200 }, userSelect: 'none' }}>
              <Typography sx={{
                fontSize: { xs: '1.6rem', md: '2.4rem' },
                fontWeight: 900,
                letterSpacing: '-0.04em',
                lineHeight: 1,
                background: isDark
                  ? 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.7) 100%)'
                  : 'linear-gradient(135deg, #000000 0%, rgba(0,0,0,0.65) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                {format(currentDate, 'MMMM')}
              </Typography>
              <Typography sx={{
                fontSize: '0.7rem', color: 'text.secondary',
                letterSpacing: '0.18em', textTransform: 'uppercase',
                fontWeight: 600, mt: 0.3,
              }}>
                {format(currentDate, 'yyyy')}
              </Typography>
            </Box>
          </motion.div>
        </AnimatePresence>

        <IconButton onClick={goNext} disabled={atCurrentMonth}
          aria-label="Next month"
          sx={{
            width: { xs: 40, md: 44 }, height: { xs: 40, md: 44 },
            borderRadius: '50%',
            bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
            backdropFilter: 'blur(8px)',
            transition: 'all 0.25s cubic-bezier(.4,0,.2,1)',
            '&:hover': {
              bgcolor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
              transform: 'scale(1.1) translateX(2px)',
              boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.1)',
            },
            '&:active': { transform: 'scale(0.95)' },
          }}>
          <ChevronRight sx={{ fontSize: { xs: 22, md: 26 } }} />
        </IconButton>
      </Box>

      {/* ── Stat Cards (Home Dashboard style) ── */}
      {isMobile ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card sx={{ mb: 1.5, overflow: 'hidden' }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                {statCards.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <Box key={i} sx={{
                      px: 1.75, py: 1.5,
                      borderRight: i % 2 === 0 ? `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#f0f0f0'}` : 'none',
                      borderBottom: i < 2 ? `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#f0f0f0'}` : 'none',
                      ...(s.highlight && { bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }),
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                        <Icon sx={{ fontSize: 14, color: 'text.secondary', opacity: 0.7 }} />
                        <Typography sx={{
                          fontSize: '0.62rem', color: 'text.secondary',
                          fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>
                          {s.label}
                        </Typography>
                      </Box>
                      <Typography sx={{
                        fontSize: s.highlight ? '1.1rem' : '0.95rem',
                        fontWeight: 700, color: s.color || 'text.primary', fontFeatureSettings: '"tnum"',
                      }} className="currency">
                        {s.amount === undefined
                          ? s.value
                          : <CountUp to={s.amount} format={s.format || formatCurrency} delay={i * 0.05} />}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          {statCards.map((s, i) => {
            const Icon = s.icon;
            return (
              <Grid size={{ xs: 6, md: 3 }} key={i}>
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card sx={{
                    position: 'relative', overflow: 'hidden',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: isDark
                        ? '0 8px 24px rgba(255,255,255,0.04)'
                        : '0 8px 24px rgba(0,0,0,0.08)',
                    },
                    ...(s.highlight && {
                      bgcolor: isDark ? '#111' : '#fafafa',
                      border: `1.5px solid ${isDark ? '#333' : '#d4d4d4'}`,
                    }),
                  }}>
                    <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography sx={{
                          fontSize: '0.68rem', color: 'text.secondary', fontWeight: 500,
                          letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>
                          {s.label}
                        </Typography>
                        <Box sx={{
                          width: 32, height: 32, borderRadius: '10px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                        }}>
                          <Icon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        </Box>
                      </Box>
                      <Typography sx={{
                        fontSize: s.highlight ? '1.4rem' : '1.2rem',
                        fontWeight: 700, color: s.color || 'text.primary', lineHeight: 1.1,
                        fontFeatureSettings: '"tnum"',
                      }} className="currency">
                        {s.amount === undefined
                          ? s.value
                          : <CountUp to={s.amount} format={s.format || formatCurrency} delay={i * 0.05} />}
                      </Typography>
                    </CardContent>
                  </Card>
                </motion.div>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* ── Expense Breakdown Chart ── */}
      <Card sx={{ mb: isMobile ? 2 : 3, overflow: 'visible' }}>
        <CardContent sx={{ p: isMobile ? 1.5 : 2.5 }}>
          <Typography sx={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 600, letterSpacing: '0.02em', mb: 1 }}>
            Expense Breakdown
          </Typography>
          {expensePieData.length > 0 ? (
            <Box sx={{ position: 'relative' }}>
              <ResponsiveContainer width="100%" height={isMobile ? 280 : 300}>
                <PieChart>
                  <Pie data={expensePieData} dataKey="value" cx="50%" cy="50%"
                    innerRadius={isMobile ? 55 : 68} outerRadius={isMobile ? 78 : 96}
                    paddingAngle={3} strokeWidth={0}
                    shape={pieSector}
                    label={activeIdx < 0 ? renderOuterLabel : false}
                    labelLine={false}
                    onMouseEnter={(_, i) => setActiveIdx(i)}
                    onMouseLeave={() => setActiveIdx(-1)}>
                    {expensePieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <DonutCenter
                data={expensePieData}
                activeIndex={activeIdx}
                restingValue={formatCurrency(stats.expense)}
                restingLabel="total expense"
                format={formatCurrency}
                width={isMobile ? 90 : 110}
                compact={isMobile}
              />
            </Box>
          ) : (
            <Box sx={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="body2" color="text.secondary">No expenses</Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ── Recent Transactions ── */}
      <Card sx={{ mb: isMobile ? 1.5 : 2 }}>
        <CardContent sx={{ p: isMobile ? 1.5 : 2.5, '&:last-child': { pb: isMobile ? 1.5 : 2.5 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em' }}>
              Recent Transactions
            </Typography>
            <Chip
              label="See All"
              size="small"
              onClick={() => navigate('/transactions')}
              deleteIcon={<ArrowForward sx={{ fontSize: 12 }} />}
              onDelete={() => navigate('/transactions')}
              sx={{
                height: 24, fontSize: '0.65rem', fontWeight: 600,
                bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)' },
              }}
            />
          </Box>

          {recentTransactions.length === 0 ? (
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', textAlign: 'center', py: 3 }}>
              No transactions this month
            </Typography>
          ) : (
            recentTransactions.map((txn, i) => (
              <motion.div key={txn.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}>
                <Box
                  onClick={() => isMobile && navigate('/transactions')}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25,
                    borderBottom: i < recentTransactions.length - 1
                      ? `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#f5f5f5'}` : 'none',
                    cursor: isMobile ? 'pointer' : 'default',
                  }}
                >
                  <Box sx={{
                    width: 36, height: 36, borderRadius: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    flexShrink: 0,
                  }}>
                    <CategoryIcon name={txn.categories?.icon} categoryName={txn.categories?.name} sx={{ fontSize: 17, color: isDark ? '#e5e5e5' : '#333', opacity: 0.85 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.2 }} noWrap>
                      {txn.categories?.name || 'Uncategorized'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', mt: 0.15 }}>
                      {formatDate(txn.date)}
                    </Typography>
                  </Box>
                  <Typography sx={{
                    fontSize: '0.82rem', fontWeight: 700, fontFeatureSettings: '"tnum"',
                    color: txn.type === 'credit' ? INCOME_COLOR : EXPENSE_COLOR,
                  }} className="currency">
                    {txn.type === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
                  </Typography>
                </Box>
              </motion.div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Round Floating + Button (Mobile Only) — via Portal to escape transform context ── */}
      {isMobile && createPortal(
        <Fab
          onClick={() => navigate('/add-transaction')}
          sx={{
            position: 'fixed',
            bottom: 78,
            right: 18,
            width: 54,
            height: 54,
            borderRadius: '50%',
            zIndex: 1300,
            bgcolor: isDark ? '#fff' : '#000',
            color: isDark ? '#000' : '#fff',
            boxShadow: isDark
              ? '0 4px 24px rgba(255,255,255,0.12)'
              : '0 4px 24px rgba(0,0,0,0.18)',
            '&:hover': {
              bgcolor: isDark ? '#e0e0e0' : '#222',
            },
            '&:active': {
              transform: 'scale(0.92)',
            },
            transition: 'all 0.15s ease',
          }}
        >
          <Add sx={{ fontSize: 26 }} />
        </Fab>,
        document.body,
      )}
    </Box>
  );
}
