import { PROJECT_VERSION } from '../core/project';
import type { Project } from '../core/types';
import type { StoredRef as AdapterRef } from '../filesystem/adapter';

/**
 * ProjectSerializer (spec §48–49).
 * The JSON never contains image bytes — only metadata, identifiers and references.
 */

export interface SerializedProject {
  version: number;
  /** written for humans reading the file */
  meta: Project['meta'] & { savedWith: string; savedAt: string };
  settings: Project['settings'];
  folders: Project['folders'];
  assets: Project['assets'];
  template: Project['template'];
  blocks: Project['blocks'];
  favorites: Project['favorites'];
  stacks: Project['stacks'];
  preview: Project['preview'];
  missingAssets: Project['missingAssets'];
  unlinkedFolderIds: Project['unlinkedFolderIds'];
}

export const APP_SIGNATURE = `Shot Composer ${PROJECT_VERSION}`;

export function serializeProject(project: Project): SerializedProject {
  return {
    version: PROJECT_VERSION,
    meta: {
      ...project.meta,
      savedWith: APP_SIGNATURE,
      savedAt: new Date().toISOString(),
    },
    settings: project.settings,
    folders: project.folders,
    assets: project.assets,
    template: project.template,
    blocks: project.blocks,
    favorites: project.favorites,
    stacks: project.stacks,
    preview: project.preview,
    missingAssets: project.missingAssets,
    unlinkedFolderIds: project.unlinkedFolderIds,
  };
}

export function projectToJson(project: Project, pretty = true): string {
  return JSON.stringify(serializeProject(project), null, pretty ? 2 : 0);
}

export function projectFileName(project: Project): string {
  const slug =
    project.meta.name
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'project';
  return `${slug}.json`;
}

/** Rebuild the adapter reference of every asset so files can be read again. */
export function buildRefIndex(project: Project): Map<string, AdapterRef> {
  const map = new Map<string, AdapterRef>();
  for (const asset of project.assets) {
    map.set(asset.id, refForAsset(asset));
  }
  return map;
}

export function refForAsset(asset: { refKey: string; name: string; path: string; mime: string; bytes: number }): AdapterRef {
  const kind: AdapterRef['kind'] = asset.refKey.startsWith('h:')
    ? 'handle'
    : asset.refKey.startsWith('f:')
      ? 'file'
      : asset.refKey.startsWith('m:')
        ? 'manual'
        : 'path';
  return { kind, key: asset.refKey, name: asset.name, path: asset.path, mime: asset.mime, bytes: asset.bytes };
}

/** A project can be reopened on this machine when its refs resolve to a known adapter. */
export function describePortability(project: Project): { local: boolean; external: number; note: string } {
  const external = project.assets.filter((a) => a.source === 'manual').length;
  const local = project.assets.some((a) => a.source === 'folder');
  return {
    local,
    external,
    note: external
      ? `${external} manually dropped image${external === 1 ? '' : 's'} are referenced by name/path and may need to be re-dropped on another machine.`
      : 'All images come from the scanned catalog.',
  };
}

export type { AdapterRef as StoredRef };
