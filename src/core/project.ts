import { DEFAULT_PREVIEW_SETTINGS, DEFAULT_SETTINGS, DEFAULT_TEMPLATE } from './defaults';
import { createBlockId, createProjectId } from './ids';
import type { Asset, Block, Project, TextTemplate } from './types';

export const PROJECT_VERSION = 1;

export function createEmptyProject(name = 'Untitled preview'): Project {
  const now = Date.now();
  return {
    version: PROJECT_VERSION,
    meta: { id: createProjectId(), name, createdAt: now, updatedAt: now },
    settings: structuredCloneSafe(DEFAULT_SETTINGS),
    folders: [],
    assets: [],
    template: structuredCloneSafe(DEFAULT_TEMPLATE),
    blocks: { order: [], byId: {} },
    favorites: {},
    stacks: [],
    preview: { ...DEFAULT_PREVIEW_SETTINGS },
    missingAssets: [],
    unlinkedFolderIds: [],
  };
}

export function createBlock(
  overrides: Partial<Block> = {},
  defaults: Project['settings']['blockDefaults'] = DEFAULT_SETTINGS.blockDefaults,
): Block {
  return {
    id: overrides.id ?? createBlockId(),
    width: overrides.width ?? defaults.width,
    height: overrides.height ?? defaults.height,
    aspect: overrides.aspect ?? defaults.aspect,
    imageAssetId: overrides.imageAssetId ?? null,
    selectedFolderIds: overrides.selectedFolderIds ?? [],
    locked: overrides.locked ?? false,
    useFavorites: overrides.useFavorites ?? DEFAULT_SETTINGS.useFavoritesDefault,
    textOverride: overrides.textOverride ?? null,
    typographyOverride: overrides.typographyOverride ?? null,
    overlayOverride: overrides.overlayOverride ?? null,
    imageFit: overrides.imageFit ?? defaults.imageFit,
    imagePosition: overrides.imagePosition ?? { x: 50, y: 50 },
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

/** Deep clone that also works in browsers without structuredClone. */
export function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* fall through */
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function touchProject(project: Project, at: number = Date.now()): Project {
  return { ...project, meta: { ...project.meta, updatedAt: at } };
}

export function createManualAsset(partial: Omit<Asset, 'id' | 'addedAt' | 'source' | 'folderId'> & { id?: string; addedAt?: number }): Asset {
  return {
    ...partial,
    id: partial.id ?? `asset_manual_${Math.random().toString(36).slice(2, 8)}`,
    folderId: null,
    source: 'manual',
    addedAt: partial.addedAt ?? Date.now(),
  };
}

export function mergeTemplate(base: TextTemplate, override: Partial<TextTemplate> | null): TextTemplate {
  if (!override) return base;
  return {
    title: override.title ?? base.title,
    subtitle: override.subtitle ?? base.subtitle,
    items: override.items ?? base.items,
    keywords: override.keywords ?? base.keywords,
  };
}

export function hasTextOverride(block: Block): boolean {
  const o = block.textOverride;
  if (!o) return false;
  return (
    (o.title !== undefined && o.title !== null) ||
    (o.subtitle !== undefined && o.subtitle !== null) ||
    o.items !== undefined ||
    o.keywords !== undefined
  );
}
