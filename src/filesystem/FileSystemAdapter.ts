import type { AssetMeta, FolderMeta, ID, ImageFormat } from '../core/types';
import { SUPPORTED_IMAGE_EXTENSIONS, createId } from '../core/types';

export interface ScannedCatalog {
  rootName: string;
  folders: FolderMeta[];
  assets: AssetMeta[];
  /** Map sourceKey → raw handle/file for later reading */
  handles: Map<string, FileSystemFileHandle | File>;
}

export interface FileSystemAdapter {
  pickDirectory(): Promise<ScannedCatalog | null>;
  /** Create object URL for display; caller must revoke when done if needed */
  getObjectUrl(sourceKey: string, handles: Map<string, FileSystemFileHandle | File>): Promise<string | null>;
  readFileAsFile(sourceKey: string, handles: Map<string, FileSystemFileHandle | File>): Promise<File | null>;
  supportsDirectoryPicker(): boolean;
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function formatOf(ext: string): ImageFormat {
  const map: Record<string, ImageFormat> = {
    jpg: 'jpg',
    jpeg: 'jpeg',
    png: 'png',
    webp: 'webp',
    gif: 'gif',
    svg: 'svg',
    avif: 'avif',
    bmp: 'bmp',
    tiff: 'tiff',
    tif: 'tiff',
    heic: 'heic',
    heif: 'heif',
  };
  return map[ext] ?? 'unknown';
}

function isImageFile(name: string): boolean {
  return SUPPORTED_IMAGE_EXTENSIONS.has(extOf(name));
}

/** Browser implementation using File System Access API + fallback */
export class BrowserFileSystemAdapter implements FileSystemAdapter {
  supportsDirectoryPicker(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  async pickDirectory(): Promise<ScannedCatalog | null> {
    if (this.supportsDirectoryPicker()) {
      try {
        const handle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
        return await this.scanDirectoryHandle(handle);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return null;
        throw e;
      }
    }
    // Fallback: <input webkitdirectory>
    return this.pickDirectoryFallback();
  }

  private pickDirectoryFallback(): Promise<ScannedCatalog | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'image/*';
      (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
      input.onchange = async () => {
        const files = input.files;
        if (!files || files.length === 0) {
          resolve(null);
          return;
        }
        resolve(this.scanFileList(files));
      };
      input.click();
    });
  }

  private async scanDirectoryHandle(root: FileSystemDirectoryHandle): Promise<ScannedCatalog> {
    const folders: FolderMeta[] = [];
    const assets: AssetMeta[] = [];
    const handles = new Map<string, FileSystemFileHandle | File>();

    // Root-level images go into a virtual folder with root name
    const rootFolderId = createId('folder');
    const rootFolder: FolderMeta = {
      id: rootFolderId,
      name: root.name,
      relativePath: root.name,
      assetIds: [],
      parentId: null,
    };

    async function walk(
      dir: FileSystemDirectoryHandle,
      relativePath: string,
      folderId: ID
    ) {
      const dirAny = dir as FileSystemDirectoryHandle & {
        entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
        values: () => AsyncIterableIterator<FileSystemHandle>;
      };

      // Prefer entries(); fall back to values()
      const iterate = async function* (): AsyncGenerator<[string, FileSystemHandle]> {
        if (typeof dirAny.entries === 'function') {
          for await (const pair of dirAny.entries()) yield pair;
        } else if (typeof dirAny.values === 'function') {
          for await (const handle of dirAny.values()) {
            yield [handle.name, handle];
          }
        }
      };

      for await (const [name, entry] of iterate()) {
        if (entry.kind === 'directory') {
          const childPath = `${relativePath}/${name}`;
          const childId = createId('folder');
          const folder: FolderMeta = {
            id: childId,
            name,
            relativePath: childPath,
            assetIds: [],
            parentId: folderId,
          };
          folders.push(folder);
          await walk(entry as FileSystemDirectoryHandle, childPath, childId);
        } else if (entry.kind === 'file' && isImageFile(name)) {
          const fileHandle = entry as FileSystemFileHandle;
          const sourceKey = `${relativePath}/${name}`;
          const ext = extOf(name);
          const asset: AssetMeta = {
            id: createId('asset'),
            filename: name,
            relativePath: sourceKey,
            folderId,
            format: formatOf(ext),
            sourceKey,
            unsupported: !['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp'].includes(ext),
          };
          assets.push(asset);
          handles.set(sourceKey, fileHandle);
          const f = folders.find((x) => x.id === folderId) ?? (folderId === rootFolderId ? rootFolder : null);
          if (f) f.assetIds.push(asset.id);
        }
      }
    }

    folders.push(rootFolder);
    await walk(root, root.name, rootFolderId);

    // If root only has subfolders with images and no direct images, we can keep root or hide empty
    // Prefer: if there are subfolders, show subfolders as primary; keep root if it has images
    const subfolders = folders.filter((f) => f.parentId === rootFolderId);
    let resultFolders = folders;
    if (subfolders.length > 0 && rootFolder.assetIds.length === 0) {
      // Promote subfolders: set parent null, remove empty root
      resultFolders = folders
        .filter((f) => f.id !== rootFolderId)
        .map((f) => (f.parentId === rootFolderId ? { ...f, parentId: null } : f));
    }

    return {
      rootName: root.name,
      folders: resultFolders,
      assets,
      handles,
    };
  }

