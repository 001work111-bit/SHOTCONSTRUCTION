import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createEmptyProject,
  createId,
  type AssetMeta,
  type ID,
  type ProjectState,
  type TextContent,
} from '../core/types';
import { HistoryManager } from '../core/history/HistoryManager';
import { cloneProject } from '../core/project/clone';
import * as actions from '../core/project/actions';
import type { ActionResult, ToastLevel } from '../core/project/actions';
import {
  serializeProject,
  deserializeProject,
  downloadJson,
  pickAndReadJsonFile,
} from '../core/project/serializer';
import { createFileSystemAdapter } from '../filesystem/FileSystemAdapter';
import type { AssetSource, ScannedCatalog } from '../filesystem/FileSystemAdapter';
import { getDesktop, desktopAssetUrl } from '../desktop/api';
import { isDesktopPathLike } from '../desktop/assetUrl';
import { assetUrlCache } from '../core/assets/AssetUrlCache';
import { autosaveProject, loadAutosavedProject } from '../persistence/localAutosave';

function baseName(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}

function dirnameOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i > 0 ? p.slice(0, i) : p;
}

export interface Toast {
  id: string;
  level: ToastLevel;
  text: string;
}

interface ProjectStoreValue {
  state: ProjectState;
  toasts: Toast[];
  canUndo: boolean;
  canRedo: boolean;
  handles: Map<string, AssetSource>;
  urlMap: Record<string, string>; // assetId → object URL
  /** true, если приложение запущено в Electron (нативные диалоги, чтение с диска) */
  isDesktop: boolean;
  /** Путь сохранённого проекта (.json) в desktop-режиме, null — ещё не сохраняли */
  projectPath: string | null;
  /** Корень каталога картинок на диске (desktop) */
  catalogRootPath: string | null;
  sidebarCollapsed: boolean;
  activePanel: PanelId;
  dismissToast: (id: string) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setActivePanel: (p: PanelId) => void;
  undo: () => void;
  redo: () => void;
  dispatch: (fn: (s: ProjectState) => ActionResult) => void;
  // convenience
  loadFolder: () => Promise<void>;
  /** Пересканировать ту же папку (desktop) либо открыть диалог выбора */
  rescanFolder: () => Promise<void>;
  saveProjectFile: () => void;
  saveProjectFileAs: () => void;
  loadProjectFile: (preferredPath?: string) => Promise<void>;
  newProject: () => void;
  resolveAssetUrl: (assetId: ID | null) => string | null;
  ensureAssetUrl: (assetId: ID) => Promise<string | null>;
  dropFileOnBlock: (blockId: ID, file: File) => void;
  importTemplateFile: () => Promise<void>;
}

export type PanelId =
  | 'project'
  | 'blocks'
  | 'images'
  | 'text'
  | 'overlay'
  | 'random'
  | 'favorites'
  | 'stacks'
  | 'preview'
  | 'settings';

const ProjectStoreContext = createContext<ProjectStoreValue | null>(null);

export function useProjectStore(): ProjectStoreValue {
  const ctx = useContext(ProjectStoreContext);
  if (!ctx) throw new Error('useProjectStore must be used within ProjectStoreProvider');
  return ctx;
}

