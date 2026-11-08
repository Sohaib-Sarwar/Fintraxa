import { IconButton, Tooltip } from '@mui/material';
import { VisibilityRounded, VisibilityOffRounded } from '@mui/icons-material';
import { useAppStore } from '../../store/appStore';
import { useFx } from './tokens';

/** Eye button: hide or show every money figure in the app (remembered on this device). */
export default function PrivacyToggle({ compact = false }) {
  const t = useFx();
  const hidden = useAppStore((s) => s.hideAmounts);
  const toggle = useAppStore((s) => s.toggleHideAmounts);
  const label = hidden ? 'Show amounts' : 'Hide amounts';
  return (
    <Tooltip title={label} arrow>
      <IconButton aria-label={label} aria-pressed={hidden} onClick={toggle}
        sx={compact
          // Beside a headline figure: quiet, borderless, the eye alone.
          ? { width: 36, height: 36, color: t.muted, transition: 'color .18s, background-color .18s', '&:hover': { color: t.ink, bgcolor: t.surface2 } }
          : { width: 34, height: 34, border: `1px solid ${t.border}`, bgcolor: hidden ? t.inv : t.surface, color: hidden ? t.invInk : t.ink,
            transition: 'background-color .18s, color .18s', '&:hover': { bgcolor: hidden ? t.inv : t.surface2 } }}>
        {hidden ? <VisibilityOffRounded sx={{ fontSize: compact ? 20 : 18 }} /> : <VisibilityRounded sx={{ fontSize: compact ? 20 : 18 }} />}
      </IconButton>
    </Tooltip>
  );
}
