/**
 * api.ts — типизированный доступ к мосту Electron (`window.shotDesktop`).
 *
 * В браузерном билде моста нет: `getDesktop()` возвращает null, и приложение
 * работает ровно как раньше (File System Access API + <a download>).
 */

import { encodeDesktopAssetPath } from './assetUrl';

export interface DesktopAppInfo {
  name: string;
  version: string;
  platform: string;
  isDesktop: boolean;
  isDev: boolean;
  appDataPath: string;
  documentsPath: string;
  versions: { electron: string; chrome: string; node: string };
}

export interface DesktopCatalogEntry {
  /** Относительный путь от родителя выбранной папки, с именем выбранной папки в начале */
  relPath: string;
  /** Абсолютный путь на диске */
  absPath: string;
  name: string;
  size: number;
  mtimeMs: number;
  /** Можно ли показать в <img> (jpg/png/webp/gif/svg/avif/bmp) */
  previewable: boolean;
}

export interface DesktopCatalogResult {
  canceled: boolean;
  rootPath?: string;
  rootName?: string;
  entries?: DesktopCatalogEntry[];
  /** Относительные пути всех подпапок (включая пустые) */
  folders?: string[];
  imageCount?: number;
  otherFileCount?: number;
  truncated?: boolean;
  skippedDirs?: string[];
  error?: string;
}

export interface DesktopReadFileResult {
  ok: boolean;
  name: string;
  mime: string;
  buffer: Uint8Array;
}

export interface DesktopSaveJsonResult {
  canceled: boolean;
  path?: string;
  size?: number;
  error?: string;
}

export interface DesktopOpenJsonResult {
  canceled: boolean;
  path?: string;
  text?: string;
  error?: string;
}

export type DesktopMenuAction =
  | { action: 'project-new' }
  | { action: 'project-open' }
  | { action: 'project-save' }
  | { action: 'project-open-path'; path: string };

export interface ShotDesktopApi {
  isDesktop: true;
  platform: string;
  appInfo: () => Promise<DesktopAppInfo>;
  pickCatalog: () => Promise<DesktopCatalogResult>;
  rescanCatalog: (rootPath: string) => Promise<DesktopCatalogResult>;
  noteCatalogRoot: (rootPath: string) => Promise<{ ok: boolean }>;
  readFile: (absPath: string) => Promise<DesktopReadFileResult>;
  pathsExist: (paths: string[]) => Promise<Record<string, boolean>>;
  saveJson: (payload: {
    fileName: string;
    text: string;
    currentPath?: string | null;
  }) => Promise<DesktopSaveJsonResult>;
  writeJsonAt: (payload: { path: string; text: string }) => Promise<DesktopSaveJsonResult>;
  openJson: () => Promise<DesktopOpenJsonResult>;
  readJsonAt: (absPath: string) => Promise<DesktopOpenJsonResult>;
  getPathForFile: (file: File) => string;
  /** Синхронный построитель URL — в preload он есть, в браузере нет */
  assetUrl?: (absPath: string) => string;
  onMenu: (callback: (payload: DesktopMenuAction) => void) => () => void;
}

declare global {
  interface Window {
    shotDesktop?: ShotDesktopApi;
  }
}

export function getDesktop(): ShotDesktopApi | null {
  if (typeof window === 'undefined') return null;
  const api = window.shotDesktop;
  return api && api.isDesktop ? api : null;
}

export function isDesktopRuntime(): boolean {
  return getDesktop() !== null;
}

/**
 * URL для файла на диске.
 * Предпочитаем синхронный билдер из preload (единая реализация с main),
 * фолбэк — локальная реализация.
 */
export function desktopAssetUrl(absPath: string): string {
  const api = getDesktop();
  if (api?.assetUrl) {
    try {
      return api.assetUrl(absPath);
    } catch {
      /* падаем на локальную реализацию */
    }
  }
  return encodeDesktopAssetPath(absPath);
}
