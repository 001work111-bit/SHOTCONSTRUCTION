/**
 * electron-main-smoke.cjs — прогон electron/main.cjs без GUI.
 *
 *   node scripts/electron-main-smoke.cjs
 *
 * Electron в песочнице/на CI без дисплея не запускается, поэтому вместо него
 * подставляется заглушка модуля `electron`: она записывает регистрацию IPC и
 * протокола и позволяет дёргать хендлеры напрямую. Проверяются реальные ветки:
 * выбор папки → скан, раздача файла по shotasset:, отказ чужим путям,
 * сохранение/открытие проекта, «последние проекты» и меню.
 */

'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-smoke-'));
const IMG_ROOT = path.join(TMP, 'Каталог кадров');
fs.mkdirSync(path.join(IMG_ROOT, 'Фон'), { recursive: true });
fs.mkdirSync(path.join(IMG_ROOT, 'Пусто'), { recursive: true });
fs.writeFileSync(path.join(IMG_ROOT, 'cover.txt'), 'not an image');
fs.writeFileSync(path.join(IMG_ROOT, 'обложка 01.jpg'), 'JPEGDATA');
fs.writeFileSync(path.join(IMG_ROOT, 'Фон', 'bg 100%.png'), 'PNGDATA');

/** Состояние заглушки */
const stub = {
  handlers: new Map(),
  protocolHandlers: new Map(),
  privilegedSchemes: [],
  sent: [],
  menus: [],
  dialogs: { openPaths: [], savePath: null, messages: [] },
  appEvents: new Map(),
  windows: [],
};

function makeWebContents(win) {
  return {
    send: (channel, payload) => stub.sent.push({ channel, payload }),
    on: () => {},
    once: () => {},
    setWindowOpenHandler: (fn) => {
      win._openHandler = fn;
    },
    session: {
      setPermissionRequestHandler: (fn) => {
        win._permissionRequest = fn;
      },
      setPermissionCheckHandler: (fn) => {
        win._permissionCheck = fn;
      },
    },
    openDevTools: () => {},
    isLoading: () => false,
  };
}

class FakeBrowserWindow {
  constructor(options = {}) {
    Object.assign(this, {
      options,
      _listeners: new Map(),
      _destroyed: false,
      _maximized: false,
      _bounds: { x: 0, y: 0, width: options.width ?? 1440, height: options.height ?? 900 },
    });
    this.webContents = makeWebContents(this);
    FakeBrowserWindow._all.push(this);
    stub.windows.push(this);
    setImmediate(() => this.emit('ready-to-show'));
  }

  static getAllWindows() {
    return FakeBrowserWindow._all.filter((w) => !w._destroyed);
  }

  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(cb);
  }

  once(event, cb) {
    this.on(event, cb);
  }

  emit(event, ...args) {
    for (const cb of this._listeners.get(event) ?? []) cb({}, ...args);
  }

  loadURL(url) {
    this.loadedUrl = url;
    return Promise.resolve();
  }

  loadFile(file) {
    this.loadedFile = file;
    return Promise.resolve();
  }

  show() {}
  focus() {}
  isMinimized() {
    return false;
  }
  restore() {}
  isDestroyed() {
    return this._destroyed;
  }
  isMaximized() {
    return this._maximized;
  }
  maximize() {
    this._maximized = true;
  }
  getNormalBounds() {
    return this._bounds;
  }
  getBounds() {
    return this._bounds;
  }
  destroy() {
    this._destroyed = true;
  }
}
FakeBrowserWindow._all = [];

