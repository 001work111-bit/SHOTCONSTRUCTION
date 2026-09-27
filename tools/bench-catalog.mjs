/**
 * Verification tool — run against a running server:
 *   npm run dev                        # then: node tools/bench-catalog.mjs
 *
 * Playwright is an optional dev dependency (`npm i -D playwright && npx playwright install chromium`).
 * These scripts drive the real application; they are not part of the app bundle.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.header');

const result = await page.evaluate(async () => {
  const st = window.__controller;
  const FOLDERS = 60;
  const PER_FOLDER = 333; // ≈ 20 000 files
  const folders = [];
  const refs = [];
  let total = 0;
  for (let f = 0; f < FOLDERS; f += 1) {
    const name = `Set${String(f + 1).padStart(2, '0')}`;
    const files = [];
    for (let i = 0; i < PER_FOLDER; i += 1) {
      const path = `${name}/shoot_${String(i).padStart(4, '0')}.jpg`;
      files.push({ name: `shoot_${i}.jpg`, path, format: 'jpg', mime: 'image/jpeg', bytes: 900000, refKey: `h:${path}`, supported: true });
      total += 1;
    }
    folders.push({ path: name, name, files });
  }
  const outcome = {
    rootName: 'BigCatalog',
    rootLabel: 'D:\\BigCatalog',
    folders,
    rootFiles: [],
    unsupported: 0,
    totalFiles: total,
    root: { id: 'root_big', name: 'BigCatalog', label: 'D:\\BigCatalog', token: 'big' },
    refs,
  };

  const t0 = performance.now();
  st.applyScanOutcome(outcome, 'Synthetic');
  const scanMs = performance.now() - t0;

  st.setBlockCount(40);
  const t1 = performance.now();
  st.randomizeAll();
  const randomizeMs = performance.now() - t1;

  const t2 = performance.now();
  st.undo();
  const undoMs = performance.now() - t2;

  const t3 = performance.now();
  const json = st.exportProjectJson();
  const exportMs = performance.now() - t3;

  const t4 = performance.now();
  let found = 0;
  for (let i = 0; i < 20; i += 1) found = st.project.assets.filter((a) => a.path.includes(`Set3${i % 10}/shoot_0${i}0`)).length;
  const searchMs = (performance.now() - t4) / 20;

  const t5 = performance.now();
  st.undo();
  st.redo();
  const historyMs = performance.now() - t5;

  return {
    files: total,
    folders: FOLDERS,
    assets: st.project.assets.length,
    blocks: st.project.blocks.order.length,
    scanMs: Math.round(scanMs),
    randomizeMs: Math.round(randomizeMs),
    undoMs: Math.round(undoMs),
    redoMs: Math.round(historyMs),
    exportMs: Math.round(exportMs),
    exportMB: (json.length / 1024 / 1024).toFixed(2),
    searchMs: Math.round(searchMs * 10) / 10,
    found,
    memory: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : null,
  };
});
console.log('PERF', JSON.stringify(result, null, 2));

// UI behaviour with the big catalog: virtualization + workspace render
const ui = await page.evaluate(async () => {
  const st = window.__controller;
  const t0 = performance.now();
  st.setSection('images');
  await new Promise((r) => setTimeout(r, 600));
  const panelMs = performance.now() - t0;
  const tiles = document.querySelectorAll('.asset-tile').length;
  const nodes = document.querySelectorAll('*').length;
  st.setSection('blocks');
  await new Promise((r) => setTimeout(r, 600));
  const cards = document.querySelectorAll('.block-card').length;
  return { panelMs: Math.round(panelMs), tiles, nodes, cards, total: document.querySelectorAll('*').length };
});
console.log('UI', JSON.stringify(ui, null, 2));
await page.screenshot({ path: '/home/user/shots/qa-big-catalog.png' });
await browser.close();
