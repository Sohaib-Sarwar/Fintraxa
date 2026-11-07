import { useState } from 'react';
import { Box, Card, CardContent, Typography, Chip, Button, Skeleton, useMediaQuery } from '@mui/material';
import { UploadFileRounded, ChevronRightRounded, DescriptionRounded } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { clickable } from '../../lib/a11y';
import ImportDialog from './ImportDialog';
import { STATUS_LABEL, AMC_NAME, fmtDate } from './mfLabels';
import AmcLogo from './AmcLogo';


export default function Imports() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width:768px)');
  const [open, setOpen] = useState(false);

  const { data: imports = [], isLoading } = useQuery({
    queryKey: ['mf-imports', user?.id],
    enabled: !!user,
    refetchInterval: (q) => (q.state.data?.some((i) => ['uploaded', 'parsing', 'redacting', 'validating'].includes(i.status)) ? 3000 : false),
    queryFn: async () => {
      const { data, error } = await supabase.from('mf_statement_imports')
        .select('id, status, file_label, period_start, period_end, summary, error_message, created_at, page_count')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Box sx={{ pb: isMobile ? 1 : 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: isMobile ? 2 : 3 }}>
        <Typography sx={{ fontSize: isMobile ? '1.2rem' : '1.5rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Statement imports</Typography>
        <Button variant="contained" disableElevation startIcon={<UploadFileRounded />} onClick={() => setOpen(true)}
          sx={{ textTransform: 'none', borderRadius: 2.5, fontWeight: 600 }}>
          Import
        </Button>
      </Box>

      {isLoading && [1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={72} sx={{ mb: 1 }} />)}

      {!isLoading && imports.length === 0 && (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <DescriptionRounded sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }} />
          <Typography sx={{ fontWeight: 600, mb: 0.5 }}>No statements yet</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mb: 2 }}>
            Import an account statement from your AMC and your holdings, profit and CGT are worked out from it.
          </Typography>
          <Button variant="outlined" startIcon={<UploadFileRounded />} onClick={() => setOpen(true)} sx={{ textTransform: 'none', borderRadius: 2.5 }}>
            Import a statement
          </Button>
        </Card>
      )}

      {imports.map((imp) => {
        const [label, color] = STATUS_LABEL[imp.status] ?? [imp.status, 'default'];
        const s = imp.summary ?? {};
        return (
          <Card key={imp.id} sx={{ mb: 1, cursor: 'pointer' }} {...clickable(() => navigate(`/funds/imports/${imp.id}`))}
            aria-label={`Open import ${imp.file_label ?? ''}`}>
            <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 }, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <AmcLogo code={s.amc} name={AMC_NAME[s.amc]} size={34} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: '0.82rem', fontWeight: 700 }}>
                  {AMC_NAME[s.amc] ?? 'Statement'} · {fmtDate(imp.period_start)} – {fmtDate(imp.period_end)}
                </Typography>
                <Typography noWrap sx={{ fontSize: '0.66rem', color: 'text.secondary' }}>
                  {imp.status === 'failed' ? imp.error_message
                    : `${s.events ?? 0} transactions · ${s.auto_approved ?? 0} added automatically${s.duplicates ? ` · ${s.duplicates} duplicates skipped` : ''}`}
                </Typography>
              </Box>
              <Chip size="small" label={label} color={color} variant="outlined" sx={{ fontSize: '0.62rem' }} />
              <ChevronRightRounded sx={{ color: 'text.disabled' }} />
            </CardContent>
          </Card>
        );
      })}

      <ImportDialog open={open} onClose={() => setOpen(false)} />
    </Box>
  );
}
