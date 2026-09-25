/**
 * fs-bridge.cjs — вся платформенная логика приложения без зависимости от Electron.
 *
 * Модуль сознательно не импортирует `electron`, чтобы его можно было
 * протестировать обычным `node` (см. scripts/desktop-selftest.mjs) и переиспользовать
 * в любом окружении. main.cjs только подключает IPC/диалоги поверх этих функций.
 */

'use strict';

const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/** Поддерживаемые растровые форматы (совпадает с SUPPORTED_IMAGE_EXTENSIONS в src/core/types.ts) */
const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'svg',
  'avif',
  'bmp',
  'tiff',
  'tif',
  'heic',
  'heif',
]);

/** Форматы, которые Chromium умеет показывать в <img> без плагинов */
const PREVIEWABLE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'svg',
  'avif',
  'bmp',
]);

const MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** Каталоги, которые никогда не стоит обходить */
const IGNORED_DIR_NAMES = new Set([
  'node_modules',
  '$recycle.bin',
  'system volume information',
  '.trash',
  '.thumbnails',
  '__MACOSX',
  '.git',
]);

const DEFAULT_MAX_IMAGES = 20000;

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function isImageName(name) {
  return IMAGE_EXTENSIONS.has(extOf(name));
}

function isPreviewable(name) {
  return PREVIEWABLE_EXTENSIONS.has(extOf(name));
}

function mimeFor(filePath) {
  return MIME_TYPES[extOf(filePath)] ?? 'application/octet-stream';
}

/** Normalizes a path coming from the renderer (may contain forward slashes on Windows). */
function normalizeIncomingPath(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('Path must be a non-empty string');
  }
  let p = input;
  if (process.platform === 'win32') {
    p = p.replace(/\//g, '\\');
    // замена даёт удвоенные разделители — path.win32.normalize их схлопывает
    // префикс вида \\?\C:\... уже нормализован, остальное чистим от `..`
    p = path.win32.normalize(p);
    // пути длиннее MAX_PATH Windows понимает только с префиксом \\?\ (сеть — \\?\UNC\)
    if (p.length > 259 && !p.startsWith('\\\\?\\') && !p.startsWith('\\\\.\\')) {
      p = p.startsWith('\\\\') ? `\\\\?\\UNC\\${p.slice(2)}` : `\\\\?\\${p}`;
    }
  } else {
    p = path.posix.normalize(p);
  }
  return p;
}

