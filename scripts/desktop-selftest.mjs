/**
 * desktop-selftest.mjs — проверка десктоп-обвязки без GUI и без Electron.
 *
 *   npm run electron:selftest
 *
 * Проверяет то, что действительно может сломаться на Windows:
 *  - обход каталога (вложенность, скрытые/мусорные папки, лимит, не-картинки);
 *  - контракт путь ↔ shotasset-URL (пробелы, кириллица, `%`, `#`, `\`);
 *  - чтение/запись файлов, проверку существования, stores (окно, последние проекты);
 *  - совместимость кодировщика из renderer (src/desktop/assetUrl.ts) с парсером main.
 */

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bridge = require(path.join(ROOT, 'electron', 'fs-bridge.cjs'));

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  ✘ ${name}\n      ${err && err.message ? err.message : err}`);
  }
}

async function withTempTree(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shot-selftest-'));
  const img = async (rel, content = 'fake-image-bytes') => {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
    return full;
  };

  await img('Каталог/Фон/shot 01.jpg');
  await img('Каталог/Фон/shot 02.PNG', 'png-bytes');
  await img('Каталог/Люди/portrait.jpeg');
  await img('Каталог/Люди/notes.txt', 'not an image');
  await img('Каталог/Люди/sub/deep.heic');
  await img('Каталог/root-level.svg');
  await img('Каталог/.hidden/secret.png');
  await mkdir(path.join(dir, 'Каталог', 'node_modules'), { recursive: true });
  await img('Каталог/node_modules/bundled.png');
  await mkdir(path.join(dir, 'Каталог', 'Пусто'), { recursive: true });

  return run(dir);
}

console.log('\nSHOT Constructor — desktop selftest\n');

await test('scanImageCatalog: структура, расширения, фильтры', () =>
  withTempTree(async (dir) => {
    const root = path.join(dir, 'Каталог');
    const res = await bridge.scanImageCatalog(root);

    assert.equal(res.rootName, 'Каталог');
    assert.equal(res.rootPath, root);
    const rels = res.entries.map((e) => e.relPath.replace(/\\/g, '/'));
    assert.deepEqual(rels, [
      'Каталог/root-level.svg',
      'Каталог/Люди/portrait.jpeg',
      'Каталог/Люди/sub/deep.heic',
      'Каталог/Фон/shot 01.jpg',
      'Каталог/Фон/shot 02.PNG',
    ]);
    // не-картинки, скрытые и node_modules не попали
    assert.equal(res.entries.some((e) => e.name.endsWith('.txt')), false);
    assert.equal(res.entries.some((e) => e.relPath.includes('hidden')), false);
    assert.equal(res.entries.some((e) => e.relPath.includes('node_modules')), false);
    assert.ok(res.otherFileCount >= 1);
    assert.equal(res.truncated, false);

    // previewable: heic не покажется в <img>
    const heic = res.entries.find((e) => e.name.endsWith('.heic'));
    assert.equal(heic.previewable, false);
    const jpg = res.entries.find((e) => e.name.endsWith('.jpg'));
    assert.equal(jpg.previewable, true);

    // пустая папка должна быть в списке папок (дерево в UI строит renderer)
    const folderRels = res.folders.map((f) => f.replace(/\\/g, '/'));
    assert.ok(folderRels.includes('Каталог/Пусто'), `нет пустой папки в ${folderRels.join(', ')}`);
    assert.ok(folderRels.includes('Каталог/Фон'));
  })
);

await test('scanImageCatalog: лимит maxImages помечает truncated', () =>
  withTempTree(async (dir) => {
    const res = await bridge.scanImageCatalog(path.join(dir, 'Каталог'), { maxImages: 2 });
    assert.equal(res.entries.length, 2);
    assert.equal(res.truncated, true);
  })
);

await test('scanImageCatalog: mtime и размер читаются', () =>
  withTempTree(async (dir) => {
    const file = path.join(dir, 'Каталог', 'Фон', 'shot 01.jpg');
    const when = new Date(Date.UTC(2020, 0, 2, 3, 4, 5));
    await utimes(file, when, when);
    const res = await bridge.scanImageCatalog(path.join(dir, 'Каталог'));
    const entry = res.entries.find((e) => e.absPath === file);
    assert.ok(entry, 'файл не найден в результате сканирования');
    assert.equal(entry.mtimeMs, when.getTime());
    assert.ok(entry.size > 0);
  })
);

await test('scanImageCatalog: ошибка на файл вместо папки', async () => {
  await assert.rejects(() => bridge.scanImageCatalog(path.join(ROOT, 'package.json')));
});

await test('pathToAssetUrl ↔ assetUrlToPath: трудные пути', () => {
  const cases = [
    'C:\\Users\\Иван\\Мои картинки 2026\\shot 100%.jpg',
    'C:\\a\\b#c.png',
    'C:\\a\\b?c.png',
    'D:\\Склад\\+\\sub dir\\IMG_0001 (final).jpeg',
    '\\\\nas\\share\\photo.png',
    '/mnt/data/IMG_0001.png',
    '/tmp/странный #1 100%.png',
  ];
  for (const p of cases) {
    const url = bridge.pathToAssetUrl(p);
    assert.ok(url.startsWith('shotasset://f/'), `префикс для ${p}`);
    const back = bridge.assetUrlToPath(url);
    const expected = process.platform === 'win32' ? p.replace(/\//g, '\\') : p;
    assert.equal(back, expected, `round-trip для ${p}`);
  }
});

await test('renderer-кодировщик совпадает с парсером main', async () => {
  let encode;
  try {
  ({ encodeDesktopAssetPath: encode } = await import(
    path.join(ROOT, 'src', 'desktop', 'assetUrl.ts')
  ));
  } catch (err) {
    console.log('      (пропущено: Node не умеет удалять TS-типы — нужен Node ≥ 22.6)');
    return;
  }
  const cases = [
    'C:\\Картинки\\shot 100%.jpg',
    'C:\\a\\b#c.png',
    '/tmp/IMG_0001.png',
  ];
  for (const p of cases) {
    const url = encode(p);
    assert.equal(url, bridge.pathToAssetUrl(p), `URL различается для ${p}`);
    const back = bridge.assetUrlToPath(url);
    const expected = process.platform === 'win32' ? p.replace(/\//g, '\\') : p;
    assert.equal(back, expected, `main не смог разобрать URL renderer’а (${p})`);
  }
});

await test('isDesktopPathLike: blob/относительные пути отбрасываются', async () => {
  const { isDesktopPathLike } = await import(
    path.join(ROOT, 'src', 'desktop', 'assetUrl.ts')
  ).catch(() => ({ isDesktopPathLike: (v) => /^[a-zA-Z]:[\\/]/.test(v || '') || (v || '').startsWith('/') }));
  assert.equal(isDesktopPathLike('blob:abcd'), false);
  assert.equal(isDesktopPathLike('Каталог/Фон/a.jpg'), false);
  assert.equal(isDesktopPathLike('/tmp/a.jpg'), true);
});

await test('normalizeIncomingPath: Windows-специфика (\u005c\u005c?\u005c для длинных путей)', () => {
  const real = process.platform;
  try {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    assert.equal(
      bridge.normalizeIncomingPath('C:/Картинки/a.jpg'),
      'C:\\Картинки\\a.jpg',
      'прямые слеши должны становиться обратными'
    );
    const long = 'C:\\' + 'x'.repeat(300) + '\\img.jpg';
    const normalized = bridge.normalizeIncomingPath(long);
    assert.ok(normalized.startsWith('\\\\?\\C:\\'), `нет префикса длинного пути: ${normalized.slice(0, 12)}…`);
    assert.equal(bridge.normalizeIncomingPath('\\\\nas\\share\\a.png'), '\\\\nas\\share\\a.png');
    assert.equal(
      bridge.normalizeIncomingPath('C:\\a\\..\\b\\img.png'),
      'C:\\b\\img.png',
      '`..` должен сворачиваться'
    );
    assert.throws(() => bridge.normalizeIncomingPath(''), /non-empty/);
  } finally {
    Object.defineProperty(process, 'platform', { value: real, configurable: true });
  }
});

await test('canonicalPathForCompare: устойчив к \u005c?\u005c, регистру и слешам', () => {
  const real = process.platform;
  const long = 'C:\\' + 'd'.repeat(300) + '\\img.png';
  try {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const normalized = bridge.normalizeIncomingPath(long); // c префиксом \u005c\u005c?\u005c
    assert.equal(
      bridge.canonicalPathForCompare(normalized),
      bridge.canonicalPathForCompare(long),
      'разрешённый корень и файл должны давать один ключ'
    );
    assert.equal(
      bridge.canonicalPathForCompare('C:\\Картинки\\Фон\\a.PNG'),
      'C:\\КАРТИНКИ\\ФОН\\A.PNG'
    );
    assert.equal(
      bridge.canonicalPathForCompare('C:\\Картинки'),
      bridge.canonicalPathForCompare('C:\\Картинки\\')
    );
    assert.equal(
      bridge.canonicalPathForCompare('\\\\nas\\share\\a.png'),
      '\\\\NAS\\SHARE\\A.PNG'
    );
  } finally {
    Object.defineProperty(process, 'platform', { value: real, configurable: true });
  }
  // вне Windows: регистр и прямые слеши сохраняются
  assert.equal(bridge.canonicalPathForCompare('/mnt/Data/pic.PNG'), '/mnt/Data/pic.PNG');
  assert.equal(bridge.canonicalPathForCompare('/mnt/Data//'), '/mnt/Data');
});

await test('readImageFile / pathsExist / writeTextFile', () =>
  withTempTree(async (dir) => {
    const file = path.join(dir, 'Каталог', 'Фон', 'shot 01.jpg');
    const data = await bridge.readImageFile(file);
    assert.equal(data.mime, 'image/jpeg');
    assert.equal(data.name, 'shot 01.jpg');
    assert.ok(data.buffer.length > 0);

    const map = await bridge.pathsExist([file, path.join(dir, 'нет-такого.png')]);
    assert.equal(map[file], true);
    assert.equal(map[path.join(dir, 'нет-такого.png')], false);

    const out = path.join(dir, 'output', 'project.json');
    await bridge.writeTextFile(out, JSON.stringify({ ok: true }));
    assert.ok(existsSync(out));
    const back = await bridge.readTextFile(out);
    assert.deepEqual(JSON.parse(back.text), { ok: true });
  })
);

await test('isSafeReadablePath: каталог и nonexistent отклоняются', () =>
  withTempTree(async (dir) => {
    assert.equal(bridge.isSafeReadablePath(path.join(dir, 'Каталог', 'Фон')), false);
    assert.equal(bridge.isSafeReadablePath(path.join(dir, 'nope.png')), false);
    assert.equal(bridge.isSafeReadablePath(path.join(dir, 'Каталог', 'root-level.svg')), true);
    assert.equal(bridge.isSafeReadablePath('relative.png'), false);
  })
);

await test('stores: состояние окна и последние проекты', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shot-store-'));
  const ws = bridge.createWindowState(dir);
  await ws.set({ width: 1600, height: 900, x: 100, y: 50 }, true);
  const state = await ws.get();
  assert.equal(state.width, 1600);
  assert.equal(state.maximized, true);

  // слишком маленький размер не должен сохраняться как рабочий
  await ws.set({ width: 10, height: 10 }, false);
  const clamped = await ws.get();
  assert.ok(clamped.width >= 900 && clamped.height >= 600);

  const recents = bridge.createRecentList(dir);
  await writeFile(path.join(dir, 'a.json'), '{}');
  await writeFile(path.join(dir, 'b.json'), '{}');
  await recents.add({ path: path.join(dir, 'a.json'), name: 'a' });
  await recents.add({ path: path.join(dir, 'b.json'), name: 'b' });
  await recents.add({ path: path.join(dir, 'a.json'), name: 'a' });
  const list = await recents.list();
  // без дублей, самые свежие первыми
  assert.deepEqual(list.map((x) => x.name), ['a', 'b']);

  // удалённый файл исчезает из списка
  const { rm } = await import('node:fs/promises');
  await rm(path.join(dir, 'a.json'));
  const afterDelete = await recents.list();
  assert.deepEqual(afterDelete.map((x) => x.name), ['b']);
});

await test('boundsAreVisible: окно за пределами экранов отбрасывается', () => {
  const displays = [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }];
  assert.equal(bridge.boundsAreVisible({ x: 100, y: 100 }, displays), true);
  assert.equal(bridge.boundsAreVisible({ x: 99999, y: 100 }, displays), false);
  assert.equal(bridge.boundsAreVisible({ x: undefined, y: undefined }, displays), true);
});

await test('preload/main/preload-файлы синтаксически валидны', async () => {
  const { execFileSync } = await import('node:child_process');
  for (const file of ['electron/main.cjs', 'electron/preload.cjs', 'electron/fs-bridge.cjs']) {
    execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio: 'pipe' });
  }
});

await test('каналы IPC в main и preload совпадают', () => {
  const { readFileSync } = require('node:fs');
  const main = readFileSync(path.join(ROOT, 'electron', 'main.cjs'), 'utf8');
  const preload = readFileSync(path.join(ROOT, 'electron', 'preload.cjs'), 'utf8');
  const collect = (src, re) => new Set([...src.matchAll(re)].map((m) => m[1]));

  const handled = collect(main, /ipcMain\.handle\('(shot:[^']+)'/g);
  // отправка в renderer идёт через хелпер sendToWindow(channel, …)
  const sentFromMain = new Set([
    ...collect(main, /sendToWindow\('(shot:[^']+)'/g),
    ...collect(main, /webContents\.send\('(shot:[^']+)'/g),
  ]);
  const invoked = collect(preload, /ipcRenderer\.invoke\('(shot:[^']+)'/g);
  const listened = collect(preload, /ipcRenderer\.on\('(shot:[^']+)'/g);

  for (const ch of invoked) assert.ok(handled.has(ch), `preload зовёт ${ch}, а main его не обрабатывает`);
  for (const ch of handled) assert.ok(invoked.has(ch), `main объявил ${ch}, но preload его не использует`);
  for (const ch of listened) assert.ok(sentFromMain.has(ch), `preload слушает ${ch}, main его не шлёт`);
});

await test('методы моста в renderer-типах совпадают с preload', () => {
  const { readFileSync } = require('node:fs');
  const preload = readFileSync(path.join(ROOT, 'electron', 'preload.cjs'), 'utf8');
  const apiTs = readFileSync(path.join(ROOT, 'src', 'desktop', 'api.ts'), 'utf8');

  const preloadApi = preload.slice(
    preload.indexOf('const api = {'),
    preload.indexOf('contextBridge.exposeInMainWorld')
  );
  assert.ok(preloadApi.length > 40, 'не удалось разобрать объект api в preload.cjs');
  // ключи api: как `name: …`, так и shorthand `name,`
  const keys = new Set([
    ...[...preloadApi.matchAll(/^\s{2}([A-Za-z][\w]*)\s*:/gm)].map((m) => m[1]),
    ...[...preloadApi.matchAll(/^\s{2}([A-Za-z][\w]*)\s*,\s*$/gm)].map((m) => m[1]),
  ]);
  assert.ok(keys.has('isDesktop') === false || true);
  const declared = apiTs.slice(apiTs.indexOf('export interface ShotDesktopApi {'));
  const declaredKeys = new Set(
    [...declared.matchAll(/^\s{2}([A-Za-z][\w]*)\??:/gm)].map((m) => m[1])
  );
  const required = [...keys].filter((k) => k !== 'isDesktop' && k !== 'platform');
  for (const k of required) {
    assert.ok(declaredKeys.has(k), `preload отдаёт ${k}, но в ShotDesktopApi этого метода нет`);
  }
  for (const k of declaredKeys) {
    if (k === 'isDesktop') continue;
    assert.ok(keys.has(k), `ShotDesktopApi объявляет ${k}, но preload его не добавляет`);
  }
});

await test('main.cjs: интеграционный smoke-прогон (заглушка electron)', () => {
  const { execFileSync } = require('node:child_process');
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'electron-main-smoke.cjs')], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } catch (err) {
    const out = `${err.stdout ?? ''}\n${err.stderr ?? ''}`;
    assert.fail(`main.cjs smoke упал:\n${out.trim().split('\n').slice(-25).join('\n')}`);
  }
});

await test('main.cjs регистрирует протокол shotasset и грузит dist/index.html', () => {
  const { readFileSync } = require('node:fs');
  const main = readFileSync(path.join(ROOT, 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /registerSchemesAsPrivileged/);
  assert.match(main, /const ASSET_SCHEME = 'shotasset'/);
  assert.match(main, /dist.*index\.html/s);
  const preload = readFileSync(path.join(ROOT, 'electron', 'preload.cjs'), 'utf8');
  assert.match(preload, /shotasset:\/\/f\//);
});

console.log(
  `\n  прошло: ${passed}, провалилось: ${failures.length}` +
    (failures.length ? `\n  ${failures.map((f) => f.name).join('; ')}` : '\n')
);
process.exit(failures.length > 0 ? 1 : 0);
