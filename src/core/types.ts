/** Core domain types — platform-agnostic */

export type ID = string;

export type ImageFit = 'cover' | 'contain' | 'fill';

export type AspectRatioPreset =
  | '2:1'
  | '16:9'
  | '16:10'
  | '4:3'
  | '3:2'
  | '1:1'
  | 'custom';

export type TransitionType = 'fade' | 'slide' | 'crossfade';

export type NavigationMode = 'auto' | 'manual' | 'both';

export type ImageFormat =
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

export interface TextContent {
  title: string;
  subtitle: string;
  items: string[];
  /** Extra large category lines (as in reference) */
  categories?: string[];
}

export interface TextStyle {
  titleSize: number;
  subtitleSize: number;
  itemSize: number;
  categorySize: number;
  color: string;
  opacity: number;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  titleWeight: number;
  subtitleWeight: number;
}

export interface OverlaySettings {
  enabled: boolean;
  color: string;
  opacity: number; // 0–100
  /** true = uses block override; false = inherits global */
  override?: boolean;
}

export interface ImagePosition {
  x: number; // 0–100 %
  y: number;
}

export interface BlockDimensions {
  width: number;
  height: number;
  aspectRatio: AspectRatioPreset;
  lockAspect: boolean;
}

export interface AssetMeta {
  id: ID;
  filename: string;
  /** Relative path within loaded root, or external marker */
  relativePath: string;
  folderId: ID | null;
  format: ImageFormat;
  width?: number;
  height?: number;
  fileSize?: number;
  /** Browser: object URL or blob ref key; Electron: absolute path */
  sourceKey: string;
  missing?: boolean;
  external?: boolean;
  unsupported?: boolean;
}

export interface FolderMeta {
  id: ID;
  name: string;
  relativePath: string;
  assetIds: ID[];
  parentId: ID | null;
}

export interface Block {
  id: ID;
  order: number;
  name: string;
  imageAssetId: ID | null;
  selectedFolderIds: ID[];
  locked: boolean;
  useFavorites: boolean;
  favoriteAssetIds: ID[];
  /** Local text; null means "use global template" — but we copy on create */
  text: TextContent;
  textIsOverride: boolean;
  overlay: OverlaySettings;
  imageFit: ImageFit;
  imagePosition: ImagePosition;
  dimensions: BlockDimensions;
}

export interface Stack {
  id: ID;
  name: string;
  createdAt: number;
  /** blockId → assetId */
  images: Record<ID, ID | null>;
}

export interface PreviewSettings {
  transitionType: TransitionType;
  transitionDuration: number; // ms
  transitionDelay: number; // ms
  easing: string;
  autoplay: boolean;
  loop: boolean;
  navigationMode: NavigationMode;
}

export interface GlobalSettings {
  overlay: OverlaySettings;
  textStyle: TextStyle;
  defaultDimensions: BlockDimensions;
  blockCount: number;
  useFavoritesGlobal: boolean;
}

export interface ProjectMeta {
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  version: number;
}

export interface ProjectState {
  meta: ProjectMeta;
  settings: GlobalSettings;
  template: TextContent;
  folders: Record<ID, FolderMeta>;
  assets: Record<ID, AssetMeta>;
  blocks: Record<ID, Block>;
  blockOrder: ID[];
  stacks: Stack[];
  activeStackId: ID | null;
  preview: PreviewSettings;
  /** UI selection (not always persisted) */
  selectedBlockId: ID | null;
  mode: 'edit' | 'preview';
  dirty: boolean;
  rootFolderName: string | null;
}

export const PROJECT_VERSION = 1;

export const DEFAULT_TEXT_TEMPLATE: TextContent = {
  title: 'Авто',
  subtitle: 'ОРГАНИЗУЕМ ПЕРЕВОЗКИ',
  items: [
    'АВТОКОМПОНЕНТОВ',
    'ЗАПЧАСТЕЙ И ОБОРУДОВАНИЯ',
    'ПРОИЗВОДСТВЕННЫХ КОМПЛЕКТУЮЩИХ',
  ],
  categories: [
    'Электроника',
    'Промышленность',
    'Стройматериалы',
    'Медицина',
    'Химия',
  ],
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  titleSize: 64,
  subtitleSize: 14,
  itemSize: 13,
  categorySize: 48,
  color: '#ffffff',
  opacity: 100,
  align: 'center',
  lineHeight: 1.2,
  letterSpacing: 0.5,
  titleWeight: 400,
  subtitleWeight: 400,
};

