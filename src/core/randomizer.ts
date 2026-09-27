import { poolForFolders } from './assets';
import { isDisplayable } from './formats';
import { createRng, createSeed, pickIndex, type Rng } from './rng';
import type { Asset, AssetId, Block, BlockId, Project, RandomizeResult } from './types';

/**
 * Randomizer — the single source of truth for image picking (spec §72–74).
 *
 * Every entry point (`🎲` on a card, `Randomize Selected`, `Randomize All`,
 * the dice in Preview) calls `randomizeBlocks()`; there is never a second algorithm.
 *
 * Pipeline:  folder filter → favorites filter → drop invalid → pick (seeded)
 * Lock is applied at the operation level: bulk runs skip locked blocks (spec §90–91),
 * while an explicit single-block action passes `ignoreLock`.
 */

export interface PoolInfo {
  assetIds: AssetId[];
  source: 'favorites' | 'folders' | 'none';
  /** number of folders that contributed */
  folderCount: number;
  /** diagnostics for the status bar / inspector */
  skipped: { missing: number; unsupported: number };
}

export interface RandomizeOptions {
  seed?: string;
  /** explicit single-block action ignores the lock (spec §91) */
  ignoreLock?: boolean;
  /** avoid re-picking the current image when the pool has alternatives */
  avoidCurrent?: boolean;
  rng?: Rng;
}

/**
 * Lookup tables built **once per operation**.
 *
 * The naive version scanned `project.assets` for every candidate asset, which is
 * `assets²` work — on a 100k catalog a single Randomize All would freeze the tab.
 * The tables are derived from an immutable snapshot, so they never go stale.
 */
export interface PoolLookup {
  index: Map<AssetId, Asset>;
  missing: Set<AssetId>;
}

export function createLookup(project: Project): PoolLookup {
  const index = new Map<AssetId, Asset>();
  for (const asset of project.assets) index.set(asset.id, asset);
  return { index, missing: new Set(project.missingAssets) };
}

function isUsable(lookup: PoolLookup, assetId: AssetId): 'ok' | 'missing' | 'unsupported' | 'unknown' {
  const asset = lookup.index.get(assetId);
  if (!asset) return 'unknown';
  if (lookup.missing.has(assetId)) return 'missing';
  if (asset.source === 'folder' && !isDisplayable(asset.format)) return 'unsupported';
  return 'ok';
}

/** Step 1–3 of the pipeline: resolve the candidate pool of a block. */
export function resolvePool(project: Project, block: Block, providedLookup?: PoolLookup): PoolInfo {
  const skipped = { missing: 0, unsupported: 0 };
  const favorites = project.favorites[block.id] ?? [];
  const lookup = providedLookup ?? createLookup(project);

  const filterIds = (ids: AssetId[]): AssetId[] => {
    const out: AssetId[] = [];
    const seen = new Set<AssetId>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      const state = isUsable(lookup, id);
      if (state === 'missing') {
        skipped.missing += 1;
        continue;
      }
      if (state === 'unsupported') {
        skipped.unsupported += 1;
        continue;
      }
      seen.add(id);
      out.push(id);
    }
    return out;
  };

  if (block.useFavorites && favorites.length) {
    // 5 favorites → pool is exactly those 5 (spec §37)
    return { assetIds: filterIds(favorites), source: 'favorites', folderCount: 0, skipped };
  }

  // no folders selected → every folder of the catalog (spec §27)
  const assetIds = filterIds(poolForFolders(project, block.selectedFolderIds));
  const folderCount = block.selectedFolderIds.length || project.folders.length;

  if (block.useFavorites && !favorites.length) {
    // favorites empty → fall back to the folder pool, never fail (spec §36, §107)
    return { assetIds, source: 'folders', folderCount, skipped };
  }

  return { assetIds, source: 'folders', folderCount, skipped };
}

function pickFrom(pool: AssetId[], rng: Rng, avoid?: AssetId | null): AssetId | null {
  if (!pool.length) return null;
  if (pool.length === 1) return pool[0] === avoid ? pool[0] : pool[0];
  if (avoid) {
    const filtered = pool.filter((id) => id !== avoid);
    if (filtered.length) return filtered[pickIndex(rng, filtered.length)];
  }
  return pool[pickIndex(rng, pool.length)];
}

