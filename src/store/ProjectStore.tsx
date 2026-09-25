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
  saveProjectFile: () => void;
  loadProjectFile: () => Promise<void>;
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
  const handlesRef = useRef<Map<string, FileSystemFileHandle | File>>(new Map());
  const historyRef = useRef(new HistoryManager<ProjectState>(cloneProject));
  const [historyTick, setHistoryTick] = useState(0);
  const fsRef = useRef(createFileSystemAdapter());
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
      handlesRef.current = catalog.handles;
      // Clear old URLs
      assetUrlCache.clear();
      setUrlMap({});
      dispatch((s) => actions.applyCatalog(s, catalog));
      // Preload URLs for first batch of assets used after randomize later
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Could not read folder');
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

  const saveProjectFile = useCallback(() => {
    const data = serializeProject(state);
    const name = `${state.meta.name.replace(/[^\w\-]+/g, '_') || 'project'}.json`;
    downloadJson(name, data);
    dispatch((s) => actions.markClean(s));
    pushToast('success', 'Project exported');
  }, [state, dispatch, pushToast]);

  const loadProjectFile = useCallback(async () => {
    try {
      const data = await pickAndReadJsonFile();
      const result = deserializeProject(data);
      if (!result.ok) {
        pushToast('error', result.error);
        return;
      }
      historyRef.current.clear();
      setHistoryTick((x) => x + 1);
      // Keep handles if same session — mark missing otherwise
      dispatch((s) => actions.replaceProject(s, result.state));
      pushToast('success', 'Project loaded');
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
    try {
      const data = await pickAndReadJsonFile();
      dispatch((s) => actions.importTemplateJson(s, data as TextContent));
    } catch (e) {
      if ((e as Error).message !== 'No file selected') {
        pushToast('error', 'Invalid template file');
      }
    }
  }, [dispatch, pushToast]);

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
      saveProjectFile,
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
      saveProjectFile,
      loadProjectFile,
      newProject,
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
