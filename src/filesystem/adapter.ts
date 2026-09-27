import type { ScanResult } from '../core/assets';
import type { AssetFormat } from '../core/types';

/**
 * FileSystemAdapter contract (spec §40, §109–111).
 *
 * The core never talks to a browser API or to Electron. Everything platform specific
 * lives behind this interface, so the swap Browser → Electron does not touch the
 * Randomizer, BlockManager, FavoritesManager, StackManager or the PreviewEngine.
 */

export interface AdapterCapabilities {
  /** real directory picker with persistent handles */
  directoryPicker: boolean;
  /** absolute paths are available (Electron) */
  absolutePaths: boolean;
  /** file handles survive a page reload */
  persistedHandles: boolean;
  /** catalog can be re-read from disk without a new user pick */
  rescan: boolean;
  /** drop events carry real file paths (Electron) */
  nativePaths: boolean;
  /** codecs beyond the browser ones (TIFF / HEIC via native libs) */
  nativeDecoders: boolean;
}

export interface StoredRef {
  /** how the bytes can be reached again */
  kind: 'handle' | 'file' | 'path' | 'manual';
  /** handle key / absolute path / manual token */
  key: string;
  name: string;
  /** display path */
  path: string;
  mime?: string;
  bytes?: number;
}

export interface ScanRoot {
  id: string;
  name: string;
  /** display label, e.g. `Images` (browser) or `D:\Images` (Electron) */
  label: string;
  /** adapter token to re-open the root (handle key or absolute path) */
  token: string;
}

export interface ScanOutcome extends ScanResult {
  root: ScanRoot;
  refs: StoredRef[];
  /** permission still valid (handles restored from IndexedDB may need a gesture) */
  needsPermission?: boolean;
}

export interface ImageRequest {
  /** longest edge of the produced bitmap; `Infinity` = original */
  maxEdge: number;
  /** do not downscale below this (used by the preview hero) */
  quality?: number;
}

export interface ImageSource {
  url: string;
  width?: number;
  height?: number;
  /** the format cannot be decoded here → render the placeholder card instead */
  unsupported?: boolean;
  note?: string;
  /** true when the url is the untouched original file */
  original?: boolean;
}

export interface DroppedAsset {
  ref: StoredRef;
  name: string;
  path: string;
  format: AssetFormat;
  mime: string;
  bytes: number;
  supported: boolean;
  width?: number;
  height?: number;
}

export interface FileSystemAdapter {
  readonly kind: 'browser' | 'electron';
  readonly capabilities: AdapterCapabilities;
  isAvailable(): boolean;
  /** Ask the user for a root folder and scan it (must be called inside a user gesture). */
  pickDirectory(): Promise<ScanOutcome | null>;
  /** Re-read a previously scanned root without a new pick (Electron always, browser when permission allows). */
  rescan(root: ScanRoot): Promise<ScanOutcome | null>;
  /** Try to restore the last root after a reload. */
  restoreLastRoot(): Promise<{ root: ScanRoot; needsPermission: boolean } | null>;
  /** Re-request permission for a restored root (needs a user gesture in Chromium). */
  requestAccess(root: ScanRoot): Promise<boolean>;
  /** Read bytes for one asset. */
  openBlob(ref: StoredRef): Promise<Blob | null>;
  /**
   * Register dropped files as assets (spec §38–39).
   * `handles` carries `DataTransferItem.getAsFileSystemHandle()` results when the browser
   * provides them, which keeps the dropped file reachable after a reload.
   */
  importDropped(files: File[], handles?: Map<File, FileSystemFileHandle>): Promise<DroppedAsset[]>;
  /** Human readable location for the inspector. */
  pathLabel(ref: StoredRef | null, fallback?: string): string;
  /** Persist handles so a reload can relink (no-op for Electron). */
  persistRefs(root: ScanRoot | null, refs: StoredRef[]): Promise<void>;
  /** Clear stored handles (used by “Relink folder”). */
  forgetRefs(): Promise<void>;
  /** Optional disk space / capability probe for the settings panel. */
  describe(): string;
  /**
   * Optional: import a catalog that ships with the application (used by the bundled demo).
   * Implemented by the browser adapter; an Electron build may omit it.
   */
  registerBundledFiles?(entries: { path: string; url: string }[]): Promise<ScanOutcome>;
}
