import { ASPECT_PRESETS, DEFAULT_BLOCK_SIZE, ratioToPreset } from './defaults';
import { createBlockId } from './ids';
import { createBlock } from './project';
import type {
  AspectPreset,
  AssetId,
  Block,
  BlockId,
  FolderId,
  ImageFit,
  ImagePosition,
  Overlay,
  Project,
  TextLayerKey,
  TextOverride,
  TypographySet,
} from './types';

/* ------------------------------------------------------------ collection -- */

export function getBlock(project: Project, blockId: BlockId | null | undefined): Block | null {
  if (!blockId) return null;
  return project.blocks.byId[blockId] ?? null;
}

export function blockList(project: Project): Block[] {
  return project.blocks.order.map((id) => project.blocks.byId[id]).filter(Boolean);
}

export function blockCount(project: Project): number {
  return project.blocks.order.length;
}

/** Human facing number of a block (`#03`) — display only, never an identity (spec §76). */
export function blockNumber(project: Project, blockId: BlockId): number {
  return project.blocks.order.indexOf(blockId) + 1;
}

function withBlocks(project: Project, order: BlockId[], byId: Record<BlockId, Block>): Project {
  return { ...project, blocks: { order, byId }, meta: { ...project.meta, updatedAt: Date.now() } };
}

export function addBlocks(project: Project, count = 1, defaults?: Partial<Block>): Project {
  const byId = { ...project.blocks.byId };
  const order = [...project.blocks.order];
  const folderIds = project.folders.map((f) => f.id);
  for (let i = 0; i < Math.max(0, Math.floor(count)); i += 1) {
    const block = createBlock({ selectedFolderIds: folderIds, ...defaults }, project.settings.blockDefaults);
    byId[block.id] = block;
    order.push(block.id);
  }
  return withBlocks(project, order, byId);
}

export function removeBlock(project: Project, blockId: BlockId): Project {
  if (!project.blocks.byId[blockId]) return project;
  const order = project.blocks.order.filter((id) => id !== blockId);
  const byId = { ...project.blocks.byId };
  delete byId[blockId];
  const favorites = { ...project.favorites };
  delete favorites[blockId]; // block scoped favorites disappear with the block…
  const stacks = project.stacks.map((stack) => {
    // …while stacks keep their other entries and simply ignore the unknown id (spec §78)
    if (!(blockId in stack.entries)) return stack;
    const entries = { ...stack.entries };
    delete entries[blockId];
    return { ...stack, entries };
  });
  return withBlocks({ ...project, favorites, stacks }, order, byId);
}

export function duplicateBlock(project: Project, blockId: BlockId): Project {
  const source = getBlock(project, blockId);
  if (!source) return project;
  const byId = { ...project.blocks.byId };
  const clone: Block = {
    ...source,
    id: createBlockId(),
    createdAt: Date.now(),
    textOverride: source.textOverride ? JSON.parse(JSON.stringify(source.textOverride)) : null,
    overlayOverride: source.overlayOverride ? { ...source.overlayOverride } : null,
    selectedFolderIds: [...source.selectedFolderIds],
    imagePosition: { ...source.imagePosition },
  };
  byId[clone.id] = clone;
  const order = [...project.blocks.order];
  order.splice(order.indexOf(blockId) + 1, 0, clone.id);
  const favorites = { ...project.favorites, [clone.id]: [...(project.favorites[blockId] ?? [])] };
  return withBlocks({ ...project, favorites }, order, byId);
}

export function moveBlock(project: Project, blockId: BlockId, delta: number): Project {
  const order = [...project.blocks.order];
  const index = order.indexOf(blockId);
  if (index < 0) return project;
  const target = Math.max(0, Math.min(order.length - 1, index + delta));
  if (target === index) return project;
  order.splice(index, 1);
  order.splice(target, 0, blockId);
  return withBlocks(project, order, project.blocks.byId);
}

/**
 * Set the number of blocks (spec §12). Existing blocks keep their ids, so their image,
 * text override, folders, lock and favorites survive a resize of the list.
 */
export function setBlockCount(project: Project, count: number): Project {
  const target = Math.max(0, Math.floor(count));
  const current = project.blocks.order.length;
  if (target === current) return project;
  if (target > current) return addBlocks(project, target - current);
  let next = project;
  for (const id of project.blocks.order.slice(target)) next = removeBlock(next, id);
  return next;
}

