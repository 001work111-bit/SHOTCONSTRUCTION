/**
 * Shot Composer — domain data model.
 *
 * Pure types only: no React, no DOM, no adapter imports.
 * The whole app (including the Electron build) shares these types.
 */

export type AssetId = string;
export type FolderId = string;
export type BlockId = string;
export type StackId = string;

export type AssetFormat =
  | 'jpg'
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'svg'
  | 'avif'
  | 'bmp'
  | 'tiff'
  | 'heic'
  | 'heif'
  | 'unknown';

/** A physical picture on disk. Bytes are never copied into the project JSON. */
export interface Asset {
  id: AssetId;
  /** file name, e.g. `001.jpg` */
  name: string;
  /** folder the file was discovered in; `null` for manually dropped files */
  folderId: FolderId | null;
  /** display path: relative to the scanned root (browser) or absolute (Electron) */
  path: string;
  format: AssetFormat;
  mime: string;
  bytes: number;
  /** intrinsic dimensions — resolved lazily, may be undefined until first decode */
  width?: number;
  height?: number;
  /**
   * `folder` = discovered during a directory scan,
   * `manual` = dragged in from outside the catalog (spec §38–39).
   * A manual asset is what the model calls an "external image" on a block.
   */
  source: 'folder' | 'manual';
  /** key of the persisted file handle / ref inside the active adapter store */
  refKey: string;
  addedAt: number;
}

export interface Folder {
  id: FolderId;
  name: string;
  /** display path relative to the scan root */
  path: string;
  parentId: FolderId | null;
  depth: number;
  assetIds: AssetId[];
  imageCount: number;
  unsupportedCount: number;
}

/* ------------------------------------------------------------------ text -- */

/** The single imported JSON template. Initial value for every block. */
export interface TextTemplate {
  title: string;
  subtitle: string;
  /** the small bordered lines: `Автокомпонентов`, `Запчастей и оборудования`, … */
  items: string[];
  /** the big low-contrast words at the bottom: `Электроника`, `Промышленность`, … */
  keywords: string[];
}

export type TextLayerKey = 'title' | 'subtitle' | 'items' | 'keywords';

/**
 * Partial per-block copy of the template. A layer that is absent inherits the
 * global template (Global Template → local override, spec §19).
 */
export type TextOverride = Partial<TextTemplate>;

export interface LayerTypography {
  visible: boolean;
  /** px inside the logical block frame (scaled in preview) */
  fontSize: number;
  weight: number;
  color: string;
  opacity: number;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  /** em */
  letterSpacing: number;
  textTransform: 'none' | 'uppercase';
  /** vertical gap above the layer, px at logical frame size */
  marginTop: number;
}

export interface LayerItemsStyle {
  /** bordered pill per item line (as on the reference screenshot) */
  pill: boolean;
  pillPadX: number;
  pillPadY: number;
  pillBorder: number;
  pillRadius: number;
  gap: number;
}

export interface LayerKeywordsStyle {
  opacityStart: number;
  /** added per line; negative → lines fade out downwards */
  opacityStep: number;
}

export interface TextGroup {
  /** anchor in % of the block frame */
  anchorX: number;
  anchorY: number;
  /** text column width, % of the block frame */
  width: number;
}

export interface TypographySet {
  layers: Record<TextLayerKey, LayerTypography>;
  items: LayerItemsStyle;
  keywords: LayerKeywordsStyle;
  group: TextGroup;
}

/* ----------------------------------------------------------------- block -- */

export type AspectPreset = '2:1' | '16:9' | '16:10' | '4:3' | '3:2' | '1:1' | 'custom';
export type ImageFit = 'cover' | 'contain' | 'fill';

export interface Overlay {
  enabled: boolean;
  color: string;
  /** 0..1 */
  opacity: number;
}

export interface ImagePosition {
  /** object-position X/Y, 0..100 */
  x: number;
  y: number;
}

export interface Block {
  id: BlockId;
  /** logical frame size for editing (spec §14) — the physical file is never touched */
  width: number;
  height: number;
  aspect: AspectPreset;
  /** current picture. `null` → empty block (renders a placeholder). */
  imageAssetId: AssetId | null;
  /** allowed image sources; empty array = inherit "all folders" */
  selectedFolderIds: FolderId[];
  /** excluded from bulk randomize (spec §32, §90–91) */
  locked: boolean;
  /** randomize only within accumulated favorites, when they exist (spec §36–37) */
  useFavorites: boolean;
  /** local text override; `null` = fully inherited from the global template */
  textOverride: TextOverride | null;
  typographyOverride: Partial<TypographySet> | null;
  /** `null` = inherit the global overlay */
  overlayOverride: Overlay | null;
  imageFit: ImageFit;
  imagePosition: ImagePosition;
  createdAt: number;
}

