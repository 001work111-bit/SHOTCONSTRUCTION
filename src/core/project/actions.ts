import {
  type ProjectState,
  type ID,
  type TextContent,
  type OverlaySettings,
  type ImageFit,
  type ImagePosition,
  type BlockDimensions,
  type AspectRatioPreset,
  type PreviewSettings,
  type AssetMeta,
  type GlobalSettings,
  createDefaultBlock,
  createId,
  aspectToSize,
  DEFAULT_TEXT_TEMPLATE,
} from '../types';
import { defaultRandomizer } from '../randomizer/Randomizer';
import type { ScannedCatalog } from '../../filesystem/FileSystemAdapter';

export type ToastLevel = 'info' | 'success' | 'warning' | 'error';

export interface ActionResult {
  state: ProjectState;
  message?: { level: ToastLevel; text: string };
  /** Whether this action should be recorded in undo history (caller pushes BEFORE applying) */
  recordHistory: boolean;
}

function touch(state: ProjectState): ProjectState {
  return {
    ...state,
    dirty: true,
    meta: { ...state.meta, updatedAt: Date.now() },
  };
}

export function selectBlock(state: ProjectState, blockId: ID | null): ActionResult {
  return { state: { ...state, selectedBlockId: blockId }, recordHistory: false };
}

export function setMode(state: ProjectState, mode: 'edit' | 'preview'): ActionResult {
  return { state: { ...state, mode }, recordHistory: false };
}

export function setBlockCount(state: ProjectState, count: number): ActionResult {
  const n = Math.max(1, Math.min(50, Math.floor(count)));
  const folderIds = Object.keys(state.folders);
  let blocks = { ...state.blocks };
  let blockOrder = [...state.blockOrder];

  if (n > blockOrder.length) {
    for (let i = blockOrder.length; i < n; i++) {
      const b = createDefaultBlock(i, state.template, folderIds);
      // apply global overlay defaults
      b.overlay = { ...state.settings.overlay, override: false };
      b.dimensions = { ...state.settings.defaultDimensions };
      blocks[b.id] = b;
      blockOrder.push(b.id);
    }
  } else if (n < blockOrder.length) {
    const removed = blockOrder.slice(n);
    blockOrder = blockOrder.slice(0, n);
    const nextBlocks = { ...blocks };
    for (const id of removed) delete nextBlocks[id];
    blocks = nextBlocks;
    // Clean stacks of removed blocks
    const stacks = state.stacks.map((s) => {
      const images = { ...s.images };
      for (const id of removed) delete images[id];
      return { ...s, images };
    });
    const selectedBlockId =
      state.selectedBlockId && blockOrder.includes(state.selectedBlockId)
        ? state.selectedBlockId
        : blockOrder[0] ?? null;
    return {
      state: touch({
        ...state,
        blocks,
        blockOrder,
        stacks,
        selectedBlockId,
        settings: { ...state.settings, blockCount: n },
      }),
      recordHistory: true,
    };
  }

  // re-number orders
  blockOrder.forEach((id, i) => {
    if (blocks[id]) {
      blocks[id] = {
        ...blocks[id],
        order: i,
        name: `Block ${String(i + 1).padStart(2, '0')}`,
      };
    }
  });

  return {
    state: touch({
      ...state,
      blocks,
      blockOrder,
      settings: { ...state.settings, blockCount: n },
      selectedBlockId:
        state.selectedBlockId && blockOrder.includes(state.selectedBlockId)
          ? state.selectedBlockId
          : blockOrder[0] ?? null,
    }),
    recordHistory: true,
  };
}

export function addBlock(state: ProjectState): ActionResult {
  return setBlockCount(state, state.blockOrder.length + 1);
}

