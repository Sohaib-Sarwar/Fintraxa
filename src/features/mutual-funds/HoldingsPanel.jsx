import { formatCurrency } from '../../lib/formatters';
import { HoldingsCard } from '../../components/fx';
import { shortDate } from '../../lib/dateRange';
import AmcLogo from './AmcLogo';

const AMC_SHORT = { atlas: 'Atlas', mcb: 'MCB', meezan: 'Meezan', nbp: 'NBP', ubl: 'UBL' };
const pctText = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`);

/** Mutual-fund rows for the shared holdings card: fund, value, gain. */
export default function HoldingsPanel({ held, previous, onOpen, emptyText }) {
  const fundRow = (p, extra) => ({
    key: p.key, onClick: () => onOpen(p), title: p.fundName ?? 'Fund', sub: AMC_SHORT[p.amcCode] ?? p.amcName,
    logo: <AmcLogo code={p.amcCode} name={p.amcName} size={32} />, ...extra,
  });
  return (
    <HoldingsCard
      formatMoney={(v) => formatCurrency(v)}
      chart={{
        centerLabel: 'Value',
        items: held.filter((p) => (p.value ?? 0) > 0).map((p) => ({
          key: p.key, label: p.fundName ?? 'Fund', value: p.value, onClick: () => onOpen(p),
          logo: <AmcLogo code={p.amcCode} name={p.amcName} size={28} />,
        })),
      }}
      tabs={[
        {
          value: 'current', label: 'Current', columns: ['Fund', 'Value', 'Unrealized'], empty: emptyText,
          rows: [...held].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).map((p) => fundRow(p, {
            main: p.value === null ? '—' : formatCurrency(p.value),
            gain: p.unrealized.net,
            gainSub: p.invested > 0 && p.unrealized.gross !== null ? pctText((p.unrealized.gross / p.invested) * 100) : '',
          })),
        },
        {
          value: 'previous', label: 'Previous', columns: ['Fund', 'Redeemed', 'Realized'], empty: 'No funds fully redeemed in this period',
          rows: previous.map((p) => fundRow(p, {
            main: p.lastDate ? shortDate(p.lastDate) : '—', mainMuted: true, gain: p.realized.net, gainSub: 'after CGT',
          })),
        },
      ]}
    />
  );
}
