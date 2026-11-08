import { createPortal } from 'react-dom';
import { Box } from '@mui/material';

/**
 * Line-chart hover cards used to be an SVG foreignObject inside the chart, so
 * the y-axis labels (painted later in the same SVG) showed through them. The
 * card is now plain HTML in a layer stacked above the whole chart: the chart
 * still decides where the card goes, the layer guarantees it is on top.
 *
 *   const [layer, layerRef] = useHoverLayer();   // from ./hooks
 *   <Box sx={{ position: 'relative' }}> <ResponsiveContainer …/> <HoverLayerHost ref={layerRef} /> </Box>
 *   <HoverPortal layer={layer} x={…} y={…} width={…} height={…}>card</HoverPortal>   // from an activeDot
 *
 * Coordinates are the chart's own (the SVG fills the wrapper), so nothing is converted.
 */
export function HoverLayerHost({ ref }) {
  return <Box ref={ref} aria-hidden sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }} />;
}

export function HoverPortal({ layer, x, y, width, height, children }) {
  if (!layer) return null;
  return createPortal(
    <Box sx={{ position: 'absolute', left: x, top: y, width, height, pointerEvents: 'none' }}>{children}</Box>,
    layer,
  );
}