export function deleteBlock(state: ProjectState, blockId: ID): ActionResult {
  if (state.blockOrder.length <= 1) {
    return {
      state,
      message: { level: 'warning', text: 'At least one block is required' },
      recordHistory: false,
    };
  }
  const idx = state.blockOrder.indexOf(blockId);
  if (idx < 0) return { state, recordHistory: false };
  const blockOrder = state.blockOrder.filter((id) => id !== blockId);
  const blocks = { ...state.blocks };
  delete blocks[blockId];
  blockOrder.forEach((id, i) => {
    blocks[id] = {
      ...blocks[id],
      order: i,
      name: `Block ${String(i + 1).padStart(2, '0')}`,
    };
  });
  const stacks = state.stacks.map((s) => {
    const images = { ...s.images };
    delete images[blockId];
    return { ...s, images };
  });
  return {
    state: touch({
      ...state,
      blocks,
      blockOrder,
      stacks,
      settings: { ...state.settings, blockCount: blockOrder.length },
      selectedBlockId:
        state.selectedBlockId === blockId
          ? blockOrder[Math.min(idx, blockOrder.length - 1)] ?? null
          : state.selectedBlockId,
    }),
    recordHistory: true,
  };
}

export function applyCatalog(state: ProjectState, catalog: ScannedCatalog): ActionResult {
  const folders: ProjectState['folders'] = {};
  const assets: ProjectState['assets'] = {};
  for (const f of catalog.folders) folders[f.id] = f;
  for (const a of catalog.assets) assets[a.id] = a;

  const folderIds = Object.keys(folders);
  // Update blocks: select all folders by default if they had none or previous folders gone
  const blocks = { ...state.blocks };
  for (const id of state.blockOrder) {
    const b = blocks[id];
    if (!b) continue;
    const stillValid = b.selectedFolderIds.filter((fid) => folders[fid]);
    blocks[id] = {
      ...b,
      selectedFolderIds: stillValid.length > 0 ? stillValid : folderIds,
      // clear missing images
      imageAssetId: b.imageAssetId && assets[b.imageAssetId] ? b.imageAssetId : null,
      favoriteAssetIds: b.favoriteAssetIds.filter((aid) => assets[aid]),
    };
  }

  return {
    state: touch({
      ...state,
      folders,
      assets,
      blocks,
      rootFolderName: catalog.rootName,
    }),
    message: {
      level: 'success',
      text: `Loaded ${catalog.assets.length} images in ${catalog.folders.length} folders`,
    },
    recordHistory: true,
  };
}

export function setBlockFolders(state: ProjectState, blockId: ID, folderIds: ID[]): ActionResult {
  const block = state.blocks[blockId];
  if (!block) return { state, recordHistory: false };
  return {
    state: touch({
      ...state,
      blocks: {
        ...state.blocks,
        [blockId]: { ...block, selectedFolderIds: folderIds },
      },
    }),
    recordHistory: true,
  };
}

export function randomizeBlock(state: ProjectState, blockId: ID, ignoreLock = true): ActionResult {
  const result = defaultRandomizer.randomizeBlock(state, blockId, { ignoreLock });
  if (result.error === 'Block not found') {
    return { state, recordHistory: false };
  }
  if (result.error === 'No eligible images') {
    return {
      state,
      message: { level: 'warning', text: 'No eligible images for this block' },
      recordHistory: false,
    };
  }
  const block = state.blocks[blockId];
  return {
    state: touch({
      ...state,
      blocks: {
        ...state.blocks,
        [blockId]: { ...block, imageAssetId: result.assetId },
      },
      activeStackId: null,
    }),
    recordHistory: true,
  };
}

export function randomizeAll(state: ProjectState): ActionResult {
  const { changes, skipped, errors } = defaultRandomizer.randomizeAll(state);
  if (Object.keys(changes).length === 0) {
    return {
      state,
      message: {
        level: 'warning',
        text:
          skipped.length === state.blockOrder.length
            ? 'All blocks are locked'
            : 'No eligible images',
      },
      recordHistory: false,
    };
  }
  const blocks = { ...state.blocks };
  for (const [blockId, assetId] of Object.entries(changes)) {
    const b = blocks[blockId];
    if (b) blocks[blockId] = { ...b, imageAssetId: assetId };
  }
  const errCount = Object.keys(errors).length;
  return {
    state: touch({ ...state, blocks, activeStackId: null }),
    message: {
      level: errCount ? 'warning' : 'success',
      text: `Randomized ${Object.keys(changes).length} blocks${skipped.length ? `, skipped ${skipped.length} locked` : ''}${errCount ? `, ${errCount} had no images` : ''}`,
    },
    recordHistory: true,
  };
}

export function toggleLock(state: ProjectState, blockId: ID): ActionResult {
  const block = state.blocks[blockId];
  if (!block) return { state, recordHistory: false };
  return {
    state: touch({
      ...state,
      blocks: {
        ...state.blocks,
        [blockId]: { ...block, locked: !block.locked },
      },
    }),
    recordHistory: true,
  };
}

