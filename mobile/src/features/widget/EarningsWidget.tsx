'use no memo';
// ↑ Required (2026-11-28 bug: "Save does nothing, widget never added"): react-native-android-widget builds the
// widget by CALLING these components as plain functions. The React Compiler (on app-wide) rewrites components to
// use a memo-cache hook, and a hook called outside React throws "Invalid hook call" — every draw failed. This
// directive keeps the compiler off this file. Guarded by widget/__tests__/tree.test.tsx.

/**
 * The "Passive income" home-screen widget's picture (owner, 2026-11-28 redesign). Drawn natively by
 * react-native-android-widget: the card art edge to edge (the system rounds the corners — plugins/withWidgetTicker.js),
 * "Earned today", the Fintraxa mark, and the small figures. The big figure is the live, flipping number drawn on top by
 * the native ticker into `layout.slot`; without the ticker (older APKs) the picture draws a still figure there.
 * Geometry for every size: layout.ts. Tapping anywhere opens the app.
 */
import React from 'react';
import { Image } from 'react-native';
import { FlexWidget, ImageWidget, OverlapWidget, TextWidget } from 'react-native-android-widget';
import { designOf, type CardDesignId } from '@/features/today/cardDesigns';
import { FIGURE_NAMES, liveDecimals, rupees, rupeesShort, type SmallFigure, type WidgetFigures } from './earnings';
import { stillFigureSize, widgetLayout, type WidgetLayout } from './layout';

type Hex = `#${string}`;
const INK: Hex = '#F5F5F3';
const INK_LABEL: Hex = '#F5F5F3E6';
const INK2: Hex = '#F5F5F3B3';
const LINE: Hex = '#FFFFFF33';
const SHADOW = { textShadowColor: '#00000066' as Hex, textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };
const F_LABEL = 'Inter_500Medium';
const F_BIG = 'InterTight_800ExtraBold';
const F_SMALL = 'InterTight_600SemiBold';
const MASK = '••••••';
const MARK = require('../../../assets/mark.png');
/** Corners drawn by the picture itself only when the system can't round the frame (APKs without the new layout). */
const OWN_RADIUS = 24;

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
  /** The native ticker draws the big figure (and the system rounds the frame). */
  live: boolean;
};

/** The figure without "Rs" (PKR follows it). */
const bare = (s: string) => s.replace(/^(-?)Rs /, '$1');

function Background({ width, height, card }: { width: number; height: number; card: CardDesignId }) {
  const d = designOf(card);
  const src = Image.resolveAssetSource(d.source);
  const ratio = src?.width && src?.height ? src.width / src.height : 1000 / 647;
  // "cover": the art fills the whole widget, centred; the frame clips the overflow.
  const w = Math.max(width, height * ratio);
  const h = w / ratio;
  return (
    <OverlapWidget style={{ width: 'match_parent', height: 'match_parent' }}>
      <ImageWidget image={d.source} imageWidth={Math.ceil(w)} imageHeight={Math.ceil(h)}
        style={{ marginLeft: -Math.round((w - width) / 2), marginTop: -Math.round((h - height) / 2) }} />
      <FlexWidget style={{ width: 'match_parent', height: 'match_parent', backgroundGradient: { from: d.scrim ? '#00000059' : '#00000026', to: d.scrim ? '#0000009E' : '#00000059', orientation: 'TOP_BOTTOM' } }} />
    </OverlapWidget>
  );
}

function Label({ text, size, color = INK_LABEL, align }: { text: string; size: number; color?: Hex; align?: 'left' | 'right' }) {
  return <TextWidget text={text} allowFontScaling={false} maxLines={1} truncate="END"
    style={{ fontFamily: F_LABEL, fontSize: size, color, letterSpacing: 0.1, textAlign: align ?? 'left', ...SHADOW }} />;
}

/** A still big figure with PKR right after it (used when the live ticker isn't there, or amounts are hidden). */
function StillFigure({ text, l, width }: { text: string; l: WidgetLayout; width: number }) {
  const size = stillFigureSize(text, l, width);
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <TextWidget text={text} allowFontScaling={false} maxLines={1}
        style={{ fontFamily: F_BIG, fontSize: size, color: INK, letterSpacing: size > 30 ? -0.8 : -0.3, ...SHADOW }} />
      <TextWidget text="PKR" allowFontScaling={false}
        style={{ fontFamily: F_LABEL, fontSize: Math.max(10, Math.round(size * 0.32)), color: INK2, marginLeft: 4, marginBottom: Math.round(size * 0.14), ...SHADOW }} />
    </FlexWidget>
  );
}

function Holder({ label, value, l, first }: { label: string; value: string; l: WidgetLayout; first: boolean }) {
  return (
    <FlexWidget style={{ flex: 1, flexDirection: 'column', ...(first ? {} : { borderLeftWidth: 1, borderLeftColor: LINE, paddingLeft: 10, marginLeft: 10 }) }}>
      <Label text={label} size={l.figLabel} color={INK2} />
      <TextWidget text={value} allowFontScaling={false} maxLines={1}
        style={{ fontFamily: F_SMALL, fontSize: l.figValue, color: INK, marginTop: 2, adjustsFontSizeToFit: true, width: 'match_parent', ...SHADOW }} />
    </FlexWidget>
  );
}

