import type {
  FileSystemAdapter,
  ScannedCatalog,
} from './FileSystemAdapter';

/**
 * ElectronFileSystemAdapter — файловая система через мост window.electronAPI.
 *
 * Отличия от браузерного адаптера:
 *  • нет File System Access API и <input webkitdirectory> — вместо них
 *    нативный диалог и рекурсивный скан в main-процессе;
 *  • sourceKey = абсолютный путь к файлу, поэтому проекты
 *    переоткрываются без «пропажи» картинок;
 *  • картинки отдаются не через blob:-URL, а через кастомный протокол
 *    appimg://file/<base64url пути> (см. electron/main.cjs).
 *
 * Интерфейс намеренно совпадает с BrowserFileSystemAdapter, поэтому
 * ProjectStore и actions не знают, в какой оболочке работают.
 */
export class ElectronFileSystemAdapter implements FileSystemAdapter {
  private get api() {
    return typeof window !== 'undefined' ? window.electronAPI : undefined;
  }

  supportsDirectoryPicker(): boolean {
    return !!this.api;
  }

  /** Нативный выбор папки → каталог в формате приложения */
  async pickDirectory(): Promise<ScannedCatalog | null> {
    const api = this.api;
    if (!api) return null;
    try {
      const catalog = await api.pickDirectory();
      if (!catalog) return null;
      return {
        rootName: catalog.rootName,
        folders: catalog.folders,
        assets: catalog.assets,
        // handles не нужны: файлы читает main-процесс
        handles: new Map(),
      };
    } catch (e) {
      console.error('[electron-fs] pickDirectory failed', e);
      return null;
    }
  }

  /**
   * URL для <img src>. Для абсолютных путей возвращает appimg://-ссылку,
   * для уже готовых URL (blob:, appimg:, http:) — как есть.
   */
  async getObjectUrl(
    sourceKey: string,
    _handles: Map<string, FileSystemFileHandle | File>
  ): Promise<string | null> {
    const api = this.api;
    if (!api || !sourceKey) return null;

    if (
      sourceKey.startsWith('appimg://') ||
      sourceKey.startsWith('blob:') ||
      sourceKey.startsWith('data:') ||
      sourceKey.startsWith('http://') ||
      sourceKey.startsWith('https://')
    ) {
      return sourceKey;
    }

    // Абсолютный путь (POSIX: /..., Windows: C:\...)
    if (/^([a-zA-Z]:[\\/]|\/)/.test(sourceKey)) {
      return api.imageUrl(sourceKey);
    }

    return null;
  }

  /** File-объект для внешних операций (используется редко, но контракт требует) */
  async readFileAsFile(
    sourceKey: string,
    _handles: Map<string, FileSystemFileHandle | File>
  ): Promise<File | null> {
    const api = this.api;
    if (!api || !sourceKey) return null;

    try {
      const res = await api.readFile(sourceKey);
      if (!res.ok || !res.data) return null;

      const bin = atob(res.data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new File([bytes], res.name || 'image', {
        type: res.mime || 'application/octet-stream',
      });
    } catch (e) {
      console.error('[electron-fs] readFileAsFile failed', e);
      return null;
    }
  }
}
