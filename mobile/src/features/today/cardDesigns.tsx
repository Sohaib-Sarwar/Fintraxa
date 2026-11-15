/**
 * Net-worth card designs (owner, 2026-11-14): Obsidian (black brushed metal with a gold line, generated with
 * Higgsfield nano_banana_flash) plus the nature / night / space photos of the web sign-in page
 * (`public/auth-bg/*.webp`) and more leaf / greenery / starry-forest photos, all Unsplash License (credits in
 * `assets/cards/CREDITS.md`), center-cropped to the card ratio into `assets/cards/`. Photos get a soft dark scrim so white figures always read.
 * Add a design by adding an image here; the id is what the phone remembers (unknown ids fall back to Obsidian).
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import type { AccentPreset } from '@/ui/tokens';

export type CardDesignId = 'obsidian' | 'monstera' | 'milkyway-mountains' | 'milkyway-clouds' | 'moon-sea' | 'moonlit-waves' | 'earth-space' | 'milkyway-ridge'
  | 'violet-pines' | 'fern' | 'night-fern' | 'canopy-stars' | 'deep-leaves' | 'forest-milkyway' | 'night-palms'
  | 'visa-black' | 'amex-botanical' | 'night-bloom' | 'star-dust' | 'deep-field' | 'saturn' | 'solar-system' | 'jupiter' | 'fern-forest' | 'night-leaves' | 'bamboo' | 'foliage';

/**
 * `accent`: the accent preset that matches the card's colours (sampled from the photo); the app suggests it.
 * `ink: 'dark'`: the card is light (Platinum Silver), so its figures are dark ink without a shadow.
 */
export type CardDesign = { id: CardDesignId; name: string; source: number; scrim: boolean; accent: AccentPreset; ink?: 'dark'; mark?: boolean };
export const CARD_DESIGNS: CardDesign[] = [
  { id: 'obsidian', name: 'Obsidian', source: require('../../../assets/cards/obsidian.webp'), scrim: false, accent: 'champagne' },
  // The owner's own card images (Cards/ folder), used as supplied for this personal, non-commercial app (2026-11-15).
  // They carry their own marks, so the Fintraxa mark is hidden on them (`mark: false`).
  { id: 'visa-black', name: 'Visa Black', source: require('../../../assets/cards/visa-black.webp'), scrim: false, accent: 'silver', mark: false },
  { id: 'amex-botanical', name: 'Amex Botanical', source: require('../../../assets/cards/amex-botanical.webp'), scrim: false, accent: 'champagne', mark: false },
  { id: 'night-bloom', name: 'Night Bloom', source: require('../../../assets/cards/night-bloom.webp'), scrim: true, accent: 'lavender' },
  { id: 'monstera', name: 'Monstera', source: require('../../../assets/cards/monstera.webp'), scrim: true, accent: 'lime' },
  { id: 'night-fern', name: 'Night fern', source: require('../../../assets/cards/night-fern.webp'), scrim: true, accent: 'jade' },
  { id: 'fern', name: 'Fern', source: require('../../../assets/cards/fern.webp'), scrim: true, accent: 'sage' },
  { id: 'deep-leaves', name: 'Deep leaves', source: require('../../../assets/cards/deep-leaves.webp'), scrim: true, accent: 'emerald' },
  { id: 'fern-forest', name: 'Fern forest', source: require('../../../assets/cards/fern-forest.webp'), scrim: true, accent: 'sage' },
  { id: 'night-leaves', name: 'Night leaves', source: require('../../../assets/cards/night-leaves.webp'), scrim: true, accent: 'emerald' },
  { id: 'foliage', name: 'Foliage', source: require('../../../assets/cards/foliage.webp'), scrim: true, accent: 'moss' },
  { id: 'bamboo', name: 'Bamboo', source: require('../../../assets/cards/bamboo.webp'), scrim: true, accent: 'champagne' },
  { id: 'night-palms', name: 'Palms at night', source: require('../../../assets/cards/night-palms.webp'), scrim: true, accent: 'champagne' },
  { id: 'violet-pines', name: 'Violet night', source: require('../../../assets/cards/violet-pines.webp'), scrim: true, accent: 'lavender' },
  { id: 'forest-milkyway', name: 'Forest Milky Way', source: require('../../../assets/cards/forest-milkyway.webp'), scrim: true, accent: 'sky' },
  { id: 'canopy-stars', name: 'Stars through the canopy', source: require('../../../assets/cards/canopy-stars.webp'), scrim: true, accent: 'mist' },
  { id: 'milkyway-mountains', name: 'Milky Way', source: require('../../../assets/cards/milkyway-mountains.webp'), scrim: true, accent: 'glacier' },
  { id: 'star-dust', name: 'Star dust', source: require('../../../assets/cards/star-dust.webp'), scrim: true, accent: 'silver' },
  { id: 'deep-field', name: 'Deep field', source: require('../../../assets/cards/deep-field.webp'), scrim: true, accent: 'lavender' },
  { id: 'saturn', name: 'Saturn', source: require('../../../assets/cards/saturn.webp'), scrim: true, accent: 'champagne' },
  { id: 'jupiter', name: 'Crescent Jupiter', source: require('../../../assets/cards/jupiter.webp'), scrim: true, accent: 'mist' },
  { id: 'solar-system', name: 'Solar system', source: require('../../../assets/cards/solar-system.webp'), scrim: true, accent: 'amber' },
  { id: 'earth-space', name: 'Planet', source: require('../../../assets/cards/earth-space.webp'), scrim: true, accent: 'moss' },
  { id: 'moon-sea', name: 'Moon over the sea', source: require('../../../assets/cards/moon-sea.webp'), scrim: true, accent: 'silver' },
  { id: 'milkyway-clouds', name: 'Above the clouds', source: require('../../../assets/cards/milkyway-clouds.webp'), scrim: true, accent: 'blue' },
  { id: 'moonlit-waves', name: 'Moonlit waves', source: require('../../../assets/cards/moonlit-waves.webp'), scrim: true, accent: 'champagne' },
  { id: 'milkyway-ridge', name: 'Night ridge', source: require('../../../assets/cards/milkyway-ridge.webp'), scrim: true, accent: 'glacier' },
];

export const designOf = (id: string | null | undefined) => CARD_DESIGNS.find((d) => d.id === id) ?? CARD_DESIGNS[0];

export function CardArt({ id }: { id: CardDesignId }) {
  const d = designOf(id);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={d.source} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} priority="high" cachePolicy="memory" accessibilityIgnoresInvertColors />
      {d.scrim ? (
        <LinearGradient colors={['rgba(0,0,0,0.30)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.55)']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      ) : null}
    </View>
  );
}