/**
 * Randomize a set of blocks in one atomic operation.
 * Returns a *new* project together with a full report (changed / skipped / pools / seed).
 */
export function randomizeBlocks(
  project: Project,
  blockIds: BlockId[],
  options: RandomizeOptions = {},
): { project: Project; result: RandomizeResult } {
  const seed = options.seed ?? project.settings.lastSeed ?? createSeed('rnd');
  const rng = options.rng ?? createRng(seed);
  const avoidCurrent = options.avoidCurrent ?? true;
  const lookup = createLookup(project); // once per operation, not once per candidate

  const changed: BlockId[] = [];
  const skipped: BlockId[] = [];
  const pools: Record<BlockId, number> = {};
  let reason: RandomizeResult['reason'] | undefined;

  const byId = { ...project.blocks.byId };
  let touched = false;

  for (const blockId of blockIds) {
    const block = byId[blockId];
    if (!block) continue;
    if (block.locked && !options.ignoreLock) {
      skipped.push(blockId);
      continue;
    }

    const pool = resolvePool(project, block, lookup);
    pools[blockId] = pool.assetIds.length;

    if (!pool.assetIds.length) {
      if (!project.folders.length) reason = 'no-catalog';
      else if (!block.selectedFolderIds.length && !project.folders.length) reason = 'no-folders-selected';
      else if (!pool.assetIds.length && (block.useFavorites || !block.selectedFolderIds.length)) reason = 'no-eligible-images';
      else reason = 'empty-pool';
      skipped.push(blockId);
      continue;
    }

    const pick = pickFrom(pool.assetIds, rng, avoidCurrent ? block.imageAssetId : null);
    if (!pick || pick === block.imageAssetId) {
      skipped.push(blockId);
      continue;
    }
    byId[blockId] = { ...block, imageAssetId: pick };
    changed.push(blockId);
    touched = true;
  }

  const nextProject = touched
    ? {
        ...project,
        blocks: { ...project.blocks, byId },
        settings: { ...project.settings, lastSeed: seed },
        meta: { ...project.meta, updatedAt: Date.now() },
      }
    : { ...project, settings: { ...project.settings, lastSeed: seed } };

  return {
    project: nextProject,
    result: {
      ok: changed.length > 0,
      changed,
      skipped,
      reason,
      pools,
      seed,
    },
  };
}

/** Single block, explicit user action → lock is ignored for this operation only (spec §91). */
export function randomizeBlock(
  project: Project,
  blockId: BlockId,
  options: RandomizeOptions = {},
): { project: Project; result: RandomizeResult } {
  return randomizeBlocks(project, [blockId], { ignoreLock: true, ...options });
}

/** All blocks, bulk semantics → locked blocks are skipped (spec §29, §90). */
export function randomizeAll(project: Project, options: RandomizeOptions = {}): { project: Project; result: RandomizeResult } {
  return randomizeBlocks(project, project.blocks.order, { ignoreLock: false, ...options });
}

/** Replay a stored seed (spec §73) — used by "reproduce combination" in the future UI. */
export function replay(project: Project, seed: string, blockIds?: BlockId[]) {
  return randomizeBlocks(project, blockIds ?? project.blocks.order, { seed, ignoreLock: false, avoidCurrent: false });
}

export function poolSizeFor(project: Project, block: Block): number {
  return resolvePool(project, block).assetIds.length;
}

export function describeRandomizeResult(result: RandomizeResult, blockCount: number): string {
  if (result.changed.length) {
    const parts = [`${result.changed.length} of ${blockCount} blocks updated`];
    if (result.skipped.length) parts.push(`${result.skipped.length} skipped (locked / no pool)`);
    return parts.join(' · ');
  }
  switch (result.reason) {
    case 'no-catalog':
      return 'No image catalog loaded yet — press “Load image folder”.';
    case 'no-folders-selected':
      return 'No folders selected for this block.';
    case 'no-eligible-images':
      return 'No eligible images: selected folders are empty or favorites contain unsupported files.';
    case 'empty-pool':
      return 'No eligible images in the resolved pool.';
    default:
      return 'Nothing to randomize.';
  }
}
