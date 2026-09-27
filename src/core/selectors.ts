import { poolForFolders } from './assets';
import { createLookup } from './randomizer';
import { effectiveOverlay, getBlock } from './blocks';
import { favoriteCounts, totalFavoriteCount } from './favorites';
import { isDisplayable } from './formats';
import { resolvePool } from './randomizer';
import { resolveBlockText } from './templates';
import type {
  Asset,
  AssetId,
  Block,
  BlockId,
  FolderId,
  Project,
  ProjectState,
  TextTemplate,
  TypographySet,
} from './types';

/* --------------------------------------------------------------- helpers -- */

const memo = new WeakMap<object, Map<string, unknown>>();

/** Memoize on an object key (the immutable project / block identity). */
function memoBy<T>(key: object, cacheKey: string, factory: () => T): T {
  let inner = memo.get(key);
  if (!inner) {
    inner = new Map();
    memo.set(key, inner);
  }
  if (inner.has(cacheKey)) return inner.get(cacheKey) as T;
  const value = factory();
  inner.set(cacheKey, value);
  return value;
}

/* --------------------------------------------------------------- basics -- */

export function selectedBlock(state: ProjectState): Block | null {
  return getBlock(state.project, state.ui.selectedBlockId);
}

export function blockList(project: Project): Block[] {
  return memoBy(project, 'blockList', () => project.blocks.order.map((id) => project.blocks.byId[id]).filter(Boolean));
}

export function blockByIndex(project: Project, index: number): Block | null {
  const id = project.blocks.order[index];
  return id ? project.blocks.byId[id] ?? null : null;
}

export function indexOfBlock(project: Project, blockId: BlockId | null): number {
  if (!blockId) return -1;
  return project.blocks.order.indexOf(blockId);
}

export function effectiveOverlayOf(project: Project, block: Block) {
  return memoBy(block, `overlay:${project.settings.globalOverlay.enabled}:${project.settings.globalOverlay.color}:${project.settings.globalOverlay.opacity}`, () =>
    effectiveOverlay(project, block),
  );
}

export function effectiveText(project: Project, block: Block): TextTemplate {
  return memoBy(block, `text:${project.meta.updatedAt}:${JSON.stringify(block.textOverride)}`, () => resolveBlockText(project, block));
}

export function effectiveTypography(project: Project, block: Block): TypographySet {
  return memoBy(block, `typo:${project.meta.updatedAt}`, () => {
    const override = block.typographyOverride;
    if (!override) return project.settings.typography;
    const base = project.settings.typography;
    const layers = { ...base.layers };
    if (override.layers) {
      for (const key of Object.keys(override.layers) as (keyof TypographySet['layers'])[]) {
        const patch = override.layers[key];
        if (patch) layers[key] = { ...base.layers[key], ...patch };
      }
    }
    return {
      layers,
      items: { ...base.items, ...(override.items ?? {}) },
      keywords: { ...base.keywords, ...(override.keywords ?? {}) },
      group: { ...base.group, ...(override.group ?? {}) },
    };
  });
}

/**
 * O(1) asset lookup. Every panel, block card and thumbnail used to scan the asset array,
 * which turns into `tiles × assets` work on a 100k catalog — the index is built once per
 * immutable project snapshot instead (spec §26, §98).
 */
export function assetIndex(project: Project): Map<AssetId, Asset> {
  return memoBy(project, 'assetIndex', () => {
    const map = new Map<AssetId, Asset>();
    for (const asset of project.assets) map.set(asset.id, asset);
    return map;
  });
}

export function assetById(project: Project, assetId: AssetId | null | undefined): Asset | null {
  if (!assetId) return null;
  return assetIndex(project).get(assetId) ?? null;
}

export function assetsByFolder(project: Project, folderId: FolderId | null): AssetId[] {
  return memoBy(project, `folderAssets:${project.folders.length}:${project.assets.length}`, () => {
    const map = new Map<FolderId | null, AssetId[]>();
    for (const asset of project.assets) {
      if (asset.source !== 'folder') continue;
      const list = map.get(asset.folderId) ?? [];
      list.push(asset.id);
      map.set(asset.folderId, list);
    }
    for (const folder of project.folders) {
      // root level assets plus the folder's own children handled through its own bucket
      map.set(folder.id, folder.assetIds.length ? folder.assetIds : map.get(folder.id) ?? []);
    }
    return map;
  }).get(folderId) ?? [];
}

/* ------------------------------------------------------------ searching -- */

