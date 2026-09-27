import type { ScanResult } from '../core/assets';
import { addFavorite } from '../core/favorites';
import { AppError } from '../core/errors';
import type { Asset, Project } from '../core/types';
import { assetIdForPath, fileToAsset } from '../core/assets';
import { parseProjectJson, validateProject } from '../core/validation';

/**
 * ProjectLoader (spec §48, §66, §79).
 * Validates, migrates and repairs; then rebuilds the missing-link information the UI needs.
 */

export interface LoadReport {
  project: Project;
  warnings: string[];
  /** assets referenced by a block / favorite / stack that are not in the catalog */
  missingAssetIds: string[];
  /** folders whose files could not be re-read (relink offer) */
  unlinkedFolderCount: number;
}

export function loadProjectFromText(text: string): LoadReport {
  const validation = parseProjectJson(text);
  if (!validation.ok) throw validation.error;
  const missing = collectMissingReferences(validation.project);
  return {
    project: { ...validation.project, missingAssets: mergeIds(validation.project.missingAssets, missing) },
    warnings: validation.warnings,
    missingAssetIds: missing,
    unlinkedFolderCount: validation.project.unlinkedFolderIds.length,
  };
}

export function loadProjectFromObject(raw: unknown): LoadReport {
  const validation = validateProject(raw);
  if (!validation.ok) throw validation.error;
  const missing = collectMissingReferences(validation.project);
  return {
    project: { ...validation.project, missingAssets: mergeIds(validation.project.missingAssets, missing) },
    warnings: validation.warnings,
    missingAssetIds: missing,
    unlinkedFolderCount: validation.project.unlinkedFolderIds.length,
  };
}

function mergeIds(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b]));
}

/** Dangling references are reported, never fatal (spec §108). */
export function collectMissingReferences(project: Project): string[] {
  const known = new Set(project.assets.map((a) => a.id));
  const missing = new Set<string>();
  for (const blockId of project.blocks.order) {
    const assetId = project.blocks.byId[blockId]?.imageAssetId;
    if (assetId && !known.has(assetId)) missing.add(assetId);
  }
  for (const list of Object.values(project.favorites)) {
    for (const assetId of list) if (!known.has(assetId)) missing.add(assetId);
  }
  for (const stack of project.stacks) {
    for (const entry of Object.values(stack.entries)) {
      if (entry.assetId && !known.has(entry.assetId)) missing.add(entry.assetId);
    }
  }
  return [...missing];
}

/* ----------------------------------------------------------------- relink -- */

export interface RelinkReport {
  project: Project;
  /** missing assets that were matched to a file from the new scan */
  recovered: number;
  stillMissing: number;
}

/**
 * "Relink / Locate folder" (spec §66).
 *
 * When the folder was moved, every referenced file changed its stable path id. We match by
 * file name inside the relinked folder and rewrite blocks, favorites and stacks accordingly —
 * the project keeps working instead of showing blank frames.
 */
