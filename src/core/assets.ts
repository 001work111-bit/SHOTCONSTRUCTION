import { createFolderId, stableAssetId, stableFolderId } from './ids';
import type { Asset, AssetId, Folder, FolderId, Project } from './types';

/** Raw folder description produced by a FileSystemAdapter scan. */
export interface ScannedFolder {
  /** display path relative to the scan root, e.g. `Auto` or `Auto/Shipped` */
  path: string;
  name: string;
  files: ScannedFile[];
}

export interface ScannedFile {
  name: string;
  /** display path relative to the scan root */
  path: string;
  format: Asset['format'];
  mime: string;
  bytes: number;
  /** adapter specific key of the persisted handle / absolute path */
  refKey: string;
  supported: boolean;
  width?: number;
  height?: number;
}

export interface ScanResult {
  rootName: string;
  rootLabel: string;
  folders: ScannedFolder[];
  /** files that sit directly in the root (no subfolder) */
  rootFiles: ScannedFile[];
  unsupported: number;
  totalFiles: number;
  handles?: unknown[];
  /** scan level notes (limits reached, unreadable sub-folders, …) surfaced in the UI */
  notes?: string[];
}

export function assetIdForPath(path: string): AssetId {
  return stableAssetId(path);
}

export function folderIdForPath(path: string): FolderId {
  return stableFolderId(path) || createFolderId();
}

/** Depth derived from the relative path (`Auto/Shipped` → 1). */
function pathDepth(path: string): number {
  return path.split('/').filter(Boolean).length - 1;
}

export function fileToAsset(file: ScannedFile, folderId: FolderId | null): Asset {
  return {
    id: assetIdForPath(file.path),
    name: file.name,
    folderId,
    path: file.path,
    format: file.format,
    mime: file.mime,
    bytes: file.bytes,
    width: file.width,
    height: file.height,
    source: 'folder',
    refKey: file.refKey,
    addedAt: Date.now(),
  };
}

/**
 * Merge a scan into the project.
 *
 * Assets are keyed by their stable path id, so rescanning or reloading a project keeps
 * every block / favorite / stack reference intact. Assets that disappeared from disk are
 * *not* deleted — they are flagged through `missingAssets` (spec §66, §108).
 */
export function applyScan(project: Project, scan: ScanResult): {
  project: Project;
  added: number;
  updated: number;
  removed: number;
  folderIds: FolderId[];
} {
  const foldersByPath = new Map<string, Folder>();
  const existingByPath = new Map(project.folders.map((f) => [f.path, f]));
  const previousAssets = new Map(project.assets.map((a) => [a.id, a]));
  const seenAssetIds = new Set<AssetId>();

  let added = 0;
  let updated = 0;

  const buildFolder = (path: string, name: string, parentPath: string | null): Folder => {
    const id = existingByPath.get(path)?.id ?? folderIdForPath(path);
    const folder: Folder = {
      id,
      name,
      path,
      parentId: parentPath ? folderIdForPath(parentPath) : null,
      depth: pathDepth(path),
      assetIds: [],
      imageCount: 0,
      unsupportedCount: 0,
    };
    foldersByPath.set(path, folder);
    return folder;
  };

  const allScanned: { folder: Folder | null; files: ScannedFile[] }[] = [];

  // root-level files (spec §107: a folder with no sub-folders must behave sensibly)
  allScanned.push({ folder: null, files: scan.rootFiles });

  for (const scanned of scan.folders) {
    const segments = scanned.path.split('/').filter(Boolean);
    let parentPath: string | null = null;
    let acc = '';
    segments.forEach((segment, i) => {
      acc = acc ? `${acc}/${segment}` : segment;
      if (!foldersByPath.has(acc)) buildFolder(acc, segment, parentPath);
      parentPath = acc;
      void i;
    });
    const folder = foldersByPath.get(scanned.path) as Folder;
    allScanned.push({ folder, files: scanned.files });
  }

  const collectedAssets: Asset[] = [];

  for (const group of allScanned) {
    for (const file of group.files) {
      const asset = fileToAsset(file, group.folder ? group.folder.id : null);
      seenAssetIds.add(asset.id);
      const prev = previousAssets.get(asset.id);
      if (prev) {
        updated += 1;
        collectedAssets.push({
          ...prev,
          name: asset.name,
          path: asset.path,
          folderId: asset.folderId,
          format: asset.format,
          mime: asset.mime,
          bytes: asset.bytes,
          refKey: asset.refKey,
          width: prev.width ?? asset.width,
          height: prev.height ?? asset.height,
          source: 'folder',
        });
      } else {
        added += 1;
        collectedAssets.push(asset);
      }
      if (group.folder) {
        group.folder.assetIds.push(asset.id);
        if (file.supported) group.folder.imageCount += 1;
        else group.folder.unsupportedCount += 1;
      }
    }
  }

  // keep manually dropped assets (assets with source 'manual' are never dropped by a rescan)
  const manualAssets = project.assets.filter((a) => a.source === 'manual');
  const assets = [...collectedAssets, ...manualAssets];

  const sortedFolders = [...foldersByPath.values()].sort((a, b) => a.path.localeCompare(b.path));

  const detectedMissing = assets
    .filter((a) => a.source === 'folder' && !seenAssetIds.has(a.id))
    .map((a) => a.id);
  const missingAssets = Array.from(new Set([...project.missingAssets, ...detectedMissing]));

  // folders from the previous project that were not found in this scan are reported as unlinked
  const unlinkedFolderIds = project.folders
    .filter((f) => !foldersByPath.has(f.path))
    .map((f) => f.id);

  return {
    project: {
      ...project,
      folders: sortedFolders.length ? sortedFolders : project.folders,
      assets,
      missingAssets,
      unlinkedFolderIds,
      meta: { ...project.meta, updatedAt: Date.now() },
    },
    added,
    updated,
    removed: detectedMissing.length,
    folderIds: sortedFolders.map((f) => f.id),
  };
}

