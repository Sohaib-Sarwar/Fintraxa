import { useState, useMemo } from 'react';
import {
  Box, Typography, TextField, Button, Autocomplete, CircularProgress, InputAdornment, ButtonBase, useMediaQuery,
} from '@mui/material';
import {
  UploadFileRounded, EditNoteRounded, SearchRounded, ArrowBackRounded, ChevronRightRounded,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { uuid } from '../../lib/mf/hash';
import { supabase } from '../../lib/supabase';
import { MF_LEDGER_KEY } from '../../lib/mf/useMfPortfolio';
import { mufapFundsQuery } from '../../lib/marketQueries';
import { dbErrorHandler } from '../../lib/dbErrors';
import { useAppStore } from '../../store/appStore';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import { useFx, PageHeader, Seg, FONT_NUM } from '../../components/fx';
import ImportDialog from './ImportDialog';

const DECIMAL = /^\d+(\.\d+)?$/;
const today = () => new Date().toISOString().slice(0, 10);

/** Add a fund: upload an AMC statement, or enter a purchase/redemption by hand. */
export default function AddFund() {
  const [mode, setMode] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  return (
    <Box>
      <PageHeader title="Add fund" filter={false} sub={mode === 'manual' ? 'Enter a purchase or redemption' : 'Choose how to add'} />
      {mode === 'manual' ? <ManualEntry onBack={() => setMode(null)} /> : <Choice onUpload={() => setImportOpen(true)} onManual={() => setMode('manual')} />}
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </Box>
  );
}

function Choice({ onUpload, onManual }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, maxWidth: 760 }}>
      <Option icon={<UploadFileRounded />} tone="#4f46e5" title="Upload statement"
        text="PDF account statement from Atlas, MCB, Meezan, NBP or UBL. Every transaction and CGT is read for you." onClick={onUpload} />
      <Option icon={<EditNoteRounded />} tone="#0f9f6e" title="Add manually"
        text="Record one purchase or redemption: fund, amount, price and date." onClick={onManual} />
    </Box>
  );
}

function Option({ icon, tone, title, text, onClick }) {
  const t = useFx();
  return (
    <ButtonBase onClick={onClick} sx={{
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1.5, p: 2.5, borderRadius: '24px', textAlign: 'left', fontFamily: 'inherit',
      bgcolor: t.surface, border: `1px solid ${t.border}`, boxShadow: t.shadow, transition: 'border-color .16s, transform .16s',
      '@media (hover: hover)': { '&:hover': { borderColor: tone } },
    }}>
      <Box sx={{ width: 48, height: 48, borderRadius: '14px', display: 'grid', placeItems: 'center', color: '#fff', bgcolor: tone, '& svg': { fontSize: 26 } }}>{icon}</Box>
      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <Typography sx={{ fontSize: '1.02rem', fontWeight: 750, letterSpacing: '-0.02em', flex: 1 }}>{title}</Typography>
        <ChevronRightRounded sx={{ color: t.muted }} />
      </Box>
      <Typography sx={{ fontSize: '0.8rem', color: t.ink2, lineHeight: 1.5 }}>{text}</Typography>
    </ButtonBase>
  );
}