const electronStub = {
  app: {
    setName: () => {},
    setAppUserModelId: () => {},
    requestSingleInstanceLock: () => true,
    getVersion: () => '0.0.0-smoke',
    getPath: (which) => (which === 'userData' || which === 'appData' ? path.join(TMP, 'userData') : which === 'documents' ? TMP : IMG_ROOT),
    quit: () => {},
    on: (event, cb) => {
      if (!stub.appEvents.has(event)) stub.appEvents.set(event, []);
      stub.appEvents.get(event).push(cb);
    },
    whenReady: () => Promise.resolve(),
  },
  BrowserWindow: FakeBrowserWindow,
  Menu: {
    buildFromTemplate: (template) => ({ template }),
    setApplicationMenu: (menu) => stub.menus.push(menu),
  },
  dialog: {
    showOpenDialog: async (_parent, options) => {
      stub.lastOpenOptions = options;
      const paths = stub.dialogs.openPaths.shift();
      if (!paths) return { canceled: true, filePaths: [] };
      return { canceled: false, filePaths: paths };
    },
    showSaveDialog: async (_parent, options) => {
      stub.lastSaveOptions = options;
      const p = stub.dialogs.savePath;
      if (!p) return { canceled: true };
      return { canceled: false, filePath: p };
    },
    showMessageBox: async (_parent, options) => {
      stub.dialogs.messages.push(options);
      return { response: 0 };
    },
  },
  ipcMain: {
    handle: (channel, fn) => {
      if (stub.handlers.has(channel)) throw new Error(`двойная регистрация ${channel}`);
      stub.handlers.set(channel, fn);
    },
  },
  protocol: {
    registerSchemesAsPrivileged: (schemes) => stub.privilegedSchemes.push(...schemes),
    handle: (scheme, fn) => stub.protocolHandlers.set(scheme, fn),
  },
  shell: {
    openPath: async () => '',
    openExternal: async () => {},
  },
  screen: {
    getAllDisplays: () => [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }],
  },
  nativeTheme: { themeSource: 'dark' },
  // preload-специфичное main.cjs не использует
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve(null) },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return electronStub;
  return originalLoad.call(this, request, parent, isMain);
};

const bridge = require(path.join(ROOT, 'electron', 'fs-bridge.cjs'));

