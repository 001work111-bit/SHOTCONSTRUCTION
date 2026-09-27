import type { Asset, AssetId, BlockId, Project } from './types';

/**
 * Favorites are scoped to a single block (spec §34): the same picture may be a favorite
 * for Block 01 and not be one for Block 02. Only references are stored — the file is
 * never copied or moved (spec §35).
 */

export function favoritesOf(project: Project, blockId: BlockId): AssetId[] {
  return project.favorites[blockId] ?? [];
}

export function favoriteCount(project: Project, blockId: BlockId): number {
  return favoritesOf(project, blockId).length;
}

/** Counter for every block at once — feeds the per-block visual badge (spec addendum). */
export function favoriteCounts(project: Project): Record<BlockId, number> {
  const out: Record<BlockId, number> = {};
  for (const blockId of project.blocks.order) out[blockId] = favoritesOf(project, blockId).length;
  return out;
}

export function totalFavoriteCount(project: Project): number {
  return Object.values(project.favorites).reduce((sum, list) => sum + list.length, 0);
}

export function isFavorite(project: Project, blockId: BlockId, assetId: AssetId): boolean {
  return favoritesOf(project, blockId).includes(assetId);
}

export function addFavorite(project: Project, blockId: BlockId, assetId: AssetId): Project {
  if (!project.blocks.byId[blockId]) return project;
  const list = favoritesOf(project, blockId);
  if (list.includes(assetId)) return project;
  return {
    ...project,
    favorites: { ...project.favorites, [blockId]: [assetId, ...list] },
    meta: { ...project.meta, updatedAt: Date.now() },
  };
}

export function removeFavorite(project: Project, blockId: BlockId, assetId: AssetId): Project {
  const list = favoritesOf(project, blockId);
  if (!list.includes(assetId)) return project;
  const next = list.filter((id) => id !== assetId);
  const favorites = { ...project.favorites };
  if (next.length) favorites[blockId] = next;
  else delete favorites[blockId];
  return { ...project, favorites, meta: { ...project.meta, updatedAt: Date.now() } };
}

export function toggleFavoriteForBlock(project: Project, blockId: BlockId, assetId: AssetId): Project {
  return isFavorite(project, blockId, assetId)
    ? removeFavorite(project, blockId, assetId)
    : addFavorite(project, blockId, assetId);
}

export function addCurrentImageToFavorites(project: Project, blockId: BlockId): Project {
  const block = project.blocks.byId[blockId];
  if (!block?.imageAssetId) return project;
  return addFavorite(project, blockId, block.imageAssetId);
}

export function clearFavorites(project: Project, blockId: BlockId): Project {
  if (!project.favorites[blockId]) return project;
  const favorites = { ...project.favorites };
  delete favorites[blockId];
  return { ...project, favorites };
}

export function copyFavorites(project: Project, fromBlockId: BlockId, toBlockId: BlockId): Project {
  const list = favoritesOf(project, fromBlockId);
  if (!list.length) return project;
  const merged = Array.from(new Set([...list, ...favoritesOf(project, toBlockId)]));
  return { ...project, favorites: { ...project.favorites, [toBlockId]: merged } };
}

export function favoriteAssets(project: Project, blockId: BlockId): Asset[] {
  const byId = new Map(project.assets.map((a) => [a.id, a]));
  const out: Asset[] = [];
  for (const id of favoritesOf(project, blockId)) {
    const asset = byId.get(id);
    if (asset) out.push(asset);
  }
  return out;
}

/** Remove favorites pointing at assets that no longer exist (spec §108). */
export function pruneFavorites(project: Project): Project {
  const known = new Set(project.assets.map((a) => a.id));
  const blockIds = new Set(project.blocks.order);
  let changed = false;
  const favorites: Project['favorites'] = {};
  for (const [blockId, list] of Object.entries(project.favorites)) {
    if (!blockIds.has(blockId)) {
      changed = true;
      continue;
    }
    const filtered = list.filter((id) => known.has(id));
    if (filtered.length !== list.length) changed = true;
    if (filtered.length) favorites[blockId] = filtered;
  }
  return changed ? { ...project, favorites } : project;
}
