import type { ScanResult, ScannedFile, ScannedFolder } from '../core/assets';
import { AppError } from '../core/errors';
import { extensionOf, formatFromName, SCAN_EXTENSIONS } from '../core/formats';
import { stableAssetId } from '../core/ids';
import type { AssetFormat } from '../core/types';
import type {
  AdapterCapabilities,
  DroppedAsset,
  FileSystemAdapter,
  ImageRequest,
  ImageSource,
  ScanOutcome,
  ScanRoot,
  StoredRef,
} from './adapter';
import { IDB_KEYS, idbDelete, idbGet, idbSet } from './idb';

/**
 * BrowserFileSystemAdapter — the browser half of the abstraction (spec §40).
 *
 * Primary path: File System Access API (`showDirectoryPicker`) with real recursive scanning
 * and persisted `FileSystemFileHandle`s so a reload can relink without re-picking.
 * Fallback path: `<input type="file" webkitdirectory>` — metadata and `File` objects only,
 * files stay reachable for the session and can be relinked after a reload.
 */

const MAX_FILES = 250_000;
const MAX_FOLDERS = 20_000;
const MAX_DEPTH = 12;

interface PersistedRoot {
  root: ScanRoot;
  handle: FileSystemDirectoryHandle | null;
  mode: 'picker' | 'input';
}

interface FileSystemDirectoryHandleWithEntries extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

export class BrowserFileSystemAdapter implements FileSystemAdapter {
  readonly kind = 'browser' as const;

  readonly capabilities: AdapterCapabilities = {
    directoryPicker: typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function',
    absolutePaths: false,
    persistedHandles: true,
    rescan: true,
    nativePaths: false,
    nativeDecoders: false,
  };

  private handles = new Map<string, FileSystemFileHandle>();
  private files = new Map<string, File>();
  private manualHandles = new Map<string, FileSystemFileHandle>();
  private manualBlobs = new Map<string, Blob>();
  private rootHandle: FileSystemDirectoryHandle | null = null;
  private root: ScanRoot | null = null;

  isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof File !== 'undefined';
  }

  describe(): string {
    if (this.capabilities.directoryPicker) return 'Browser · File System Access API';
    return 'Browser · folder input fallback (no persistent handles)';
  }

  /* ------------------------------------------------------------- scanning -- */

  async pickDirectory(): Promise<ScanOutcome | null> {
    if (this.capabilities.directoryPicker) {
      const picker = (
        globalThis as unknown as { showDirectoryPicker: (o?: unknown) => Promise<FileSystemDirectoryHandle> }
      ).showDirectoryPicker;
      let handle: FileSystemDirectoryHandle;
      try {
        handle = await picker({ id: 'shot-composer-root', mode: 'read' });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return null;
        throw new AppError('directory-read-failed', 'Could not open the selected folder.', {
          detail: err instanceof Error ? err.message : String(err),
        });
      }
      return this.scanHandle(handle);
    }
    return this.pickViaInput();
  }

  private async pickViaInput(): Promise<ScanOutcome | null> {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    input.style.display = 'none';
    document.body.appendChild(input);

    const files = await new Promise<File[] | null>((resolve) => {
      input.onchange = () => resolve(Array.from(input.files ?? []));
      input.oncancel = () => resolve(null);
      input.click();
    });
    document.body.removeChild(input);
    if (!files || !files.length) return null;

    const rootName = files[0]?.webkitRelativePath?.split('/')[0] ?? 'Images';
    const root: ScanRoot = { id: 'root_input', name: rootName, label: rootName, token: `input:${rootName}` };
    this.root = root;
    this.rootHandle = null;

    const folderMap = new Map<string, ScannedFolder>();
    const rootFiles: ScannedFile[] = [];
    const refs: StoredRef[] = [];
    let unsupported = 0;

    for (const file of files) {
      const relative = file.webkitRelativePath || file.name;
      const segments = relative.split('/');
      const name = segments[segments.length - 1];
      const folderPath = segments.slice(1, -1).join('/');
      if (!SCAN_EXTENSIONS.has(extensionOf(name))) continue;
      const info = formatFromName(name);
      if (!info.supported) unsupported += 1;
      const refKey = `f:${relative}`;
      this.files.set(refKey, file);
      const scanned: ScannedFile = {
        name,
        path: relative,
        format: info.format,
        mime: info.mime || file.type,
        bytes: file.size,
        refKey,
        supported: info.supported,
      };
      refs.push({ kind: 'file', key: refKey, name, path: relative, mime: scanned.mime, bytes: file.size });
      if (folderPath) {
        const folder = folderMap.get(folderPath) ?? {
          path: folderPath,
          name: folderPath.split('/').pop() ?? folderPath,
          files: [],
        };
        folder.files.push(scanned);
        folderMap.set(folderPath, folder);
      } else {
        rootFiles.push(scanned);
      }
    }

    const folders = [...folderMap.values()];
    const totalFiles = folders.reduce((sum, f) => sum + f.files.length, 0) + rootFiles.length;
    const result: ScanResult = {
      rootName,
      rootLabel: rootName,
      folders,
      rootFiles,
      unsupported,
      totalFiles,
      notes: ['Folder was opened through the input fallback: handles are not persisted, relink after reload.'],
    };
    return { ...result, root, refs };
  }

  private async scanHandle(handle: FileSystemDirectoryHandle): Promise<ScanOutcome> {
    this.rootHandle = handle;
    const root: ScanRoot = {
      id: 'root_picker',
      name: handle.name,
      label: handle.name,
      token: `handle:${handle.name}`,
    };
    this.root = root;

    const folders = new Map<string, ScannedFolder>();
    const refs: StoredRef[] = [];
    const rootFiles: ScannedFile[] = [];
    const notes: string[] = [];
    let unsupported = 0;
    let totalFiles = 0;
    let readableFiles = 0;

    const queue: { handle: FileSystemDirectoryHandleWithEntries; path: string; depth: number }[] = [
      { handle: handle as FileSystemDirectoryHandleWithEntries, path: '', depth: 0 },
    ];

    while (queue.length) {
      const current = queue.shift() as { handle: FileSystemDirectoryHandleWithEntries; path: string; depth: number };
      let iterator: AsyncIterableIterator<[string, FileSystemHandle]>;
      try {
        iterator = current.handle.entries();
      } catch {
        notes.push(`Could not read “${current.path || current.handle.name}”.`);
        continue;
      }
      try {
        for await (const [name, entry] of iterator) {
          if (entry.kind === 'directory') {
            if (current.depth + 1 > MAX_DEPTH) {
              notes.push(`Depth limit (${MAX_DEPTH}) reached at “${current.path}/${name}”.`);
              continue;
            }
            if (folders.size >= MAX_FOLDERS) {
              notes.push(`Folder limit (${MAX_FOLDERS}) reached; deeper folders were skipped.`);
              continue;
            }
            queue.push({
              handle: entry as FileSystemDirectoryHandleWithEntries,
              path: current.path ? `${current.path}/${name}` : name,
              depth: current.depth + 1,
            });
            continue;
          }

          if (!SCAN_EXTENSIONS.has(extensionOf(name))) continue;
          if (readableFiles >= MAX_FILES) {
            notes.push(`File limit (${MAX_FILES}) reached; remaining files were skipped.`);
            break;
          }
          const info = formatFromName(name);
          const relative = current.path ? `${current.path}/${name}` : name;
          const refKey = `h:${relative}`;
          this.handles.set(refKey, entry as FileSystemFileHandle);

          let bytes = 0;
          try {
            const file = await (entry as FileSystemFileHandle).getFile();
            bytes = file.size;
          } catch {
            notes.push(`Could not read metadata of “${relative}”.`);
          }
          if (!info.supported) unsupported += 1;
          totalFiles += 1;
          readableFiles += 1;

          const scanned: ScannedFile = {
            name,
            path: relative,
            format: info.format,
            mime: info.mime,
            bytes,
            refKey,
            supported: info.supported,
          };
          refs.push({ kind: 'handle', key: refKey, name, path: relative, mime: info.mime, bytes });

          if (current.path) {
            const folder =
              folders.get(current.path) ??
              ({
                path: current.path,
                name: current.path.split('/').pop() ?? current.path,
                files: [],
              } satisfies ScannedFolder);
            folder.files.push(scanned);
            folders.set(current.path, folder);
          } else {
            rootFiles.push(scanned);
          }
        }
      } catch (err) {
        notes.push(`Could not finish reading “${current.path || handle.name}”.`);
        void err;
      }
    }

    await this.persistRefs(root, []);

    const result: ScanResult = {
      rootName: handle.name,
      rootLabel: handle.name,
      folders: [...folders.values()],
      rootFiles,
      unsupported,
      totalFiles,
      notes,
    };
    return { ...result, root, refs };
  }

  /**
   * Register files that ship with the app (demo catalog) as a normal scanned catalog:
   * they are fetched from the app origin, wrapped in real `File` objects and then go
   * through the ordinary thumbnail / randomize pipeline.
   */
  async registerBundledFiles(entries: { path: string; url: string }[]): Promise<ScanOutcome> {
    const folders = new Map<string, ScannedFolder>();
    const refs: StoredRef[] = [];
    const notes: string[] = ['Demo catalog bundled with the app — pick your own folder to work with real photos.'];
    let total = 0;

    for (const entry of entries) {
      let blob: Blob;
      try {
        const response = await fetch(entry.url);
        if (!response.ok) throw new Error(String(response.status));
        blob = await response.blob();
      } catch (err) {
        notes.push(`Could not load ${entry.path}`);
        void err;
        continue;
      }
      const name = entry.path.split('/').pop() ?? entry.path;
      const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
      const refKey = `f:${entry.path}`;
      this.files.set(refKey, file);
      const info = formatFromName(name);
      const folderPath = entry.path.split('/').slice(0, -1).join('/');
      const scanned: ScannedFile = {
        name,
        path: entry.path,
        format: info.format,
        mime: file.type || info.mime,
        bytes: file.size,
        refKey,
        supported: info.supported,
      };
      refs.push({ kind: 'file', key: refKey, name, path: entry.path, mime: scanned.mime, bytes: file.size });
      const folder = folders.get(folderPath) ?? { path: folderPath, name: folderPath, files: [] };
      folder.files.push(scanned);
      folders.set(folderPath, folder);
      total += 1;
    }

    const root: ScanRoot = { id: 'root_demo', name: 'Demo catalog', label: 'Bundled demo catalog', token: 'demo:root' };
    this.root = root;
    this.rootHandle = null;

    const result: ScanResult = {
      rootName: 'Demo catalog',
      rootLabel: 'Bundled demo catalog',
      folders: [...folders.values()],
      rootFiles: [],
      unsupported: 0,
      totalFiles: total,
      notes,
    };
    return { ...result, root, refs };
  }

  async rescan(root: ScanRoot): Promise<ScanOutcome | null> {
    if (root.token.startsWith('handle:') && this.rootHandle) {
      return this.scanHandle(this.rootHandle);
    }
    return null;
  }

  async restoreLastRoot(): Promise<{ root: ScanRoot; needsPermission: boolean } | null> {
    const persisted = await idbGet<PersistedRoot>(IDB_KEYS.root);
    if (!persisted?.root) return null;
    if (persisted.handle) {
      this.rootHandle = persisted.handle;
      this.root = persisted.root;
      const state = await this.queryPermission(persisted.handle);
      return { root: persisted.root, needsPermission: state !== 'granted' };
    }
    return null;
  }

  private async queryPermission(handle: FileSystemHandle): Promise<PermissionState> {
    const fn = (handle as unknown as { queryPermission?: (o: { mode: string }) => Promise<PermissionState> }).queryPermission;
    if (!fn) return 'prompt';
    try {
      return await fn.call(handle, { mode: 'read' });
    } catch {
      return 'prompt';
    }
  }

  async requestAccess(root: ScanRoot): Promise<boolean> {
    const persisted = await idbGet<PersistedRoot>(IDB_KEYS.root);
    const handle = this.rootHandle ?? persisted?.handle ?? null;
    if (!handle) return false;
    const fn = (handle as unknown as { requestPermission?: (o: { mode: string }) => Promise<PermissionState> }).requestPermission;
    if (!fn) return true;
    try {
      const state = await fn.call(handle, { mode: 'read' });
      if (state === 'granted') {
        this.rootHandle = handle;
        this.root = root;
        return true;
      }
      return false;
    } catch (err) {
      throw AppError.from(err, 'permission-denied');
    }
  }

  /* ------------------------------------------------------------ file bytes */

  async openBlob(ref: StoredRef): Promise<Blob | null> {
    try {
      if (ref.kind === 'handle') {
        const handle = this.handles.get(ref.key);
        if (!handle) return null;
        return await handle.getFile();
      }
      if (ref.kind === 'file') {
        return this.files.get(ref.key) ?? null;
      }
      if (ref.kind === 'manual') {
        const handle = this.manualHandles.get(ref.key);
        if (handle) return await handle.getFile();
        return this.manualBlobs.get(ref.key) ?? null;
      }
      return null;
    } catch (err) {
      throw AppError.from(err, 'missing-asset');
    }
  }

  /** Loaded directly by the ImageService — kept for adapters that own decoding. */
  async loadPreview(_ref: StoredRef, _request: ImageRequest): Promise<ImageSource | null> {
    return null;
  }

  async importDropped(files: File[], handles?: Map<File, FileSystemFileHandle>): Promise<DroppedAsset[]> {
    const out: DroppedAsset[] = [];
    for (const file of files) {
      const info = formatFromName(file.name);
      const key = `m:${stableAssetId(`${file.name}:${file.size}:${file.lastModified}`)}`;
      const handle = handles?.get(file) ?? null;
      if (handle) this.manualHandles.set(key, handle);
      else this.manualBlobs.set(key, file);
      out.push({
        ref: {
          kind: 'manual',
          key,
          name: file.name,
          path: file.name,
          mime: file.type || info.mime,
          bytes: file.size,
        },
        name: file.name,
        path: file.name,
        format: info.format as AssetFormat,
        mime: file.type || info.mime,
        bytes: file.size,
        supported: info.supported,
      });
    }
    await this.persistManualRefs();
    return out;
  }

  pathLabel(ref: StoredRef | null, fallback = ''): string {
    if (!ref) return fallback;
    return ref.path || fallback;
  }

  async persistRefs(root: ScanRoot | null, _refs: StoredRef[]): Promise<void> {
    if (!root) return;
    // Only the root handle is stored: child handles are re-derived by re-walking the tree,
    // which keeps IndexedDB small even for a 250k file catalog.
    await idbSet(IDB_KEYS.root, {
      root,
      handle: this.rootHandle,
      mode: root.token.startsWith('input:') ? 'input' : 'picker',
    } satisfies PersistedRoot);
    await this.persistManualRefs();
  }

  private async persistManualRefs(): Promise<void> {
    if (!this.manualHandles.size) return;
    await idbSet(IDB_KEYS.manualHandles, [...this.manualHandles.entries()]);
  }

  async forgetRefs(): Promise<void> {
    await idbDelete(IDB_KEYS.root);
    await idbDelete(IDB_KEYS.manualHandles);
  }

  /** Used when a project is loaded that references manual assets of a previous session. */
  async restoreManualHandles(): Promise<void> {
    const entries = await idbGet<[string, FileSystemFileHandle][]>(IDB_KEYS.manualHandles);
    if (!entries) return;
    for (const [key, handle] of entries) this.manualHandles.set(key, handle);
  }

  refFor(assetId: string, refKey: string, kind: StoredRef['kind'], name: string, path: string, mime?: string, bytes?: number): StoredRef {
    void assetId;
    return { kind, key: refKey || `h:${path}`, name, path, mime, bytes };
  }
}
