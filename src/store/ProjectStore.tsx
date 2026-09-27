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
import type { ScannedCatalog } from '../filesystem/FileSystemAdapter';
import { assetUrlCache } from '../core/assets/AssetUrlCache';
import { ThumbService } from '../filesystem/thumbs';
import { loadDemoCatalog } from '../filesystem/demoCatalog';
import { autosaveProject, loadAutosavedProject } from '../persistence/localAutosave';

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
  handles: Map<string, FileSystemFileHandle | File>;
  urlMap: Record<string, string>; // assetId → object URL
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
  loadDemo: () => Promise<void>;
  saveProjectFile: () => void;
  loadProjectFile: () => Promise<void>;
  newProject: () => void;
  resolveAssetUrl: (assetId: ID | null) => string | null;
  ensureAssetUrl: (assetId: ID) => Promise<string | null>;
  dropFileOnBlock: (blockId: ID, file: File) => void;
  importTemplateFile: () => Promise<void>;
  /** конвейер миниатюр для панели медиа и сеток */
  thumbs: ThumbService;
  /** индекс слайда в превью (превью начинается с выделенного блока) */
  previewIndex: number;
  openPreview: () => void;
  closePreview: () => void;
  previewStep: (direction: 1 | -1) => void;
  previewGoTo: (index: number) => void;
  /** рандом / следующая картинка с учётом режима */
  advanceBlock: (blockId: ID) => void;
  /** сохранить все избранные картинки в папку */
  exportFavorites: () => Promise<void>;
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
  const [previewIndex, setPreviewIndex] = useState(0);
  const [urlMap, setUrlMap] = useState<Record<string, string>>({});
  const handlesRef = useRef<Map<string, FileSystemFileHandle | File>>(new Map());
  const historyRef = useRef(new HistoryManager<ProjectState>(cloneProject));
  const [historyTick, setHistoryTick] = useState(0);
  const fsRef = useRef(createFileSystemAdapter());

  // Актуальные ссылки, чтобы ThumbService не зависел от порядка объявлений
  const stateRef = useRef<ProjectState>(state);
  stateRef.current = state;
  const ensureAssetUrlRef = useRef<(assetId: ID) => Promise<string | null>>(
    async () => null
  );

  // Конвейер миниатюр: один экземпляр на приложение
  const thumbsRef = useRef<ThumbService | null>(null);
  if (!thumbsRef.current) {
    thumbsRef.current = new ThumbService({
      getDisplayUrl: (assetId) => ensureAssetUrlRef.current(assetId),
      isUnsupported: (assetId) => !!stateRef.current.assets[assetId]?.unsupported,
      budgetMB: 48,
      concurrency: 4,
    });
  }
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

  // Hydrate autosave
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    loadAutosavedProject().then((saved) => {
      if (saved) {
        setState(saved);
        pushToast('info', 'Restored autosaved project');
      }
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

  const loadFolder = useCallback(async () => {
    try {
      const catalog = await fsRef.current.pickDirectory();
      if (!catalog) return;
      handlesRef.current = catalog.handles ?? new Map();
      // Clear old URLs
      assetUrlCache.clear();
      setUrlMap({});
      dispatch((s) => actions.applyCatalog(s, catalog));
      // Preload URLs for first batch of assets used after randomize later
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Could not read folder');
    }
  }, [dispatch, pushToast]);

  /** Демо-набор: встроенные картинки, чтобы попробовать программу без своих файлов */
  const loadDemo = useCallback(async () => {
    try {
      const catalog = await loadDemoCatalog();
      if (!catalog) {
        pushToast('error', 'Демо-картинки не найдены');
        return;
      }
      handlesRef.current = catalog.handles ?? new Map();
      assetUrlCache.clear();
      setUrlMap({});
      thumbsRef.current?.clear();
      dispatch((s) => actions.applyCatalog(s, catalog));
      pushToast('success', `Демо-набор: ${catalog.assets.length} картинок в ${catalog.folders.length} папках`);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Не удалось загрузить демо-набор');
    }
  }, [dispatch, pushToast]);

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

  ensureAssetUrlRef.current = ensureAssetUrl;

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

  const saveProjectFile = useCallback(async () => {
    const data = serializeProject(state);
    const name = `${state.meta.name.replace(/[^\w\-]+/g, '_') || 'project'}.json`;

    // Electron: нативный диалог «Сохранить как» + запись на диск
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (api?.isElectron) {
      const res = await api.saveProject(name, data);
      if (res.canceled) return;
      if (!res.ok) {
        pushToast('error', res.error || 'Не удалось сохранить проект');
        return;
      }
      dispatch((s) => actions.markClean(s));
      pushToast('success', `Проект сохранён: ${res.path}`);
      return;
    }

    downloadJson(name, data);
    dispatch((s) => actions.markClean(s));
    pushToast('success', 'Project exported');
  }, [state, dispatch, pushToast]);

  const loadProjectFile = useCallback(async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    try {
      let data: unknown;

      if (api?.isElectron) {
        const res = await api.openJson();
        if (res.canceled) return;
        if (!res.ok) {
          pushToast('error', res.error || 'Не удалось открыть проект');
          return;
        }
        data = res.data;
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
      dispatch((s) => actions.replaceProject(s, result.state));
      pushToast('success', 'Project loaded');

      // Electron: sourceKey — абсолютные пути, проверяем, что файлы на месте
      if (api?.isElectron) {
        const absEntries = Object.entries(result.state.assets).filter(
          ([, a]) => !!a.sourceKey && /^([a-zA-Z]:[\\/]|\/)/.test(a.sourceKey)
        );
        if (absEntries.length > 0) {
          const presence = await api.checkFiles(absEntries.map(([, a]) => a.sourceKey));
          const available = new Set(
            absEntries.filter(([, a]) => presence[a.sourceKey]).map(([id]) => id)
          );
          dispatch((s) => actions.refreshAssetAvailability(s, available));
        }
      }
    } catch (e) {
      if ((e as Error).message !== 'No file selected') {
        pushToast('error', e instanceof Error ? e.message : 'Failed to load project');
      }
    }
  }, [dispatch, pushToast]);

  const newProject = useCallback(() => {
    historyRef.current.clear();
    setHistoryTick((x) => x + 1);
    handlesRef.current = new Map();
    assetUrlCache.clear();
    setUrlMap({});
    setState(createEmptyProject());
    pushToast('info', 'New project created');
  }, [pushToast]);

  const dropFileOnBlock = useCallback(
    (blockId: ID, file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const sourceKey = `external/${createId('ext')}_${file.name}`;
      const url = URL.createObjectURL(file);
      handlesRef.current.set(sourceKey, file);
      const asset: AssetMeta = {
        id: createId('asset'),
        filename: file.name,
        relativePath: sourceKey,
        folderId: null,
        format: (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp'].includes(ext)
          ? ext
          : 'unknown') as AssetMeta['format'],
        fileSize: file.size,
        sourceKey,
        external: true,
      };
      assetUrlCache.set(asset.id, url);
      setUrlMap((m) => ({ ...m, [asset.id]: url }));
      dispatch((s) => actions.addExternalAsset(s, asset, blockId));
    },
    [dispatch]
  );

  const importTemplateFile = useCallback(async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    try {
      let data: unknown;
      if (api?.isElectron) {
        const res = await api.openJson();
        if (res.canceled) return;
        if (!res.ok) {
          pushToast('error', res.error || 'Не удалось открыть файл шаблона');
          return;
        }
        data = res.data;
      } else {
        data = await pickAndReadJsonFile();
      }
      dispatch((s) => actions.importTemplateJson(s, data as TextContent));
    } catch (e) {
      if ((e as Error).message !== 'No file selected') {
        pushToast('error', 'Invalid template file');
      }
    }
  }, [dispatch, pushToast]);


  /* --------------------------------------------------------------- preview */

  const blocksInOrder = useCallback(
    () => state.blockOrder.filter((id) => !!state.blocks[id]),
    [state.blockOrder, state.blocks]
  );

  /** Вход в превью — с выделенного блока, а не с первого */
  const openPreview = useCallback(() => {
    const order = blocksInOrder();
    if (order.length === 0) {
      pushToast('warning', 'Нет блоков для превью');
      return;
    }
    const selected = state.selectedBlockId;
    const idx = selected ? order.indexOf(selected) : -1;
    setPreviewIndex(idx >= 0 ? idx : 0);
    dispatch((s) => actions.setMode(s, 'preview'));
  }, [blocksInOrder, state.selectedBlockId, dispatch, pushToast]);

  const closePreview = useCallback(() => {
    dispatch((s) => actions.setMode(s, 'edit'));
  }, [dispatch]);

  const previewStep = useCallback(
    (direction: 1 | -1) => {
      const total = state.blockOrder.length;
      if (total <= 1) return;
      setPreviewIndex((current) => {
        let next = current + direction;
        if (next < 0) next = state.preview.loop ? total - 1 : 0;
        if (next > total - 1) next = state.preview.loop ? 0 : total - 1;
        return next === current ? current : next;
      });
    },
    [state.blockOrder.length, state.preview.loop]
  );

  const previewGoTo = useCallback((index: number) => {
    setPreviewIndex(Math.max(0, index));
  }, []);

  /**
   * Кнопка/клавиша «дальше»: в случайном режиме — кубик,
   * в последовательном — следующая картинка по порядку (без повторов).
   */
  const advanceBlock = useCallback(
    (blockId: ID) => {
      dispatch((s) => actions.advanceBlock(s, blockId));
    },
    [dispatch]
  );

  /**
   * Экспорт всех избранных картинок в выбранную папку.
   * В браузере (без Electron) просто сохраняем список в JSON.
   */
  const exportFavorites = useCallback(async () => {
    const tasks: Array<{ from: string; to: string }> = [];
    const seen = new Set<string>();

    for (const blockId of state.blockOrder) {
      const block = state.blocks[blockId];
      if (!block) continue;
      for (const assetId of block.favoriteAssetIds) {
        const asset = state.assets[assetId];
        if (!asset || seen.has(assetId)) continue;
        seen.add(assetId);
        if (!asset.sourceKey) continue;
        const folderName = asset.folderId
          ? state.folders[asset.folderId]?.name ?? 'Без папки'
          : 'Без папки';
        tasks.push({
          from: asset.sourceKey,
          to: `${folderName}/${asset.filename}`,
        });
      }
    }

    if (tasks.length === 0) {
      pushToast('warning', 'Избранных картинок нет — отметьте звездочкой хотя бы одну');
      return;
    }

    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api?.isElectron) {
      const name = `favorites-${new Date().toISOString().slice(0, 10)}.json`;
      downloadJson(
        name,
        tasks.map((t) => ({ file: t.to, path: t.from }))
      );
      pushToast('success', `Список из ${tasks.length} картинок сохранён в ${name}`);
      return;
    }

    const res = await api.copyFiles(tasks);
    if (res.canceled) return;
    if (!res.ok) {
      pushToast('error', res.error || 'Не удалось сохранить картинки');
      return;
    }
    const skipped = res.failed?.length ? `, не скопировано: ${res.failed.length}` : '';
    pushToast('success', `Сохранено ${res.copied ?? tasks.length} картинок в ${res.path}${skipped}`);
  }, [state.blockOrder, state.blocks, state.assets, state.folders, pushToast]);

  // Команды из нативного меню Electron (см. electron/main.cjs → 'menu:command')
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api?.isElectron) return;

    return api.onMenuCommand((command) => {
      switch (command) {
        case 'new':
          newProject();
          break;
        case 'open':
          void loadProjectFile();
          break;
        case 'save':
          void saveProjectFile();
          break;
        case 'loadFolder':
          void loadFolder();
          break;
        case 'undo':
          undo();
          break;
        case 'redo':
          redo();
          break;
        case 'preview':
          dispatch((s) => actions.setMode(s, 'preview'));
          break;
        default:
          break;
      }
    });
  }, [newProject, loadProjectFile, saveProjectFile, loadFolder, loadDemo, undo, redo, dispatch]);


  /* ------------------------------------------------------ горячие клавиши */
  // Ctrl+Z / Ctrl+Y / Ctrl+S уже обрабатываются выше; здесь — новые функции.
  // Проверяем, что фокус не в поле ввода, чтобы не ломать набор текста.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (typing) return;

      const mod = e.ctrlKey || e.metaKey;

      // P — войти/выйти из превью
      if (!mod && !e.altKey && (e.key === 'p' || e.key === 'P' || e.key === 'з')) {
        e.preventDefault();
        if (state.mode === 'preview') closePreview();
        else openPreview();
        return;
      }

      // Space — play/pause автоплея в превью
      if (!mod && !e.altKey && (e.code === 'Space' || e.key === ' ') && state.mode === 'preview') {
        e.preventDefault();
        dispatch((s) =>
          actions.updatePreviewSettings(s, { autoplay: !s.preview.autoplay })
        );
        return;
      }

      // 1..5 — быстрый выбор перехода (и в редакторе, и в превью)
      if (!mod && !e.altKey && /^[1-5]$/.test(e.key)) {
        const transitions = [
          'fade',
          'slide-vertical',
          'slide-horizontal',
          'crossfade',
          'zoom',
        ] as const;
        const transition = transitions[Number(e.key) - 1];
        if (transition) {
          e.preventDefault();
          dispatch((s) => actions.updatePreviewSettings(s, { transitionType: transition }));
          pushToast('info', `Переход: ${transition}`);
        }
        return;
      }

      // В превью: стрелки листают блоки, Alt+стрелки — картинки внутри блока
      if (state.mode === 'preview') {
        const currentBlockId = state.blockOrder[previewIndex];

        if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
          e.preventDefault();
          if (currentBlockId) {
            dispatch((s) => actions.advanceBlock(s, currentBlockId));
          }
          return;
        }

        if (!e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
          e.preventDefault();
          previewStep(e.key === 'ArrowRight' ? 1 : -1);
          return;
        }

        // F — текущая картинка в избранное
        if (!mod && !e.altKey && (e.key === 'f' || e.key === 'F' || e.key === 'а')) {
          e.preventDefault();
          if (currentBlockId) dispatch((s) => actions.toggleFavorite(s, currentBlockId));
          return;
        }

        // R — рандом текущего блока
        if (!mod && !e.altKey && (e.key === 'r' || e.key === 'R' || e.key === 'к')) {
          e.preventDefault();
          if (currentBlockId) dispatch((s) => actions.randomizeBlock(s, currentBlockId, true));
          return;
        }
        return;
      }

      // В редакторе
      const selected = state.selectedBlockId;

      // Alt+стрелки — листать картинки выбранного блока
      if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        if (selected) dispatch((s) => actions.advanceBlock(s, selected));
        return;
      }

      // R — рандом выбранного блока
      if (!mod && !e.altKey && (e.key === 'r' || e.key === 'R' || e.key === 'к')) {
        e.preventDefault();
        if (selected) dispatch((s) => actions.advanceBlock(s, selected));
        return;
      }

      // F — текущая картинка выбранного блока в избранное
      if (!mod && !e.altKey && (e.key === 'f' || e.key === 'F' || e.key === 'а')) {
        e.preventDefault();
        if (selected) dispatch((s) => actions.toggleFavorite(s, selected));
        return;
      }

      // L — замок на блоке
      if (!mod && !e.altKey && (e.key === 'l' || e.key === 'L' || e.key === 'д')) {
        e.preventDefault();
        if (selected) dispatch((s) => actions.toggleLock(s, selected));
        return;
      }

    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    state.mode,
    state.selectedBlockId,
    state.blockOrder,
    previewIndex,
    dispatch,
    openPreview,
    closePreview,
    previewStep,
    pushToast,
  ]);

  const value = useMemo<ProjectStoreValue>(
    () => ({
      state,
      toasts,
      canUndo: historyRef.current.canUndo(),
      canRedo: historyRef.current.canRedo(),
      handles: handlesRef.current,
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
      loadDemo,
      saveProjectFile,
      loadProjectFile,
      newProject,
      resolveAssetUrl,
      ensureAssetUrl,
      dropFileOnBlock,
      importTemplateFile,
      thumbs: thumbsRef.current as ThumbService,
      previewIndex,
      openPreview,
      closePreview,
      previewStep,
      previewGoTo,
      advanceBlock,
      exportFavorites,
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
      loadDemo,
      saveProjectFile,
      loadProjectFile,
      newProject,
      resolveAssetUrl,
      ensureAssetUrl,
      dropFileOnBlock,
      importTemplateFile,
      previewIndex,
      openPreview,
      closePreview,
      previewStep,
      previewGoTo,
      advanceBlock,
      exportFavorites,
    ]
  );

  return (
    <ProjectStoreContext.Provider value={value}>{children}</ProjectStoreContext.Provider>
  );
}

// re-export actions for UI convenience
export { actions };
export type { ScannedCatalog };
