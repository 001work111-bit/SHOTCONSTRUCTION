'use strict';

/**
 * main.cjs — Electron main process для Visual Constructor.
 *
 * Запуск:
 *   разработка:  npm run dev      (Vite dev-server + Electron на http://localhost:5173)
 *   прод:        npm run build && npm start
 *   упаковка:    npm run dist     (electron-builder → папка release/)
 */

const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const { app, BrowserWindow, shell, protocol, ipcMain, Menu, net } = require('electron');

const fsService = require('./fs-service.cjs');

/* ---------------------------------------------------------------- */
/* Кастомный протокол для локальных картинок                         */
/* appimg://file/<base64url абсолютного пути>                        */
/* Регистрируем ДО app.ready, иначе браузер получит отказ.           */
/* ---------------------------------------------------------------- */
protocol.registerSchemesAsPrivileged([
  { scheme: 'appimg', srcSchemeSupport: true },
]);

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

/* Диагностика скорости запуска: SHOTC_TIMING=1 node scripts/launch.cjs */
const T0 = Date.now();
function mark(label) {
  if (!process.env.SHOTC_TIMING) return;
  const ms = Date.now() - T0;
  console.log(`[timing] ${label}: +${ms}ms`);
}

let mainWindow = null;

function resolveIndexHtml() {
  // electron/ лежит рядом с dist/ и в dev, и в собранном пакете (asar)
  return path.join(__dirname, '..', 'dist', 'index.html');
}

function createWindow() {
  mark('создаю окно');
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#0c0c0e',
    show: false,
    title: 'Visual Constructor — Image Combinator',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mark('окно готово к показу');
    mainWindow.show();
    if (isDev) mainWindow.focus();
    mark('окно показано');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mark('интерфейс загружен');
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    if (process.env.SHOTC_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'bottom' });
    }
  } else {
    const indexHtml = resolveIndexHtml();
    if (!fs.existsSync(indexHtml)) {
      // Прод-режим без сборки: объясняем человеческим языком вместо белого экрана
      const { dialog } = require('electron');
      dialog.showErrorBox(
        'Приложение ещё не собрано',
        [
          'Не найден файл:',
          indexHtml,
          '',
          'Что сделать (один раз):',
          '1. Откройте папку с программой.',
          '2. Запустите файл  ЗАПУСК.bat  (Windows) или  ЗАПУСК.command  (macOS).',
          '   Он сам установит компоненты и соберёт приложение.',
          '',
          'Либо вручную, в терминале из папки программы:',
          'npm install',
          'npm run build',
          'npm start',
        ].join('\n')
      );
      app.quit();
      return;
    }
    mainWindow.loadFile(indexHtml).catch((e) => {
      console.error('[main] не удалось загрузить dist/index.html:', e);
      mainWindow.loadURL(DEV_URL);
    });
  }

  // Внешние ссылки — в системный браузер, новые окна запрещены
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  fsService.setupIpc(ipcMain, { getWindow: () => mainWindow });

  ipcMain.on('win:toggleDevTools', () => {
    const wc = mainWindow && mainWindow.webContents;
    if (!wc) return;
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools({ mode: 'bottom' });
  });
}

/* ---------------------------------------------------------------- */
/* Протокол отдачи картинок                                          */
/* ---------------------------------------------------------------- */
/** Декодирование base64url (Buffer в sandboxed preload не знает 'base64url') */
function fromBase64Url(encoded) {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf8');
}

function setupImageProtocol() {
  protocol.handle('appimg', async (request) => {
    try {
      const u = new URL(request.url);
      const encoded = u.pathname.replace(/^\/+/, '');
      if (!encoded) return new Response('bad request', { status: 400 });

      const absPath = fromBase64Url(encoded);
      if (!fsService.isAbsolutePath(absPath)) {
        return new Response('forbidden', { status: 403 });
      }

      const stat = await fsp.stat(absPath);
      if (!stat.isFile()) return new Response('not found', { status: 404 });

      const data = await fsp.readFile(absPath);
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': fsService.mimeOf(absPath),
          'Content-Length': String(data.byteLength),
          'Cache-Control': 'private, max-age=31536000, immutable',
          'Accept-Ranges': 'none',
        },
      });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}