export const DEFAULT_OVERLAY: OverlaySettings = {
  enabled: true,
  color: '#000000',
  opacity: 45,
  override: false,
};

export const DEFAULT_DIMENSIONS: BlockDimensions = {
  width: 1024,
  height: 512,
  aspectRatio: '2:1',
  lockAspect: true,
};

export const DEFAULT_PREVIEW: PreviewSettings = {
  transitionType: 'fade',
  transitionDuration: 600,
  transitionDelay: 4000,
  easing: 'ease-in-out',
  autoplay: false,
  loop: true,
  navigationMode: 'both',
};

export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'svg',
  'avif',
  'bmp',
  'tiff',
  'tif',
  'heic',
  'heif',
]);

export function createId(prefix = 'id'): ID {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function aspectToSize(
  preset: AspectRatioPreset,
  baseWidth = 1024
): { width: number; height: number } {
  const map: Record<string, [number, number]> = {
    '2:1': [2, 1],
    '16:9': [16, 9],
    '16:10': [16, 10],
    '4:3': [4, 3],
    '3:2': [3, 2],
    '1:1': [1, 1],
  };
  if (preset === 'custom') return { width: baseWidth, height: Math.round(baseWidth / 2) };
  const [w, h] = map[preset] ?? [2, 1];
  return { width: baseWidth, height: Math.round((baseWidth * h) / w) };
}

export function createDefaultBlock(order: number, template: TextContent, folderIds: ID[] = []): Block {
  const dims = { ...DEFAULT_DIMENSIONS };
  return {
    id: createId('block'),
    order,
    name: `Block ${String(order + 1).padStart(2, '0')}`,
    imageAssetId: null,
    selectedFolderIds: [...folderIds],
    locked: false,
    useFavorites: false,
    favoriteAssetIds: [],
    text: {
      title: template.title,
      subtitle: template.subtitle,
      items: [...template.items],
      categories: template.categories ? [...template.categories] : [],
    },
    textIsOverride: false,
    overlay: { ...DEFAULT_OVERLAY },
    imageFit: 'cover',
    imagePosition: { x: 50, y: 50 },
    dimensions: dims,
  };
}

export function createEmptyProject(name = 'Untitled Project'): ProjectState {
  const template = { ...DEFAULT_TEXT_TEMPLATE, items: [...DEFAULT_TEXT_TEMPLATE.items], categories: [...(DEFAULT_TEXT_TEMPLATE.categories ?? [])] };
  const blocks: Record<ID, Block> = {};
  const blockOrder: ID[] = [];
  for (let i = 0; i < 6; i++) {
    const b = createDefaultBlock(i, template);
    blocks[b.id] = b;
    blockOrder.push(b.id);
  }
  const now = Date.now();
  return {
    meta: {
      id: createId('proj'),
      name,
      createdAt: now,
      updatedAt: now,
      version: PROJECT_VERSION,
    },
    settings: {
      overlay: { ...DEFAULT_OVERLAY },
      textStyle: { ...DEFAULT_TEXT_STYLE },
      defaultDimensions: { ...DEFAULT_DIMENSIONS },
      blockCount: 6,
      useFavoritesGlobal: false,
    },
    template,
    folders: {},
    assets: {},
    blocks,
    blockOrder,
    stacks: [],
    activeStackId: null,
    preview: { ...DEFAULT_PREVIEW },
    selectedBlockId: blockOrder[0] ?? null,
    mode: 'edit',
    dirty: false,
    rootFolderName: null,
  };
}

/** Serializable project (no runtime handles) */
export interface SerializedProject {
  version: number;
  meta: ProjectMeta;
  settings: GlobalSettings;
  template: TextContent;
  folders: FolderMeta[];
  assets: Array<Omit<AssetMeta, 'sourceKey'> & { sourceKey?: string }>;
  blocks: Block[];
  blockOrder: ID[];
  stacks: Stack[];
  activeStackId: ID | null;
  preview: PreviewSettings;
  rootFolderName: string | null;
}
