/**
 * The "Passive income" home-screen widget (owner, 2026-11-28). Drawn by react-native-android-widget: these
 * components describe the layout, the library draws it natively — in the widget's background task, in the
 * settings preview and from the app. Same face as the in-app cards (NetWorthCard): the chosen card art under a
 * soft scrim, the label top-left, the gold mark top-right, one big heavy figure with PKR, and up to three small
 * figures along the bottom like the card-holder fields. Tapping anywhere opens the app.
 *
 * Sizes (Samsung One UI grid): 2×1 / 4×1 → one line; 2×2 → label, figure and one small figure; 3×2 and wider → up to
 * three small figures in a row; 4×3 and taller → the small figures as a list.
 */
import React from 'react';
import { Image } from 'react-native';
import { FlexWidget, ImageWidget, OverlapWidget, TextWidget } from 'react-native-android-widget';
import { designOf, type CardDesignId } from '@/features/today/cardDesigns';
import { FIGURE_NAMES, liveDecimals, rupees, rupeesShort, type SmallFigure, type WidgetFigures } from './earnings';

type Hex = `#${string}`;
const INK: Hex = '#F5F5F3';
const INK2: Hex = '#F5F5F3A8';
const LINE: Hex = '#FFFFFF38';
const SHADOW = { textShadowColor: '#00000073' as Hex, textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };
const F_LABEL = 'Inter_500Medium';
const F_BIG = 'InterTight_800ExtraBold';
const F_SMALL = 'InterTight_600SemiBold';
const MASK = '••••••';
const MARK = require('../../../assets/mark.png');
/** One UI's widget corner. */
export const RADIUS = 24;

export type WidgetView = {
  width: number;
  height: number;
  card: CardDesignId;
  figures: WidgetFigures | null;
  show: SmallFigure[];
  hide: boolean;
  /** When the app last saved the figures (ms), for the "update" hint on old data. */
  builtAt: number | null;
  now: number;
};

/** The figure without "Rs" (the card prints PKR beside it). */
const bare = (s: string) => s.replace(/^(-?)Rs /, '$1');

function Background({ width, height, card }: { width: number; height: number; card: CardDesignId }) {
  const d = designOf(card);
  const src = Image.resolveAssetSource(d.source);
  const ratio = src?.width && src?.height ? src.width / src.height : 1000 / 647;
  // "cover": scale the art to fill the widget, centred; the rounded frame clips the overflow.
  const w = Math.max(width, height * ratio);
  const h = w / ratio;
  return (
    <OverlapWidget style={{ width: 'match_parent', height: 'match_parent' }}>
      <ImageWidget image={d.source} imageWidth={Math.ceil(w)} imageHeight={Math.ceil(h)}
        style={{ marginLeft: -Math.round((w - width) / 2), marginTop: -Math.round((h - height) / 2) }} />
      {d.scrim ? (
        <FlexWidget style={{ width: 'match_parent', height: 'match_parent', backgroundGradient: { from: '#0000004D', to: '#0000008C', orientation: 'TOP_BOTTOM' } }} />
      ) : null}
    </OverlapWidget>
  );
}

function Label({ text, size, align }: { text: string; size: number; align?: 'left' | 'right' }) {
  return <TextWidget text={text} allowFontScaling={false} maxLines={1} truncate="END"
    style={{ fontFamily: F_LABEL, fontSize: size, color: INK2, letterSpacing: 0.2, textAlign: align ?? 'left', ...SHADOW }} />;
}

function Big({ text, size }: { text: string; size: number }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end', width: 'match_parent' }}>
      <FlexWidget style={{ flex: 1, width: 'match_parent' }}>
        <TextWidget text={text} allowFontScaling={false} maxLines={1}
          style={{ fontFamily: F_BIG, fontSize: size, color: INK, letterSpacing: size > 30 ? -1 : -0.4, adjustsFontSizeToFit: true, width: 'match_parent', ...SHADOW }} />
      </FlexWidget>
      <TextWidget text="PKR" allowFontScaling={false}
        style={{ fontFamily: F_LABEL, fontSize: Math.max(10, size * 0.3), color: INK2, letterSpacing: 0.6, marginLeft: 6, marginBottom: Math.round(size * 0.16), ...SHADOW }} />
    </FlexWidget>
  );
}

function Holder({ label, value, size, first }: { label: string; value: string; size: number; first: boolean }) {
  return (
    <FlexWidget style={{
      flex: 1, flexDirection: 'column',
      ...(first ? {} : { borderLeftWidth: 1, borderLeftColor: LINE, paddingLeft: 10, marginLeft: 10 }),
    }}>
      <Label text={label} size={Math.max(9.5, size * 0.72)} />
      <TextWidget text={value} allowFontScaling={false} maxLines={1}
        style={{ fontFamily: F_SMALL, fontSize: size, color: INK, marginTop: 1, adjustsFontSizeToFit: true, width: 'match_parent', ...SHADOW }} />
    </FlexWidget>
  );
}