function ManualEntry({ onBack }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const queryClient = useQueryClient();
  const [side, setSide] = useState('purchase');
  const [fund, setFund] = useState(null);
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(today());
  // One key per intended entry: a double tap or a retry cannot book twice.
  const [key, setKey] = useState(() => uuid());
  const { data: all, isLoading } = useQuery(mufapFundsQuery());

  const options = useMemo(() => {
    if (!all?.data || search.length < 2) return [];
    const q = search.toLowerCase();
    return all.data.filter((f) => f.fund_name?.toLowerCase().includes(q) || f.amc?.toLowerCase().includes(q)).slice(0, 80);
  }, [all, search]);

  const pick = (f) => {
    setFund(f);
    const p = side === 'purchase' ? (f?.offer_price || f?.nav) : (f?.repurchase_price || f?.nav);
    setPrice(p ? String(p) : '');
  };
  const switchSide = (s) => {
    setSide(s);
    if (fund) {
      const p = s === 'purchase' ? (fund.offer_price || fund.nav) : (fund.repurchase_price || fund.nav);
      setPrice(p ? String(p) : '');
    }
  };

  const amt = String(amount).replace(/,/g, '').trim();
  const prc = String(price).replace(/,/g, '').trim();
  const units = DECIMAL.test(amt) && DECIMAL.test(prc) && Number(prc) > 0 && Number(amt) > 0
    ? new Decimal(amt).dividedBy(prc).toDecimalPlaces(4, Decimal.ROUND_DOWN) : null;
  const error = (amount && !DECIMAL.test(amt)) ? 'Use a plain number' : (price && !DECIMAL.test(prc)) ? 'Use a plain number' : date > today() ? 'Date cannot be in the future' : null;
  const ready = fund && units && units.gt(0) && !error && date;

  const save = useMutation({
    mutationFn: async () => {
      const { error: e } = await supabase.rpc('mf_record_manual_entry', {
        p_fund: { fund_name: fund.fund_name, amc: fund.amc || 'Unknown AMC', slug: fund.slug || null, category: fund.category || null },
        p_entry_type: side, p_trade_date: date, p_gross: amt, p_nav: prc, p_units: units.toString(), p_idempotency_key: key,
      });
      if (e) throw e;
    },
    onSuccess: () => {
      showSnackbar(side === 'purchase' ? 'Purchase added' : 'Redemption added', 'success');
      setKey(uuid());
      queryClient.invalidateQueries({ queryKey: [MF_LEDGER_KEY] });
      setFund(null); setSearch(''); setAmount(''); setPrice('');
    },
    onError: dbErrorHandler(showSnackbar, 'Could not save'),
  });

  return (
    <Box sx={{ maxWidth: 560 }}>
      <ButtonBase onClick={onBack} sx={{ gap: 0.5, mb: 1.5, px: 1, height: 32, borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, color: t.ink2, fontFamily: 'inherit' }}>
        <ArrowBackRounded sx={{ fontSize: 17 }} /> Back
      </ButtonBase>
      <Box sx={{ bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '24px', boxShadow: t.shadow, p: isMobile ? 2 : 2.75 }}>
        <Seg label="Type" value={side} onChange={switchSide} options={[{ value: 'purchase', label: 'Buy' }, { value: 'redemption', label: 'Redeem' }]} sx={{ mb: 2 }} />
        <Autocomplete
          options={options} value={fund} onChange={(_, v) => pick(v)} inputValue={search} onInputChange={(_, v) => setSearch(v)}
          getOptionLabel={(o) => o.fund_name || ''} filterOptions={(x) => x} loading={isLoading}
          isOptionEqualToValue={(o, v) => (o.slug || o.fund_name) === (v.slug || v.fund_name)}
          noOptionsText={search.length < 2 ? 'Type at least 2 letters' : 'No fund found'}
          renderOption={(props, o) => (
            <li {...props} key={o.slug || o.fund_name}>
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{o.fund_name}</Typography>
                <Typography sx={{ fontSize: '0.66rem', color: 'text.secondary' }}>{o.amc}</Typography>
              </Box>
            </li>
          )}
          renderInput={(params) => (
            <TextField {...params} label="Fund" fullWidth sx={{ mb: 1.75 }}
              slotProps={{ input: { ...params.InputProps, startAdornment: <InputAdornment position="start"><SearchRounded sx={{ fontSize: 18 }} /></InputAdornment>, endAdornment: <>{isLoading && <CircularProgress size={16} />}{params.InputProps.endAdornment}</> } }} />
          )}
        />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.75 }}>
          <TextField label="Amount (Rs)" value={amount} onChange={(e) => setAmount(e.target.value)} inputProps={{ inputMode: 'decimal' }} />
          <TextField label={side === 'purchase' ? 'Offer price' : 'Repurchase price'} value={price} onChange={(e) => setPrice(e.target.value)} inputProps={{ inputMode: 'decimal' }}
            helperText={fund ? 'Use the price on the date below' : ' '} />
        </Box>
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} fullWidth sx={{ mb: 1.75 }} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today() } }} />

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5, borderRadius: '14px', bgcolor: t.surface2, mb: 2 }}>
          <Typography sx={{ fontSize: '0.78rem', color: t.ink2 }}>Units</Typography>
          <Typography sx={{ fontFamily: FONT_NUM, fontWeight: 650, letterSpacing: '-0.02em' }}>{units ? formatNumber(Number(units.toString()), 4) : '—'}</Typography>
        </Box>
        {error && <Typography sx={{ fontSize: '0.74rem', color: t.neg, mb: 1.5 }}>{error}</Typography>}

        <Button fullWidth variant="contained" disableElevation size="large" disabled={!ready || save.isPending} onClick={() => save.mutate()}
          sx={{ borderRadius: 999, py: 1.25, bgcolor: t.inv, color: t.invInk, '&:hover': { bgcolor: t.inv, opacity: 0.88 } }}>
          {save.isPending ? 'Saving…' : `${side === 'purchase' ? 'Add purchase' : 'Add redemption'}${ready ? ` · ${formatCurrency(Number(amt))}` : ''}`}
        </Button>
      </Box>
    </Box>
  );
}
