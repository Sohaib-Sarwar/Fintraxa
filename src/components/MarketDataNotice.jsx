import { useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { CloseRounded, WarningAmberRounded } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { staleFeeds, expectedSession } from '../lib/market/health';
import { useFx } from './fx';

const fmt = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'never');
const KEY = 'fintraxa.marketNotice.dismissed';

/**
 * A quiet warning when market data has stopped updating (public.market_feed_health):
 * values on the dashboards then rest on old prices. Dismissed for the day; shows again
 * the next day if the feed is still behind. Renders nothing while everything is current.
 * feeds: which feeds this page depends on.
 */
export default function MarketDataNotice({ feeds = ['psx', 'mufap', 'psx_indices'] }) {
  const t = useFx();
  const today = expectedSession();
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(KEY) === today; } catch { return false; } });
  const { data } = useQuery({
    queryKey: ['market-feed-health'],
    staleTime: 15 * 60_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc('market_feed_health');
      if (error) throw error;
      return rows ?? [];
    },
  });
  const stale = staleFeeds(data, new Date()).filter((f) => feeds.includes(f.feed));
  if (!data || !stale.length || dismissed) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, today); } catch { /* private mode */ } setDismissed(true); };

  return (
    <Box role="status" sx={{
      display: 'flex', alignItems: 'flex-start', gap: 1.25, mb: 1.5, px: 1.75, py: 1.25, borderRadius: '16px',
      bgcolor: t.warnSoft, border: `1px solid ${t.border}`, color: t.ink, flexShrink: 0,
    }}>
      <WarningAmberRounded sx={{ fontSize: 20, color: t.warn, mt: '1px' }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 650 }}>Market prices have not updated</Typography>
        <Typography sx={{ fontSize: '0.74rem', color: t.ink2, lineHeight: 1.45 }}>
          {stale.map((f) => `${f.name}: last ${fmt(f.latest)}`).join(' · ')}. Values use the last prices received until the feed catches up.
        </Typography>
      </Box>
      <IconButton size="small" aria-label="Dismiss for today" onClick={dismiss}><CloseRounded fontSize="small" /></IconButton>
    </Box>
  );
}
