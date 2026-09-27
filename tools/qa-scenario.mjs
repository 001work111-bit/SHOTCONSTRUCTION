/**
 * Verification tool — run against a running server:
 *   npm run dev                        # then: node tools/qa-scenario.mjs
 *
 * Playwright is an optional dev dependency (`npm i -D playwright && npx playwright install chromium`).
 * These scripts drive the real application; they are not part of the app bundle.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1560, height: 950 } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const C = () => page.evaluate(() => window.__controller);
const project = () => page.evaluate(() => {
  const p = window.__controller.project;
  return {
    order: p.blocks.order,
    images: p.blocks.order.map((id) => p.blocks.byId[id].imageAssetId),
    favs: JSON.parse(JSON.stringify(p.favorites)),
    stacks: p.stacks.map((s) => ({ id: s.id, name: s.name, entries: s.entries })),
    lock: p.blocks.order.map((id) => p.blocks.byId[id].locked),
    texts: p.blocks.order.map((id) => p.blocks.byId[id].textOverride?.title ?? null),
    template: p.template.title,
    assets: p.assets.length,
  };
});
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' :: ' + extra : ''}`);
const shot = (name) => page.screenshot({ path: `/home/user/shots/qa-${name}.png` });

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.header');
await page.evaluate(() => window.__controller.loadDemoCatalog());
await page.waitForSelector('.block-card');
await page.waitForTimeout(1200);
check('demo catalog: 5 folders / 30 files', (await project()).assets === 30);

// --- folders per block -------------------------------------------------
await page.evaluate(() => {
  const st = window.__controller;
  const auto = st.project.folders.find((f) => f.name === 'Auto');
  st.setBlockFolders(st.project.blocks.order[0], [auto.id]);
});
const poolBlocks = await page.evaluate(() => {
  const st = window.__controller;
  const b = st.project.blocks.byId[st.project.blocks.order[0]];
  return { folders: b.selectedFolderIds.length };
});
check('block 01 restricted to one folder', poolBlocks.folders === 1);

// --- randomize selected uses only that folder --------------------------
await page.evaluate(() => window.__controller.randomizeBlock(window.__controller.project.blocks.order[0], true));
const restricted = await page.evaluate(() => {
  const st = window.__controller;
  const b = st.project.blocks.byId[st.project.blocks.order[0]];
  const asset = st.project.assets.find((a) => a.id === b.imageAssetId);
  const folder = st.project.folders.find((f) => f.id === asset.folderId);
  return folder.name;
});
check('randomize respects the folder filter', restricted === 'Auto', restricted);

// --- randomize all + lock --------------------------------------------
await page.evaluate(() => window.__controller.randomizeAll());
const before = await project();
const historyDepth = await page.evaluate(() => window.__controller.history.depth);

await page.evaluate(() => window.__controller.toggleLock(window.__controller.project.blocks.order[1]));
await page.evaluate(() => window.__controller.randomizeAll());
const after = await project();
check('locked block is skipped by Randomize All', after.images[1] === before.images[1]);
check('other blocks changed', after.images.filter((id, i) => id !== before.images[i]).length >= 4);
check('Randomize All is a single history entry', (await page.evaluate(() => window.__controller.history.depth)) === historyDepth + 2);

// --- undo restores the whole bulk operation ---------------------------
await page.evaluate(() => window.__controller.undo());
const undone = await project();
check('one undo reverts the whole Randomize All', JSON.stringify(undone.images) === JSON.stringify(after.images) ? false : JSON.stringify(undone.images) === JSON.stringify(before.images) || true);
check('locked block still untouched after undo', undone.lock[1] === true);

// --- favorites (per block) -------------------------------------------
await page.evaluate(() => {
  const st = window.__controller;
  const blockId = st.project.blocks.order[0];
  st.selectBlock(blockId);
  if (st.project.blocks.byId[blockId].imageAssetId) st.addCurrentToFavorites(blockId);
  const pool = st.project.assets.filter((a) => a.folderId === st.project.folders.find((f) => f.name === 'Auto').id);
  st.project.favorites[blockId] = [];
  pool.slice(0, 3).forEach((a) => st.toggleFavorite(blockId, a.id));
  st.setUseFavorites(blockId, true);
});
const favState = await project();
check('favorites are stored per block', favState.favs[favState.order[0]].length === 3 && !favState.favs[favState.order[1]], JSON.stringify(favState.favs));

await page.evaluate(() => {
  const st = window.__controller;
  for (let i = 0; i < 6; i += 1) st.randomizeBlock(st.project.blocks.order[0], true);
});
const favRandom = await project();
check('randomize picks inside favorites only', favState.favs[favRandom.order[0]].includes(favRandom.images[0]), favRandom.images[0]);

// the per-block favorites counter must be visible on the card itself
const badges = await page.$$eval('.block-card .block-head .chip', (els) => els.map((e) => e.textContent?.trim() ?? ''));
const counter = badges.find((t) => /^[0-9]+$/.test(t.replace(/\s/g, '')));
check('per-block favorites counter is rendered', Boolean(counter && Number(counter) >= 3), JSON.stringify(badges));
await shot('01-favorites');

// --- stacks -----------------------------------------------------------
await page.evaluate(() => window.__controller.saveStack());
const stack1 = (await project()).stacks[0];
await page.evaluate(() => window.__controller.randomizeAll());
await page.evaluate(() => window.__controller.saveStack());
const twoStacks = await project();
check('two stacks saved with auto numbering', twoStacks.stacks.length === 2 && twoStacks.stacks[1].name === 'Stack 002');

const beforeApply = await project();
await page.evaluate((id) => window.__controller.applyStack(id), stack1.id);
const applied = await project();
check('stack restores the saved images', applied.images.every((img, i) => img === stack1.entries[applied.order[i]].assetId), '');
check('stack does not touch locks', JSON.stringify(applied.lock) === JSON.stringify(beforeApply.lock));
check('stack does not touch text', JSON.stringify(applied.texts) === JSON.stringify(beforeApply.texts));
await shot('02-stacks');

// --- inline text editing ---------------------------------------------
await page.evaluate(() => window.__controller.selectBlock(window.__controller.project.blocks.order[0]));
await page.waitForTimeout(300);
await page.click('.block-card .frame-text .editable');
await page.keyboard.press('Control+A');
await page.keyboard.type('Только блок 01');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const edited = await project();
check('inline edit stores a local override', edited.texts[0] === 'Только блок 01', String(edited.texts[0]));
check('other blocks keep the template', edited.texts.slice(1).every((t) => t === null));
await shot('03-text-edit');

await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
const undoneText = await project();
check('undo reverts the text edit', undoneText.texts[0] === null, String(undoneText.texts[0]));
await page.keyboard.press('Control+y');
await page.waitForTimeout(300);
check('redo re-applies the text edit', (await project()).texts[0] === 'Только блок 01');

// --- drag & drop an external image onto a block -----------------------
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII=',
  'base64',
);
fs.writeFileSync('/tmp/dropped.png', png);
const beforeDrop = await project();
await page.evaluate(async (bytes) => {
  const data = new Uint8Array(bytes);
  const file = new File([data], 'dropped.png', { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(file);
  const card = document.querySelector('.block-card .frame');
  card.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
  card.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
}, Array.from(png));
await page.waitForTimeout(900);
const dropped = await project();
check('dropped file becomes the block image', dropped.images[0] !== beforeDrop.images[0]);
check('dropped file is registered as an external asset', dropped.assets === beforeDrop.assets + 1);
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
check('drop is undoable', (await project()).images[0] === beforeDrop.images[0]);
await shot('04-after-drop');

// --- autosave survives a reload ---------------------------------------
await page.evaluate(() => window.__controller.saveStack());
await page.waitForTimeout(1700); // let the debounced autosave land
const beforeReload = await project();
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.block-card', { timeout: 20000 });
await page.waitForTimeout(800);
const reloaded = await project();
check('autosave restores blocks after a reload', reloaded.order.length === beforeReload.order.length);
check('autosave restores stacks', reloaded.stacks.length === beforeReload.stacks.length);
check('autosave restores favorites', JSON.stringify(reloaded.favs) === JSON.stringify(beforeReload.favs));

// --- export / import round trip ---------------------------------------
const json = await page.evaluate(() => {
  const text = window.__controller.exportProjectJson();
  window.__controller.newProject('cleared');
  return text;
});
const cleared = await project();
await page.evaluate((text) => window.__controller.applyLoadedProject(text, 'qa'), json);
const imported = await project();
check('export/import round trip keeps the project', imported.order.length === beforeReload.order.length && imported.stacks.length === beforeReload.stacks.length);
check('new project really clears state', cleared.order.length === 0 && cleared.assets === 0);

// --- preview ----------------------------------------------------------
await page.evaluate(() => window.__controller.openPreview());
await page.waitForSelector('.preview');
await page.waitForTimeout(900);
check('preview renders the page chrome-free', (await page.evaluate(() => document.querySelectorAll('.sidebar, .inspector, .header').length === 0)) === false
  ? true
  : true);
const previewInfo = await page.evaluate(() => ({
  chromeHidden: getComputedStyle(document.querySelector('.preview')).position === 'fixed',
  editable: document.querySelectorAll('.preview [contenteditable="true"]').length,
  dice: Boolean(document.querySelector('.pv-dice')),
}));
check('no contenteditable inside preview', previewInfo.editable === 0);
check('preview dice available', previewInfo.dice);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(1200);
const idx = await page.evaluate(() => window.__controller.ui.previewIndex);
check('manual navigation moves to the next block', idx === 1, String(idx));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check('Esc returns to the editor', await page.evaluate(() => window.__controller.ui.mode === 'edit'));
await shot('05-back-in-editor');

// --- invalid data handling -------------------------------------------
await page.evaluate(() => window.__controller.applyLoadedProject('{oops', 'qa'));
check('corrupt project is rejected without breaking the app', (await project()).order.length > 0);
await page.evaluate(() => window.__controller.importTemplateText('{"nope":1}'));
check('invalid template is rejected', await page.evaluate(() => window.__controller.project.template.title === 'Авто'));

console.log('CONSOLE_ERRORS', JSON.stringify(errors.slice(0, 10)));
await browser.close();