export interface AssetQuery {
  search?: string;
  folderId?: FolderId | null;
  /** only assets usable for randomize / display */
  onlyDisplayable?: boolean;
  limit?: number;
}

export function searchAssets(project: Project, query: AssetQuery): AssetId[] {
  const cacheKey = `search:${query.search ?? ''}|${query.folderId ?? 'all'}|${query.onlyDisplayable ? 1 : 0}|${query.limit ?? 0}`;
  return memoBy(project, cacheKey, () => runSearch(project, query));
}

function runSearch(project: Project, query: AssetQuery): AssetId[] {
  const search = (query.search ?? '').trim().toLowerCase();
  const folderNameById = memoBy(project, `folderNames:${project.folders.length}`, () => {
    const map = new Map<FolderId, string>();
    for (const folder of project.folders) map.set(folder.id, `${folder.name} ${folder.path}`.toLowerCase());
    return map;
  });

  const source =
    query.folderId === undefined || query.folderId === null
      ? project.assets
      : project.assets.filter((asset) => asset.folderId === query.folderId);

  const out: AssetId[] = [];
  for (const asset of source) {
    if (query.onlyDisplayable && asset.source === 'folder' && !isDisplayable(asset.format)) continue;
    if (search) {
      const haystack = `${asset.name.toLowerCase()} ${asset.path.toLowerCase()} ${
        asset.folderId ? folderNameById.get(asset.folderId) ?? '' : ''
      }`;
      if (!haystack.includes(search)) continue;
    }
    out.push(asset.id);
    if (query.limit && out.length >= query.limit) break;
  }
  return out;
}

/* ------------------------------------------------------------ aggregates -- */

export interface ProjectStats {
  blocks: number;
  locked: number;
  favorites: number;
  overrides: number;
  stacks: number;
  folders: number;
  assets: number;
  unsupported: number;
  missing: number;
  withImage: number;
  externalImages: number;
}

export function projectStats(project: Project): ProjectStats {
  return memoBy(project, 'stats', () => {
    let locked = 0;
    let overrides = 0;
    let withImage = 0;
    let externalImages = 0;
    const assetByIdMap = new Map(project.assets.map((a) => [a.id, a]));
    for (const id of project.blocks.order) {
      const block = project.blocks.byId[id];
      if (!block) continue;
      if (block.locked) locked += 1;
      if (block.textOverride && Object.keys(block.textOverride).length) overrides += 1;
      if (block.imageAssetId) {
        withImage += 1;
        if (assetByIdMap.get(block.imageAssetId)?.source === 'manual') externalImages += 1;
      }
    }
    return {
      blocks: project.blocks.order.length,
      locked,
      favorites: totalFavoriteCount(project),
      overrides,
      stacks: project.stacks.length,
      folders: project.folders.length,
      assets: project.assets.filter((a) => a.source === 'folder').length,
      unsupported: project.folders.reduce((sum, f) => sum + f.unsupportedCount, 0),
      missing: project.missingAssets.length,
      withImage,
      externalImages,
    };
  });
}

export function favoriteBadges(project: Project): Record<BlockId, number> {
  return memoBy(project, `favCounts:${project.meta.updatedAt}`, () => favoriteCounts(project));
}

/** Pool sizes for every block in one memoized pass (used by the Random panel). */
export function poolSizes(project: Project): Record<BlockId, number> {
  return memoBy(project, 'poolSizes', () => {
    const lookup = createLookup(project);
    const out: Record<BlockId, number> = {};
    for (const id of project.blocks.order) {
      const block = project.blocks.byId[id];
      if (!block) continue;
      out[id] = resolvePool(project, block, lookup).assetIds.length;
    }
    return out;
  });
}

export function poolSize(project: Project, block: Block): number {
  // the cache key must describe the block *and* the catalog it was resolved against,
  // otherwise a changed folder selection would keep a stale pool size
  const key = [
    'pool',
    project.assets.length,
    project.folders.length,
    project.missingAssets.length,
    block.useFavorites ? 'fav' : 'folders',
    project.favorites[block.id]?.length ?? 0,
    block.selectedFolderIds.join(','),
  ].join(':');
  return memoBy(project.blocks, `${block.id}|${key}`, () => resolvePool(project, block).assetIds.length);
}

export function folderRows(project: Project): { id: FolderId; name: string; path: string; imageCount: number; depth: number }[] {
  return memoBy(project, `folderRows:${project.folders.length}`, () =>
    project.folders.map((f) => ({ id: f.id, name: f.name, path: f.path, imageCount: f.imageCount, depth: f.depth })),
  );
}