export function allFolderIds(project: Project): FolderId[] {
  return project.folders.map((f) => f.id);
}

export function reachableFolderIds(project: Project, folderIds: FolderId[]): Set<FolderId> {
  // A selected parent folder includes its children (intuitive folder-tree behaviour).
  const result = new Set<FolderId>(folderIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of project.folders) {
      if (folder.parentId && result.has(folder.parentId) && !result.has(folder.id)) {
        result.add(folder.id);
        grew = true;
      }
    }
  }
  return result;
}

/**
 * Pool of usable asset ids for a set of folders.
 * `folderIds` empty → every folder of the catalog (spec §27 default: all folders selected).
 */
export function poolForFolders(project: Project, folderIds: FolderId[]): AssetId[] {
  const folderById = new Map(project.folders.map((f) => [f.id, f]));
  const selected = folderIds.length ? reachableFolderIds(project, folderIds) : new Set(allFolderIds(project));
  const seen = new Set<AssetId>();
  const out: AssetId[] = [];
  for (const asset of project.assets) {
    if (!asset.folderId) continue; // root-level files are addressed by their own pseudo-folder below
    if (!selected.has(asset.folderId)) continue;
    if (seen.has(asset.id)) continue;
    const folder = folderById.get(asset.folderId);
    if (!folder) continue;
    seen.add(asset.id);
    out.push(asset.id);
  }
  return out;
}

export function assetMap(project: Project): Map<AssetId, Asset> {
  return new Map(project.assets.map((a) => [a.id, a]));
}

export function folderMap(project: Project): Map<FolderId, Folder> {
  return new Map(project.folders.map((f) => [f.id, f]));
}

export function patchAsset(project: Project, assetId: AssetId, patch: Partial<Asset>): Project {
  let touched = false;
  const assets = project.assets.map((asset) => {
    if (asset.id !== assetId) return asset;
    touched = true;
    return { ...asset, ...patch };
  });
  return touched ? { ...project, assets } : project;
}

export function registerManualAsset(project: Project, asset: Asset): Project {
  const exists = project.assets.some((a) => a.id === asset.id);
  return {
    ...project,
    assets: exists ? project.assets.map((a) => (a.id === asset.id ? asset : a)) : [...project.assets, asset],
    missingAssets: project.missingAssets.filter((id) => id !== asset.id),
  };
}

export function folderStats(project: Project): { totalAssets: number; totalFolders: number; unsupported: number } {
  return {
    totalAssets: project.assets.filter((a) => a.source === 'folder').length,
    totalFolders: project.folders.length,
    unsupported: project.folders.reduce((sum, f) => sum + f.unsupportedCount, 0),
  };
}
