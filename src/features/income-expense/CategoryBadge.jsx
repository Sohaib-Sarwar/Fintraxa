import { Box } from '@mui/material';
import CategoryIcon from '../../lib/categoryIcons';
import { useFx } from '../../components/fx';

/** A category's icon in a round, theme-coloured badge (used in lists and the donut). */
export default function CategoryBadge({ icon, name, size = 32 }) {
  const t = useFx();
  return (
    <Box sx={{ width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: t.surface3, color: t.ink }}>
      <CategoryIcon name={icon} categoryName={name} sx={{ fontSize: Math.round(size * 0.52), color: 'inherit' }} />
    </Box>
  );
}
