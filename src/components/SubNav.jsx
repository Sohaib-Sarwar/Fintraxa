import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Chip, useMediaQuery, useTheme } from '@mui/material';

export default function SubNav({ links }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width:768px)');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (!isMobile) return null;

  return (
    <Box sx={{
      display: 'flex', gap: 0.75, mb: 2, overflowX: 'auto', pb: 0.5,
      '&::-webkit-scrollbar': { display: 'none' },
      scrollbarWidth: 'none',
    }}>
      {links.map((l) => {
        const isActive = location.pathname === l.path;
        return (
          <Chip
            key={l.path}
            label={l.label}
            onClick={() => navigate(l.path)}
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: '0.72rem',
              flexShrink: 0,
              height: 30,
              bgcolor: isActive ? (isDark ? '#fff' : '#111') : 'transparent',
              color: isActive ? (isDark ? '#000' : '#fff') : 'text.secondary',
              border: isActive ? 'none' : '1px solid',
              borderColor: 'divider',
              '&:hover': { bgcolor: isActive ? (isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.8)') : 'action.hover' },
            }}
          />
        );
      })}
    </Box>
  );
}
