import { useState } from 'react';
import { Box, Tooltip } from '@mui/material';
import { BROKERS } from '../../lib/psx/confirmations';
import { useFx } from '../../components/fx';

/** Broker mark (AKD, KTrade) as a rounded tile; initials if the image is missing. */
export default function BrokerLogo({ broker, size = 24, tooltip }) {
  const t = useFx();
  const [failed, setFailed] = useState(false);
  const b = BROKERS[broker];
  if (!b) return null;
  const tile = failed ? (
    <Box sx={{ width: size, height: size, borderRadius: size * 0.28 + 'px', bgcolor: t.surface3, color: t.ink2, display: 'grid', placeItems: 'center', fontSize: size * 0.36, fontWeight: 800, flexShrink: 0 }}>
      {b.name.slice(0, 2).toUpperCase()}
    </Box>
  ) : (
    <Box component="img" src={b.logo} alt={b.name} width={size} height={size} loading="lazy" onError={() => setFailed(true)}
      sx={{ width: size, height: size, borderRadius: size * 0.28 + 'px', objectFit: 'cover', flexShrink: 0, display: 'block', boxShadow: `0 0 0 1px ${t.hairline}` }} />
  );
  return tooltip ? <Tooltip title={tooltip === true ? b.name : tooltip} arrow><Box component="span" sx={{ display: 'inline-flex' }}>{tile}</Box></Tooltip> : tile;
}
