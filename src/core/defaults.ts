import type {
  AspectPreset,
  Overlay,
  PreviewSettings,
  ProjectSettings,
  TextTemplate,
  TypographySet,
} from './types';

/**
 * Default text template — taken from the reference screenshot provided with the brief:
 * a logistics one-pager hero block whose central white typography is:
 *   Авто / организуем перевозки / three bordered service lines / five fading keyword words.
 * No site header (logo + nav) is part of the template: only the central block text (spec addendum).
 */
export const DEFAULT_TEMPLATE: TextTemplate = {
  title: 'Авто',
  subtitle: 'Организуем перевозки',
  items: ['Автокомпонентов', 'Запчастей и оборудования', 'Производственных комплектующих'],
  keywords: ['Электроника', 'Промышленность', 'Стройматериалы', 'Медицина', 'Химия'],
};

/**
 * Typography defaults, measured against the reference (logical frame 1024 × 512).
 * Preview scales this set by `frameWidth / 1024`, so a 2:1 hero looks like the real site.
 */
export const DEFAULT_TYPOGRAPHY: TypographySet = {
  layers: {
    title: {
      visible: true,
      fontSize: 46,
      weight: 300,
      color: '#ffffff',
      opacity: 1,
      align: 'center',
      lineHeight: 0.98,
      letterSpacing: -0.01,
      textTransform: 'none',
      marginTop: 0,
    },
    subtitle: {
      visible: true,
      fontSize: 11,
      weight: 600,
      color: '#ffffff',
      opacity: 0.9,
      align: 'center',
      lineHeight: 1.3,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
      marginTop: 14,
    },
    items: {
      visible: true,
      fontSize: 11.5,
      weight: 600,
      color: '#ffffff',
      opacity: 0.95,
      align: 'center',
      lineHeight: 1.3,
      letterSpacing: 0.13,
      textTransform: 'uppercase',
      marginTop: 10,
    },
    keywords: {
      visible: true,
      fontSize: 42,
      weight: 300,
      color: '#ffffff',
      opacity: 1,
      align: 'center',
      lineHeight: 0.96,
      letterSpacing: -0.015,
      textTransform: 'none',
      marginTop: 6,
    },
  },
  items: {
    pill: true,
    pillPadX: 26,
    pillPadY: 9,
    pillBorder: 1,
    pillRadius: 2,
    gap: 8,
  },
  keywords: {
    opacityStart: 0.86,
    opacityStep: -0.13,
  },
  group: {
    anchorX: 50,
    anchorY: 20,
    width: 46,
  },
};

export const DEFAULT_OVERLAY: Overlay = {
  enabled: true,
  color: '#000000',
  opacity: 0.55,
};

export const DEFAULT_PREVIEW_SETTINGS: PreviewSettings = {
  transition: 'fade',
  duration: 750,
  delay: 3200,
  easing: 'cubic-bezier(.16,1,.3,1)',
  autoplay: false,
  loop: true,
  navigation: 'auto-manual',
  fit: 'fill',
  showProgress: true,
  showDice: true,
  background: '#07080a',
};

/** Starting preset requested by the brief: 1024 × 512, 2:1 (from the reference screenshot). */
export const DEFAULT_BLOCK_SIZE = { width: 1024, height: 512, aspect: '2:1' as AspectPreset };

export const ASPECT_PRESETS: { id: AspectPreset; label: string; ratio: number | null }[] = [
  { id: '2:1', label: '2:1', ratio: 2 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '16:10', label: '16:10', ratio: 16 / 10 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: 'custom', label: 'Custom', ratio: null },
];

export function aspectRatio(preset: AspectPreset, width: number, height: number): number {
  const found = ASPECT_PRESETS.find((p) => p.id === preset);
  if (found?.ratio) return found.ratio;
  return height > 0 ? width / height : 1;
}

export function ratioToPreset(ratio: number): AspectPreset {
  for (const preset of ASPECT_PRESETS) {
    if (preset.ratio && Math.abs(preset.ratio - ratio) < 0.005) return preset.id;
  }
  return 'custom';
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  globalOverlay: DEFAULT_OVERLAY,
  typography: DEFAULT_TYPOGRAPHY,
  blockDefaults: { ...DEFAULT_BLOCK_SIZE, imageFit: 'cover' },
  useFavoritesDefault: false,
  historyLimit: 120,
  thumbnailBudgetMB: 48,
  lastSeed: null,
};
