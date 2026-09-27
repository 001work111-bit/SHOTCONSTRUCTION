/// <reference types="node" />

/**
 * Типы моста window.electronAPI (см. electron/preload.cjs).
 * Файл не импортируется в рантайме — только для TypeScript.
 */

export interface ElectronScannedCatalog {
  rootName: string;
  folders: Array<{
    id: string;
    name: string;
    relativePath: string;
    assetIds: string[];
    parentId: string | null;
  }>;
  assets: Array<{
    id: string;
    filename: string;
    relativePath: string;
    folderId: string | null;
    format: ImageFormat;
    fileSize?: number;
    sourceKey: string;
    unsupported?: boolean;
    missing?: boolean;
    external?: boolean;
  }>;
  truncated?: boolean;
  native?: boolean;
}

export interface ElectronAPI {
  isElectron: true;

  /** Нативный диалог выбора папки + рекурсивный скан */
  pickDirectory(): Promise<ElectronScannedCatalog | null>;

  /** appimg://-URL для локального файла (абсолютный путь) */
  imageUrl(absPath: string): string | null;

  /** Нативный Save-as + запись JSON. Возвращает { canceled } при отмене. */
  saveProject(filename: string, data: unknown): Promise<{
    ok: boolean;
    canceled?: boolean;
    path?: string;
    error?: string;
  }>;

  /** Нативное Open + чтение JSON (проект или шаблон) */
  openJson(): Promise<{
    ok: boolean;
    canceled?: boolean;
    path?: string;
    data?: unknown;
    error?: string;
  }>;

  /** Алиас openJson */
  openProject(): Promise<{
    ok: boolean;
    canceled?: boolean;
    path?: string;
    data?: unknown;
    error?: string;
  }>;

  /** Проверка существования файлов на диске: { путь: boolean } */
  checkFiles(paths: string[]): Promise<Record<string, boolean>>;

  /** Файл как base64 (используется адаптером readFileAsFile) */
  readFile(absPath: string): Promise<{
    ok: boolean;
    name?: string;
    mime?: string;
    size?: number;
    data?: string;
    error?: string;
  }>;

  /** Выбор папки для экспорта избранных картинок */
  pickExportFolder(): Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;

  /** Копирование файлов [{ from, to }] в выбранную папку */
  copyFiles(tasks: Array<{ from: string; to: string }>): Promise<{
    ok: boolean;
    canceled?: boolean;
    path?: string;
    copied?: number;
    failed?: string[];
    error?: string;
  }>;

  appInfo(): Promise<{
    name: string;
    version: string;
    platform: string;
    arch: string;
    electron: string;
    chrome: string;
    node: string;
    userData: string;
    isPackaged: boolean;
  }>;

  /** Команды из нативного меню */
  onMenuCommand(handler: (command: string) => void): () => void;

  toggleDevTools(): void;

  /** Демо-каталог со встроенными картинками (абсолютные пути) */
  demoCatalog(): Promise<ScannedCatalogPayload | null>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
