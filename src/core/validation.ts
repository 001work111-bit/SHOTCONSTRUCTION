import { DEFAULT_PREVIEW_SETTINGS, DEFAULT_SETTINGS, DEFAULT_TEMPLATE, DEFAULT_TYPOGRAPHY } from './defaults';
import { AppError } from './errors';
import { PROJECT_VERSION, structuredCloneSafe } from './project';
import { validateTemplate } from './templates';
import type { Block, Project, TextTemplate } from './types';

/**
 * ProjectLoader validation (spec §79, §107).
 * Never throw a white screen: return either a repaired project + warnings, or a typed error.
 */

export interface ProjectValidationOk {
  ok: true;
  project: Project;
  warnings: string[];
}
export interface ProjectValidationFail {
  ok: false;
  error: AppError;
}
export type ProjectValidation = ProjectValidationOk | ProjectValidationFail;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceBlock(raw: unknown, index: number, warnings: string[]): Block | null {
  if (!isObject(raw)) {
    warnings.push(`Block #${index + 1} is not an object and was skipped.`);
    return null;
  }
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  if (!id) {
    warnings.push(`Block #${index + 1} has no id and was skipped.`);
    return null;
  }
  const width = Number.isFinite(raw.width) ? Number(raw.width) : DEFAULT_SETTINGS.blockDefaults.width;
  const height = Number.isFinite(raw.height) ? Number(raw.height) : DEFAULT_SETTINGS.blockDefaults.height;
  return {
    id,
    width,
    height,
    aspect: (raw.aspect as Block['aspect']) ?? 'custom',
    imageAssetId: typeof raw.imageAssetId === 'string' ? raw.imageAssetId : null,
    selectedFolderIds: Array.isArray(raw.selectedFolderIds) ? raw.selectedFolderIds.map(String) : [],
    locked: Boolean(raw.locked),
    useFavorites: Boolean(raw.useFavorites),
    textOverride: isObject(raw.textOverride) ? (raw.textOverride as Block['textOverride']) : null,
    typographyOverride: isObject(raw.typographyOverride) ? (raw.typographyOverride as Block['typographyOverride']) : null,
    overlayOverride: isObject(raw.overlayOverride) ? (raw.overlayOverride as unknown as Block['overlayOverride']) : null,
    imageFit: (raw.imageFit as Block['imageFit']) ?? 'cover',
    imagePosition: isObject(raw.imagePosition)
      ? {
          x: Number((raw.imagePosition as { x?: number }).x ?? 50),
          y: Number((raw.imagePosition as { y?: number }).y ?? 50),
        }
      : { x: 50, y: 50 },
    createdAt: Number.isFinite(raw.createdAt) ? Number(raw.createdAt) : Date.now(),
  };
}