export function setAllLocks(state: ProjectState, locked: boolean): ActionResult {
  const blocks = { ...state.blocks };
  for (const id of state.blockOrder) {
    if (blocks[id]) blocks[id] = { ...blocks[id], locked };
  }
  return { state: touch({ ...state, blocks }), recordHistory: true };
}

export function toggleFavorite(state: ProjectState, blockId: ID): ActionResult {
  const block = state.blocks[blockId];
  if (!block || !block.imageAssetId) {
    return {
      state,
      message: { level: 'warning', text: 'No image to favorite' },
      recordHistory: false,
    };
  }
  const assetId = block.imageAssetId;
  const has = block.favoriteAssetIds.includes(assetId);
  const favoriteAssetIds = has
    ? block.favoriteAssetIds.filter((id) => id !== assetId)
    : [...block.favoriteAssetIds, assetId];
  return {
    state: touch({
      ...state,
      blocks: {
        ...state.blocks,
        [blockId]: { ...block, favoriteAssetIds },
      },
    }),
    message: {
      level: 'success',
      text: has ? 'Removed from favorites' : `Added to favorites (${favoriteAssetIds.length})`,
    },
    recordHistory: true,
  };
}

export function setUseFavorites(state: ProjectState, blockId: ID, use: boolean): ActionResult {
  const block = state.blocks[blockId];
  if (!block) return { state, recordHistory: false };
  return {
    state: touch({
      ...state,
      blocks: {
        ...state.blocks,
        [blockId]: { ...block, useFavorites: use },
      },
    }),
    recordHistory: true,
  };
}

export function saveStack(state: ProjectState, name?: string): ActionResult {
  const images: Record<ID, ID | null> = {};
  for (const id of state.blockOrder) {
    images[id] = state.blocks[id]?.imageAssetId ?? null;
  }
  const num = state.stacks.length + 1;
  const stack = {
    id: createId('stack'),
    name: name ?? `Stack ${String(num).padStart(3, '0')}`,
    createdAt: Date.now(),
    images,
  };
  return {
    state: touch({
      ...state,
      stacks: [...state.stacks, stack],
      activeStackId: stack.id,
    }),
    message: { level: 'success', text: `Saved ${stack.name}` },
    recordHistory: true,
  };
}

export function applyStack(state: ProjectState, stackId: ID): ActionResult {
  const stack = state.stacks.find((s) => s.id === stackId);
  if (!stack) {
    return {
      state,
      message: { level: 'error', text: 'Stack not found' },
      recordHistory: false,
    };
  }
  const blocks = { ...state.blocks };
  let missing = 0;
  for (const [blockId, assetId] of Object.entries(stack.images)) {
    if (!blocks[blockId]) continue;
    if (assetId && !state.assets[assetId]) {
      missing++;
      blocks[blockId] = { ...blocks[blockId], imageAssetId: null };
    } else {
      blocks[blockId] = { ...blocks[blockId], imageAssetId: assetId };
    }
  }
  return {
    state: touch({ ...state, blocks, activeStackId: stackId }),
    message: missing
      ? { level: 'warning', text: `Stack applied with ${missing} missing assets` }
      : { level: 'info', text: `Applied ${stack.name}` },
    recordHistory: true,
  };
}

export function deleteStack(state: ProjectState, stackId: ID): ActionResult {
  const stacks = state.stacks.filter((s) => s.id !== stackId);
  return {
    state: touch({
      ...state,
      stacks,
      activeStackId: state.activeStackId === stackId ? null : state.activeStackId,
    }),
    recordHistory: true,
  };
}

export function navigateStack(state: ProjectState, direction: -1 | 1): ActionResult {
  if (state.stacks.length === 0) return { state, recordHistory: false };
  const idx = state.activeStackId
    ? state.stacks.findIndex((s) => s.id === state.activeStackId)
    : -1;
  let next = idx + direction;
  if (next < 0) next = state.stacks.length - 1;
  if (next >= state.stacks.length) next = 0;
  return applyStack(state, state.stacks[next].id);
}