export function patchBlock(project: Project, blockId: BlockId, patch: Partial<Block>): Project {
  const block = getBlock(project, blockId);
  if (!block) return project;
  const byId = { ...project.blocks.byId, [blockId]: { ...block, ...patch } };
  return withBlocks(project, project.blocks.order, byId);
}

/* ----------------------------------------------------------------- image -- */

export function setBlockImage(project: Project, blockId: BlockId, assetId: AssetId | null): Project {
  const block = getBlock(project, blockId);
  if (!block || block.imageAssetId === assetId) return project;
  return patchBlock(project, blockId, { imageAssetId: assetId });
}

/** Dropped external file: register the asset and point the block at it (spec §38–39). */
export function setBlockExternalImage(project: Project, blockId: BlockId, assetId: AssetId): Project {
  return patchBlock(project, blockId, { imageAssetId: assetId });
}

export function setImageFit(project: Project, blockId: BlockId, fit: ImageFit): Project {
  return patchBlock(project, blockId, { imageFit: fit });
}

export function setImagePosition(project: Project, blockId: BlockId, position: Partial<ImagePosition>): Project {
  const block = getBlock(project, blockId);
  if (!block) return project;
  const next: ImagePosition = {
    x: clamp(position.x ?? block.imagePosition.x, 0, 100),
    y: clamp(position.y ?? block.imagePosition.y, 0, 100),
  };
  return patchBlock(project, blockId, { imagePosition: next });
}

export function nudgeImagePosition(project: Project, blockId: BlockId, dx: number, dy: number): Project {
  const block = getBlock(project, blockId);
  if (!block) return project;
  return setImagePosition(project, blockId, {
    x: block.imagePosition.x + dx,
    y: block.imagePosition.y + dy,
  });
}

/* ---------------------------------------------------------------- geometry */

export interface ResizeInput {
  width?: number;
  height?: number;
  aspect?: AspectPreset;
  lockRatio?: boolean;
  /** which side the user is editing — the other one is recalculated when the ratio is locked */
  driver?: 'width' | 'height';
}

export function resizeBlock(project: Project, blockId: BlockId, input: ResizeInput): Project {
  const block = getBlock(project, blockId);
  if (!block) return project;

  let { width, height } = { width: input.width ?? block.width, height: input.height ?? block.height };
  width = clamp(Math.round(width), 64, 8192);
  height = clamp(Math.round(height), 64, 8192);

  let aspect: AspectPreset = input.aspect ?? block.aspect;

  if (input.aspect && input.aspect !== 'custom') {
    const preset = ASPECT_PRESETS.find((p) => p.id === input.aspect);
    if (preset?.ratio) {
      if (input.driver === 'height') width = Math.round(height * preset.ratio);
      else height = Math.round(width / preset.ratio);
    }
  } else if (input.lockRatio !== false && !input.aspect) {
    const ratio = block.height > 0 ? block.width / block.height : 1;
    if (input.driver === 'height') width = Math.round(height * ratio);
    else height = Math.round(width / ratio);
    aspect = ratioToPreset(ratio);
  } else if (input.width && input.height) {
    aspect = ratioToPreset(width / height);
  }

  return patchBlock(project, blockId, { width, height, aspect });
}

export function applySizeToAll(project: Project, width: number, height: number, aspect: AspectPreset): Project {
  let next = project;
  for (const id of project.blocks.order) {
    next = patchBlock(next, id, { width, height, aspect });
  }
  return next;
}

/* -------------------------------------------------------------- overlays -- */

export function effectiveOverlay(project: Project, block: Block): Overlay {
  return block.overlayOverride ?? project.settings.globalOverlay;
}

export function setBlockOverlay(project: Project, blockId: BlockId, overlay: Overlay | null): Project {
  return patchBlock(project, blockId, { overlayOverride: overlay });
}

export function patchBlockOverlay(project: Project, blockId: BlockId, patch: Partial<Overlay>): Project {
  const block = getBlock(project, blockId);
  if (!block) return project;
  const base = block.overlayOverride ?? project.settings.globalOverlay;
  return patchBlock(project, blockId, { overlayOverride: { ...base, ...patch } });
}

/* ------------------------------------------------------------------ text -- */

