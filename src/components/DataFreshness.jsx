import { Box, Typography, Tooltip } from '@mui/material';
import { FiberManualRecord } from '@mui/icons-material';

/**
 * What the numbers on screen actually are.
 *
 * The old label read "Updated 4h ago" off the fetch time. On a Saturday that
 * sentence is true and useless: the fetch was four hours ago, but the prices
 * are Thursday's close, and nothing on screen said so. PSX is scraped once per
 * working day after the close, so for most of the week the fetch time and the
 * session the prices describe are different days.
 *
 * So this reports `data_as_of` — the session PSX stamped the board with —
 * and keeps the fetch and publication times in the tooltip for anyone
 * debugging. `state` comes from the service, which knows both its own schedule
 * and the market calendar; a weekend is not staleness, and the dot is only
 * amber when the service itself says a refresh is overdue.
 */

const REL = [
  [60, 'second', 1],
  [3600, 'minute', 60],
  [86400, 'hour', 3600],
  [2592000, 'day', 86400],
];

function relative(iso) {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const secs = Math.round((Date.now() - then.getTime()) / 1000);
  if (secs < 45) return 'just now';
  for (const [limit, unit, div] of REL) {
    if (secs < limit) {
      const n = Math.floor(secs / div);
      return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
    }
  }
  return then.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
}

function sessionLabel(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return "today's session";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "yesterday's close";
  return `${d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })} close`;
}

export default function DataFreshness({ freshness, sx }) {
  if (!freshness) return null;

  const { state, data_as_of, fetched_at, published_at, next_refresh_at, market_status } = freshness;

  const session = sessionLabel(data_as_of);
  const overdue = state && state !== 'fresh';

  const tip = [
    session && `Prices from ${session}.`,
    fetched_at && `Scraped ${relative(fetched_at)}.`,
    published_at && `Published ${relative(published_at)}.`,
    next_refresh_at && `Next refresh ${new Date(next_refresh_at).toLocaleString('en-PK', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })}.`,
    market_status && `Market ${market_status}.`,
    overdue && 'The scheduled refresh has not landed yet.',
  ].filter(Boolean).join(' ');

  return (
    <Tooltip title={tip} arrow enterTouchDelay={0} leaveTouchDelay={4000}>
      <Box
        component="span"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help', ...sx }}
      >
        <FiberManualRecord
          aria-hidden
          sx={{ fontSize: 7, color: overdue ? 'warning.main' : 'success.main', flexShrink: 0 }}
        />
        <Typography
          component="span"
          sx={{
            fontSize: '0.55rem', color: 'text.secondary', lineHeight: 1.2,
            fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap',
          }}
        >
          {session ? `Prices: ${session}` : relative(published_at)}
          {overdue ? ' · refresh due' : ''}
        </Typography>
      </Box>
    </Tooltip>
  );
}