export function ProjectStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProjectState>(() => createEmptyProject());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelId>('project');
  const [urlMap, setUrlMap] = useState<Record<string, string>>({});
  const handlesRef = useRef<Map<string, AssetSource>>(new Map());
  const historyRef = useRef(new HistoryManager<ProjectState>(cloneProject));
  const [historyTick, setHistoryTick] = useState(0);
  const fsRef = useRef(createFileSystemAdapter());
  const desktop = useRef(getDesktop()).current;
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const projectPathRef = useRef<string | null>(null);
  const [catalogRootPath, setCatalogRootPath] = useState<string | null>(
    () => fsRef.current.getCatalogRootPath?.() ?? null
  );
  const autosaveTimer = useRef<number | null>(null);
  const hydrated = useRef(false);

  const pushToast = useCallback((level: ToastLevel, text: string) => {
    const id = createId('toast');
    setToasts((t) => [...t, { id, level, text }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const dispatch = useCallback(
    (fn: (s: ProjectState) => ActionResult) => {
      setState((prev) => {
        const result = fn(prev);
        if (result.recordHistory) {
          historyRef.current.push(prev);
          setHistoryTick((x) => x + 1);
        }
        if (result.message) {
          // defer toast outside setState
          queueMicrotask(() => pushToast(result.message!.level, result.message!.text));
        }
        return result.state;
      });
    },
    [pushToast]
  );

  const undo = useCallback(() => {
    setState((prev) => {
      const next = historyRef.current.undo(prev);
      setHistoryTick((x) => x + 1);
      if (!next) {
        queueMicrotask(() => pushToast('info', 'Nothing to undo'));
        return prev;
      }
      return { ...next, dirty: true };
    });
  }, [pushToast]);

  const redo = useCallback(() => {
    setState((prev) => {
      const next = historyRef.current.redo(prev);
      setHistoryTick((x) => x + 1);
      if (!next) {
        queueMicrotask(() => pushToast('info', 'Nothing to redo'));
        return prev;
      }
      return { ...next, dirty: true };
    });
  }, [pushToast]);

  // Autosave debounce
  useEffect(() => {
    if (!hydrated.current) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      void autosaveProject(state);
    }, 800);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, [state]);

  // Hotkeys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape' && state.mode === 'preview') {
        e.preventDefault();
        dispatch((s) => actions.setMode(s, 'edit'));
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveProjectFile();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, state.mode, dispatch]);

  /** Проверка доступности файлов на диске (desktop): после загрузки проекта/автосейва */
  const checkAssetsAvailability = useCallback(
    async (assets: Record<string, AssetMeta>) => {
      if (!desktop) return;
      const list = Object.values(assets);
      const paths = list.map((a) => a.sourceKey).filter((p) => isDesktopPathLike(p));
      if (paths.length === 0) return;
      try {
        const exists = await desktop.pathsExist(paths);
        const missing: ID[] = [];
        const restored: ID[] = [];
        for (const a of list) {
          if (!isDesktopPathLike(a.sourceKey)) continue;
          const ok = exists[a.sourceKey] !== false;
          if (!ok && !a.missing) missing.push(a.id);
          if (ok && a.missing) restored.push(a.id);
        }
        if (missing.length > 0) {
          pushToast('warning', `Не найдено файлов на диске: ${missing.length}`);
        }
        if (missing.length > 0 || restored.length > 0) {
          dispatch((s) => actions.setAssetAvailability(s, missing, restored));
        }
      } catch {
        /* проверка не критична */
      }
    },
    [desktop, dispatch, pushToast]
  );

  const applyCatalogResult = useCallback(
    (catalog: ScannedCatalog | null) => {
      if (!catalog) return false;
      handlesRef.current = catalog.handles;
      // Clear old URLs
      assetUrlCache.clear();
      setUrlMap({});
      setCatalogRootPath(catalog.rootPath ?? null);
      dispatch((s) => actions.applyCatalog(s, catalog));
      if (catalog.truncated) {
        pushToast('warning', 'Каталог обрезан по лимиту — задайте SHOT_MAX_IMAGES');
      }
      if (catalog.skippedDirs && catalog.skippedDirs.length > 0) {
        pushToast('warning', `Пропущено папок: ${catalog.skippedDirs.length}`);
      }
      return true;
    },
    [dispatch, pushToast]
  );

  // Заголовок окна = имя проекта (Electron подхватывает document.title)
  useEffect(() => {
    const base = 'SHOT Constructor';
    document.title = state.meta.name ? `${state.meta.name} — ${base}` : base;
  }, [state.meta.name]);

  // Hydrate autosave
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    loadAutosavedProject().then((saved) => {
      if (saved) {
        setState(saved);
        pushToast('info', 'Restored autosaved project');
        void checkAssetsAvailability(saved.assets);
      }
    });
  }, [pushToast, checkAssetsAvailability]);

  const loadFolder = useCallback(async () => {
    try {
      const catalog = await fsRef.current.pickDirectory();
      applyCatalogResult(catalog);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Could not read folder');
    }
  }, [applyCatalogResult, pushToast]);

  /** Desktop: перечитать ту же папку (новые файлы в каталоге) без диалога */
  const rescanFolder = useCallback(async () => {
    const rescan = fsRef.current.rescan;
    if (!rescan) {
      await loadFolder();
      return;
    }
    try {
      const catalog = await rescan.call(fsRef.current);
      if (!catalog) {
        await loadFolder();
        return;
      }
      applyCatalogResult(catalog);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Could not re-read folder');
    }
  }, [applyCatalogResult, loadFolder, pushToast]);

  const ensureAssetUrl = useCallback(async (assetId: ID): Promise<string | null> => {
    const asset = state.assets[assetId];
    if (!asset) return null;
    if (asset.missing) return null;

    const cached = assetUrlCache.get(assetId) || urlMap[assetId];
    if (cached) return cached;

    // Direct sourceKey if already blob
    if (asset.sourceKey.startsWith('blob:')) {
      assetUrlCache.set(assetId, asset.sourceKey);
      setUrlMap((m) => ({ ...m, [assetId]: asset.sourceKey }));
      return asset.sourceKey;
    }

    const url = await fsRef.current.getObjectUrl(asset.sourceKey, handlesRef.current);
    if (url) {
      assetUrlCache.set(assetId, url);
      setUrlMap((m) => ({ ...m, [assetId]: url }));
      return url;
    }
    return null;
  }, [state.assets, urlMap]);

  const resolveAssetUrl = useCallback(
    (assetId: ID | null): string | null => {
      if (!assetId) return null;
      return urlMap[assetId] || assetUrlCache.get(assetId);
    },
    [urlMap]
  );

  // Eagerly resolve URLs for visible block images
  useEffect(() => {
    const ids = state.blockOrder
      .map((id) => state.blocks[id]?.imageAssetId)
      .filter((x): x is ID => !!x);
    for (const id of ids) {
      if (!urlMap[id] && !assetUrlCache.get(id)) {
        void ensureAssetUrl(id);
      }
    }
  }, [state.blockOrder, state.blocks, state.assets, urlMap, ensureAssetUrl]);

  /** Сохранение: в Electron — системный диалог/запись в известный путь, в браузере — download */
  const runSaveProjectFile = useCallback(
    async (forceDialog: boolean) => {
      const data = serializeProject(state);
      const text = JSON.stringify(data, null, 2);
      const fileName = `${state.meta.name.replace(/[^\w\-]+/g, '_') || 'project'}.json`;

      if (!desktop) {
        downloadJson(fileName, data);
        dispatch((s) => actions.markClean(s));
        pushToast('success', 'Project exported');
        return;
      }

      try {
        // уже знаем путь файла — пишем молча (Ctrl+S)
        if (!forceDialog && projectPathRef.current) {
          const res = await desktop.writeJsonAt({ path: projectPathRef.current, text });
          if (res && !res.canceled && !res.error) {
            dispatch((s) => actions.markClean(s));
            pushToast('success', `Сохранено: ${baseName(projectPathRef.current!)}`);
            return;
          }
        }
        const res = await desktop.saveJson({
          fileName,
          text,
          currentPath: projectPathRef.current,
        });
        if (res.canceled) return;
        if (res.error) {
          pushToast('error', res.error);
          return;
        }
        if (res.path) {
          projectPathRef.current = res.path;
          setProjectPath(res.path);
        }
        dispatch((s) => actions.markClean(s));
        pushToast('success', `Проект сохранён: ${res.path ? baseName(res.path) : fileName}`);
      } catch (e) {
        pushToast('error', e instanceof Error ? e.message : 'Не удалось сохранить проект');
      }
    },
    [state, desktop, dispatch, pushToast]
  );

  const saveProjectFile = useCallback(() => {
    void runSaveProjectFile(false);
  }, [runSaveProjectFile]);

  const saveProjectFileAs = useCallback(() => {
    void runSaveProjectFile(true);
  }, [runSaveProjectFile]);

  const loadProjectFile = useCallback(
    async (preferredPath?: string) => {
      try {
        let data: unknown;
        let loadedFrom: string | null = preferredPath ?? null;

        if (desktop) {
          const res = preferredPath
            ? await desktop.readJsonAt(preferredPath)
            : await desktop.openJson();
          if (res.canceled) return;
          if (res.error) {
            pushToast('error', res.error);
            return;
          }
          try {
            data = JSON.parse(res.text ?? '');
          } catch {
            pushToast('error', 'Файл проекта повреждён или это не JSON');
            return;
          }
          loadedFrom = res.path ?? loadedFrom;
        } else {
          data = await pickAndReadJsonFile();
        }

        const result = deserializeProject(data);
        if (!result.ok) {
          pushToast('error', result.error);
          return;
        }
        historyRef.current.clear();
        setHistoryTick((x) => x + 1);
        if (desktop) {
          projectPathRef.current = loadedFrom;
          setProjectPath(loadedFrom);
          // sourceKey = абсолютный путь → картинки подтянутся с диска сами
          handlesRef.current = new Map();
          assetUrlCache.clear();
          setUrlMap({});
        }
        dispatch((s) => actions.replaceProject(s, result.state));
        pushToast('success', 'Project loaded');
        void checkAssetsAvailability(result.state.assets);
      } catch (e) {
        if ((e as Error).message !== 'No file selected') {
          pushToast('error', e instanceof Error ? e.message : 'Failed to load project');
        }
      }
    },
    [desktop, dispatch, pushToast, checkAssetsAvailability]
  );

  const newProject = useCallback(() => {
    historyRef.current.clear();
    setHistoryTick((x) => x + 1);
    projectPathRef.current = null;
    setProjectPath(null);
    handlesRef.current = new Map();
    assetUrlCache.clear();
    setUrlMap({});
    setState(createEmptyProject());
    pushToast('info', 'New project created');
  }, [pushToast]);

  const dropFileOnBlock = useCallback(
    (blockId: ID, file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      // В Electron берём реальный путь из проводника — картинка переживёт перезапуск
      const desktopPath = desktop?.getPathForFile(file) ?? '';
      const sourceKey = desktopPath || `external/${createId('ext')}_${file.name}`;
      const url = desktopPath ? desktopAssetUrl(desktopPath) : URL.createObjectURL(file);
      if (desktopPath) {
        // пользователь явно бросил файл → разрешаем main-процессу читать его папку
        void desktop?.noteCatalogRoot(dirnameOf(desktopPath));
        handlesRef.current.set(desktopPath, { kind: 'desktop', path: desktopPath, size: file.size });
      } else {
        handlesRef.current.set(sourceKey, file);
      }
      const asset: AssetMeta = {
        id: createId('asset'),
        filename: file.name,
        // в desktop-режиме sourceKey — абсолютный путь, в UI показываем имя файла
        relativePath: desktopPath ? baseName(desktopPath) : sourceKey,
        folderId: null,
        format: (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp'].includes(ext)
          ? ext
          : 'unknown') as AssetMeta['format'],
        fileSize: file.size,
        sourceKey,
        external: true,
        unsupported: !['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp'].includes(ext),
      };
      assetUrlCache.set(asset.id, url);
      setUrlMap((m) => ({ ...m, [asset.id]: url }));
      dispatch((s) => actions.addExternalAsset(s, asset, blockId));
    },
    [desktop, dispatch]
  );

  const importTemplateFile = useCallback(async () => {
    try {
      const data = await pickAndReadJsonFile();
      dispatch((s) => actions.importTemplateJson(s, data as TextContent));
    } catch (e) {
      if ((e as Error).message !== 'No file selected') {
        pushToast('error', 'Invalid template file');
      }
    }
  }, [dispatch, pushToast]);

  // ---- Интеграция с нативным меню Electron -------------------------------------
  // Держим актуальные обработчики в ref: подписка на ipc происходит один раз,
  // а замыкания из первого рендера сохраняли бы пустой/устаревший проект.
  const desktopMenuActions = useRef({
    newProject,
    loadProjectFile,
    saveProjectFileAs,
  });
  useEffect(() => {
    desktopMenuActions.current = { newProject, loadProjectFile, saveProjectFileAs };
  });

  useEffect(() => {
    if (!desktop) return;
    return desktop.onMenu((payload) => {
      const actions2 = desktopMenuActions.current;
      switch (payload.action) {
        case 'project-new':
          actions2.newProject();
          break;
        case 'project-open':
          void actions2.loadProjectFile();
          break;
        case 'project-save':
          actions2.saveProjectFileAs();
          break;
        case 'project-open-path':
          void actions2.loadProjectFile(payload.path);
          break;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop]);

  const value = useMemo<ProjectStoreValue>(
    () => ({
      state,
      toasts,
      canUndo: historyRef.current.canUndo(),
      canRedo: historyRef.current.canRedo(),
      handles: handlesRef.current,
      isDesktop: !!desktop,
      projectPath,
      catalogRootPath,
      urlMap,
      sidebarCollapsed,
      activePanel,
      dismissToast,
      setSidebarCollapsed,
      setActivePanel,
      undo,
      redo,
      dispatch,
      loadFolder,
      rescanFolder,
      saveProjectFile,
      saveProjectFileAs,
      loadProjectFile,
      newProject,
      resolveAssetUrl,
      ensureAssetUrl,
      dropFileOnBlock,
      importTemplateFile,
    }),
    // historyTick forces canUndo/canRedo refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state,
      toasts,
      urlMap,
      sidebarCollapsed,
      activePanel,
      historyTick,
      dismissToast,
      undo,
      redo,
      dispatch,
      loadFolder,
      rescanFolder,
      saveProjectFile,
      saveProjectFileAs,
      loadProjectFile,
      newProject,
      desktop,
      projectPath,
      catalogRootPath,
      resolveAssetUrl,
      ensureAssetUrl,
      dropFileOnBlock,
      importTemplateFile,
    ]
  );

  return (
    <ProjectStoreContext.Provider value={value}>{children}</ProjectStoreContext.Provider>
  );
}

// re-export actions for UI convenience
export { actions };
export type { ScannedCatalog };
