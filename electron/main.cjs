/**
 * Shot Composer — Electron main process.
 *
 * Same renderer code as the browser build; this file only provides the native half of the
 * FileSystemAdapter (real absolute paths, native dialogs, recursive scanning, optional
 * native TIFF/HEIC codecs through `sharp`).
 *
 * Run:
 *   npm i -D electron            # optional dev dependency
 *   npm run build                # produces ./dist
 *   npx electron electron/main.cjs
 *   SHOT_COMPOSER_DEV=1 npx electron electron/main.cjs   # loads the Vite dev server
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

let sharp = null;
try {
  sharp = require('sharp'); // optional: enables TIFF / HEIC / HEIF decoding
} catch {
  sharp = null;
}

const IMAGE_EXT = new Set([
  'jpg', 'jpeg', 'jpe', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp', 'tif', 'tiff', 'heic', 'heif',
]);

const extOf = (name) => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
};

async function scanDirectoryRecursive(rootPath, options = {}) {
  const maxFiles = options.maxFiles ?? 250000;
  const maxDepth = options.maxDepth ?? 12;

  const folders = [];
  const rootFiles = [];
  let fileCount = 0;
  let truncated = false;

  async function walk(dirPath, relative, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    const localFiles = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dirPath, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, rel, depth + 1);
        continue;
      }
      if (!IMAGE_EXT.has(extOf(entry.name))) continue;
      if (fileCount >= maxFiles) {
        truncated = true;
        continue;
      }
      let stat = null;
      try {
        stat = await fs.stat(abs);
      } catch {
        continue;
      }
      fileCount += 1;
      localFiles.push({ name: entry.name, path: abs, relativePath: rel, bytes: stat.size, mtimeMs: stat.mtimeMs });
    }
    if (localFiles.length) {
      if (!relative) rootFiles.push(...localFiles);
      else folders.push({ path: relative, name: path.basename(relative), files: localFiles });
    }
  }

  await walk(rootPath, '', 0);
  return {
    rootPath,
    rootName: path.basename(rootPath) || rootPath,
    folders,
    rootFiles,
    truncated,
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0b0c0e',
    title: 'Shot Composer',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.SHOT_COMPOSER_DEV) {
    win.loadURL(process.env.SHOT_COMPOSER_DEV_URL || 'http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

app.whenReady().then(() => {
  ipcMain.handle('app:meta', () => ({
    platform: process.platform,
    versions: { electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome },
    hasNativeDecoders: Boolean(sharp),
  }));

  ipcMain.handle('fs:pickDirectory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select image folder' });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('fs:scanDirectory', async (_event, dirPath, options) => scanDirectoryRecursive(dirPath, options));

  ipcMain.handle('fs:readFile', async (_event, filePath) => {
    const buffer = await fs.readFile(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });

  ipcMain.handle('fs:convertImage', async (_event, filePath) => {
    if (!sharp) return null;
    const out = await sharp(filePath).png().toBuffer();
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  });

  ipcMain.handle('fs:exists', async (_event, target) => {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:reveal', async (_event, target) => {
    shell.showItemInFolder(target);
  });

  ipcMain.handle('dialog:saveJson', async (_event, defaultName, content) => {
    const result = await dialog.showSaveDialog({
      title: 'Save project',
      defaultPath: defaultName,
      filters: [{ name: 'Shot Composer project', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, content, 'utf8');
    return result.filePath;
  });

  ipcMain.handle('dialog:openJson', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open project',
      properties: ['openFile'],
      filters: [{ name: 'Shot Composer project', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf8');
    return { path: filePath, content };
  });

  ipcMain.handle('window:setTitle', (event, title) => {
    BrowserWindow.fromWebContents(event.sender)?.setTitle(title);
  });

  ipcMain.handle('window:toggleFullScreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setFullScreen(!win.isFullScreen());
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
