/**
 * Type surface of the Electron preload bridge (`electron/preload.cjs`).
 * The browser build never touches it; the adapter activates only when it exists (spec §110).
 */

export interface BridgeScannedFile {
  name: string;
  /** absolute path */
  path: string;
  relativePath: string;
  bytes: number;
  mtimeMs: number;
}

export interface BridgeScanResult {
  rootPath: string;
  rootName: string;
  folders: { path: string; name: string; files: BridgeScannedFile[] }[];
  rootFiles: BridgeScannedFile[];
  truncated: boolean;
}

export interface ShotComposerBridge {
  platform: string;
  versions: { electron: string; node: string; chrome: string };
  /** true when the native image codec (sharp) is installed → TIFF/HEIC become usable */
  hasNativeDecoders: boolean;
  fs: {
    pickDirectory(): Promise<string | null>;
    scanDirectory(path: string, options?: { maxFiles?: number; maxDepth?: number }): Promise<BridgeScanResult>;
    readFile(path: string): Promise<ArrayBuffer>;
    convertImage(path: string): Promise<ArrayBuffer | null>;
    exists(path: string): Promise<boolean>;
    /** real absolute path of a dropped File (Electron ≥ 32 uses webUtils) */
    pathForFile(file: File): string | null;
    revealInFolder(path: string): Promise<void>;
  };
  dialogs: {
    saveJson(defaultName: string, content: string): Promise<string | null>;
    openJson(): Promise<{ path: string; content: string } | null>;
  };
  window: {
    setTitle(title: string): void;
    toggleFullScreen(): void;
  };
}

declare global {
  interface Window {
    __shotComposer?: ShotComposerBridge;
  }
}