  private scanFileList(fileList: FileList): ScannedCatalog {
    const foldersMap = new Map<string, FolderMeta>();
    const assets: AssetMeta[] = [];
    const handles = new Map<string, FileSystemFileHandle | File>();

    let rootName = 'Images';
    const paths: string[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      paths.push(rel);
    }

    if (paths.length > 0) {
      const first = paths[0];
      const parts = first.split('/');
      if (parts.length > 1) rootName = parts[0];
    }

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (!isImageFile(file.name)) continue;

      const parts = rel.split('/');
      // parts[0] = root, parts[1] = folder or file
      let folderName = rootName;
      let folderPath = rootName;
      if (parts.length >= 3) {
        // root/folder/file
        folderName = parts[1];
        folderPath = `${parts[0]}/${parts[1]}`;
      } else if (parts.length === 2) {
        // root/file — put in root folder
        folderName = rootName;
        folderPath = rootName;
      }

      if (!foldersMap.has(folderPath)) {
        foldersMap.set(folderPath, {
          id: createId('folder'),
          name: folderName,
          relativePath: folderPath,
          assetIds: [],
          parentId: null,
        });
      }
      const folder = foldersMap.get(folderPath)!;
      const sourceKey = rel;
      const ext = extOf(file.name);
      const asset: AssetMeta = {
        id: createId('asset'),
        filename: file.name,
        relativePath: rel,
        folderId: folder.id,
        format: formatOf(ext),
        fileSize: file.size,
        sourceKey,
        unsupported: !['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp'].includes(ext),
      };
      assets.push(asset);
      folder.assetIds.push(asset.id);
      handles.set(sourceKey, file);
    }

    return {
      rootName,
      folders: Array.from(foldersMap.values()),
      assets,
      handles,
    };
  }

  async getObjectUrl(
    sourceKey: string,
    handles: Map<string, FileSystemFileHandle | File>
  ): Promise<string | null> {
    const h = handles.get(sourceKey);
    if (!h) return null;
    try {
      if (h instanceof File) {
        return URL.createObjectURL(h);
      }
      const file = await h.getFile();
      return URL.createObjectURL(file);
    } catch {
      return null;
    }
  }

  async readFileAsFile(
    sourceKey: string,
    handles: Map<string, FileSystemFileHandle | File>
  ): Promise<File | null> {
    const h = handles.get(sourceKey);
    if (!h) return null;
    try {
      if (h instanceof File) return h;
      return await h.getFile();
    } catch {
      return null;
    }
  }
}

/** Placeholder for future Electron adapter */
export class ElectronFileSystemAdapter implements FileSystemAdapter {
  supportsDirectoryPicker(): boolean {
    return true;
  }

  async pickDirectory(): Promise<ScannedCatalog | null> {
    throw new Error('ElectronFileSystemAdapter is not available in browser build');
  }

  async getObjectUrl(): Promise<string | null> {
    return null;
  }

  async readFileAsFile(): Promise<File | null> {
    return null;
  }
}

export function createFileSystemAdapter(): FileSystemAdapter {
  return new BrowserFileSystemAdapter();
}
