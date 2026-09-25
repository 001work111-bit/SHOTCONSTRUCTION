/**
 * preload.cjs — единственный мост между renderer'ом и Node.
 *
 * Работает при `contextIsolation: true` + `sandbox: true`: наружу отдаётся только
 * типизированный набор функций, без доступа к fs/Node напрямую.
 */

'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

/**
 * Копия encodeDesktopAssetPath() из src/desktop/assetUrl.ts — синхронно и без IPC,
 * т.к. вызывается на каждую картинку. Совместность проверяет desktop:selftest.
 */
function assetUrl(absPath) {
  return `shotasset://f/${encodeURIComponent(String(absPath))}`;
}

const api = {
  isDesktop: true,
  platform: process.platform,

  /** Информация о приложении (версии, пути) */
  appInfo: () => ipcRenderer.invoke('shot:app-info'),

  /** Диалог выбора папки + сканирование каталога картинок */
  pickCatalog: () => ipcRenderer.invoke('shot:pick-catalog'),

  /** Пересканировать уже выбранную папку без диалога */
  rescanCatalog: (rootPath) => ipcRenderer.invoke('shot:rescan-catalog', rootPath),

  /** Разрешить main'у читать файлы из корня каталога (после восстановления проекта) */
  noteCatalogRoot: (rootPath) => ipcRenderer.invoke('shot:note-catalog-root', rootPath),

  /** Содержимое файла как Uint8Array (для File-совместимых мест) */
  readFile: (absPath) => ipcRenderer.invoke('shot:read-file', absPath),

  /** Проверка существования пачки путей: { path: boolean } */
  pathsExist: (paths) => ipcRenderer.invoke('shot:paths-exist', paths),

  /** Сохранить JSON через системный диалог */
  saveJson: (payload) => ipcRenderer.invoke('shot:save-json', payload),

  /** Перезаписать JSON по известному пути (Ctrl+S без диалога) */
  writeJsonAt: (payload) => ipcRenderer.invoke('shot:write-json-at', payload),

  /** Открыть JSON через системный диалог */
  openJson: () => ipcRenderer.invoke('shot:open-json'),

  /** Открыть JSON по конкретному пути (меню «Последние проекты») */
  readJsonAt: (absPath) => ipcRenderer.invoke('shot:read-json-at', absPath),

  /** Путь файла, брошенного из проводника Windows (аналог снятого File.path) */
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch {
      return '';
    }
  },

  /** Абсолютный путь → URL для <img src> (кастомная схема shotasset:) */
  assetUrl,

  /** События из нативного меню */
  onMenu: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('shot:menu', handler);
    return () => ipcRenderer.removeListener('shot:menu', handler);
  },
};

contextBridge.exposeInMainWorld('shotDesktop', api);
