import type { AssetMeta, Block, FolderMeta, ID, ProjectState } from '../types';

export interface RandomizerOptions {
  seed?: number;
}

/** Simple seeded PRNG (mulberry32) for future reproducibility */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export class Randomizer {
  private rng: () => number;

  constructor(options: RandomizerOptions = {}) {
    this.rng = options.seed != null ? mulberry32(options.seed) : Math.random;
  }

  setSeed(seed: number) {
    this.rng = mulberry32(seed);
  }

  /** Get eligible asset IDs for a block */
  getEligibleAssets(
    block: Block,
    assets: Record<ID, AssetMeta>,
    folders: Record<ID, FolderMeta>,
    useFavoritesOverride?: boolean
  ): ID[] {
    const useFav =
      useFavoritesOverride !== undefined ? useFavoritesOverride : block.useFavorites;

    if (useFav && block.favoriteAssetIds.length > 0) {
      return block.favoriteAssetIds.filter((id) => {
        const a = assets[id];
        return a && !a.missing && !a.unsupported;
      });
    }

    const folderIds =
      block.selectedFolderIds.length > 0
        ? block.selectedFolderIds
        : Object.keys(folders);

    const pool = new Set<ID>();
    for (const fid of folderIds) {
      const folder = folders[fid];
      if (!folder) continue;
      for (const aid of folder.assetIds) {
        const a = assets[aid];
        if (a && !a.missing && !a.unsupported) {
          pool.add(aid);
        }
      }
    }
    return Array.from(pool);
  }

  randomPick(ids: ID[]): ID | null {
    if (ids.length === 0) return null;
    const idx = Math.floor(this.rng() * ids.length);
    return ids[idx] ?? null;
  }

  randomizeBlock(
    state: ProjectState,
    blockId: ID,
    options?: { ignoreLock?: boolean; forceUseFavorites?: boolean }
  ): { assetId: ID | null; error?: string } {
    const block = state.blocks[blockId];
    if (!block) return { assetId: null, error: 'Block not found' };

    if (block.locked && !options?.ignoreLock) {
      return { assetId: block.imageAssetId, error: 'Block is locked' };
    }

    const eligible = this.getEligibleAssets(
      block,
      state.assets,
      state.folders,
      options?.forceUseFavorites
    );

    if (eligible.length === 0) {
      return { assetId: null, error: 'No eligible images' };
    }

    // Prefer not picking the same image again if possible
    let pool = eligible;
    if (eligible.length > 1 && block.imageAssetId) {
      const filtered = eligible.filter((id) => id !== block.imageAssetId);
      if (filtered.length > 0) pool = filtered;
    }

    const picked = this.randomPick(pool);
    return { assetId: picked };
  }

  randomizeAll(
    state: ProjectState
  ): { changes: Record<ID, ID | null>; skipped: ID[]; errors: Record<ID, string> } {
    const changes: Record<ID, ID | null> = {};
    const skipped: ID[] = [];
    const errors: Record<ID, string> = {};

    for (const blockId of state.blockOrder) {
      const block = state.blocks[blockId];
      if (!block) continue;
      if (block.locked) {
        skipped.push(blockId);
        continue;
      }
      const result = this.randomizeBlock(state, blockId, { ignoreLock: true });
      if (result.error && result.assetId === null) {
        errors[blockId] = result.error;
      }
      if (result.assetId !== null || result.error === 'No eligible images') {
        changes[blockId] = result.assetId;
      }
    }
    return { changes, skipped, errors };
  }
}

export const defaultRandomizer = new Randomizer();