export function updateBlockText(
  state: ProjectState,
  blockId: ID,
  text: Partial<TextContent>
): ActionResult {
  const block = state.blocks[blockId];
  if (!block) return { state, recordHistory: false };
  return {
    state: touch({
      ...state,
      blocks: {
        ...state.blocks,
        [blockId]: {
          ...block,
          text: {
            ...block.text,
            ...text,
            items: text.items ?? block.text.items,
            categories: text.categories ?? block.text.categories,
          },
          textIsOverride: true,
        },
      },
    }),
    recordHistory: true,
  };
}

export function applyTemplateToAll(state: ProjectState, template?: TextContent): ActionResult {
  const t = template ?? state.template;
  const blocks = { ...state.blocks };
  for (const id of state.blockOrder) {
    const b = blocks[id];
    if (!b) continue;
    blocks[id] = {
      ...b,
      text: {
        title: t.title,
        subtitle: t.subtitle,
        items: [...t.items],
        categories: t.categories ? [...t.categories] : [],
      },
      textIsOverride: false,
    };
  }
  return {
    state: touch({ ...state, blocks, template: t }),
    message: { level: 'success', text: 'Template applied to all blocks' },
    recordHistory: true,
  };
}

export function setTemplate(state: ProjectState, template: TextContent): ActionResult {
  return {
    state: touch({ ...state, template }),
    recordHistory: true,
    message: { level: 'success', text: 'Template updated' },
  };
}

export function importTemplateJson(state: ProjectState, data: unknown): ActionResult {
  try {
    if (!data || typeof data !== 'object') {
      return {
        state,
        message: { level: 'error', text: 'Invalid template JSON' },
        recordHistory: false,
      };
    }
    const raw = data as Record<string, unknown>;
    const template: TextContent = {
      title: typeof raw.title === 'string' ? raw.title : DEFAULT_TEXT_TEMPLATE.title,
      subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : DEFAULT_TEXT_TEMPLATE.subtitle,
      items: Array.isArray(raw.items)
        ? raw.items.filter((x): x is string => typeof x === 'string')
        : [...DEFAULT_TEXT_TEMPLATE.items],
      categories: Array.isArray(raw.categories)
        ? raw.categories.filter((x): x is string => typeof x === 'string')
        : [...(DEFAULT_TEXT_TEMPLATE.categories ?? [])],
    };
    return applyTemplateToAll({ ...state, template }, template);
  } catch {
    return {
      state,
      message: { level: 'error', text: 'Invalid template JSON' },
      recordHistory: false,
    };
  }
}

export function setBlockOverlay(
  state: ProjectState,
  blockId: ID,
  overlay: Partial<OverlaySettings>
): ActionResult {
  const block = state.blocks[blockId];
  if (!block) return { state, recordHistory: false };
  const nextOverride = overlay.override !== undefined ? overlay.override : true;
  return {
    state: touch({
      ...state,
      blocks: {
        ...state.blocks,
        [blockId]: {
          ...block,
          overlay: { ...block.overlay, ...overlay, override: nextOverride },
        },
      },
    }),
    recordHistory: true,
  };
}

export function removeFavoriteAsset(
  state: ProjectState,
  blockId: ID,
  assetId: ID
): ActionResult {
  const block = state.blocks[blockId];
  if (!block) return { state, recordHistory: false };
  return {
    state: touch({
      ...state,
      blocks: {
        ...state.blocks,
        [blockId]: {
          ...block,
          favoriteAssetIds: block.favoriteAssetIds.filter((id) => id !== assetId),
        },
      },
    }),
    recordHistory: true,
  };
}

export function setGlobalOverlay(state: ProjectState, overlay: Partial<OverlaySettings>): ActionResult {
  const nextOverlay = { ...state.settings.overlay, ...overlay };
  const blocks = { ...state.blocks };
  for (const id of state.blockOrder) {
    const b = blocks[id];
    if (b && !b.overlay.override) {
      blocks[id] = { ...b, overlay: { ...nextOverlay, override: false } };
    }
  }
  return {
    state: touch({
      ...state,
      settings: { ...state.settings, overlay: nextOverlay },
      blocks,
    }),
    recordHistory: true,
  };
}

export function setImageFit(state: ProjectState, blockId: ID, fit: ImageFit): ActionResult {
  const block = state.blocks[blockId];
  if (!block) return { state, recordHistory: false };
  return {
    state: touch({
      ...state,
      blocks: { ...state.blocks, [blockId]: { ...block, imageFit: fit } },
    }),
    recordHistory: true,
  };
}