export function relinkFolder(project: Project, folderId: string, scan: ScanResult, newFolderId: string): RelinkReport {
  const scannedFiles = new Map<string, Asset>();
  for (const folder of scan.folders) {
    for (const file of folder.files) {
      const asset = fileToAsset(file, newFolderId);
      if (!scannedFiles.has(file.name.toLowerCase())) scannedFiles.set(file.name.toLowerCase(), asset);
    }
  }
  for (const file of scan.rootFiles) {
    const asset = fileToAsset(file, newFolderId);
    if (!scannedFiles.has(file.name.toLowerCase())) scannedFiles.set(file.name.toLowerCase(), asset);
  }

  const missingSet = new Set(project.missingAssets);
  const oldFolder = project.folders.find((f) => f.id === folderId);
  const remap = new Map<string, { asset: Asset; previousPath: string }>();

  for (const assetId of missingSet) {
    const previous = project.assets.find((a) => a.id === assetId);
    if (!previous) continue;
    const isInFolder = previous.folderId === folderId || (oldFolder ? previous.path.startsWith(`${oldFolder.path}/`) : false);
    if (!isInFolder) continue;
    const match = scannedFiles.get(previous.name.toLowerCase());
    if (match) remap.set(assetId, { asset: match, previousPath: previous.path });
  }

  if (!remap.size) {
    return { project, recovered: 0, stillMissing: missingSet.size };
  }

  const extraAssets: Asset[] = [];
  const seen = new Set(project.assets.map((a) => a.id));
  for (const { asset } of remap.values()) {
    if (!seen.has(asset.id)) {
      seen.add(asset.id);
      extraAssets.push(asset);
    }
  }

  const blocks = { ...project.blocks.byId };
  for (const blockId of project.blocks.order) {
    const block = blocks[blockId];
    const replaced = block.imageAssetId ? remap.get(block.imageAssetId) : undefined;
    if (replaced) blocks[blockId] = { ...block, imageAssetId: replaced.asset.id };
  }

  let favorites = { ...project.favorites };
  for (const [blockId, list] of Object.entries(favorites)) {
    const next = list.map((id) => remap.get(id)?.asset.id ?? id);
    favorites[blockId] = Array.from(new Set(next));
  }

  const stacks = project.stacks.map((stack) => {
    let changed = false;
    const entries = { ...stack.entries };
    for (const [blockId, entry] of Object.entries(entries)) {
      if (!entry.assetId) continue;
      const replaced = remap.get(entry.assetId);
      if (replaced) {
        entries[blockId] = { ...entry, assetId: replaced.asset.id };
        changed = true;
      }
    }
    return changed ? { ...stack, entries } : stack;
  });

  const remainingMissing = [...missingSet].filter((id) => !remap.has(id));

  return {
    project: {
      ...project,
      blocks: { ...project.blocks, byId: blocks },
      favorites,
      stacks,
      assets: [...project.assets, ...extraAssets],
      missingAssets: remainingMissing,
      meta: { ...project.meta, updatedAt: Date.now() },
    },
    recovered: remap.size,
    stillMissing: remainingMissing.length,
  };
}

export function assertProjectLoadable(report: LoadReport): void {
  if (!report.project.blocks.order.length && !report.project.assets.length) {
    throw new AppError('invalid-project', 'Project could not be loaded: it has no blocks and no assets.');
  }
}

export const assetIdFromPath = assetIdForPath;

/**
 * Rewrite a fresh scan so it adopts the path prefix of a known folder.
 *
 * Used by “Relink folder”: after the user re-picks a moved folder, the scanned relative
 * paths are re-based on the old folder path, which reproduces exactly the same stable
 * asset ids — so blocks, favorites and stacks keep pointing at the right files.
 */
export function remapScanForRelink(scan: ScanResult, targetPath: string, targetName: string): ScanResult {
  const prefix = targetPath.replace(/\/+$/, '');

  /**
   * Two scanning conventions exist:
   *  • the directory picker reports paths relative to the picked folder ("Sub/file.jpg"),
   *  • the `<input webkitdirectory>` fallback prefixes them with the root folder name
   *    ("MyFolder/Sub/file.jpg").
   * Both are normalised to "relative to the picked root" before the old folder path is
   * re-applied, which reproduces exactly the same stable asset ids as before the move.
   */
  const stripRoot = (path: string): string => {
    if (!scan.rootName) return path;
    if (path === scan.rootName) return '';
    if (path.startsWith(`${scan.rootName}/`)) return path.slice(scan.rootName.length + 1);
    return path;
  };

  const join = (relative: string, file?: string): string => {
    const parts = [prefix, relative, file].filter((part) => part !== undefined && part !== '');
    return parts.join('/');
  };

  const folders = scan.folders.map((folder) => {
    const relative = stripRoot(folder.path);
    const path = join(relative);
    const name = relative ? relative.split('/').pop() ?? folder.name : targetName;
    return {
      ...folder,
      path,
      name,
      files: folder.files.map((file) => ({ ...file, path: join(relative, file.name) })),
    };
  });

  const rootFiles = scan.rootFiles.map((file) => ({ ...file, path: join('', file.name) }));

  return { ...scan, folders, rootFiles };
}