function isSafeReadablePath(input) {
  try {
    const p = normalizeIncomingPath(input);
    if (!path.isAbsolute(p)) return false;
    // Только регулярные файлы, без устройств и сокетов
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Рекурсивно сканирует папку и возвращает плоский список картинок.
 * Относительные пути строятся от родителя выбранной папки, т.е. первым
 * сегментом идёт имя выбранной папки — ровно как в браузерном
 * BrowserFileSystemAdapter (scanDirectoryHandle).
 *
 * @param {string} rootDir абсолютный путь, выбранный пользователем
 * @param {{maxImages?: number, skipped?: string[]}} [options]
 * @returns {Promise<{
 *   rootPath: string, rootName: string,
 *   entries: Array<{relPath: string, absPath: string, size: number, mtimeMs: number, previewable: boolean}>,
 *   folders: string[], imageCount: number, otherFileCount: number,
 *   truncated: boolean, skippedDirs: string[]
 * }>}
 */
async function scanImageCatalog(rootDir, options = {}) {
  const maxImages = Number(options.maxImages) || DEFAULT_MAX_IMAGES;
  const root = path.resolve(normalizeIncomingPath(rootDir));

  const stat = await fsp.stat(root);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${root}`);
  }

  const rootName = path.basename(root) || root;
  const skippedDirs = Array.isArray(options.skipped) ? options.skipped : [];
  /** @type {Array<{relPath: string, absPath: string, size: number, mtimeMs: number, previewable: boolean}>} */
  const entries = [];
  /** @type {Set<string>} */
  const folders = new Set();
  let imageCount = 0;
  let otherFileCount = 0;
  let truncated = false;

  /** очередь папок: [абсолютный путь, относительный путь от корня] */
  const queue = [[root, '']];
  const CONCURRENCY = 8;

  const readDirSafe = async (dir) => {
    try {
      return await fsp.readdir(dir, { withFileTypes: true });
    } catch (err) {
      skippedDirs.push(`${path.basename(dir)} (${err && err.code ? err.code : 'error'})`);
      return null;
    }
  };

  while (queue.length > 0) {
    const batch = queue.splice(0, CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ([abs, rel]) => {
        const dirents = await readDirSafe(abs);
        if (!dirents) return null;
        return { abs, rel, dirents };
      })
    );

    for (const item of results) {
      if (!item) continue;
      // Сортировка по имени, чтобы порядок папок/картинок был детерминированным
      const sorted = item.dirents.slice().sort((a, b) => {
        const aDir = a.isDirectory() && !a.isSymbolicLink() ? 0 : 1;
        const bDir = b.isDirectory() && !b.isSymbolicLink() ? 0 : 1;
        if (aDir !== bDir) return aDir - bDir;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

      for (const entry of sorted) {
        const absPath = path.join(item.abs, entry.name);
        const relPath = item.rel ? `${item.rel}/${entry.name}` : entry.name;
        const isSymlink = entry.isSymbolicLink();

        if (entry.isDirectory() && !isSymlink) {
          const lower = entry.name.toLowerCase();
          if (entry.name.startsWith('.') || IGNORED_DIR_NAMES.has(lower)) continue;
          // относительный путь всегда начинается с имени корня — см. браузерный адаптер
          const childRel = `${rootName}/${relPath}`;
          folders.add(childRel);
          queue.push([absPath, relPath]);
          continue;
        }

        if (!entry.isFile() || isSymlink) {
          if (entry.isSymbolicLink() && isImageName(entry.name)) {
            // симлинки на картинки читаем, но каталоги по симлинкам не обходим
            try {
              const linkStat = await fsp.stat(absPath);
              if (linkStat.isFile()) {
                pushImage(absPath, relPath, entry.name, linkStat);
              }
            } catch {
              /* битый симлинк — пропускаем */
            }
          }
          continue;
        }

        if (entry.name.startsWith('.')) continue;

        if (isImageName(entry.name)) {
          let fileStat = null;
          try {
            fileStat = await fsp.stat(absPath);
          } catch {
            continue;
          }
          pushImage(absPath, relPath, entry.name, fileStat);
        } else {
          otherFileCount += 1;
        }
      }
    }
  }

  function pushImage(absPath, relPath, name, fileStat) {
    if (imageCount >= maxImages) {
      truncated = true;
      return;
    }
    const displayRel = `${rootName}/${relPath}`.replace(/\\/g, '/');
    imageCount += 1;
    const sep = displayRel.lastIndexOf('/');
    if (sep > 0) folders.add(displayRel.slice(0, sep));
    entries.push({
      relPath: displayRel,
      absPath,
      name,
      size: Number(fileStat.size),
      mtimeMs: Math.round(fileStat.mtimeMs),
      previewable: isPreviewable(name),
    });
  }

  entries.sort((a, b) => a.relPath.localeCompare(b.relPath, undefined, { numeric: true }));

  return {
    rootPath: root,
    rootName,
    entries,
    folders: Array.from(folders).sort(),
    imageCount,
    otherFileCount,
    truncated,
    skippedDirs,
  };
}

/**
 * Путь → URL кастомной схемы `shotasset:` (см. main.cjs).
 * Путь кодируется одним сегментом — зеркало `encodeDesktopAssetPath()` из src/desktop/assetUrl.ts.
 */
function pathToAssetUrl(absPath) {
  return `shotasset://f/${encodeURIComponent(String(absPath))}`;
}

/** URL → путь (используется обработчиком протокола) */
function assetUrlToPath(url) {
  const parsed = new global.URL(url);
  const decoded = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (process.platform === 'win32') {
    // Windows принимает оба разделителя, но обратный слеш надёжнее (UNC, \?\ и т.п.)
    return decoded.replace(/\//g, '\\');
  }
  return decoded;
}

/**
 * Канонический вид пути для СРАВНЕНИЙ (список разрешённых корней ↔ запрашиваемый файл).
 * Снимает win32-префиксы \\?\ и \\?\UNC\, использует нативные разделители,
 * убирает хвостовой разделитель, а на Windows ещё и приводит регистр к верхнему
 * (том там case-insensitive). Без этого путь с длинным именем не совпал бы
 * с «разрешённым корнем», выбранным по короткому пути.
 */
function canonicalPathForCompare(input) {
  const raw = String(input);
  if (process.platform === 'win32') {
    let p = raw.replace(/\//g, '\\');
    if (p.startsWith('\\\\?\\UNC\\')) p = `\\\\${p.slice(8)}`;
    else if (p.startsWith('\\\\?\\')) p = p.slice(4);
    p = path.win32.normalize(p);
    if (p.length > 3) p = p.replace(/[\\]+$/, '');
    return p.toUpperCase();
  }
  let p = path.posix.normalize(raw);
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p;
}

async function readImageFile(absPath) {
  const p = normalizeIncomingPath(absPath);
  const stat = await fsp.stat(p);
  if (!stat.isFile()) throw new Error('Not a file');
  const buffer = await fsp.readFile(p);
  return {
    buffer,
    mime: mimeFor(p),
    size: buffer.length,
    name: path.basename(p),
    mtimeMs: Math.round(stat.mtimeMs),
  };
}

async function pathExists(absPath) {
  try {
    await fsp.access(normalizeIncomingPath(absPath), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Пакетная проверка доступности файлов — нужна, чтобы после перезапуска
 * пометить пропавшие картинки, а не показывать битые <img>.
 */
async function pathsExist(paths, limit = 5000) {
  const list = Array.from(new Set((Array.isArray(paths) ? paths : []).slice(0, limit)));
  const results = await Promise.all(list.map(async (p) => [p, await pathExists(p)]));
  return Object.fromEntries(results);
}

async function writeTextFile(absPath, text) {
  const p = normalizeIncomingPath(absPath);
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, String(text), 'utf8');
  return { path: p, size: Buffer.byteLength(String(text), 'utf8') };
}

async function readTextFile(absPath) {
  const p = normalizeIncomingPath(absPath);
  const text = await fsp.readFile(p, 'utf8');
  return { path: p, text };
}

/** Небольшое хранилище JSON-настроек в userData (состояние окна, последние проекты). */
function createJsonStore(dirPath, fileName, defaults) {
  const file = path.join(dirPath, fileName);
  let cache = null;

  async function load() {
    if (cache) return cache;
    try {
      const raw = await fsp.readFile(file, 'utf8');
      cache = { ...defaults, ...JSON.parse(raw) };
    } catch {
      cache = { ...defaults };
    }
    return cache;
  }

  async function save(next) {
    cache = next;
    try {
      await fsp.mkdir(dirPath, { recursive: true });
      await fsp.writeFile(file, JSON.stringify(next, null, 2), 'utf8');
    } catch {
      /* настройки не критичны — молча игнорируем */
    }
    return cache;
  }

  return {
    file,
    load,
    save,
    async update(patch) {
      const current = await load();
      const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
      return save(next);
    },
  };
}

/** Ограниченный список последних проектов. */
function createRecentList(dirPath, limit = 8) {
  const store = createJsonStore(dirPath, 'recent-projects.json', { items: [] });
  return {
    async list() {
      const { items } = await store.load();
      const checked = await Promise.all(
        items.map(async (item) => ({ item, ok: await pathExists(item.path) }))
      );
      return checked.filter((x) => x.ok).map((x) => x.item);
    },
    async add(entry) {
      await store.update((state) => {
        const items = [
          { ...entry, at: Date.now() },
          ...state.items.filter((x) => x.path !== entry.path),
        ].slice(0, limit);
        return { ...state, items };
      });
    },
  };
}

/** Состояние окна (позиция/размер/maximum), чтобы приложение открывалось «как было». */
function createWindowState(dirPath) {
  const store = createJsonStore(dirPath, 'window-state.json', {
    width: 1440,
    height: 900,
    x: null,
    y: null,
    maximized: false,
  });

  return {
    async get() {
      const state = await store.load();
      const width = Math.max(900, Number(state.width) || 1440);
      const height = Math.max(600, Number(state.height) || 900);
      return {
        width,
        height,
        x: Number.isFinite(state.x) ? state.x : undefined,
        y: Number.isFinite(state.y) ? state.y : undefined,
        maximized: !!state.maximized,
      };
    },
    async set(bounds, maximized) {
      await store.update((state) => ({ ...state, ...bounds, maximized: !!maximized }));
    },
  };
}

/** Проверка, что сохранённая позиция окна не уехала за пределы экранов. */
function boundsAreVisible(bounds, displays) {
  if (!displays || displays.length === 0) return true;
  if (bounds.x == null || bounds.y == null) return true;
  return displays.some((d) => {
    const b = d.workArea || d.bounds;
    return (
      bounds.x < b.x + b.width - 60 &&
      bounds.x + 200 > b.x &&
      bounds.y >= b.y - 10 &&
      bounds.y < b.y + b.height - 60
    );
  });
}

const helpers = {
  IMAGE_EXTENSIONS,
  DEFAULT_MAX_IMAGES,
  extOf,
  isImageName,
  isPreviewable,
  mimeFor,
  normalizeIncomingPath,
  canonicalPathForCompare,
  isSafeReadablePath,
  scanImageCatalog,
  pathToAssetUrl,
  assetUrlToPath,
  readImageFile,
  pathExists,
  pathsExist,
  writeTextFile,
  readTextFile,
  createJsonStore,
  createRecentList,
  createWindowState,
  boundsAreVisible,
  tmpDir: os.tmpdir,
};

module.exports = helpers;