async function main() {
  process.on('unhandledRejection', (err) => {
    console.error('unhandledRejection:', err);
    process.exit(1);
  });
  const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));

  require(path.join(ROOT, 'electron', 'main.cjs'));
  // whenReady().then(…) содержит реальные fs-операции — даём договорить
  await settle();

  const call = (channel, payload) => stub.handlers.get(channel)({}, payload);
  const step = (name) => console.log(`  · ${name}`);

  assert.ok(stub.handlers.size > 0, 'ipc-хендлеры не зарегистрированы');
  assert.equal(stub.windows.length, 1, 'окно не создано');
  assert.ok(stub.windows[0].loadedFile, 'в проде окно должно грузить dist/index.html');
  assert.ok(stub.menus.length >= 1, 'меню не установлено');
  assert.deepEqual(
    stub.privilegedSchemes.map((s) => s.scheme),
    ['shotasset'],
    'схема shotasset не зарегистрирована как привилегированная'
  );

  step('app-info');
  const info = await call('shot:app-info');
  assert.equal(info.isDesktop, true);

  step('pick-catalog → скан папки');
  stub.dialogs.openPaths.push([IMG_ROOT]);
  const catalog = await call('shot:pick-catalog');
  assert.equal(catalog.canceled, false);
  // порядок зависит от локали collation → сравниваем отсортированные наборы
  assert.deepEqual(
    catalog.entries.map((e) => e.relPath.replace(/\\/g, '/')).sort(),
    ['Каталог кадров/Фон/bg 100%.png', 'Каталог кадров/обложка 01.jpg'].sort()
  );
  assert.ok(catalog.folders.some((f) => f.includes('Пусто')), 'пустая папка потерялась');
  assert.equal(catalog.truncated, false);

  await settle(40);
  step('shotasset: раздача файла из выбранного корня');
  const handler = stub.protocolHandlers.get('shotasset');
  assert.ok(handler, 'протокол shotasset не обработан');
  const target = catalog.entries.find((e) => e.name.endsWith('.png'));
  const response = await handler({ url: bridge.pathToAssetUrl(target.absPath) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(await response.text(), 'PNGDATA');

  step('shotasset: чужой путь отклоняется');
  const forbidden = await handler({ url: bridge.pathToAssetUrl(path.join(TMP, 'outside.txt')) });
  assert.equal(forbidden.status, 404);

  step('shotasset: несуществующий файл внутри каталога');
  const gone = await handler({
    url: bridge.pathToAssetUrl(path.join(IMG_ROOT, 'нет.png')),
  });
  assert.equal(gone.status, 404);

  step('read-file + paths-exist');
  const file = await call('shot:read-file', target.absPath);
  assert.equal(file.ok, true);
  assert.equal(file.mime, 'image/png');
  const exists = await call('shot:paths-exist', [target.absPath, path.join(TMP, 'нет-файла.png')]);
  assert.equal(exists[target.absPath], true);
  assert.equal(exists[path.join(TMP, 'нет-файла.png')], false);

  step('save-json через диалог');
  const savePath = path.join(TMP, 'projects', 'мой проект.json');
  stub.dialogs.savePath = savePath;
  const saved = await call('shot:save-json', { fileName: 'мой проект.json', text: '{"a":1}' });
  assert.equal(saved.canceled, false);
  assert.equal(fs.readFileSync(savePath, 'utf8'), '{"a":1}');
  assert.ok(saved.path.endsWith('мой проект.json'));

  step('write-json-at (Ctrl+S без диалога)');
  const rewritten = await call('shot:write-json-at', { path: savePath, text: '{"a":2}' });
  assert.equal(rewritten.canceled, false);
  assert.equal(fs.readFileSync(savePath, 'utf8'), '{"a":2}');

  step('open-json / read-json-at');
  stub.dialogs.openPaths.push([savePath]);
  const opened = await call('shot:open-json');
  assert.equal(opened.canceled, false);
  assert.equal(opened.text, '{"a":2}');
  const byPath = await call('shot:read-json-at', savePath);
  assert.equal(byPath.canceled, false);

  step('последние проекты попадают в меню');
  await settle();
  const menu = stub.menus[stub.menus.length - 1];
  const fileMenu = menu.template.find((t) => t.label === 'Файл');
  const recents = fileMenu.submenu.find((t) => t.label === 'Последние проекты');
  assert.ok(recents && recents.submenu.length === 1, 'список последних проектов пуст');
  assert.equal(recents.submenu[0].label, 'мой проект');

  await settle(40);
  step('клик по пункту меню → событие в renderer');
  stub.sent.length = 0;
  recents.submenu[0].click();
  assert.deepEqual(stub.sent, [
    { channel: 'shot:menu', payload: { action: 'project-open-path', path: savePath } },
  ]);

  step('сохранение состояния окна');
  const win = stub.windows[0];
  win._bounds = { x: 10, y: 20, width: 1280, height: 800 };
  win.emit('resize');
  await new Promise((r) => setTimeout(r, 700));
  const windowStateFile = path.join(TMP, 'userData', 'window-state.json');
  assert.ok(fs.existsSync(windowStateFile), 'window-state.json не записан');
  const stored = JSON.parse(fs.readFileSync(windowStateFile, 'utf8'));
  assert.equal(stored.width, 1280);

  step('allowed-roots переживают перезапуск');
  const rootsFile = path.join(TMP, 'userData', 'allowed-roots.json');
  assert.ok(fs.existsSync(rootsFile), 'allowed-roots.json не записан');
  assert.ok(
    JSON.parse(fs.readFileSync(rootsFile, 'utf8')).roots.some((r) => r.includes('Каталог кадров')),
    'корень каталога не сохранён'
  );

  step('политика безопасности окна');
  assert.ok(win._permissionRequest, 'не задан setPermissionRequestHandler');
  await new Promise((resolve) => {
    win._permissionRequest(win.webContents, 'fullscreen', (allowed) => {
      assert.equal(allowed, true);
      resolve();
    }, { permission: 'fullscreen' });
  });
  await new Promise((resolve) => {
    win._permissionRequest(win.webContents, 'media', (allowed) => {
      assert.equal(allowed, false);
      resolve();
    }, { permission: 'media' });
  });
  assert.equal(win._openHandler({ url: 'https://example.com' }).action, 'deny');

  console.log('\n  ✔ smoke-прогон main.cjs прошёл\n');
}

main().catch((err) => {
  console.error('\n  ✘ smoke-прогон main.cjs упал\n');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
