'use strict';

/**
 * preload.cjs — мост между main-процессом и React-приложением.
 *
 * Работает при sandbox: true и contextIsolation: true.
 * Наружу отдаём только безопасные обёртки (без прямого доступа к fs/dialog).
 */

const { contextBridge, ipcRenderer } = require('electron');

/** base64url без зависимости от поддержки кодировки 'base64url' в Buffer */
function toBase64Url(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** appimg://file/<base64url абсолютного пути> — отдаёт байты локального файла */
function imageUrl(absPath) {
  if (typeof absPath !== 'string' || absPath.length === 0) return null;
  if (absPath.startsWith('appimg://')) return absPath;
  return 'appimg://file/' + toBase64Url(absPath);
}

const api = {
  isElectron: true,

  /** Скан папки через нативный диалог → каталог ассетов */
  pickDirectory: () => ipcRenderer.invoke('fs:pickDirectory'),

  /** Синхронная сборка URL картинки (данные отдаёт protocol.handle в main) */
  imageUrl,

  /** Нативное «Сохранить как» + запись JSON */
  saveProject: (filename, data) => ipcRenderer.invoke('fs:saveProject', filename, data),

  /** Нативное «Открыть» + чтение JSON (проект или шаблон) */
  openJson: () => ipcRenderer.invoke('fs:openJson'),

  /** Алиас для совместимости */
  openProject: () => ipcRenderer.invoke('fs:openJson'),

  /** Проверить, какие файлы ещё существуют на диске */
  checkFiles: (paths) => ipcRenderer.invoke('fs:checkFiles', paths),

  /** Прочитать файл как base64 (для drag-n-drop и readFileAsFile) */
  readFile: (absPath) => ipcRenderer.invoke('fs:readFile', absPath),

  /** Выбор папки для экспорта избранных картинок */
  pickExportFolder: () => ipcRenderer.invoke('fs:pickExportFolder'),

  /** Копирование файлов: [{ from, to }] → выбранная папка */
  copyFiles: (tasks) => ipcRenderer.invoke('fs:copyFiles', tasks),
  /** Демо-каталог со встроенными картинками */
  demoCatalog: () => ipcRenderer.invoke('demo:catalog'),

  /** Информация о приложении/окружении */
  appInfo: () => ipcRenderer.invoke('app:info'),

  /** Подписки на команды из меню (main → renderer) */
  onMenuCommand: (handler) => {
    const listener = (_e, command) => handler(command);
    ipcRenderer.on('menu:command', listener);
    return () => ipcRenderer.removeListener('menu:command', listener);
  },

  /** Переключить DevTools (из UI, если понадобится) */
  toggleDevTools: () => ipcRenderer.send('win:toggleDevTools'),
};

contextBridge.exposeInMainWorld('electronAPI', api);
