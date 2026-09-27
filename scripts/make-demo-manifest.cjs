'use strict';

/**
 * make-demo-manifest.cjs — собирает список встроенных демо-картинок
 * в public/demo/manifest.json.
 *
 * Зачем: рендерер не должен «знать» файлы на этапе сборки — иначе сборщик
 * вшьёт их в бандл base64-ом. С манифестом картинки остаются отдельными
 * файлами в dist/demo, а бандл не растёт.
 *
 * Запускается автоматически перед сборкой (см. package.json → build).
 */

const fs = require('node:fs');
const path = require('node:path');

const DEMO_DIR = path.join(__dirname, '..', 'public', 'demo');
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

function main() {
  if (!fs.existsSync(DEMO_DIR)) {
    console.log('[demo] public/demo не найдено — манифест не создан');
    return;
  }

  const folders = fs
    .readdirSync(DEMO_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const manifest = { rootName: 'Демо', folders: [] };

  for (const folder of folders) {
    const files = fs
      .readdirSync(path.join(DEMO_DIR, folder))
      .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
      .sort();
    if (files.length > 0) manifest.folders.push({ name: folder, files });
  }

  const out = path.join(DEMO_DIR, 'manifest.json');
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2), 'utf8');

  const total = manifest.folders.reduce((n, f) => n + f.files.length, 0);
  console.log(`[demo] манифест: ${manifest.folders.length} папок, ${total} картинок`);
}

main();
