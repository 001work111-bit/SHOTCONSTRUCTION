/**
 * main.cjs — главный процесс Electron-оболочки SHOT Constructor.
 *
 * Ответственности:
 *  - окно (с сохранением размера/позиции, тёмная тема, иконка);
 *  - кастомная схема `shotasset:` для показа картинок прямо с диска;
 *  - IPC: выбор папки-каталога, чтение файлов, системные диалоги сохранения/открытия проекта;
 *  - нативное меню (Файл/Правка/Вид/Справка) + последние проекты;
 *  - базовые настройки безопасности renderer'а.
 *
 * Вся файловая логика вынесена в fs-bridge.cjs (можно тестировать без Electron).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell, screen, nativeTheme } = require(
  'electron'
);

const bridge = require('./fs-bridge.cjs');

const APP_NAME = 'SHOT Constructor';
const APP_ID = 'com.shotconstruction.app';
const ASSET_SCHEME = 'shotasset';

const isDev = !!process.env.ELECTRON_START_URL;
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_INDEX = path.join(ROOT_DIR, 'dist', 'index.html');

/** @type {BrowserWindow | null} */
let mainWindow = null;
let recentList = null;
let windowState = null;
/** Корни, из которых разрешено читать файлы (выбранные пользователем папки). */
const allowedRoots = new Set();

app.setName(APP_NAME);

// Windows: без этого иконка/группа в панели задач будет «Electron app»
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