export function validateProject(raw: unknown): ProjectValidation {
  const warnings: string[] = [];
  if (!isObject(raw)) {
    return { ok: false, error: new AppError('invalid-project', 'Project could not be loaded: the file is not a JSON object.') };
  }
  if (raw.version === undefined) {
    return {
      ok: false,
      error: new AppError('invalid-project', 'Project could not be loaded: missing `version`.', {
        hint: 'This does not look like a Shot Composer project file.',
      }),
    };
  }
  const version = Number(raw.version);
  if (!Number.isFinite(version) || version < 1) {
    return { ok: false, error: new AppError('invalid-project', `Unsupported project version: ${String(raw.version)}.`) };
  }
  if (version > PROJECT_VERSION) {
    return {
      ok: false,
      error: new AppError('invalid-project', `Project version ${version} is newer than this build (${PROJECT_VERSION}).`, {
        hint: 'Update the app to open this file.',
      }),
    };
  }

  const meta = isObject(raw.meta) ? raw.meta : {};
  const settings = isObject(raw.settings) ? raw.settings : {};
  const base = structuredCloneSafe(DEFAULT_SETTINGS);

  const folders = Array.isArray(raw.folders)
    ? raw.folders.filter(isObject).map((f) => ({
        id: String(f.id ?? ''),
        name: String(f.name ?? ''),
        path: String(f.path ?? ''),
        parentId: typeof f.parentId === 'string' ? f.parentId : null,
        depth: Number.isFinite(f.depth) ? Number(f.depth) : 0,
        assetIds: Array.isArray(f.assetIds) ? f.assetIds.map(String) : [],
        imageCount: Number.isFinite(f.imageCount) ? Number(f.imageCount) : 0,
        unsupportedCount: Number.isFinite(f.unsupportedCount) ? Number(f.unsupportedCount) : 0,
      }))
    : [];

  const assets = Array.isArray(raw.assets)
    ? raw.assets.filter(isObject).map((a) => ({
        id: String(a.id ?? ''),
        name: String(a.name ?? ''),
        folderId: typeof a.folderId === 'string' ? a.folderId : null,
        path: String(a.path ?? ''),
        format: (a.format as Project['assets'][number]['format']) ?? 'unknown',
        mime: String(a.mime ?? ''),
        bytes: Number.isFinite(a.bytes) ? Number(a.bytes) : 0,
        width: Number.isFinite(a.width) ? Number(a.width) : undefined,
        height: Number.isFinite(a.height) ? Number(a.height) : undefined,
        source: a.source === 'manual' ? ('manual' as const) : ('folder' as const),
        refKey: String(a.refKey ?? ''),
        addedAt: Number.isFinite(a.addedAt) ? Number(a.addedAt) : Date.now(),
      }))
    : [];

  if (Array.isArray(raw.assets) && assets.length !== raw.assets.length) {
    warnings.push(`${raw.assets.length - assets.length} malformed asset entries were ignored.`);
  }

  const assetIds = new Set(assets.map((a) => a.id));
  const folderIds = new Set(folders.map((f) => f.id));

  const blocksRaw = isObject(raw.blocks) ? raw.blocks : null;
  const orderRaw = blocksRaw && Array.isArray(blocksRaw.order) ? blocksRaw.order : [];
  const byIdRaw = blocksRaw && isObject(blocksRaw.byId) ? blocksRaw.byId : {};

  const byId: Record<string, Block> = {};
  const order: string[] = [];
  const seen = new Set<string>();

  for (const idRaw of orderRaw) {
    const id = String(idRaw);
    if (byIdRaw[id]) continue;
    const block = coerceBlock(byIdRaw[id] ?? { id }, order.length, warnings);
    if (block) {
      byId[block.id] = block;
      order.push(block.id);
      seen.add(block.id);
    }
  }
  // blocks present in `byId` but missing from `order` are appended (never dropped silently)
  for (const [id, value] of Object.entries(byIdRaw)) {
    if (seen.has(id)) continue;
    const block = coerceBlock({ ...(value as object), id }, order.length, warnings);
    if (block) {
      byId[block.id] = block;
      order.push(block.id);
      if (!orderRaw.includes(id)) warnings.push(`Block ${id} was missing from the order list and was appended.`);
    }
  }

  const missingAssets: string[] = [];
  for (const id of order) {
    const block = byId[id];
    if (block.imageAssetId && !assetIds.has(block.imageAssetId)) {
      missingAssets.push(block.imageAssetId);
      warnings.push(`Block ${id} references an unknown asset; it will render as an empty block.`);
      byId[id] = { ...block, imageAssetId: null };
    }
    block.selectedFolderIds = block.selectedFolderIds.filter((folderId) => {
      if (folderIds.has(folderId)) return true;
      warnings.push(`Block ${id}: folder ${folderId} no longer exists and was removed from the selection.`);
      return false;
    });
  }

  const favorites: Project['favorites'] = {};
  if (isObject(raw.favorites)) {
    for (const [blockId, list] of Object.entries(raw.favorites)) {
      if (!byId[blockId]) {
        warnings.push(`Favorites of an unknown block (${blockId}) were ignored.`);
        continue;
      }
      const filtered = (Array.isArray(list) ? list.map(String) : []).filter((assetId) => assetIds.has(assetId));
      if (filtered.length) favorites[blockId] = filtered;
    }
  }

  const stacks = Array.isArray(raw.stacks)
    ? raw.stacks
        .filter(isObject)
        .map((s, i) => {
          const entriesRaw = isObject(s.entries) ? s.entries : {};
          const entries: Project['stacks'][number]['entries'] = {};
          for (const [blockId, entryRaw] of Object.entries(entriesRaw)) {
            if (!byId[blockId]) {
              warnings.push(`Stack “${String(s.name ?? i + 1)}” contains a deleted block (${blockId}); the entry is kept but ignored.`);
            }
            const entry = isObject(entryRaw) ? entryRaw : {};
            entries[blockId] = {
              assetId: typeof entry.assetId === 'string' ? entry.assetId : null,
              imageFit: (entry.imageFit as Block['imageFit']) ?? 'cover',
              imagePosition: isObject(entry.imagePosition)
                ? {
                    x: Number((entry.imagePosition as { x?: number }).x ?? 50),
                    y: Number((entry.imagePosition as { y?: number }).y ?? 50),
                  }
                : { x: 50, y: 50 },
            };
          }
          return {
            id: String(s.id ?? `stack_restored_${i}`),
            index: Number.isFinite(s.index) ? Number(s.index) : i + 1,
            name: String(s.name ?? `Stack ${String(i + 1).padStart(3, '0')}`),
            createdAt: Number.isFinite(s.createdAt) ? Number(s.createdAt) : Date.now(),
            entries,
          };
        })
    : [];

  let template: TextTemplate = structuredCloneSafe(DEFAULT_TEMPLATE);
  if (raw.template !== undefined) {
    const validated = validateTemplate(raw.template);
    if (validated.ok) template = validated.template;
    else {
      warnings.push(`Stored text template was invalid (${validated.error.message}); the default was used.`);
    }
  }

  const project: Project = {
    version: PROJECT_VERSION,
    meta: {
      id: String(meta.id ?? `project_restored`),
      name: String(meta.name ?? 'Untitled preview'),
      createdAt: Number.isFinite(meta.createdAt) ? Number(meta.createdAt) : Date.now(),
      updatedAt: Number.isFinite(meta.updatedAt) ? Number(meta.updatedAt) : Date.now(),
    },
    settings: {
      ...base,
      ...(isObject(settings) ? settings : {}),
      globalOverlay: {
        ...base.globalOverlay,
        ...(isObject(settings) && isObject(settings.globalOverlay) ? settings.globalOverlay : {}),
      } as Project['settings']['globalOverlay'],
      typography: {
        ...structuredCloneSafe(DEFAULT_TYPOGRAPHY),
        ...(isObject(settings) && isObject(settings.typography) ? settings.typography : {}),
      } as Project['settings']['typography'],
      blockDefaults: {
        ...base.blockDefaults,
        ...(isObject(settings) && isObject(settings.blockDefaults) ? settings.blockDefaults : {}),
      } as Project['settings']['blockDefaults'],
      lastSeed: typeof settings.lastSeed === 'string' ? settings.lastSeed : null,
    },
    folders,
    assets,
    template,
    blocks: { order, byId },
    favorites,
    stacks,
    preview: {
      ...DEFAULT_PREVIEW_SETTINGS,
      ...(isObject(raw.preview) ? raw.preview : {}),
    } as Project['preview'],
    missingAssets,
    unlinkedFolderIds: Array.isArray(raw.unlinkedFolderIds) ? raw.unlinkedFolderIds.map(String) : [],
  };

  return { ok: true, project, warnings };
}

export function parseProjectJson(text: string): ProjectValidation {
  if (!text.trim()) {
    return { ok: false, error: new AppError('invalid-json', 'Project could not be loaded: the file is empty.') };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      error: new AppError('invalid-json', 'Project could not be loaded: invalid JSON.', {
        detail: err instanceof Error ? err.message : String(err),
      }),
    };
  }
  return validateProject(parsed);
}
