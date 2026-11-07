import { Box, MenuItem, Select } from '@mui/material';
import { useFx } from './tokens';

/** Compact rounded select for filters. items: [{ value, label, icon? }] */
export default function PillSelect({ value, onChange, items, label, width = 150 }) {
  const t = useFx();
  return (
    <Select size="small" value={value} onChange={(e) => onChange(e.target.value)} inputProps={{ 'aria-label': label }}
      renderValue={(v) => {
        const it = items.find((i) => i.value === v);
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            {it?.icon}
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it?.label ?? label}</Box>
          </Box>
        );
      }}
      sx={{
        height: 34, width, maxWidth: '100%', borderRadius: 999, bgcolor: t.surface, fontSize: '0.76rem', fontWeight: 600, flexShrink: 1, minWidth: 0,
        '& .MuiOutlinedInput-notchedOutline': { borderColor: t.border }, '& .MuiSelect-select': { py: 0.5, pl: 1.25, display: 'flex' },
      }}
      MenuProps={{ slotProps: { paper: { sx: { borderRadius: '14px', mt: 0.5, maxHeight: 360 } } } }}>
      {items.map((i) => (
        <MenuItem key={i.value} value={i.value} sx={{ fontSize: '0.78rem', gap: 1 }}>{i.icon}{i.label}</MenuItem>
      ))}
    </Select>
  );
}