// Единый экземпляр: повторный запуск фокусирует существующее окно
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Схема должна быть объявлена «привилегированной» до готовности app
protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function sendToWindow(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

/* ------------------------------------------------------------------ */
/* Разрешение доступа к путям                                          */
/* ------------------------------------------------------------------ */

let allowedRootsStore = null;
let persistRoots = null;

/**
 * Корни, из которых renderer может читать файлы. Храним в userData, чтобы
 * восстановленный из автосейва проект снова показывал картинки после перезапуска.
 */
function allowRoot(dirPath) {
  let resolved = null;
  try {
    resolved = bridge.canonicalPathForCompare(path.resolve(bridge.normalizeIncomingPath(dirPath)));
  } catch {
    return;
  }
  // разрешили «папку», а передали файл — берём каталог
  try {
    if (fs.statSync(resolved).isFile()) resolved = bridge.canonicalPathForCompare(path.dirname(resolved));
  } catch {
    /* не существует — считаем каталогом */
  }
  if (!resolved || allowedRoots.has(resolved)) return;
  allowedRoots.add(resolved);
  if (persistRoots) persistRoots();
}

/**
 * Читать можно либо файлы внутри выбранной пользователем папки, либо файлы,
 * к которым уже есть «легитимный» доступ (проекты из последних/сохранений).
 */
function isPathAllowed(absPath) {
  let resolved;
  try {
    resolved = bridge.canonicalPathForCompare(path.resolve(bridge.normalizeIncomingPath(absPath)));
  } catch {
    return false;
  }
  const targetDir = path.dirname(resolved);
  for (const root of allowedRoots) {
    if (targetDir === root || targetDir.startsWith(root + path.sep)) return true;
  }
  return false;
}

function assertReadable(absPath) {
  if (!bridge.isSafeReadablePath(absPath)) {
    throw new Error('Файл недоступен для чтения');
  }
  if (!isPathAllowed(absPath)) {
    throw new Error('Дост к этому пути не разрешён: сначала откройте папку или проект');
  }
}

/* ------------------------------------------------------------------ */
/* Протокол shotasset://                                               */
/* ------------------------------------------------------------------ */

function registerAssetProtocol() {
  protocol.handle(ASSET_SCHEME, async (request) => {
    try {
      const absPath = bridge.assetUrlToPath(request.url);
      assertReadable(absPath);
      const data = await bridge.readImageFile(absPath);
      return new global.Response(data.buffer, {
        status: 200,
        headers: {
          'Content-Type': data.mime,
          'Content-Length': String(data.size),
          'Access-Control-Allow-Origin': '*',
          // Короткий кэш: картинки на локальном диске меняются редко,
          // но после правки файла достаточно F5 (или пересканирования папки).
          'Cache-Control': 'private, max-age=60',
        },
      });
    } catch (err) {
      const status = err && err.code === 'EACCES' ? 403 : 404;
      return new global.Response(String(err && err.message ? err.message : 'Not found'), {
        status,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Меню                                                                */
/* ------------------------------------------------------------------ */

async function buildMenu() {
  const recent = recentList ? await recentList.list() : [];

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const fileSubmenu = [
    {
      label: 'Новый проект',
      accelerator: 'CmdOrCtrl+Alt+N',
      click: () => sendToWindow('shot:menu', { action: 'project-new' }),
    },
    {
      label: 'Открыть проект…',
      accelerator: 'CmdOrCtrl+O',
      click: () => sendToWindow('shot:menu', { action: 'project-open' }),
    },
    {
      label: 'Сохранить проект…',
      accelerator: 'CmdOrCtrl+Shift+S',
      click: () => sendToWindow('shot:menu', { action: 'project-save' }),
    },
    { type: 'separator' },
    recent.length === 0
      ? { label: 'Нет последних проектов', enabled: false }
      : {
          label: 'Последние проекты',
          submenu: recent.map((item) => ({
            label: item.name || path.basename(item.path),
            click: () => sendToWindow('shot:menu', { action: 'project-open-path', path: item.path }),
          })),
        },
    { type: 'separator' },
    { role: 'close', label: 'Закрыть окно' },
    process.platform === 'win32'
      ? { role: 'quit', label: 'Выход' }
      : { role: 'quit', label: `Выйти из ${APP_NAME}` },
  ];

  const template = [
    { label: 'Файл', submenu: fileSubmenu },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'delete', label: 'Удалить' },
        { role: 'selectAll', label: 'Выделить всё' },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload', label: 'Перезагрузить' },
        { role: 'forceReload', label: 'Перезагрузить принудительно' },
        { role: 'toggleDevTools', label: 'Инструменты разработчика' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Масштаб 100%' },
        { role: 'zoomIn', label: 'Увеличить' },
        { role: 'zoomOut', label: 'Уменьшить' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Полноэкранный режим' },
      ],
    },
    {
      label: 'Окно',
      submenu: [
        { role: 'minimize', label: 'Свернуть' },
        { role: 'zoom', label: 'Развернуть' },
        ...(process.platform === 'win32'
          ? [{ role: 'alwaysOnTop', label: 'Поверх остальных окон' }]
          : []),
      ],
    },
    {
      label: 'Справка',
      submenu: [
        {
          label: `О программе ${APP_NAME}`,
          click: () => {
            dialog.showMessageBox(mainWindow ?? undefined, {
              type: 'info',
              title: APP_NAME,
              message: APP_NAME,
              detail: [
                `Версия: ${app.getVersion()}`,
                `Electron: ${process.versions.electron}`,
                `Chromium: ${process.versions.chrome}`,
                `Node: ${process.versions.node}`,
                '',
                'Данные проекта хранятся локально и никуда не отправляются.',
              ].join('\n'),
              buttons: ['OK'],
              noLink: true,
            });
          },
        },
        {
          label: 'Открыть папку данных',
          click: () => {
            void shell.openPath(app.getPath('userData'));
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function registerIpc() {
  ipcMain.handle('shot:app-info', () => ({
    name: APP_NAME,
    version: app.getVersion(),
    platform: process.platform,
    isDesktop: true,
    isDev,
    appDataPath: app.getPath('userData'),
    documentsPath: app.getPath('documents'),
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
  }));

  /** Выбор папки с картинками + сканирование */
  ipcMain.handle('shot:pick-catalog', async () => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите папку с картинками',
      buttonLabel: 'Выбрать папку',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: allowedRoots.size > 0 ? Array.from(allowedRoots).pop() : app.getPath('pictures'),
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };

    const root = result.filePaths[0];
    allowRoot(root);
    const maxImages = Number(process.env.SHOT_MAX_IMAGES) || bridge.DEFAULT_MAX_IMAGES;
    const catalog = await bridge.scanImageCatalog(root, { maxImages });
    return { canceled: false, ...catalog };
  });

  /** Пересканировать ранее выбранную папку (обновить каталог без диалога) */
  ipcMain.handle('shot:rescan-catalog', async (_event, rootPath) => {
    if (!rootPath) return { canceled: true };
    allowRoot(rootPath);
    const maxImages = Number(process.env.SHOT_MAX_IMAGES) || bridge.DEFAULT_MAX_IMAGES;
    const catalog = await bridge.scanImageCatalog(rootPath, { maxImages });
    return { canceled: false, ...catalog };
  });

  /** Чтение файла для File-совместимого API (drag&drop, экспорт) */
  ipcMain.handle('shot:read-file', async (_event, absPath) => {
    assertReadable(absPath);
    const data = await bridge.readImageFile(absPath);
    return {
      ok: true,
      name: data.name,
      mime: data.mime,
      buffer: data.buffer,
    };
  });

  ipcMain.handle('shot:paths-exist', async (_event, paths) => {
    const map = await bridge.pathsExist(paths);
    return map;
  });

  /** Сохранить проект через системный диалог */
  ipcMain.handle('shot:save-json', async (_event, payload) => {
    const fileName = String((payload && payload.fileName) || 'project.json').replace(
      /[\\/:*?"<>|]/g,
      '_'
    );
    const startDir =
      (payload && payload.currentPath && path.dirname(bridge.normalizeIncomingPath(payload.currentPath))) ||
      app.getPath('documents');

    const result = await dialog.showSaveDialog(mainWindow ?? undefined, {
      title: 'Сохранить проект',
      defaultPath: path.join(startDir, fileName),
      filters: [
        { name: 'Проект SHOT Constructor (JSON)', extensions: ['json'] },
        { name: 'Все файлы', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    const written = await bridge.writeTextFile(result.filePath, (payload && payload.text) || '');
    allowRoot(path.dirname(written.path));
    if (recentList) {
      await recentList.add({ path: written.path, name: path.basename(written.path, '.json') });
      await buildMenu();
    }
    return { canceled: false, path: written.path, size: written.size };
  });

  /** Перезаписать файл проекта по уже известному пути — без диалога */
  ipcMain.handle('shot:write-json-at', async (_event, payload) => {
    const target = payload && payload.path;
    if (!target) return { canceled: true, error: 'Не указан файл' };
    if (!isPathAllowed(target) && !bridge.isSafeReadablePath(target)) {
      // файл мог лежать вне выбранной папки — спросим разрешение через диалог
      return { canceled: true, error: 'Нет доступа к пути. Используйте «Сохранить как…»' };
    }
    try {
      const written = await bridge.writeTextFile(target, (payload && payload.text) || '');
      if (recentList) {
        await recentList.add({ path: written.path, name: path.basename(written.path, '.json') });
        await buildMenu();
      }
      return { canceled: false, path: written.path, size: written.size };
    } catch (err) {
      return { canceled: false, error: String(err && err.message ? err.message : 'Ошибка записи') };
    }
  });

  /** Открыть проект через системный диалог */
  ipcMain.handle('shot:open-json', async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      title: 'Открыть проект',
      buttonLabel: 'Открыть',
      properties: ['openFile'],
      filters: [{ name: 'Проект SHOT Constructor (JSON)', extensions: ['json'] }],
      defaultPath: app.getPath('documents'),
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return readProjectFromPath(result.filePaths[0]);
  });

  /** Открыть конкретный путь (пункт «Последние проекты») */
  ipcMain.handle('shot:read-json-at', async (_event, absPath) => readProjectFromPath(absPath));

  async function readProjectFromPath(absPath) {
    const { path: normalized, text } = await bridge.readTextFile(absPath);
    allowRoot(path.dirname(normalized));
    if (recentList) {
      await recentList.add({ path: normalized, name: path.basename(normalized, '.json') });
      await buildMenu();
    }
    return { canceled: false, path: normalized, text };
  }

  ipcMain.handle('shot:note-catalog-root', async (_event, rootPath) => {
    if (rootPath) allowRoot(rootPath);
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ */
/* Окно                                                                */
/* ------------------------------------------------------------------ */

function applyWindowSecurity(win) {
  const wc = win.webContents;

  // Никакой навигации за пределы приложения
  wc.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith(process.env.ELECTRON_START_URL) : url.startsWith('file://');
    if (!allowed) {
      event.preventDefault();
      void shell.openExternal(url).catch(() => undefined);
    }
  });

  wc.setWindowOpenHandler(({ url }) => {
    // Ссылки вида https:// — в системный браузер, новые окна приложения запрещены
    if (/^https?:/i.test(url)) void shell.openExternal(url).catch(() => undefined);
    return { action: 'deny' };
  });

  // Не разрешаем просить камеру/микрофон/геолокацию и т.п.
  const ses = wc.session;
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    // Нужен только полный экран для режима предпросмотра
    callback(permission === 'fullscreen');
  });
  ses.setPermissionCheckHandler((_webContents, permission) => permission === 'fullscreen');
}

async function createWindow() {
  const savedBounds = windowState ? await windowState.get() : { width: 1440, height: 900 };
  let x = savedBounds.x;
  let y = savedBounds.y;
  try {
    const displays = screen.getAllDisplays();
    if (!bridge.boundsAreVisible({ ...savedBounds, x, y }, displays)) {
      x = undefined;
      y = undefined;
    }
  } catch {
    /* screen может быть недоступен на ранних этапах */
  }

  mainWindow = new BrowserWindow({
    width: savedBounds.width,
    height: savedBounds.height,
    x,
    y,
    minWidth: 1080,
    minHeight: 640,
    show: false,
    backgroundColor: '#0c0c0e',
    title: APP_NAME,
    autoHideMenuBar: true,
    icon: path.join(ROOT_DIR, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // В dev нужен доступ к http://127.0.0.1:5173, в prod — к file://
      webSecurity: true,
      spellcheck: false,
      devTools: true,
      backgroundThrottling: false,
      zoomFactor: 1,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (savedBounds.maximized) mainWindow.maximize();
    mainWindow.show();
  });

  applyWindowSecurity(mainWindow);

  const persist = () => {
    if (!mainWindow || !windowState || mainWindow.isDestroyed()) return;
    const isMax = mainWindow.isMaximized();
    const b = mainWindow.getNormalBounds ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    void windowState.set(
      { width: Math.round(b.width), height: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y) },
      isMax
    );
  };
  const debounce = (fn, ms) => {
    let t = null;
    return () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        fn();
      }, ms);
    };
  };
  const persistDebounced = debounce(persist, 350);
  mainWindow.on('resize', persistDebounced);
  mainWindow.on('move', persistDebounced);
  mainWindow.on('maximize', persist);
  mainWindow.on('unmaximize', persist);
  mainWindow.on('close', persist);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Заголовок окна синхронизирует renderer (document.title), autosave страхует от потери данных

  if (isDev) {
    await mainWindow.loadURL(process.env.ELECTRON_START_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(DIST_INDEX);
  }
}

/* ------------------------------------------------------------------ */
/* Жизненный цикл                                                     */
/* ------------------------------------------------------------------ */

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on('render-process-gone', (_event, _wc, details) => {
  dialog.showErrorBox(
    APP_NAME,
    `Окно приложения завершилось (${details && details.reason}). Перезапустите программу.`
  );
});

void app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';
  registerAssetProtocol();
  registerIpc();

  const userData = app.getPath('userData');
  recentList = bridge.createRecentList(userData);
  windowState = bridge.createWindowState(userData);
  allowedRootsStore = bridge.createJsonStore(userData, 'allowed-roots.json', { roots: [] });

  const stored = await allowedRootsStore.load();
  for (const root of Array.isArray(stored.roots) ? stored.roots : []) {
    try {
      allowedRoots.add(path.resolve(bridge.normalizeIncomingPath(root)));
    } catch {
      /* мусор в конфиге — пропускаем */
    }
  }

  let saveTimer = null;
  persistRoots = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      // последние 12 корней — больше не нужно
      const roots = Array.from(allowedRoots).slice(-12);
      void allowedRootsStore.save({ roots });
    }, 500);
  };

  await buildMenu();
  await createWindow();
});