/* --------------------------------------------------------------- project -- */

export type PreviewTransition =
  | 'fade'
  | 'slide-vertical'
  | 'slide-horizontal'
  | 'crossfade'
  | 'zoom';

export type PreviewEasing = 'linear' | 'ease' | 'ease-in-out' | 'ease-out' | 'cubic-bezier(.16,1,.3,1)';
export type PreviewNavigation = 'auto' | 'manual' | 'auto-manual';

export interface PreviewSettings {
  transition: PreviewTransition;
  /** ms */
  duration: number;
  /** ms between autoplay steps */
  delay: number;
  easing: PreviewEasing;
  autoplay: boolean;
  loop: boolean;
  navigation: PreviewNavigation;
  /** `fill` = hero fills the viewport (like the reference site), `frame` = exact 2:1 letterbox */
  fit: 'fill' | 'frame';
  showProgress: boolean;
  showDice: boolean;
  background: string;
}

export interface ProjectSettings {
  /** default overlay for every block (spec §21) */
  globalOverlay: Overlay;
  typography: TypographySet;
  blockDefaults: {
    width: number;
    height: number;
    aspect: AspectPreset;
    imageFit: ImageFit;
  };
  /** new blocks start with "use favorites" enabled */
  useFavoritesDefault: boolean;
  historyLimit: number;
  thumbnailBudgetMB: number;
  /** seed of the last randomize operation (spec §73) */
  lastSeed: string | null;
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface BlocksCollection {
  order: BlockId[];
  byId: Record<BlockId, Block>;
}

export interface StackEntry {
  assetId: AssetId | null;
  imageFit: ImageFit;
  imagePosition: ImagePosition;
}

/** Saved combination of images of all blocks (spec §41). References only. */
export interface Stack {
  id: StackId;
  index: number;
  name: string;
  createdAt: number;
  entries: Record<BlockId, StackEntry>;
}

export interface Project {
  version: number;
  meta: ProjectMeta;
  settings: ProjectSettings;
  folders: Folder[];
  assets: Asset[];
  template: TextTemplate;
  blocks: BlocksCollection;
  /** blockId → assetIds. Per-block favorites (spec §34). */
  favorites: Record<BlockId, AssetId[]>;
  stacks: Stack[];
  preview: PreviewSettings;
  /** refs that could not be resolved on the last load (spec §66) */
  missingAssets: AssetId[];
  /** folder ids whose handle could not be restored → Relink needed */
  unlinkedFolderIds: FolderId[];
}

/* ------------------------------------------------------------- ui state -- */

export type SidebarSection =
  | 'project'
  | 'blocks'
  | 'images'
  | 'text'
  | 'overlay'
  | 'random'
  | 'favorites'
  | 'stacks'
  | 'preview'
  | 'settings';

export type AppMode = 'edit' | 'preview';
export type SaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'warn' | 'error';
  message: string;
  detail?: string;
  at: number;
}

export interface UiState {
  mode: AppMode;
  sidebarCollapsed: boolean;
  inspectorOpen: boolean;
  section: SidebarSection;
  selectedBlockId: BlockId | null;
  /** inline text editing: block + layer (+ optional line index) */
  editing: { blockId: BlockId; layer: TextLayerKey; line: number } | null;
  previewIndex: number;
  previewDirection: 1 | -1;
  previewPlaying: boolean;
  saveStatus: SaveStatus;
  toasts: Toast[];
  busy: string | null;
  /** last scan progress hint, shown in the status bar */
  scanProgress: string | null;
  search: string;
  /** thumbnails currently decoded (status bar telemetry) */
  decodeQueue: number;
}

export interface ProjectState {
  project: Project;
  ui: UiState;
}

/* -------------------------------------------------------------- results -- */

export type RandomizeFailureReason =
  | 'no-folders-selected'
  | 'no-catalog'
  | 'no-eligible-images'
  | 'empty-pool';

export interface RandomizeResult {
  ok: boolean;
  /** blockIds actually changed */
  changed: BlockId[];
  /** blockIds skipped by lock during a bulk operation */
  skipped: BlockId[];
  reason?: RandomizeFailureReason;
  /** pool size per block, useful for diagnostics + status bar */
  pools: Record<BlockId, number>;
  seed: string;
}
