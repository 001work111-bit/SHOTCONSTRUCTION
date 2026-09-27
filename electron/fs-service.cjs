'use strict';

/**
 * fs-service.cjs — нативные файловые операции для Electron (main process).
 *
 * Всё, что нельзя сделать из рендерера (диалоги выбора папки/файла,
 * рекурсивный скан каталога, чтение байтов картинок), живёт здесь
 * и вызывается из preload через ipcRenderer.invoke().
 */

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { dialog, app } = require('electron');

/* ------------------------------------------------------------------ */
/* Константы (зеркало src/core/types.ts, чтобы main был самодостаточным) */
/* ------------------------------------------------------------------ */

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp', 'tiff', 'tif', 'heic', 'heif',
]);

/** Форматы, которые Chromium умеет показать в <img> */
const RENDERABLE = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp']);

const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  ico: 'image/x-icon',
};

const MAX_DEPTH = 16;
const MAX_FILES = 200000;

/* ------------------------------------------------------------------ */
/* Утилиты                                                             */
/* ------------------------------------------------------------------ */

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function formatOf(ext) {
  return SUPPORTED_IMAGE_EXTENSIONS.has(ext) ? ext : 'unknown';
}

function isImageFile(name) {
  return SUPPORTED_IMAGE_EXTENSIONS.has(extOf(name));
}

function isRenderable(ext) {
  return RENDERABLE.has(ext);
}

function mimeOf(filePath) {
  return MIME_BY_EXT[extOf(path.basename(filePath))] || 'application/octet-stream';
}

let idCounter = 0;
function makeId(prefix) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/** Абсолютный ли это путь (POSIX или Windows) */
function isAbsolutePath(p) {
  return typeof p === 'string' && (/^([a-zA-Z]:[\\/]|\/)/.test(p));
}

/* ------------------------------------------------------------------ */
/* Скан каталога                                                       */
/* ------------------------------------------------------------------ */

/**
 * Рекурсивно обходит папку и возвращает каталог в том же формате,
 * что и BrowserFileSystemAdapter (src/filesystem/FileSystemAdapter.ts),
 * чтобы рендерер мог скормить результат прямо в actions.applyCatalog().
 *
 * sourceKey у ассетов = АБСОЛЮТНЫЙ путь к файлу. Благодаря этому
 * сохранённый проект переоткрывается без потерь (файлы не "пропадают").
 */
async function scanDirectory(rootPath) {
  const folders = [];
  const assets = [];

  const rootName = path.basename(rootPath) || rootPath;
  const rootFolderId = makeId('folder');
  const rootFolder = {
    id: rootFolderId,
    name: rootName,
    relativePath: rootName,
    assetIds: [],
    parentId: null,
  };
  folders.push(rootFolder);

  let fileCount = 0;
  let truncated = false;

  async function walk(dirPath, relativePath, folderId, depth) {
    if (depth > MAX_DEPTH || truncated) return;

    let entries;
    try {
      entries = await fsp.readdir(dirPath, { withFileTypes: true });
    } catch {
      return; // нет доступа / битая ссылка — молча пропускаем
    }

    for (const entry of entries) {
      const absPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const childPath = `${relativePath}/${entry.name}`;
        const childId = makeId('folder');
        folders.push({
          id: childId,
          name: entry.name,
          relativePath: childPath,
          assetIds: [],
          parentId: folderId,
        });
        await walk(absPath, childPath, childId, depth + 1);
        continue;
      }

      if (!entry.isFile() || !isImageFile(entry.name)) continue;

      if (fileCount >= MAX_FILES) {
        truncated = true;
        return;
      }
      fileCount += 1;

      const ext = extOf(entry.name);
      let fileSize;
      try {
        fileSize = (await fsp.stat(absPath)).size;
      } catch {
        fileSize = undefined;
      }

      const asset = {
        id: makeId('asset'),
        filename: entry.name,
        relativePath: `${relativePath}/${entry.name}`,
        folderId,
        format: formatOf(ext),
        fileSize,
        sourceKey: absPath,
        unsupported: !isRenderable(ext),
      };
      assets.push(asset);

      const owner = folders.find((f) => f.id === folderId);
      if (owner) owner.assetIds.push(asset.id);
    }
  }

  await walk(rootPath, rootName, rootFolderId, 0);

  // Если в корне нет картинок, но есть подпапки — прячем пустой корень
  // (та же логика, что и в браузерном адаптере)
  const subfolders = folders.filter((f) => f.parentId === rootFolderId);
  let resultFolders = folders;
  if (subfolders.length > 0 && rootFolder.assetIds.length === 0) {
    resultFolders = folders
      .filter((f) => f.id !== rootFolderId)
      .map((f) => (f.parentId === rootFolderId ? { ...f, parentId: null } : f));
  }

  return {
    rootName,
    folders: resultFolders,
    assets,
    truncated,
    // Маркер для отладки: рендерер понимает, что каталог нативный
    native: true,
  };
}

