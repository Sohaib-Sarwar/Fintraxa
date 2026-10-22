import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Chip, useTheme } from '@mui/material';

/**
 * Mobile sub-navigation chips.
 *
 * This component existed but nothing imported it. Meanwhile the Finance
 * section had no mobile sub-navigation at all: the bottom tab goes to `/`, and
 * `/add-transaction` and `/transactions` were reachable only by the floating
 * "+" button and a "See All" chip buried under the charts. Funds and Stocks
 * get their sub-navigation from the swipe carousel's tab strip; Finance does
 * not use a carousel, because its three screens are full-page forms and lists
 * rather than peers you would flick between. So it gets these.
 */
export default function SubNav({ links }) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (!links?.length) return null;

  return (
    <Box
      component="nav"
      aria-label="Section pages"
      sx={{
        display: 'flex', gap: 0.75, mb: 1.5, overflowX: 'auto', pb: 0.5,
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
    >
      {links.map((l) => {
        const isActive = location.pathname === l.path;
        return (
          <Chip
            key={l.path}
            label={l.label}
            onClick={() => navigate(l.path)}
            size="small"
            aria-current={isActive ? 'page' : undefined}
            sx={{
              fontWeight: 600,
              fontSize: '0.72rem',
              flexShrink: 0,
              height: 32,
              bgcolor: isActive ? (isDark ? '#fff' : '#111') : 'transparent',
              color: isActive ? (isDark ? '#000' : '#fff') : 'text.secondary',
              border: isActive ? 'none' : '1px solid',
              borderColor: 'divider',
              '&:hover': { bgcolor: isActive ? (isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.8)') : 'action.hover' },
              '&:focus-visible': { outline: `2px solid ${isDark ? '#fff' : '#000'}`, outlineOffset: 2 },
            }}
          />
        );
      })}
    </Box>
  );
}