function ListRow({ label, value, size }: { label: string; value: string; size: number }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', paddingVertical: 4, borderTopWidth: 1, borderTopColor: LINE }}>
      <FlexWidget style={{ flex: 1 }}><Label text={label} size={size * 0.85} /></FlexWidget>
      <TextWidget text={value} allowFontScaling={false} maxLines={1}
        style={{ fontFamily: F_SMALL, fontSize: size, color: INK, ...SHADOW }} />
    </FlexWidget>
  );
}

const DAY = 86_400_000;
const shortDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function EarningsWidget(v: WidgetView) {
  const { width, height, figures, hide } = v;
  const design = designOf(v.card);
  const w = Math.max(110, width);
  const h = Math.max(50, height);
  const tiny = h < 100;               // one row of cells (2×1, 4×1)
  const narrow = w < 230;             // two columns (2×2)
  const tall = h >= 250 && !narrow;   // 4×3 and taller
  const pad = Math.round(Math.min(20, Math.max(12, Math.min(w, h) * 0.1)));

  const value = (n: number, live: boolean) => (hide ? MASK : live ? bare(rupees(n, liveDecimals(n))) : rupeesShort(n));
  const big = figures ? value(figures.today, true) : '—';
  // Big figure: as large as the height allows, never wider than the card (it also shrinks to fit).
  const bigSize = Math.round(Math.min(tiny ? h * 0.42 : tall ? 52 : h * 0.27, w * (narrow ? 0.17 : 0.12), 56));
  const smallSize = Math.round(Math.min(16, Math.max(11.5, w * 0.042)));
  const maxSmall = tiny ? 0 : narrow ? (h >= 150 ? 1 : 0) : w < 300 ? 2 : 3;
  const small = figures ? v.show.slice(0, tall ? 3 : maxSmall) : [];
  const stale = v.builtAt !== null && v.now - v.builtAt > 3 * DAY;
  const labelText = !figures ? 'Passive income' : 'Earned today';
  const labelSize = Math.round(Math.min(13, Math.max(10.5, w * 0.036)));

  const top = (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
      <FlexWidget style={{ flex: 1 }}><Label text={labelText} size={labelSize} /></FlexWidget>
      {stale && !tiny ? <Label text={`Updated ${shortDate(v.builtAt!)}`} size={labelSize - 1} align="right" />
        : design.mark !== false && !tiny ? <ImageWidget image={MARK} imageWidth={Math.round(labelSize * 2.1)} imageHeight={Math.round(labelSize * 2.1)} /> : null}
    </FlexWidget>
  );

  let body: React.ReactElement;
  if (!figures) {
    body = (
      <FlexWidget style={{ flexDirection: 'column', justifyContent: 'space-between', width: 'match_parent', height: 'match_parent', padding: pad }}>
        {top}
        <TextWidget text="Open Fintraxa once to show your passive income here." allowFontScaling={false} maxLines={tiny ? 1 : 3} truncate="END"
          style={{ fontFamily: F_LABEL, fontSize: labelSize + 1, color: INK, ...SHADOW }} />
      </FlexWidget>
    );
  } else if (tiny) {
    body = (
      <FlexWidget style={{ flexDirection: 'column', justifyContent: 'center', width: 'match_parent', height: 'match_parent', paddingHorizontal: pad, paddingVertical: 6 }}>
        <Label text={labelText} size={labelSize - 1} />
        <Big text={big} size={bigSize} />
      </FlexWidget>
    );
  } else {
    body = (
      <FlexWidget style={{ flexDirection: 'column', justifyContent: 'space-between', width: 'match_parent', height: 'match_parent', padding: pad }}>
        {top}
        <Big text={big} size={bigSize} />
        {tall ? (
          <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
            {small.map((k) => <ListRow key={k} label={FIGURE_NAMES[k]} value={value(figures[k], false)} size={smallSize} />)}
          </FlexWidget>
        ) : small.length ? (
          <FlexWidget style={{ flexDirection: 'row', width: 'match_parent' }}>
            {small.map((k, i) => <Holder key={k} label={FIGURE_NAMES[k]} value={value(figures[k], false)} size={smallSize} first={i === 0} />)}
          </FlexWidget>
        ) : <FlexWidget style={{ height: 1 }} />}
      </FlexWidget>
    );
  }

  return (
    <OverlapWidget clickAction="OPEN_APP" accessibilityLabel={figures && !hide ? `Earned today ${rupees(figures.today, 2)}. Open Fintraxa` : 'Open Fintraxa'}
      style={{ width: 'match_parent', height: 'match_parent', borderRadius: RADIUS, overflow: 'hidden', backgroundColor: '#0A0A0B' }}>
      <Background width={w} height={h} card={v.card} />
      {body}
    </OverlapWidget>
  );
}
