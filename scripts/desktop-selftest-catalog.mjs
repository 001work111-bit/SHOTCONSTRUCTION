/**
 * desktop-selftest-catalog.mjs — проверка отображения desktop-каталога в модель проекта.
 *
 *   node scripts/desktop-selftest-catalog.mjs
 *
 * src/filesystem/FileSystemAdapter.ts компилируется esbuild'ом в Node-совместимый
 * модуль, после чего проверяется соответствие contractа: плоский список от main →
 * дерево папок/ассетов, которое ожидает UI (та же логика, что и в браузерном
 * scanDirectoryHandle, включая «продвижение» подпапок при пустом корне).
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = await mkdtemp(path.join(process.env.TMPDIR || '/tmp', 'shot-catalog-test-'));
const entryFile = path.join(tmp, 'entry.mjs');

await writeFile(
  entryFile,
  [
    `export { desktopResultToCatalog, isDesktopFileRef } from ${JSON.stringify(
      path.join(ROOT, 'src', 'filesystem', 'FileSystemAdapter.ts')
    )};`,
    `export { isDesktopPathLike, encodeDesktopAssetPath } from ${JSON.stringify(
      path.join(ROOT, 'src', 'desktop', 'assetUrl.ts')
    )};`,
  ].join('\n'),
  'utf8'
);

const outfile = path.join(tmp, 'bundle.mjs');
await esbuild.build({
  entryPoints: [entryFile],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
  // DOM-типы только в декларациях, рантайм их не трогает
  external: [],
});

const {
  desktopResultToCatalog,
  isDesktopFileRef,
  encodeDesktopAssetPath,
  isDesktopPathLike,
} = await import(pathToFileURL(outfile).href);

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✘ ${name}\n      ${err.message}`);
  }
}

const SCAN = {
  canceled: false,
  rootPath: 'D:\\Проекты\\Каталог кадров',
  rootName: 'Каталог кадров',
  folders: [
    'Каталог кадров',
    'Каталог кадров/Фон',
    'Каталог кадров/Фон/Текстуры',
    'Каталог кадров/Пусто',
  ],
  entries: [
    {
      relPath: 'Каталог кадров/Фон/Текстуры/tex.png',
      absPath: 'D:\\Проекты\\Каталог кадров\\Фон\\Текстуры\\tex.png',
      name: 'tex.png',
      size: 100,
      mtimeMs: 1,
      previewable: true,
    },
    {
      relPath: 'Каталог кадров/Фон/bg.jpg',
      absPath: 'D:\\Проекты\\Каталог кадров\\Фон\\bg.jpg',
      name: 'bg.jpg',
      size: 200,
      mtimeMs: 2,
      previewable: true,
    },
    {
      relPath: 'Каталог кадров/raw.heic',
      absPath: 'D:\\Проекты\\Каталог кадров\\raw.heic',
      name: 'raw.heic',
      size: 300,
      mtimeMs: 3,
      previewable: false,
    },
  ],
  imageCount: 3,
  otherFileCount: 5,
  truncated: false,
  skippedDirs: [],
};

test('плоский скан → дерево папок с корректными parentId/relativePath', () => {
  const catalog = desktopResultToCatalog(SCAN);
  assert.equal(catalog.rootName, 'Каталог кадров');
  assert.equal(catalog.rootPath, 'D:\\Проекты\\Каталог кадров');
  assert.equal(catalog.assets.length, 3);

  const byPath = new Map(catalog.folders.map((f) => [f.relativePath, f]));
  assert.ok(byPath.has('Каталог кадров'), 'нет корневой папки');
  assert.ok(byPath.has('Каталог кадров/Пусто'), 'пропала пустая папка');

  const textures = byPath.get('Каталог кадров/Фон/Текстуры');
  const bg = byPath.get('Каталог кадров/Фон');
  assert.equal(byPath.get('Каталог кадров').parentId, null);
  assert.equal(bg.parentId, byPath.get('Каталог кадров').id);
  assert.equal(textures.parentId, bg.id);
  assert.equal(bg.assetIds.length, 1);
});

test('ассеты: sourceKey = абсолютный путь, unsupported по previewable', () => {
  const catalog = desktopResultToCatalog(SCAN);
  const tex = catalog.assets.find((a) => a.filename === 'tex.png');
  const heic = catalog.assets.find((a) => a.filename === 'raw.heic');
  assert.equal(tex.sourceKey, 'D:\\Проекты\\Каталог кадров\\Фон\\Текстуры\\tex.png');
  assert.equal(tex.format, 'png');
  assert.equal(tex.fileSize, 100);
  assert.equal(tex.missing, false);
  assert.equal(tex.unsupported, false);
  assert.equal(heic.unsupported, true, 'heic должен помечаться как неподдерживаемый');
  assert.equal(heic.format, 'heic');
  assert.equal(isDesktopPathLike(tex.sourceKey), true);
});

test('handles содержат desktop-ссылки, опознаваемые isDesktopFileRef', () => {
  const catalog = desktopResultToCatalog(SCAN);
  const tex = catalog.assets[1];
  const ref = catalog.handles.get(tex.sourceKey);
  assert.equal(isDesktopFileRef(ref), true);
  assert.equal(ref.path, tex.sourceKey);
  assert.equal(ref.size, 200);
});

test('пустой корень продвигается: подпапки становятся корнями (как в браузере)', () => {
  const rootWithoutImages = {
    ...SCAN,
    entries: SCAN.entries.filter((e) => e.relPath.includes('/Фон/')),
    folders: ['Каталог кадров/Фон', 'Каталог кадров/Фон/Текстуры'],
  };
  const catalog = desktopResultToCatalog(rootWithoutImages);
  assert.equal(
    catalog.folders.some((f) => f.relativePath === 'Каталог кадров'),
    false,
    'пустой корень должен быть удалён'
  );
  const bg = catalog.folders.find((f) => f.relativePath === 'Каталог кадров/Фон');
  assert.equal(bg.parentId, null);
});

test('URL для ассета совпадает с encodeDesktopAssetPath (тот же контракт, что у main)', () => {
  const catalog = desktopResultToCatalog(SCAN);
  const tex = catalog.assets.find((a) => a.filename === 'tex.png');
  const url = encodeDesktopAssetPath(tex.sourceKey);
  assert.ok(url.startsWith('shotasset://f/'), url);
  assert.ok(!url.includes('\\'), 'обратный слеш обязан быть закодирован');
  assert.ok(!/[^\x00-\x7F]/.test(url), 'в URL не должно остаться не-ASCII символов');
  assert.ok(url.includes('%D0%9A'), 'кириллица должна быть percent-encoded');
  // main разберёт этот URL обратно в путь (проверяется в desktop-selftest)
});

await rm(tmp, { recursive: true, force: true });
console.log(
  `\n  прошло: ${passed}, провалилось: ${failures.length}` +
    (failures.length ? `\n  ${failures.join('; ')}\n` : '\n')
);
process.exit(failures.length > 0 ? 1 : 0);
