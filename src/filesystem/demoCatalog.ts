import type { ScannedCatalog } from './FileSystemAdapter';
import { createId } from '../core/types';

/**
 * demoCatalog.ts — встроенный демо-каталог.
 *
 * Зачем: можно открыть программу и сразу всё попробовать, не имея под рукой
 * своей папки с картинками. Файлы лежат в public/demo и попадают в сборку
 * (dist/demo), список читается из demo/manifest.json.
 *
 * Почему манифест, а не import.meta.glob: сборщик в таком случае вшивает
 * картинки в бандл base64-ом, и index.html распухает на мегабайты.
 *
 * В Electron main сканирует папку сам и отдаёт абсолютные пути — демо-картинки
 * грузятся ровно тем же кодом, что и пользовательские.
 */

interface DemoManifest {
  rootName?: string;
  folders: Array<{ name: string; files: string[] }>;
}

function formatOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : 'unknown';
}

/** Собирает каталог из списка «папка → файлы» */
function buildFromEntries(
  rootName: string,
  entries: Array<{ folder: string; name: string; sourceKey: string }>
): ScannedCatalog {
  const foldersMap = new Map<
    string,
    {
      id: string;
      name: string;
      relativePath: string;
      assetIds: string[];
      parentId: null;
    }
  >();
  const assets: ScannedCatalog['assets'] = [];

  for (const entry of entries) {
    if (!foldersMap.has(entry.folder)) {
      foldersMap.set(entry.folder, {
        id: createId('folder'),
        name: entry.folder,
        relativePath: entry.folder,
        assetIds: [],
        parentId: null,
      });
    }
    const folder = foldersMap.get(entry.folder)!;
    const asset = {
      id: createId('asset'),
      filename: entry.name,
      relativePath: `${entry.folder}/${entry.name}`,
      folderId: folder.id,
      format: formatOf(entry.name) as never,
      sourceKey: entry.sourceKey,
      fileSize: undefined,
    };
    assets.push(asset);
    folder.assetIds.push(asset.id);
  }

  return {
    rootName,
    folders: Array.from(foldersMap.values()),
    assets,
    handles: new Map(),
  } as ScannedCatalog;
}

/** Electron: main сканирует папку и отдаёт абсолютные пути */
async function fromElectron(): Promise<ScannedCatalog | null> {
  const api = window.electronAPI;
  if (!api?.demoCatalog) return null;
  const catalog = await api.demoCatalog();
  if (!catalog || !catalog.assets || catalog.assets.length === 0) return null;
  return { ...catalog, handles: new Map() } as ScannedCatalog;
}

/** Браузер: читаем манифест, sourceKey — обычные URL */
async function fromManifest(): Promise<ScannedCatalog | null> {
  const base = import.meta.env?.BASE_URL ?? '/';
  const url = `${base}demo/manifest.json`.replace(/\/{2,}/g, '/');
  const res = await fetch(url);
  if (!res.ok) return null;
  const manifest = (await res.json()) as DemoManifest;
  if (!manifest.folders || manifest.folders.length === 0) return null;

  const entries = manifest.folders.flatMap((folder) =>
    folder.files.map((name) => ({
      folder: folder.name,
      name,
      sourceKey: `${base}demo/${folder.name}/${name}`.replace(/\/{2,}/g, '/'),
    }))
  );
  return buildFromEntries(manifest.rootName ?? 'Демо', entries);
}

export async function loadDemoCatalog(): Promise<ScannedCatalog | null> {
  try {
    if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
      return await fromElectron();
    }
    return await fromManifest();
  } catch (e) {
    console.error('[demo] не удалось загрузить демо-каталог', e);
    return null;
  }
}
