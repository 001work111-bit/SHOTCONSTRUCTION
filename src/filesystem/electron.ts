import type { ScanResult, ScannedFile, ScannedFolder } from '../core/assets';
import { AppError } from '../core/errors';
import { extensionOf, formatFromName, SCAN_EXTENSIONS } from '../core/formats';
import { stableAssetId } from '../core/ids';
import type { AssetFormat } from '../core/types';
import type {
  AdapterCapabilities,
  DroppedAsset,
  FileSystemAdapter,
  ScanOutcome,
  ScanRoot,
  StoredRef,
} from './adapter';
import type {} from './electronBridge';

/**
 * ElectronFileSystemAdapter (spec §109–111).
 *
 * Same interface as the browser adapter, but with real absolute Windows paths, native
 * dialogs, rescan after the files changed and — when `sharp` is installed — native
 * decoding of TIFF / HEIC. Swapping adapters never touches the core modules.
 */

export class ElectronFileSystemAdapter implements FileSystemAdapter {
  readonly kind = 'electron' as const;

  readonly capabilities: AdapterCapabilities = {
    directoryPicker: true,
    absolutePaths: true,
    persistedHandles: true,
    rescan: true,
    nativePaths: true,
    nativeDecoders: Boolean(globalThis.window?.__shotComposer?.hasNativeDecoders),
  };

  private manualPaths = new Map<string, string>();

  private get bridge() {
    const bridge = typeof window !== 'undefined' ? window.__shotComposer : undefined;
    if (!bridge) {
      throw new AppError('unknown', 'Electron bridge is not available in this window.', {
        hint: 'Run the app through electron/main.cjs (npm run electron:dev).',
      });
    }
    return bridge;
  }

  isAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean(window.__shotComposer?.fs);
  }

  describe(): string {
    if (!this.isAvailable()) return 'Electron bridge not detected';
    const b = window.__shotComposer as NonNullable<Window['__shotComposer']>;
    return `Electron ${b.versions.electron} · Node ${b.versions.node}${b.hasNativeDecoders ? ' · native TIFF/HEIC codecs' : ''}`;
  }

  async pickDirectory(): Promise<ScanOutcome | null> {
    const path = await this.bridge.fs.pickDirectory();
    if (!path) return null;
    return this.scanPath(path);
  }

  async rescan(root: ScanRoot): Promise<ScanOutcome | null> {
    if (!root.token) return null;
    const exists = await this.bridge.fs.exists(root.token);
    if (!exists) {
      throw new AppError('missing-asset', `Folder “${root.label}” is no longer available.`, {
        hint: 'Use “Relink folder” to point the project at the new location.',
      });
    }
    return this.scanPath(root.token, root);
  }

  private async scanPath(path: string, existingRoot?: ScanRoot): Promise<ScanOutcome> {
    let scan;
    try {
      scan = await this.bridge.fs.scanDirectory(path, { maxFiles: 250_000, maxDepth: 12 });
    } catch (err) {
      throw AppError.from(err, 'directory-read-failed');
    }

    const notes: string[] = [];
    if (scan.truncated) notes.push('File limit reached; the catalog was truncated.');

    const folders: ScannedFolder[] = [];
    const refs: StoredRef[] = [];
    let unsupported = 0;

    const toScanned = (file: { name: string; path: string; relativePath: string; bytes: number }): ScannedFile => {
      const info = formatFromName(file.name);
      if (!info.supported) unsupported += 1;
      refs.push({ kind: 'path', key: file.path, name: file.name, path: file.relativePath, mime: info.mime, bytes: file.bytes });
      return {
        name: file.name,
        path: file.relativePath,
        format: info.format,
        mime: info.mime,
        bytes: file.bytes,
        refKey: file.path,
        supported: info.supported,
      };
    };

    for (const folder of scan.folders) {
      // keep only image files: the Electron layer returns everything for flexibility
      const files = folder.files.filter((f) => SCAN_EXTENSIONS.has(extensionOf(f.name))).map(toScanned);
      if (!files.length) continue;
      folders.push({ path: folder.path || folder.name, name: folder.name, files });
    }

    const rootFiles = scan.rootFiles
      .filter((f) => SCAN_EXTENSIONS.has(extensionOf(f.name)))
      .map(toScanned);

    const result: ScanResult = {
      rootName: scan.rootName,
      rootLabel: scan.rootPath,
      folders,
      rootFiles,
      unsupported,
      totalFiles: folders.reduce((sum, f) => sum + f.files.length, 0) + rootFiles.length,
      notes,
    };

    const root: ScanRoot = existingRoot ?? {
      id: 'root_electron',
      name: scan.rootName,
      label: scan.rootPath,
      token: scan.rootPath,
    };

    return { ...result, root, refs };
  }

  async restoreLastRoot(): Promise<{ root: ScanRoot; needsPermission: boolean } | null> {
    return null; // the Electron build restores the root from the project file itself
  }

  async requestAccess(): Promise<boolean> {
    return true;
  }

  async openBlob(ref: StoredRef): Promise<Blob | null> {
    const path = ref.kind === 'path' ? ref.key : this.manualPaths.get(ref.key);
    if (!path) return null;
    const bridge = this.bridge;
    try {
      if (this.capabilities.nativeDecoders && (ref.mime === 'image/tiff' || ref.mime === 'image/heic' || ref.mime === 'image/heif')) {
        const converted = await bridge.fs.convertImage(path);
        if (converted) return new Blob([converted], { type: 'image/png' });
      }
      const buffer = await bridge.fs.readFile(path);
      return new Blob([buffer], { type: ref.mime || 'application/octet-stream' });
    } catch (err) {
      throw AppError.from(err, 'missing-asset');
    }
  }

  async importDropped(files: File[]): Promise<DroppedAsset[]> {
    const out: DroppedAsset[] = [];
    for (const file of files) {
      const path = this.bridge.fs.pathForFile(file) ?? '';
      const info = formatFromName(file.name);
      const key = `m:${stableAssetId(path || `${file.name}:${file.size}`)}`;
      if (path) this.manualPaths.set(key, path);
      out.push({
        ref: { kind: path ? 'path' : 'manual', key: path || key, name: file.name, path: path || file.name, mime: file.type || info.mime, bytes: file.size },
        name: file.name,
        path: path || file.name,
        format: info.format as AssetFormat,
        mime: file.type || info.mime,
        bytes: file.size,
        supported: info.supported || this.capabilities.nativeDecoders,
      });
    }
    return out;
  }

  pathLabel(ref: StoredRef | null, fallback = ''): string {
    if (!ref) return fallback;
    return ref.kind === 'path' ? ref.key : ref.path || fallback;
  }

  async persistRefs(): Promise<void> {
    /* absolute paths live in the project JSON — nothing extra to persist */
  }

  async forgetRefs(): Promise<void> {
    /* no handle store in the Electron build */
  }

  /* ------------------------------------------------- native-project helpers */

  async saveProjectDialog(defaultName: string, content: string): Promise<string | null> {
    return this.bridge.dialogs.saveJson(defaultName, content);
  }

  async openProjectDialog(): Promise<{ path: string; content: string } | null> {
    return this.bridge.dialogs.openJson();
  }
}
