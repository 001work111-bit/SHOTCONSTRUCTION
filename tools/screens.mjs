/**
 * Verification tool — captures the screenshots used to review the UI.
 *   npm run build && npm run preview      # then: node tools/screens.mjs   (default http://127.0.0.1:4173)
 *   npm run dev                           # then: node tools/screens.mjs http://127.0.0.1:5173
 *
 * Playwright is an optional dev dependency (`npm i -D playwright && npx playwright install chromium`).
 * Everything is driven through real user-level interactions — no internal API access.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const OUT = process.argv[3] ?? '/home/user/shots';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1560, height: 950 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 160)));

const clickText = (text) =>
  page.evaluate((t) => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim().includes(t));
    btn?.click();
    return Boolean(btn);
  }, text);

const section = (name) =>
  page.evaluate((n) => {
    const nav = Array.from(document.querySelectorAll('.sidebar-nav .nav-item')).find((b) => b.textContent?.includes(n));
    nav?.click();
    return Boolean(nav);
  }, name);

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.header');

// 1. catalog + blocks
await clickText('Try demo catalog');
await page.waitForSelector('.block-card');
await page.waitForTimeout(2500);
await shot('01-workspace-after-catalog');

// 2. randomize all
await clickText('Randomize all');
await page.waitForTimeout(3500);
await shot('02-randomize-all');

// 3. inspector of a selected block
await page.click('.block-card');
await page.waitForTimeout(800);
await shot('03-inspector-image');

// 4. image sources per block
await page.evaluate(() => Array.from(document.querySelectorAll('.inspector .tabs button')).find((b) => b.textContent === 'Sources')?.click());
await page.waitForTimeout(600);
await shot('04-inspector-sources');

// 5. images panel: click a folder, assign an image, star two of them
await section('Images');
await page.waitForTimeout(2500);
await page.evaluate(() => Array.from(document.querySelectorAll('.list-row')).find((r) => r.textContent?.includes('Auto') && !r.textContent?.includes('All'))?.click());
await page.waitForTimeout(1800);
await shot('05-images-panel');
const tiles = await page.$$('.asset-tile');
if (tiles[1]) await tiles[1].$eval('.tile-star', (el) => el.click());
await page.waitForTimeout(500);
if (tiles[2]) await tiles[2].$eval('.tile-star', (el) => el.click());
await page.waitForTimeout(900);
await shot('06-favorites-tiles');

// 6. favorites panel with the per-block counters
await section('Favorites');
await page.waitForTimeout(900);
await clickText('Add current');
await page.waitForTimeout(1200);
await shot('07-favorites-panel');

// 7. lock + random all again (locked block stays)
await section('Blocks');
await page.waitForTimeout(700);
await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.list-row'));
  rows[1]?.querySelector('.row-actions button')?.click();
});
await page.waitForTimeout(600);
await shot('08-locked-block');

// 8. stacks
await section('Stacks');
await page.waitForTimeout(700);
await clickText('Save current combination');
await page.waitForTimeout(900);
await clickText('Randomize all');
await page.waitForTimeout(2500);
await clickText('Save current combination');
await page.waitForTimeout(1200);
await shot('09-stacks');

// 9. inline text editing on a block
await section('Blocks');
await page.waitForTimeout(500);
await page.click('.block-card .frame-text .editable');
await page.keyboard.press('Control+A');
await page.keyboard.type('Только этот блок');
await page.keyboard.press('Enter');
await page.waitForTimeout(900);
await shot('10-inline-text-edit');

// 10. text panel + template JSON import
await section('Text');
await page.waitForTimeout(800);
await shot('11-text-template');

// 11. random / overlay / preview settings
await section('Random');
await page.waitForTimeout(700);
await shot('12-random-panel');
await section('Overlay');
await page.waitForTimeout(600);
await shot('13-overlay-panel');
await section('Preview');
await page.waitForTimeout(600);
await shot('14-preview-settings');

// 12. preview mode + a transition frame + navigation chrome
await clickText('Preview');
await page.waitForSelector('.preview');
await page.mouse.move(700, 420);
await page.waitForTimeout(2200);
await shot('15-preview');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(430);
await shot('16-preview-transition');
await page.waitForTimeout(1500);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await shot('17-back-in-editor');

console.log('SCREENSHOT_ERRORS', JSON.stringify(errors));
await browser.close();
