import { Sector } from 'recharts';

/**
 * The donut sector renderer every pie chart in the app shares.
 *
 * Recharts 3 removed `activeIndex` from `Pie` and deprecated `activeShape` in
 * favour of `shape`, which receives `isActive` per sector. Six charts here
 * still passed `activeIndex={activeIdx} activeShape={…}`: `activeIndex` was
 * silently ignored, so no sector ever grew — while the same `activeIdx` state
 * still switched the outer labels and the centre total off on hover. Hovering
 * a slice therefore blanked the chart's labels and put nothing in their place.
 *
 * Driving the sector from `isActive` restores the highlight and, unlike the
 * old mouse-only state, Recharts also raises it for touch and keyboard.
 *
 * The enlarged sector is all this draws. The hovered slice's name and value
 * belong in the HTML overlay at the centre of the donut, where they are real
 * text rather than SVG, inherit the theme, and cannot collide with the
 * resting-state total.
 */
export function pieSector(props) {
  const { isActive, cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, cornerRadius } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={isActive ? innerRadius - 3 : innerRadius}
      outerRadius={isActive ? outerRadius + 6 : outerRadius}
      startAngle={startAngle}
      endAngle={endAngle}
      cornerRadius={cornerRadius}
      fill={fill}
      style={{ transition: 'opacity 0.15s ease', opacity: 1 }}
    />
  );
}

/**
 * Outer "42% · Groceries" labels, drawn only while nothing is hovered.
 * `percent` under 3% is dropped — the text would overlap its neighbours.
 */
export function makeOuterLabel(nameOf = (p) => p.name) {
  const RADIAN = Math.PI / 180;
  return function outerLabel({ cx, cy, midAngle, outerRadius, percent, payload, fill, viewBox }) {
    if (percent < 0.03) return null;
    const isSm = (viewBox?.width || 400) < 380;
    const radius = outerRadius + (isSm ? 18 : 24);
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const anchor = x > cx ? 'start' : 'end';
    return (
      <g>
        <text x={x} y={y - 6} textAnchor={anchor} fontSize={isSm ? 12 : 13} fontWeight={800} fill={fill}>
          {`${(percent * 100).toFixed(0)}%`}
        </text>
        <text x={x} y={y + (isSm ? 7 : 9)} textAnchor={anchor} fontSize={isSm ? 9 : 10} fontWeight={500} fill="#888">
          {nameOf(payload)}
        </text>
      </g>
    );
  };
}