/* ---------------------------------------------------------------- */
/* Меню                                                               */
/* ---------------------------------------------------------------- */
function buildMenu() {
  const isMac = process.platform === 'darwin';

  const send = (command) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('menu:command', command);
    }
  };

  const template = [
    // Файл — акселераторы НЕ назначаем на Ctrl+S/Z/Y/N/O:
    // приложение обрабатывает их само (ProjectStore), иначе меню съест событие.
    ...(isMac
      ? [{ role: 'appMenu' }]
      : [
          {
            label: 'Файл',
            submenu: [
              { label: 'Новый проект', click: () => send('new') },
              { label: 'Открыть проект…', click: () => send('open') },
              { label: 'Сохранить проект…', click: () => send('save') },
              { type: 'separator' },
              { label: 'Загрузить папку изображений…', click: () => send('loadFolder') },
              { type: 'separator' },
              { role: 'quit', label: 'Выход' },
            ],
          },
        ]),
    {
      label: 'Правка',
      submenu: [
        { label: 'Отменить', click: () => send('undo') },
        { label: 'Повторить', click: () => send('redo') },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
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
        { role: 'resetZoom', label: 'Сброс масштаба' },
        { role: 'zoomIn', label: 'Увеличить' },
        { role: 'zoomOut', label: 'Уменьшить' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Полный экран' },
      ],
    },
    {
      label: 'Окно',
      submenu: [
        { role: 'minimize', label: 'Свернуть' },
        { role: 'close', label: 'Закрыть' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------------------------------------------------------- */
/* Self-test без дисплея:  SHOTC_SMOKE=1 electron .                  */
/* Проверяет протокол, скан каталога, чтение файлов и IPC-хендлеры.  */
/* ---------------------------------------------------------------- */
async function runSmokeTest() {
  const os = require('node:os');
  const report = { ok: true, checks: {} };
  const check = (name, fn) => {
    try {
      const r = fn();
      report.checks[name] = r === undefined ? 'ok' : r;
    } catch (e) {
      report.ok = false;
      report.checks[name] = `FAIL: ${e.message}`;
    }
  };

  // 1. PNG 1x1 для теста чтения через протокол
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'shotc-smoke-'));
  const pngB64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
  const imgPath = path.join(tmp, 'sub', 'test.png');
  await fsp.mkdir(path.dirname(imgPath), { recursive: true });
  await fsp.writeFile(imgPath, Buffer.from(pngB64, 'base64'));
  await fsp.writeFile(path.join(tmp, 'notes.txt'), 'not an image', 'utf8');

  // 2. Скан
  const catalog = await fsService.scanDirectory(tmp);
  check('scan: rootName', () => catalog.rootName);
  check('scan: assets count = 1', () => (catalog.assets.length === 1 ? 'ok' : String(catalog.assets.length)));
  check('scan: folders count = 1 (пустой корень спрятан)', () =>
    catalog.folders.length === 1 ? 'ok' : String(catalog.folders.length)
  );
  check('scan: sourceKey абсолютный', () =>
    fsService.isAbsolutePath(catalog.assets[0].sourceKey) ? 'ok' : catalog.assets[0].sourceKey
  );

  // 3. base64url → URL → чтение через protocol.handle
  const url = 'appimg://file/' + Buffer.from(imgPath, 'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/, '');
  const res = await net.fetch(url);
  check('protocol: status 200', () => (res.status === 200 ? 'ok' : String(res.status)));
  check('protocol: content-type', () => res.headers.get('content-type'));
  const buf = Buffer.from(await res.arrayBuffer());
  check('protocol: bytes read', () => (buf.length > 0 ? 'ok (' + buf.length + ' bytes)' : 'EMPTY'));

  // 4. Проверка отсутствующего файла
  const missingUrl =
    'appimg://file/' +
    Buffer.from(path.join(tmp, 'nope.png'), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const missing = await net.fetch(missingUrl);
  check('protocol: missing → 404', () => (missing.status === 404 ? 'ok' : String(missing.status)));

  // 5. readFileData + checkFiles
  const rd = await fsService.readFileData(imgPath);
  check('readFileData', () => (rd.ok && rd.mime === 'image/png' ? 'ok' : JSON.stringify(rd).slice(0, 120)));
  const cf = await fsService.checkFiles([imgPath, path.join(tmp, 'nope.png')]);
  check('checkFiles', () => (cf[imgPath] === true && cf[path.join(tmp, 'nope.png')] === false ? 'ok' : JSON.stringify(cf)));

  await fsp.rm(tmp, { recursive: true, force: true });

  console.log('\n=== SHOTC SMOKE TEST ===');
  console.log(JSON.stringify(report, null, 2));
  console.log('=== END ===\n');
  app.exit(report.ok ? 0 : 1);
}

/* ---------------------------------------------------------------- */
/* Жизненный цикл                                                     */
/* ---------------------------------------------------------------- */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    mark('Electron готов');
    setupImageProtocol();

    if (process.env.SHOTC_SMOKE === '1') {
      runSmokeTest();
      return;
    }

    buildMenu();
    createWindow();

    if (process.env.SHOTC_E2E === '1') {
      // Временный хук для авто-проверки рендерера (см. scripts/e2e.mjs)
      mainWindow.webContents.on('console-message', (_e, _level, message) => {
        if (message.startsWith('[dbg]') || message.startsWith('[pv]')) {
          console.log('[renderer]', message);
        }
      });
      mainWindow.webContents.on('did-finish-load', async () => {
        await new Promise((r) => setTimeout(r, 1200));

        /* ---- Фаза 0: диагностика загрузки картинок ---- */
        const diag = await mainWindow.webContents.executeJavaScript(`(async () => {
          const api = window.electronAPI;
          const cat = api ? await api.demoCatalog() : null;
          if (!cat || !cat.assets.length) return { error: 'нет демо-каталога' };
          const p = cat.assets[0].sourceKey;
          const url = api.imageUrl(p);
          const out = { path: p, url };
          try {
            const r = await fetch(url);
            out.fetch = r.status + ' ' + (r.headers.get('content-type') || '?');
            const b = await r.blob();
            out.blobSize = b.size;
            try {
              const bm = await createImageBitmap(b);
              out.bitmap = bm.width + 'x' + bm.height;
              bm.close();
            } catch (e) { out.bitmapErr = String(e); }
          } catch (e) { out.fetchErr = String(e); }
          out.img = await new Promise((res) => {
            const im = new Image();
            const t = setTimeout(() => res('timeout'), 5000);
            im.onload = () => { clearTimeout(t); res('loaded ' + im.naturalWidth + 'x' + im.naturalHeight); };
            im.onerror = () => { clearTimeout(t); res('error'); };
            im.src = url;
          });
          return out;
        })()`);
        console.log('=== SHOTC IMAGE DIAG ===');
        console.log(JSON.stringify(diag, null, 2));

        /* ---- Фаза 2: демо-каталог → панель медиа → превью ---- */
        const HELPER = `
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const byText = (sel, text) =>
            Array.from(document.querySelectorAll(sel)).find((el) =>
              (el.textContent || '').trim().toLowerCase().includes(text.toLowerCase())
            ) || null;
          const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
          const alt = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, altKey: true, bubbles: true }));
        `;

        // 2a. Демо-набор и панель медиа
        const media = await mainWindow.webContents.executeJavaScript(`(async () => {
${HELPER}
          const mediaTab = document.querySelector('button[title="Images"]');
          if (mediaTab) mediaTab.click();
          await sleep(400);

          const demoBtn = byText('button', 'Демо');
          if (!demoBtn) return { error: 'кнопка Демо не найдена' };
          demoBtn.click();
          await sleep(1500);

          const folders = Array.from(document.querySelectorAll('label'))
            .map((l) => (l.textContent || '').trim())
            .filter((t) => t.length > 0)
            .slice(0, 8);

          // Выбор одной папки — индексы должны стать 1..6
          const autoBtn = Array.from(document.querySelectorAll('button')).find((b) => {
            const t = (b.textContent || '').trim();
            return t.startsWith('\u{1F4C1} Auto') || (t.startsWith('Auto') && t.length < 12);
          });
          if (autoBtn) autoBtn.click();
          await sleep(900);
          const folderCaption = Array.from(document.querySelectorAll('span'))
            .map((el) => (el.textContent || '').trim())
            .find((t) => t.includes('индекс'));
          const folderTiles = document.querySelectorAll('[data-media-tile]').length;
          const folderBadges = Array.from(document.querySelectorAll('[data-media-tile]'))
            .map((t) => t.getAttribute('data-media-tile'))
            .slice(0, 3);
          const allBtn = Array.from(document.querySelectorAll('button')).find((b) =>
            (b.textContent || '').trim().includes('Все папки')
          );
          if (allBtn) allBtn.click();
          await sleep(600);

          return {
            folderCaption,
            folderTiles,
            folderBadges,
            tiles: document.querySelectorAll('[data-media-tile]').length,
            tileImgs: document.querySelectorAll('[data-media-tile] img').length,
            badges: Array.from(document.querySelectorAll('[data-media-tile]'))
              .map((t) => t.getAttribute('data-media-tile'))
              .slice(0, 3),
            folders,
            thumbsCached: (document.body.textContent || '').match(/в кэше (\\d+)/)?.[1] ?? null,
          };
        })()`);

        // 2b. Вход в превью с выделенного блока
        const opened = await mainWindow.webContents.executeJavaScript(`(async () => {
${HELPER}
          key('p');
          await sleep(1200);
          // Сначала назначим картинку блоку (Alt+→), иначе слой пустой
          alt('ArrowRight');
          await sleep(900);
          // Space включает автоплей — проверяем полосу прогресса
          key(' ');
          await sleep(900);
          const layer = document.querySelector('.pv-layer');
          const img = layer ? layer.querySelector('img') : null;
          // Быстрый выбор перехода: клавиши 1..5
          const transitions = [];
          for (const k of ['1', '2', '3', '4', '5']) {
            key(k);
            await sleep(450);
            const l = document.querySelector('.pv-layer');
            transitions.push(
              l ? l.className.replace('pv-layer ', '').split(' ').slice(0, 2).join(' ') : 'none'
            );
          }
          return {
            transitions,
            workspaceImgs: document.querySelectorAll('[data-block-card] img').length,
            workspaceImgSrc: document.querySelector('[data-block-card] img')?.getAttribute('src')?.slice(0, 30) ?? null,
            layerImgs: document.querySelectorAll('.pv-layer img').length,
            noImageText: !!Array.from(document.querySelectorAll('.pv-layer div')).find((d) =>
              (d.textContent || '').includes('Нет картинки')
            ),
            layerHtml: layer ? layer.innerHTML.slice(0, 220) : null,
            layers: document.querySelectorAll('.pv-layer').length,
            progress: document.querySelectorAll('.pv-progress-track').length,
            stageBg: layer ? getComputedStyle(layer.parentElement.parentElement).backgroundColor : null,
            imgLoaded: img ? img.naturalWidth + 'x' + img.naturalHeight : null,
            transitionClass: layer ? layer.className : null,
            counter: (document.body.textContent || '').match(/(\\d+) \\/ (\\d+)/)?.[0] ?? null,
          };
        })()`);

        // 2b-2. Cross dissolve в момент перехода — на скриншоте должно быть два слоя
        await mainWindow.webContents.executeJavaScript(`(async () => {
${HELPER}
          key('4');
          await sleep(600);
          key('ArrowRight');
          await sleep(260);
        })()`);
        if (process.env.SHOTC_SCREENSHOT_4) {
          const shot = await mainWindow.webContents.capturePage();
          await fsp.writeFile(process.env.SHOTC_SCREENSHOT_4, shot.toPNG());
          console.log('[e2e] screenshot 4 (cross dissolve) →', process.env.SHOTC_SCREENSHOT_4);
        }
        const dissolving = await mainWindow.webContents.executeJavaScript(`(async () => {
          const layers = Array.from(document.querySelectorAll('.pv-layer'));
          return {
            count: layers.length,
            classes: layers.map((l) => l.className.replace('pv-layer ', '')),
            opacities: layers.map((l) => getComputedStyle(l).opacity),
            zIndexes: layers.map((l) => getComputedStyle(l).zIndex),
          };
        })()`);
        console.log('=== SHOTC E2E CROSSFADE ===');
        console.log(JSON.stringify(dissolving, null, 2));

        // Скриншот превью
        if (process.env.SHOTC_SCREENSHOT_2) {
          const shot = await mainWindow.webContents.capturePage();
          await fsp.writeFile(process.env.SHOTC_SCREENSHOT_2, shot.toPNG());
          console.log('[e2e] screenshot 2 →', process.env.SHOTC_SCREENSHOT_2);
        }

        // 2c. Ещё раз Alt+→ и F (избранное) внутри превью
        const inside = await mainWindow.webContents.executeJavaScript(`(async () => {
${HELPER}
          const before = document.querySelector('.pv-layer img')?.getAttribute('src');
          alt('ArrowRight');
          await sleep(1600);
          const after = document.querySelector('.pv-layer img')?.getAttribute('src');
          const favBefore = !!document.querySelector('[title*="Убрать из избранного"]');
          key('f');
          await sleep(500);
          const favAfter = !!document.querySelector('[title*="Убрать из избранного"]');
          key('Escape');
          await sleep(400);
          return {
            imageChanged: before !== after,
            before: before ? before.slice(0, 24) : null,
            after: after ? after.slice(0, 24) : null,
            favToggled: favBefore !== favAfter,
            exited: !document.querySelector('.pv-layer'),
            statusBar: (document.querySelector('footer')?.textContent || '').trim(),
          };
        })()`);

        await new Promise((r) => setTimeout(r, 300));

        const os = require('node:os');
        const probeImg = path.join(
          os.tmpdir(),
          'shotc-e2e-' + Date.now().toString(36) + '.png'
        );
        await fsp.writeFile(
          probeImg,
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
            'base64'
          )
        );
        const probe = await mainWindow.webContents.executeJavaScript(`(async () => {\n          const PROBE_IMG = ${JSON.stringify(probeImg)};
          const q = (s) => document.querySelectorAll(s).length;
          const txt = (s) => document.querySelector(s)?.textContent?.trim() ?? null;
          const api = window.electronAPI;
          const imgOk = await new Promise((resolve) => {
            const img = new Image();
            const t0 = setTimeout(() => resolve('timeout'), 5000);
            img.onload = () => { clearTimeout(t0); resolve('loaded ' + img.naturalWidth + 'x' + img.naturalHeight); };
            img.onerror = () => { clearTimeout(t0); resolve('error'); };
            img.src = api ? api.imageUrl(PROBE_IMG) : '';
          });
          return {
            buttons: q('button'),
            inputs: q('input'),
            blockCards: q('[data-block-card]'),
            projectName: txt('input'),
            statusBar: txt('footer'),
            isElectron: !!api?.isElectron,
            checkFiles: api ? await api.checkFiles(['/etc/hostname', '/nope/nope']) : null,
            appInfo: api ? (await api.appInfo()).platform : null,
            imgProbe: imgOk,
          };
        })()`);
        await fsp.rm(probeImg, { force: true });

        // Скриншот окна для визуальной проверки: SHOTC_SCREENSHOT=/tmp/shot.png
        if (process.env.SHOTC_SCREENSHOT) {
          const shot = await mainWindow.webContents.capturePage();
          await fsp.writeFile(process.env.SHOTC_SCREENSHOT, shot.toPNG());
          console.log('[e2e] screenshot →', process.env.SHOTC_SCREENSHOT);
        }

        console.log('=== SHOTC E2E ===');
        console.log(JSON.stringify(probe, null, 2));
        // 2d. Панель «Preview» в редакторе
        const panel = await mainWindow.webContents.executeJavaScript(`(async () => {
${HELPER}
          key('Escape');
          await sleep(400);
          document.querySelector('button[title="Preview"]').click();
          await sleep(600);
          const text = document.querySelector('aside')?.textContent || '';
          return {
            transitionButtons: ['Fade', 'Slide', 'Cross', 'Zoom'].filter((t) => text.includes(t)),
            easing: ['ease', 'in-out', 'linear', 'soft'].filter((t) => text.includes(t)),
            frame: text.includes('кадр'),
            sequence: text.includes('по порядку'),
            dice: text.includes('кубик'),
            progress: text.includes('прогресс'),
          };
        })()`);

        if (process.env.SHOTC_SCREENSHOT_3) {
          const shot = await mainWindow.webContents.capturePage();
          await fsp.writeFile(process.env.SHOTC_SCREENSHOT_3, shot.toPNG());
          console.log('[e2e] screenshot 3 →', process.env.SHOTC_SCREENSHOT_3);
        }

        console.log('=== SHOTC E2E MEDIA ===');
        console.log(JSON.stringify(media, null, 2));
        console.log('=== SHOTC E2E PREVIEW OPEN ===');
        console.log(JSON.stringify(opened, null, 2));
        console.log('=== SHOTC E2E PREVIEW INSIDE ===');
        console.log(JSON.stringify(inside, null, 2));
        console.log('=== SHOTC E2E PREVIEW PANEL ===');
        console.log(JSON.stringify(panel, null, 2));
        console.log('=== END ===');
        app.exit(0);
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
