/**
 * Preload bridge. Exposes a narrow, typed surface to the renderer:
 * `window.__shotComposer` (see src/filesystem/electronBridge.d.ts).
 * No node integration in the renderer, everything goes through ipcRenderer.invoke.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const bridge = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
  hasNativeDecoders: false, // filled below from the main process
  fs: {
    pickDirectory: () => ipcRenderer.invoke('fs:pickDirectory'),
    scanDirectory: (path, options) => ipcRenderer.invoke('fs:scanDirectory', path, options),
    readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
    convertImage: (path) => ipcRenderer.invoke('fs:convertImage', path),
    exists: (path) => ipcRenderer.invoke('fs:exists', path),
    pathForFile: (file) => {
      try {
        if (webUtils && typeof webUtils.getPathForFile === 'function') return webUtils.getPathForFile(file);
      } catch {
        /* fall through to the legacy property */
      }
      return file && typeof file.path === 'string' && file.path ? file.path : null;
    },
    revealInFolder: (path) => ipcRenderer.invoke('fs:reveal', path),
  },
  dialogs: {
    saveJson: (defaultName, content) => ipcRenderer.invoke('dialog:saveJson', defaultName, content),
    openJson: () => ipcRenderer.invoke('dialog:openJson'),
  },
  window: {
    setTitle: (title) => ipcRenderer.invoke('window:setTitle', title),
    toggleFullScreen: () => ipcRenderer.invoke('window:toggleFullScreen'),
  },
};

ipcRenderer.invoke('app:meta').then((meta) => {
  bridge.hasNativeDecoders = Boolean(meta && meta.hasNativeDecoders);
});

contextBridge.exposeInMainWorld('__shotComposer', bridge);