export function setImagePosition(
  state: ProjectState,
  blockId: ID,
  position: Partial<ImagePosition>
): ActionResult {
  const block = state.blocks[blockId];
  if (!block) return { state, recordHistory: false };
  return {
    state: touch({
      ...state,
      blocks: {
        ...state.blocks,
        [blockId]: {
          ...block,
          imagePosition: { ...block.imagePosition, ...position },
        },
      },
    }),
    recordHistory: true,
  };
}

export function setBlockImage(state: ProjectState, blockId: ID, assetId: ID | null): ActionResult {
  const block = state.blocks[blockId];
  if (!block) return { state, recordHistory: false };
  return {
    state: touch({
      ...state,
      blocks: {
        ...state.blocks,
        [blockId]: { ...block, imageAssetId: assetId },
      },
      activeStackId: null,
    }),
    recordHistory: true,
  };
}

export function addExternalAsset(
  state: ProjectState,
  asset: AssetMeta,
  blockId?: ID
): ActionResult {
  const assets = { ...state.assets, [asset.id]: asset };
  let blocks = state.blocks;
  if (blockId && state.blocks[blockId]) {
    blocks = {
      ...state.blocks,
      [blockId]: { ...state.blocks[blockId], imageAssetId: asset.id },
    };
  }
  return {
    state: touch({ ...state, assets, blocks, activeStackId: blockId ? null : state.activeStackId }),
    recordHistory: true,
    message: { level: 'success', text: `Image set: ${asset.filename}` },
  };
}

export function setDimensions(
  state: ProjectState,
  dims: Partial<BlockDimensions>,
  applyToAll = true
): ActionResult {
  let defaultDimensions = { ...state.settings.defaultDimensions, ...dims };
  if (dims.aspectRatio && dims.aspectRatio !== 'custom') {
    const size = aspectToSize(dims.aspectRatio as AspectRatioPreset, defaultDimensions.width);
    defaultDimensions = { ...defaultDimensions, ...size, aspectRatio: dims.aspectRatio };
  } else if (dims.width != null && defaultDimensions.lockAspect && defaultDimensions.aspectRatio !== 'custom') {
    const size = aspectToSize(defaultDimensions.aspectRatio, dims.width);
    defaultDimensions = { ...defaultDimensions, height: size.height };
  } else if (dims.height != null && defaultDimensions.lockAspect && defaultDimensions.aspectRatio !== 'custom') {
    // reverse calc width from height roughly
    const size = aspectToSize(defaultDimensions.aspectRatio, 1000);
    const ratio = size.width / size.height;
    defaultDimensions = {
      ...defaultDimensions,
      width: Math.round(dims.height * ratio),
      height: dims.height,
    };
  }

  let blocks = state.blocks;
  if (applyToAll) {
    blocks = { ...state.blocks };
    for (const id of state.blockOrder) {
      if (blocks[id]) {
        blocks[id] = { ...blocks[id], dimensions: { ...defaultDimensions } };
      }
    }
  }

  return {
    state: touch({
      ...state,
      settings: { ...state.settings, defaultDimensions },
      blocks,
    }),
    recordHistory: true,
  };
}

export function setPreviewSettings(
  state: ProjectState,
  preview: Partial<PreviewSettings>
): ActionResult {
  return {
    state: touch({
      ...state,
      preview: { ...state.preview, ...preview },
    }),
    recordHistory: true,
  };
}

export function setProjectName(state: ProjectState, name: string): ActionResult {
  return {
    state: touch({
      ...state,
      meta: { ...state.meta, name },
    }),
    recordHistory: false,
  };
}

export function setGlobalSettings(
  state: ProjectState,
  partial: Partial<GlobalSettings>
): ActionResult {
  return {
    state: touch({
      ...state,
      settings: { ...state.settings, ...partial },
    }),
    recordHistory: true,
  };
}

export function replaceProject(_state: ProjectState, next: ProjectState): ActionResult {
  return { state: { ...next, dirty: false, mode: 'edit' }, recordHistory: true };
}

export function markClean(state: ProjectState): ActionResult {
  return { state: { ...state, dirty: false }, recordHistory: false };
}