/** Write a layer of the block text. `line` targets a single item/keyword line. */
export function setBlockTextLayer(
  project: Project,
  blockId: BlockId,
  layer: TextLayerKey,
  value: string,
  line?: number,
): Project {
  const block = getBlock(project, blockId);
  if (!block) return project;
  const base: TextOverride = block.textOverride ? { ...block.textOverride } : {};

  if (layer === 'title' || layer === 'subtitle') {
    base[layer] = value;
  } else {
    const resolved = base[layer] ?? project.template[layer];
    const list = [...resolved];
    if (line === undefined || line < 0) list.push(value);
    else list[line] = value;
    base[layer] = list;
  }
  return patchBlock(project, blockId, { textOverride: base });
}

export function addBlockTextLine(project: Project, blockId: BlockId, layer: 'items' | 'keywords', after?: number): Project {
  const block = getBlock(project, blockId);
  if (!block) return project;
  const base: TextOverride = block.textOverride ? { ...block.textOverride } : {};
  const list = [...(base[layer] ?? project.template[layer])];
  const at = after === undefined ? list.length : Math.min(list.length, after + 1);
  list.splice(at, 0, '');
  base[layer] = list;
  return patchBlock(project, blockId, { textOverride: base });
}

export function removeBlockTextLine(project: Project, blockId: BlockId, layer: 'items' | 'keywords', line: number): Project {
  const block = getBlock(project, blockId);
  if (!block) return project;
  const base: TextOverride = block.textOverride ? { ...block.textOverride } : {};
  const list = [...(base[layer] ?? project.template[layer])];
  if (line < 0 || line >= list.length) return project;
  list.splice(line, 1);
  base[layer] = list;
  return patchBlock(project, blockId, { textOverride: base });
}

/** Drop the local override → the block follows the global template again (spec §19). */
export function resetBlockText(project: Project, blockId: BlockId): Project {
  return patchBlock(project, blockId, { textOverride: null });
}

export function setBlockTypographyOverride(
  project: Project,
  blockId: BlockId,
  override: Partial<TypographySet> | null,
): Project {
  return patchBlock(project, blockId, { typographyOverride: override });
}

export function patchBlockTypography(
  project: Project,
  blockId: BlockId,
  layer: TextLayerKey,
  patch: Partial<TypographySet['layers'][TextLayerKey]>,
): Project {
  const block = getBlock(project, blockId);
  if (!block) return project;
  const base: Partial<TypographySet> = block.typographyOverride ? { ...block.typographyOverride } : {};
  const layers = { ...(base.layers ?? {}) } as TypographySet['layers'];
  const merged = { ...project.settings.typography.layers[layer], ...(layers[layer] ?? {}), ...patch };
  layers[layer] = merged;
  return patchBlock(project, blockId, { typographyOverride: { ...base, layers } });
}

/* ---------------------------------------------------------------- folders -- */

export function setBlockFolders(project: Project, blockId: BlockId, folderIds: FolderId[]): Project {
  return patchBlock(project, blockId, { selectedFolderIds: [...folderIds] });
}

export function toggleBlockFolder(project: Project, blockId: BlockId, folderId: FolderId): Project {
  const block = getBlock(project, blockId);
  if (!block) return project;
  const set = new Set(block.selectedFolderIds.length ? block.selectedFolderIds : project.folders.map((f) => f.id));
  if (set.has(folderId)) set.delete(folderId);
  else set.add(folderId);
  return patchBlock(project, blockId, { selectedFolderIds: [...set] });
}

export function selectAllFolders(project: Project, blockId: BlockId): Project {
  return setBlockFolders(project, blockId, project.folders.map((f) => f.id));
}

export function clearFolders(project: Project, blockId: BlockId): Project {
  return patchBlock(project, blockId, { selectedFolderIds: [] , });
}

export function setUseFavorites(project: Project, blockId: BlockId, value: boolean): Project {
  return patchBlock(project, blockId, { useFavorites: value });
}

/* -----------------------------------------------------------------  misc -- */

export function setBlockLocked(project: Project, blockId: BlockId, locked: boolean): Project {
  return patchBlock(project, blockId, { locked });
}

export function toggleBlockLocked(project: Project, blockId: BlockId): Project {
  const block = getBlock(project, blockId);
  if (!block) return project;
  return setBlockLocked(project, blockId, !block.locked);
}

export function setLockedForBlocks(project: Project, blockIds: BlockId[], locked: boolean): Project {
  let next = project;
  for (const id of blockIds) next = setBlockLocked(next, id, locked);
  return next;
}

export function setLockedAll(project: Project, locked: boolean): Project {
  return setLockedForBlocks(project, project.blocks.order, locked);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const DEFAULT_BLOCK_FRAME = DEFAULT_BLOCK_SIZE;