function ListRow({ label, value, l }: { label: string; value: string; l: WidgetLayout }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', height: l.rowH, borderTopWidth: 1, borderTopColor: LINE }}>
      <FlexWidget style={{ flex: 1 }}><Label text={label} size={l.figLabel + 1} color={INK2} /></FlexWidget>
      <TextWidget text={value} allowFontScaling={false} maxLines={1} style={{ fontFamily: F_SMALL, fontSize: l.figValue, color: INK, ...SHADOW }} />
    </FlexWidget>
  );
}

const DAY = 86_400_000;
const shortDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function EarningsWidget(v: WidgetView) {
  const { figures, hide } = v;
  const width = Math.max(100, v.width);
  const height = Math.max(48, v.height);
  const l = widgetLayout(width, height, v.show.length);
  const design = designOf(v.card);
  const stale = v.builtAt !== null && v.now - v.builtAt > 3 * DAY;
  const small = figures ? v.show.slice(0, l.figures) : [];
  const value = (k: SmallFigure) => (hide ? MASK : rupeesShort(figures ? figures[k] : 0));
  // The big figure: the live ticker draws it; the picture only draws it when the ticker can't (or amounts are hidden).
  const ownFigure = !!figures && (!v.live || hide);
  const figureText = hide ? MASK : figures ? bare(rupees(figures.today, liveDecimals(figures.today))) : '';
  const padV = l.mode === 'row' ? 8 : l.pad;
  const slotH = Math.max(10, height - l.slot.top - l.slot.bottom);

  const top = l.mode === 'row' ? (
    <FlexWidget style={{ height: l.topH, width: 'match_parent' }}><Label text="Earned today" size={l.label - 1} /></FlexWidget>
  ) : (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', height: l.topH }}>
      <FlexWidget style={{ flex: 1 }}><Label text={figures ? 'Earned today' : 'Passive income'} size={l.label} /></FlexWidget>
      {stale ? <Label text={`Updated ${shortDate(v.builtAt!)}`} size={l.figLabel} color={INK2} align="right" />
        : design.mark !== false ? <ImageWidget image={MARK} imageWidth={l.mark} imageHeight={l.mark} /> : null}
    </FlexWidget>
  );

  const middle = (
    <FlexWidget style={{ width: 'match_parent', height: slotH, justifyContent: 'center' }}>
      {!figures ? (
        <TextWidget text="Open Fintraxa once to show your passive income here." allowFontScaling={false} maxLines={l.mode === 'row' ? 1 : 2} truncate="END"
          style={{ fontFamily: F_LABEL, fontSize: l.label, color: INK, ...SHADOW }} />
      ) : ownFigure ? <StillFigure text={figureText} l={l} width={width} /> : null}
    </FlexWidget>
  );

  const bottom = !small.length ? null : l.mode === 'tall' ? (
    <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', height: l.bottomH }}>
      {small.map((k) => <ListRow key={k} label={FIGURE_NAMES[k]} value={value(k)} l={l} />)}
    </FlexWidget>
  ) : (
    <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', height: l.bottomH, alignItems: 'flex-end' }}>
      {small.map((k, i) => <Holder key={k} label={FIGURE_NAMES[k]} value={value(k)} l={l} first={i === 0} />)}
    </FlexWidget>
  );

  // Exact heights top to bottom, so the native ticker's slot (layout.slot) lines up with the space left here.
  return (
    <OverlapWidget clickAction="OPEN_APP" accessibilityLabel={figures && !hide ? `Earned today ${rupees(figures.today, 2)}. Open Fintraxa` : 'Open Fintraxa'}
      style={{ width: 'match_parent', height: 'match_parent', backgroundColor: '#0A0A0B', ...(v.live ? {} : { borderRadius: OWN_RADIUS, overflow: 'hidden' as const }) }}>
      <Background width={width} height={height} card={v.card} />
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', height: 'match_parent', paddingHorizontal: l.pad, paddingVertical: padV }}>
        {top}
        {l.mode === 'row' ? null : <FlexWidget style={{ height: l.slot.top - l.pad - l.topH }} />}
        {middle}
        {bottom ? <FlexWidget style={{ height: l.slot.bottom - l.pad - l.bottomH }} /> : null}
        {bottom}
      </FlexWidget>
    </OverlapWidget>
  );
}

/** Drawn when anything fails, so a widget is never left empty: the name, and a tap opens the app. */
export function FallbackWidget() {
  return (
    <FlexWidget clickAction="OPEN_APP" accessibilityLabel="Open Fintraxa"
      style={{ width: 'match_parent', height: 'match_parent', backgroundColor: '#0A0A0B', padding: 16, justifyContent: 'center' }}>
      <TextWidget text="Fintraxa" allowFontScaling={false} style={{ fontFamily: F_BIG, fontSize: 18, color: INK }} />
      <TextWidget text="Tap to open the app and update." allowFontScaling={false} style={{ fontFamily: F_LABEL, fontSize: 12, color: INK2, marginTop: 4 }} />
    </FlexWidget>
  );
}