/* ------------------------------------------------------------------ */
/* Диалоги                                                             */
/* ------------------------------------------------------------------ */

async function pickDirectory(parentWindow) {
  const result = await dialog.showOpenDialog(parentWindow, {
    title: 'Выберите папку с изображениями',
    buttonLabel: 'Загрузить',
    properties: ['openDirectory', 'dontAddToRecent', 'treatPackageAsDirectory'],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
  return scanDirectory(result.filePaths[0]);
}

async function saveProjectFile(parentWindow, filename, data) {
  const safeName =
    (filename || 'project').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').trim() || 'project';
  const defaultPath = path.join(app.getPath('documents'), safeName.endsWith('.json') ? safeName : `${safeName}.json`);

  const result = await dialog.showSaveDialog(parentWindow, {
    title: 'Сохранить проект',
    defaultPath,
    buttonLabel: 'Сохранить',
    filters: [
      { name: 'Проект Shot Construction', extensions: ['json'] },
      { name: 'Все файлы', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };

  let target = result.filePath;
  if (!target.toLowerCase().endsWith('.json')) target += '.json';
  await fsp.writeFile(target, JSON.stringify(data, null, 2), 'utf8');
  return { ok: true, path: target };
}

async function openJsonFile(parentWindow) {
  const result = await dialog.showOpenDialog(parentWindow, {
    title: 'Открыть JSON',
    buttonLabel: 'Открыть',
    properties: ['openFile', 'dontAddToRecent'],
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'Все файлы', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { ok: false, canceled: true };
  }

  const filePath = result.filePaths[0];
  try {
    const text = await fsp.readFile(filePath, 'utf8');
    return { ok: true, path: filePath, data: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: `Не удалось прочитать файл: ${e.message}` };
  }
}

async function readFileData(absPath) {
  if (!isAbsolutePath(absPath)) return { ok: false, error: 'Not an absolute path' };
  try {
    const stat = await fsp.stat(absPath);
    if (!stat.isFile()) return { ok: false, error: 'Not a file' };
    const buf = await fsp.readFile(absPath);
    return {
      ok: true,
      name: path.basename(absPath),
      mime: mimeOf(absPath),
      size: stat.size,
      data: buf.toString('base64'),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Проверка существования файлов пачками (для восстановления missing-флагов) */
async function checkFiles(paths) {
  const result = {};
  const list = Array.isArray(paths) ? paths.slice(0, MAX_FILES) : [];
  const BATCH = 64;

  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (p) => {
        if (typeof p !== 'string' || p.length === 0) {
          result[String(p)] = false;
          return;
        }
        try {
          const st = await fsp.stat(p);
          result[p] = st.isFile();
        } catch {
          result[p] = false;
        }
      })
    );
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Экспорт фаворитов                                                   */
/* ------------------------------------------------------------------ */

/** Диалог выбора папки назначения для экспорта */
async function pickExportFolder(parentWindow) {
  const result = await dialog.showOpenDialog(parentWindow, {
    title: 'Куда сохранить избранные картинки',
    buttonLabel: 'Сохранить сюда',
    properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { ok: false, canceled: true };
  }
  return { ok: true, path: result.filePaths[0] };
}

/**
 * Копирование файлов с сохранением структуры папок.
 * tasks: [{ from: абсолютный путь, to: 'папка/имя.jpg' }]
 */
async function copyFiles(parentWindow, tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { ok: false, error: 'Нечего копировать' };
  }

  const dest = await pickExportFolder(parentWindow);
  if (dest.canceled) return { ok: false, canceled: true };

  let copied = 0;
  const failed = [];

  for (const task of tasks) {
    const from = task && task.from;
    const rel = sanitizeRelative(task && task.to);
    if (!from || !rel) {
      failed.push(String((task && task.to) || 'unknown'));
      continue;
    }
    const target = path.join(dest.path, rel);
    try {
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.copyFile(from, target);
      copied += 1;
    } catch {
      failed.push(rel);
    }
  }

  return { ok: true, path: dest.path, copied, failed };
}

/** Убираем ../ и ведущие слэши, чтобы нельзя было записать что угодно куда угодно */
function sanitizeRelative(rel) {
  if (typeof rel !== 'string' || rel.length === 0) return null;
  const parts = rel
    .split(/[\\/]+/)
    .filter((p) => p.length > 0 && p !== '.' && p !== '..');
  if (parts.length === 0) return null;
  return parts.join(path.sep);
}

/* ------------------------------------------------------------------ */
/* Демо-каталог (встроенные картинки)                                   */
/* ------------------------------------------------------------------ */

/** Где лежат демо-картинки: в сборке это dist/demo, при разработке — public/demo */
function resolveDemoDir() {
  const appPath = app.getAppPath();
  const candidates = [
    path.join(appPath, 'dist', 'demo'),
    path.join(appPath, 'demo'),
    path.join(appPath, 'public', 'demo'),
    path.join(appPath, '..', 'demo'),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
    } catch (_) {
      /* игнорируем и пробуем следующий вариант */
    }
  }
  return null;
}

/**
 * Сканирует встроенный демо-набор и возвращает каталог с АБСОЛЮТНЫМИ путями,
 * поэтому картинки грузятся тем же кодом, что и пользовательские.
 */
async function demoCatalog() {
  const dir = resolveDemoDir();
  if (!dir) return null;
  const scanned = await scanDirectory(dir);
  if (!scanned.assets || scanned.assets.length === 0) return null;

  const folders = scanned.folders.map((f) => ({
    ...f,
    name: f.name === 'demo' ? 'Демо' : f.name,
  }));
  const byId = new Map(folders.map((f) => [f.id, f]));
  const assets = scanned.assets.map((a) => {
    const folder = byId.get(a.folderId);
    return folder
      ? { ...a, relativePath: `${folder.name}/${a.filename}` }
      : a;
  });

  return { ...scanned, rootName: 'Демо', folders, assets, native: true };
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function setupIpc(ipcMain, { getWindow }) {
  ipcMain.handle('fs:pickDirectory', async () => {
    try {
      return await pickDirectory(getWindow());
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('fs:saveProject', async (_e, filename, data) => {
    try {
      return await saveProjectFile(getWindow(), filename, data);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('fs:openJson', async () => {
    try {
      return await openJsonFile(getWindow());
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('fs:readFile', async (_e, absPath) => readFileData(absPath));

  ipcMain.handle('fs:checkFiles', async (_e, paths) => checkFiles(paths));

  ipcMain.handle('fs:pickExportFolder', async () => {
    try {
      return await pickExportFolder(getWindow());
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('fs:copyFiles', async (_e, tasks) => {
    try {
      return await copyFiles(getWindow(), tasks);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('demo:catalog', () => {
    try {
      return demoCatalog();
    } catch (e) {
      console.error('[demo] ошибка сканирования:', e);
      return null;
    }
  });

  ipcMain.handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    userData: app.getPath('userData'),
    isPackaged: app.isPackaged,
  }));
}

module.exports = {
  SUPPORTED_IMAGE_EXTENSIONS,
  RENDERABLE,
  MIME_BY_EXT,
  mimeOf,
  isAbsolutePath,
  isImageFile,
  scanDirectory,
  pickDirectory,
  saveProjectFile,
  openJsonFile,
  readFileData,
  checkFiles,
  pickExportFolder,
  copyFiles,
  demoCatalog,
  setupIpc,
};
