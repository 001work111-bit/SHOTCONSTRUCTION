import { AutosaveService } from '../persistence/autosave';
import { loadProjectFromObject, loadProjectFromText, relinkFolder as relinkFolderLogic, remapScanForRelink } from '../persistence/loader';
import { buildRefIndex, projectFileName, projectToJson, refForAsset } from '../persistence/serializer';
import { BrowserFileSystemAdapter } from '../filesystem/browser';
import { ElectronFileSystemAdapter } from '../filesystem/electron';
import type { FileSystemAdapter, ImageSource, ScanOutcome, StoredRef } from '../filesystem/adapter';
import { demoEntries } from '../filesystem/demo';
import { ImageService } from '../filesystem/thumbs';
import { applyScan, registerManualAsset, type ScanResult } from './assets';
import {
  addBlockTextLine,
  addBlocks,
  clearFolders,
  duplicateBlock,
  getBlock,
  moveBlock as moveBlockInOrder,
  patchBlock,
  patchBlockOverlay,
  patchBlockTypography,
  removeBlock,
  removeBlockTextLine,
  resetBlockText,
  resizeBlock as resizeBlockGeometry,
  selectAllFolders,
  setBlockCount as setBlockCountValue,
  setBlockExternalImage,
  setBlockFolders,
  setBlockImage,
  setBlockLocked,
  setBlockOverlay,
  setBlockTextLayer,
  setImageFit,
  setImagePosition,
  setLockedAll,
  setUseFavorites,
  toggleBlockFolder,
  toggleBlockLocked,
} from './blocks';
import { AppError } from './errors';
import {
  addCurrentImageToFavorites,
  clearFavorites,
  copyFavorites,
  removeFavorite,
  toggleFavoriteForBlock,
} from './favorites';
import { HistoryManager } from './history';
import { createManualAsset, createEmptyProject, touchProject } from './project';
import { assetIndex } from './selectors';
import { randomizeAll, randomizeBlock, replay as replayRandomize, describeRandomizeResult } from './randomizer';
import { createSeed } from './rng';
import { applyStack as applyStackLogic, deleteStack as deleteStackLogic, duplicateStack as duplicateStackLogic, renameStack as renameStackLogic, saveStack as saveStackLogic, stepStack as stepStackLogic } from './stacks';
import { createStore, type Store } from './store';
import { applyGlobalTemplate, copyTextToAllBlocks as copyTextToAllBlocksLogic, parseTemplateJson, resetAllBlockText } from './templates';
import type {
  Asset,
  AssetId,
  AspectPreset,
  Block,
  BlockId,
  FolderId,
  ImageFit,
  ImagePosition,
  Overlay,
  PreviewSettings,
  Project,
  ProjectState,
  RandomizeResult,
  SidebarSection,
  TextLayerKey,
  TextTemplate,
  Toast,
  TypographySet,
} from './types';
import { createToastId, stableAssetId } from './ids';

/**
 * AppController — the application service layer.
 *
 * Every UI action goes through here; components never mutate the project and never touch
 * the filesystem or the randomizer directly (spec §4). Each project change is wrapped in a
 * single history transaction, which is what makes Ctrl+Z atomic for `Randomize All`.
 */

export interface ControllerOptions {
  adapter?: FileSystemAdapter;
  autoBootstrap?: boolean;
}

export interface ToastInput {
  kind: Toast['kind'];
  message: string;
  detail?: string;
  ttlMs?: number;
}

function initialUi() {
  return {
    mode: 'edit' as const,
    sidebarCollapsed: false,
    inspectorOpen: true,
    section: 'blocks' as SidebarSection,
    selectedBlockId: null as BlockId | null,
    editing: null,
    previewIndex: 0,
    previewDirection: 1 as 1 | -1,
    previewPlaying: false,
    saveStatus: 'clean' as const,
    toasts: [] as Toast[],
    busy: null as string | null,
    scanProgress: null as string | null,
    search: '',
    decodeQueue: 0,
  };
}

export class AppController {
  readonly store: Store<ProjectState>;
  readonly history: HistoryManager;
  readonly images: ImageService;
  readonly autosave: AutosaveService;

  adapter: FileSystemAdapter;
  private refIndex = new Map<AssetId, StoredRef>();
  private pendingDimensions = new Map<AssetId, { width: number; height: number }>();
  private flushHandle: number | null = null;
  private toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: ControllerOptions = {}) {
    const project = createEmptyProject();
    this.store = createStore<ProjectState>({ project, ui: initialUi() });
    this.history = new HistoryManager(project.settings.historyLimit);
    this.adapter = options.adapter ?? pickAdapter();

    this.images = new ImageService({
      openBlob: (ref) => this.adapter.openBlob(ref),
      budgetMB: project.settings.thumbnailBudgetMB,
      concurrency: 3,
      onDimensions: (assetId, width, height) => this.queueDimensions(assetId, width, height),
      onQueueChange: (pending) => this.patchUi({ decodeQueue: pending }),
    });

    this.autosave = new AutosaveService({
      onStatus: (status, detail) => {
        if (status === 'saving') this.patchUi({ saveStatus: 'saving' });
        else if (status === 'saved') this.patchUi({ saveStatus: 'saved' });
        else {
          this.patchUi({ saveStatus: 'error' });
          if (detail) this.notify({ kind: 'warn', message: 'Autosave failed', detail });
        }
      },
    });

    if (options.autoBootstrap !== false) void this.bootstrap();
    this.installUnloadFlush();
  }

  /**
   * The autosave write is debounced; flush it when the tab goes away so a reload never
   * restores a snapshot that is older than the last user action.
   */
  private installUnloadFlush(): void {
    if (typeof window === 'undefined') return;
    const flush = () => {
      this.autosave.dispose();
      void this.autosave.flush(this.project);
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.autosave.flush(this.project);
    });
  }

  /* -------------------------------------------------------------- plumbing */

  get state(): ProjectState {
    return this.store.getState();
  }
  get project(): Project {
    return this.store.getState().project;
  }
  get ui() {
    return this.store.getState().ui;
  }
  get capabilities() {
    return this.adapter.capabilities;
  }
  get adapterLabel(): string {
    return this.adapter.describe();
  }

  /** Bound so it can be handed straight to `useSyncExternalStore`. */
  subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener);

  private setProject(project: Project, options: { touch?: boolean } = {}): void {
    const next = options.touch === false ? project : touchProject(project);
    this.store.setState((prev) => ({ ...prev, project: next, ui: { ...prev.ui, saveStatus: 'dirty' } }));
    this.autosave.schedule(next);
  }

  /** Atomic transaction: one user action → exactly one history entry. */
  private run(label: string, mutator: (project: Project) => Project): boolean {
    const previous = this.project;
    const next = mutator(previous);
    if (next === previous) return false;
    this.history.push(previous, label);
    this.setProject(next);
    return true;
  }

  /** Metadata / bookkeeping changes that must not pollute the undo stack. */
  private runSilent(mutator: (project: Project) => Project): void {
    const previous = this.project;
    const next = mutator(previous);
    if (next === previous) return;
    this.setProject(next, { touch: false });
  }

  patchUi(patch: Partial<ProjectState['ui']>): void {
    this.store.setState((prev) => ({ ...prev, ui: { ...prev.ui, ...patch } }));
  }

  notify(input: ToastInput): void {
    const toast: Toast = {
      id: createToastId(),
      kind: input.kind,
      message: input.message,
      detail: input.detail,
      at: Date.now(),
    };
    this.store.setState((prev) => ({ ...prev, ui: { ...prev.ui, toasts: [...prev.ui.toasts, toast] } }));
    const ttl = input.ttlMs ?? (input.kind === 'error' ? 9000 : 4500);
    this.toastTimers.set(
      toast.id,
      setTimeout(() => this.dismissToast(toast.id), ttl),
    );
  }

  dismissToast(id: string): void {
    const timer = this.toastTimers.get(id);
    if (timer) clearTimeout(timer);
    this.toastTimers.delete(id);
    this.store.setState((prev) => ({ ...prev, ui: { ...prev.ui, toasts: prev.ui.toasts.filter((t) => t.id !== id) } }));
  }

  private fail(err: unknown, fallbackMessage: string, code: Parameters<typeof AppError.from>[1] = 'unknown'): void {
    const error = err instanceof AppError ? err : AppError.from(err, code);
    this.notify({
      kind: 'error',
      message: error.message || fallbackMessage,
      detail: error.detail ?? error.hint,
    });
  }

  private queueDimensions(assetId: AssetId, width: number, height: number): void {
    this.pendingDimensions.set(assetId, { width, height });
    if (this.flushHandle !== null) return;
    const schedule =
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: () => void) => setTimeout(cb, 32);
    this.flushHandle = schedule(() => {
      this.flushHandle = null;
      const pending = this.pendingDimensions;
      this.pendingDimensions = new Map();
      if (!pending.size) return;
      this.runSilent((project) => ({
        ...project,
        assets: project.assets.map((asset) => {
          const patch = pending.get(asset.id);
          if (!patch) return asset;
          if (asset.width === patch.width && asset.height === patch.height) return asset;
          return { ...asset, width: patch.width, height: patch.height };
        }),
      }));
    }) as unknown as number;
  }

  /* ------------------------------------------------------------- bootstrap */

  async bootstrap(): Promise<void> {
    if (this.adapter.kind === 'browser' && 'restoreManualHandles' in this.adapter) {
      await (this.adapter as BrowserFileSystemAdapter).restoreManualHandles();
    }

    const snapshot = await this.autosave.restore();
    if (snapshot) {
      try {
        const report = loadProjectFromObject(snapshot.project);
        this.history.reset();
        this.refIndex = buildRefIndex(report.project);
        this.store.setState((prev) => ({
          ...prev,
          project: report.project,
          ui: {
            ...prev.ui,
            saveStatus: 'saved',
            selectedBlockId: report.project.blocks.order[0] ?? null,
            scanProgress: null,
          },
        }));
        this.notify({
          kind: 'info',
          message: 'Restored the autosaved session',
          detail: `${new Date(snapshot.savedAt).toLocaleString()} · ${report.project.blocks.order.length} blocks. Use “Import project” to open a saved file.`,
        });
        return;
      } catch (err) {
        this.fail(err, 'The autosaved session could not be restored.', 'corrupt-autosave');
      }
    }

    if (this.adapter.kind === 'browser') {
      const restored = await this.adapter.restoreLastRoot();
      if (restored) {
        this.pendingRoot = restored.root;
        this.patchUi({ scanProgress: `${restored.root.label} · access needs confirmation` });
      }
    }
  }

  pendingRoot: { id: string; name: string; label: string; token: string } | null = null;

  /** Called from a user gesture after a reload, when the handle permission was dropped. */
  async confirmPendingRoot(): Promise<void> {
    if (!this.pendingRoot) return;
    const root = this.pendingRoot;
    const granted = await this.adapter.requestAccess(root);
    if (!granted) {
      this.notify({ kind: 'warn', message: 'Access to the previous folder was not granted.' });
      return;
    }
    this.pendingRoot = null;
    await this.rescanCatalog();
  }

  /* ---------------------------------------------------------------- folder */

  async loadFolder(): Promise<void> {
    try {
      this.patchUi({ busy: 'Scanning folder…' });
      const outcome = await this.adapter.pickDirectory();
      if (!outcome) return;
      this.applyScanOutcome(outcome, 'Catalog loaded');
    } catch (err) {
      this.fail(err, 'Could not read the selected folder.', 'directory-read-failed');
    } finally {
      this.patchUi({ busy: null, scanProgress: null });
    }
  }

  /** Load the catalog bundled with the app (works without any file-system permission). */
  async loadDemoCatalog(): Promise<void> {
    const register = this.adapter.registerBundledFiles;
    if (!register) {
      this.notify({
        kind: 'warn',
        message: 'The bundled demo is not available for this adapter.',
        detail: 'Pick a folder with “Load image folder” instead.',
      });
      return;
    }
    try {
      this.patchUi({ busy: 'Loading demo catalog…' });
      const outcome: ScanOutcome = await register.call(this.adapter, demoEntries());
      this.applyScanOutcome(outcome, 'Demo catalog loaded');
    } catch (err) {
      this.fail(err, 'The demo catalog could not be loaded.', 'directory-read-failed');
    } finally {
      this.patchUi({ busy: null });
    }
  }

  async rescanCatalog(): Promise<void> {
    if (!this.currentRoot) {
      await this.loadFolder();
      return;
    }
    try {
      this.patchUi({ busy: 'Rescanning…' });
      const outcome = await this.adapter.rescan(this.currentRoot);
      if (!outcome) {
        this.notify({ kind: 'warn', message: 'Rescan is not available for this folder.', detail: 'Pick the folder again.' });
        return;
      }
      this.applyScanOutcome(outcome, 'Catalog rescanned');
    } catch (err) {
      this.fail(err, 'Rescan failed.', 'directory-read-failed');
    } finally {
      this.patchUi({ busy: null });
    }
  }

  private currentRoot: { id: string; name: string; label: string; token: string } | null = null;

  private applyScanOutcome(outcome: ScanResult & { root: { id: string; name: string; label: string; token: string }; refs: StoredRef[] }, successLabel: string): void {
    this.currentRoot = outcome.root;
    for (const ref of outcome.refs) {
      this.refIndex.set(refKeyToAssetId(ref), ref);
    }
    const folderCountBefore = this.project.folders.length;

    this.run(successLabel, (project) => {
      const scanned = applyScan(project, outcome as unknown as ScanResult);
      let next = scanned.project;
      // a fresh project gets a sensible starting set of blocks once a catalog exists
      if (!next.blocks.order.length && scanned.folderIds.length) {
        next = addBlocks(next, 6);
      }
      return next;
    });

    // refs must be indexed for the assets that the scan just created
    this.refIndex = buildRefIndex(this.project);
    for (const ref of outcome.refs) this.refIndex.set(refKeyToAssetId(ref), ref);
    void this.adapter.persistRefs(outcome.root, outcome.refs);

    const unsupported = outcome.unsupported;
    const notes = outcome.notes ?? [];
    this.notify({
      kind: outcome.totalFiles ? 'success' : 'warn',
      message: outcome.totalFiles
        ? `${successLabel}: ${outcome.folders.length} folders · ${outcome.totalFiles} images`
        : 'No images found in this folder.',
      detail: [
        folderCountBefore === 0 && outcome.folders.length ? 'All folders were selected for every block by default.' : null,
        unsupported ? `${unsupported} file(s) in unsupported formats (imported as metadata only).` : null,
        ...notes,
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  async importDroppedFiles(files: File[], handles?: Map<File, FileSystemFileHandle>): Promise<Asset[]> {
    try {
      if (!files.length) return [];
      const dropped = await this.adapter.importDropped(files, handles);
      const assets = dropped.map((item) =>
        createManualAsset({
          id: `asset_manual_${stableAssetId(item.ref.key).slice(6)}`,
          name: item.name,
          path: item.path,
          format: item.format,
          mime: item.mime,
          bytes: item.bytes,
          refKey: item.ref.kind === 'path' ? item.ref.key : item.ref.key,
        }),
      );
      for (let i = 0; i < assets.length; i += 1) {
        const ref = dropped[i].ref;
        this.refIndex.set(assets[i].id, { ...ref, key: assets[i].refKey });
      }
      this.run('Import external image', (project) =>
        assets.reduce((acc, asset) => registerManualAsset(acc, asset), project),
      );
      this.notify({
        kind: 'success',
        message: `${assets.length} external image${assets.length === 1 ? '' : 's'} added`,
        detail: 'They are referenced by name/path and are not copied into the catalog.',
      });
      return assets;
    } catch (err) {
      this.fail(err, 'Dropped files could not be imported.');
      return [];
    }
  }

  /** Drop onto a specific block (spec §38, §67). */
  async handleBlockDrop(blockId: BlockId, dataTransfer: DataTransfer): Promise<void> {
    const files = Array.from(dataTransfer.files ?? []).filter((file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|svg|avif|bmp|tiff?|heic|heif)$/i.test(file.name));
    if (!files.length) {
      this.notify({ kind: 'warn', message: 'No image files in the drop.' });
      return;
    }
    const handles = new Map<File, FileSystemFileHandle>();
    const items = Array.from(dataTransfer.items ?? []);
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const getter = (item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> })
        .getAsFileSystemHandle;
      if (typeof getter !== 'function') break;
      try {
        const handle = await getter.call(item);
        const file = item.getAsFile();
        if (handle && handle.kind === 'file' && file) handles.set(file, handle as FileSystemFileHandle);
      } catch {
        /* handles are a bonus, files alone are enough */
      }
    }
    const assets = await this.importDroppedFiles(files, handles.size ? handles : undefined);
    if (!assets.length) return;
    const primary = assets[0];
    this.run('Replace block image (drop)', (project) => setBlockExternalImage(project, blockId, primary.id));
    this.notify({ kind: 'success', message: `Block image replaced with “${primary.name}”` });
  }

  async relinkFolder(folderId: FolderId): Promise<void> {
    const folder = this.project.folders.find((f) => f.id === folderId);
    if (!folder) return;
    try {
      this.patchUi({ busy: 'Relinking…' });
      const outcome = await this.adapter.pickDirectory();
      if (!outcome) return;
      const remapped = remapScanForRelink(outcome as unknown as ScanResult, folder.path, folder.name);
      const report = relinkFolderLogic(this.project, folderId, remapped, folder.id);
      const merged = applyScan(report.project, { ...(outcome as unknown as ScanResult), folders: remapped.folders, rootFiles: remapped.rootFiles });
      this.run('Relink folder', () => merged.project);
      this.refIndex = buildRefIndex(this.project);
      for (const ref of outcome.refs) this.refIndex.set(refKeyToAssetId(ref), ref);
      await this.adapter.persistRefs(outcome.root, outcome.refs);
      this.notify({
        kind: report.recovered ? 'success' : 'warn',
        message: report.recovered ? `Relinked: ${report.recovered} file(s) recovered` : 'No matching files were found for this folder.',
        detail: report.stillMissing ? `${report.stillMissing} reference(s) are still missing.` : undefined,
      });
    } catch (err) {
      this.fail(err, 'Relink failed.', 'directory-read-failed');
    } finally {
      this.patchUi({ busy: null });
    }
  }

  /* ----------------------------------------------------------------- blocks */

  setBlockCount(count: number): void {
    const applied = this.run(`Block count → ${count}`, (project) => setBlockCountValue(project, count));
    if (applied) {
      const { order } = this.project.blocks;
      if (!order.includes(this.ui.selectedBlockId ?? '')) {
        this.patchUi({ selectedBlockId: order[order.length - 1] ?? null });
      }
    }
  }

  addBlock(): void {
    const created = this.run('Add block', (project) => addBlocks(project, 1));
    if (created) {
      const order = this.project.blocks.order;
      this.patchUi({ selectedBlockId: order[order.length - 1] ?? null, section: 'blocks' });
    }
  }

  deleteBlock(blockId: BlockId): void {
    const index = this.project.blocks.order.indexOf(blockId);
    const ok = this.run('Delete block', (project) => removeBlock(project, blockId));
    if (ok) {
      const order = this.project.blocks.order;
      this.patchUi({
        selectedBlockId: order[Math.min(index, order.length - 1)] ?? null,
        editing: null,
      });
      this.notify({ kind: 'info', message: 'Block deleted', detail: 'Favorites of that block were removed; stacks keep their other entries.' });
    }
  }

  duplicateBlock(blockId: BlockId): void {
    const ok = this.run('Duplicate block', (project) => duplicateBlock(project, blockId));
    if (!ok) return;
    const order = this.project.blocks.order;
    const index = order.indexOf(blockId);
    this.patchUi({ selectedBlockId: order[index + 1] ?? blockId });
  }

  moveBlock(blockId: BlockId, delta: number): void {
    this.run(delta < 0 ? 'Move block up' : 'Move block down', (project) => moveBlockInOrder(project, blockId, delta));
  }

  selectBlock(blockId: BlockId | null): void {
    this.patchUi({ selectedBlockId: blockId, editing: null, section: blockId ? 'blocks' : this.ui.section });
  }

  resizeBlock(blockId: BlockId, input: { width?: number; height?: number; aspect?: AspectPreset; lockRatio?: boolean; driver?: 'width' | 'height' }): void {
    this.run('Block size', (project) => resizeBlockGeometry(project, blockId, input));
  }

  setFit(blockId: BlockId, fit: ImageFit): void {
    this.run('Image fit', (project) => setImageFit(project, blockId, fit));
  }

  setPosition(blockId: BlockId, position: Partial<ImagePosition>): void {
    this.run('Image position', (project) => setImagePosition(project, blockId, position));
  }

  setBlockFolders(blockId: BlockId, folderIds: FolderId[]): void {
    this.run('Allowed folders', (project) => setBlockFolders(project, blockId, folderIds));
  }

  toggleBlockFolder(blockId: BlockId, folderId: FolderId): void {
    this.run('Allowed folders', (project) => toggleBlockFolder(project, blockId, folderId));
  }

  selectAllFolders(blockId: BlockId): void {
    this.run('Select all folders', (project) => selectAllFolders(project, blockId));
  }

  clearFolders(blockId: BlockId): void {
    this.run('Clear folders', (project) => clearFolders(project, blockId));
  }

  setUseFavorites(blockId: BlockId, value: boolean): void {
    this.run(value ? 'Use favorites' : 'Ignore favorites', (project) => setUseFavorites(project, blockId, value));
    if (value) {
      const count = (this.project.favorites[blockId] ?? []).length;
      if (!count) {
        this.notify({
          kind: 'info',
          message: 'No favorites for this block yet',
          detail: 'Randomize falls back to the selected folders until you add some.',
        });
      }
    }
  }

  toggleLock(blockId: BlockId): void {
    const block = getBlock(this.project, blockId);
    const next = !block?.locked;
    this.run(next ? 'Lock block' : 'Unlock block', (project) => setBlockLocked(project, blockId, next));
  }

  setLockedAll(locked: boolean): void {
    this.run(locked ? 'Lock all blocks' : 'Unlock all blocks', (project) => setLockedAll(project, locked));
  }

  setLockedForSelection(locked: boolean): void {
    const id = this.ui.selectedBlockId;
    if (!id) return;
    this.run(locked ? 'Lock selected' : 'Unlock selected', (project) => setBlockLocked(project, id, locked));
  }

  /* -------------------------------------------------------------- favorites */

  toggleFavorite(blockId: BlockId, assetId: AssetId): void {
    const isFav = (this.project.favorites[blockId] ?? []).includes(assetId);
    this.run(isFav ? 'Remove favorite' : 'Add favorite', (project) => toggleFavoriteForBlock(project, blockId, assetId));
  }

  addCurrentToFavorites(blockId: BlockId): void {
    const block = getBlock(this.project, blockId);
    if (!block?.imageAssetId) {
      this.notify({ kind: 'warn', message: 'This block has no image yet.' });
      return;
    }
    const ok = this.run('Add current image to favorites', (project) => addCurrentImageToFavorites(project, blockId));
    if (ok) {
      const count = (this.project.favorites[blockId] ?? []).length;
      this.notify({ kind: 'success', message: `Favorite added · ${count} for this block` });
    } else {
      this.notify({ kind: 'info', message: 'Already in this block’s favorites.' });
    }
  }

  removeFavorite(blockId: BlockId, assetId: AssetId): void {
    this.run('Remove favorite', (project) => removeFavorite(project, blockId, assetId));
  }

  clearFavorites(blockId: BlockId): void {
    const ok = this.run('Clear favorites', (project) => clearFavorites(project, blockId));
    if (ok) this.notify({ kind: 'info', message: 'Favorites cleared for this block.' });
  }

  copyFavoritesToAll(fromBlockId: BlockId): void {
    const from = this.project.blocks.order;
    this.run('Copy favorites to all blocks', (project) =>
      from.reduce((acc, id) => (id === fromBlockId ? acc : copyFavorites(acc, fromBlockId, id)), project),
    );
    this.notify({ kind: 'success', message: 'Favorites copied to every block.' });
  }

  /* -------------------------------------------------------------- randomize */

  randomizeAll(): void {
    const { project, result } = randomizeAll(this.project, { seed: createSeed('all') });
    this.commitRandomize('Randomize all', project, result);
  }

  randomizeSelected(): void {
    const id = this.ui.selectedBlockId;
    if (!id) {
      this.notify({ kind: 'warn', message: 'Select a block first.' });
      return;
    }
    this.randomizeBlock(id, true);
  }

  randomizeBlock(blockId: BlockId, explicit = true): void {
    const { project, result } = randomizeBlock(this.project, blockId, { seed: createSeed('one'), ignoreLock: explicit });
    this.commitRandomize('Randomize block', project, result);
  }

  private commitRandomize(label: string, nextProject: Project, result: RandomizeResult): void {
    const previous = this.project;
    if (nextProject !== previous) {
      this.history.push(previous, label);
      this.setProject(nextProject);
    } else {
      this.setProject(nextProject, { touch: false });
    }
    if (!result.ok) {
      this.notify({
        kind: result.reason === 'no-catalog' ? 'warn' : 'info',
        message: 'Randomize found nothing to change',
        detail: describeRandomizeResult(result, this.project.blocks.order.length),
      });
      return;
    }
    const unique = new Set(result.changed.map((id) => this.project.blocks.byId[id]?.imageAssetId));
    this.notify({
      kind: 'success',
      message: `${label}: ${result.changed.length} block${result.changed.length === 1 ? '' : 's'} updated`,
      detail: `${unique.size} distinct image${unique.size === 1 ? '' : 's'}${
        result.skipped.length ? ` · ${result.skipped.length} skipped (locked / empty pool)` : ''
      }`,
    });
  }

  /** Reproduce a stored combination exactly (spec §73). */
  applyReplaySeed(seed: string): void {
    const { project, result } = replayRandomize(this.project, seed);
    this.commitRandomize('Reproduce combination', project, result);
  }

  /* ------------------------------------------------------------------ stacks */

  saveStack(): void {
    const { project, stack } = saveStackLogic(this.project);
    const previous = this.project;
    this.history.push(previous, `Save ${stack.name}`);
    this.setProject(project);
    this.patchUi({ section: 'stacks' });
    this.notify({ kind: 'success', message: `${stack.name} saved`, detail: `${Object.keys(stack.entries).length} block references.` });
  }

  applyStack(stackId: string, options: { silent?: boolean } = {}): void {
    const report = applyStackLogic(this.project, stackId);
    if (!report.stack) return;
    const previous = this.project;
    this.history.push(previous, `Apply ${report.stack.name}`);
    this.setProject(report.project);
    if (options.silent) return;
    const details: string[] = [`${report.applied.length} blocks restored`];
    if (report.unknownBlockIds.length) details.push(`${report.unknownBlockIds.length} entry(ies) from deleted blocks ignored`);
    if (report.missingAssetIds.length) details.push(`${report.missingAssetIds.length} missing file(s) skipped`);
    this.notify({ kind: 'success', message: `${report.stack.name} applied`, detail: details.join(' · ') });
  }

  stepStack(direction: 1 | -1): void {
    const next = stepStackLogic(this.project, this.activeStackId, direction);
    if (!next) {
      this.notify({ kind: 'info', message: 'No stacks saved yet.' });
      return;
    }
    this.applyStack(next, { silent: true });
    const stack = this.project.stacks.find((s) => s.id === next);
    if (stack) this.notify({ kind: 'info', message: `${stack.name} · ${stack.index} / ${this.project.stacks.length}` });
  }

  activeStackId: string | null = null;

  deleteStack(stackId: string): void {
    this.run('Delete stack', (project) => deleteStackLogic(project, stackId));
    if (this.activeStackId === stackId) this.activeStackId = null;
  }

  renameStack(stackId: string, name: string): void {
    this.run('Rename stack', (project) => renameStackLogic(project, stackId, name));
  }

  duplicateStack(stackId: string): void {
    const { project, stack } = duplicateStackLogic(this.project, stackId);
    if (!stack) return;
    const previous = this.project;
    this.history.push(previous, `Duplicate ${stack.name}`);
    this.setProject(project);
  }

  /* -------------------------------------------------------------------- text */

  setTextValue(blockId: BlockId, layer: TextLayerKey, value: string, line?: number): void {
    this.run(`Edit ${layer}`, (project) => setBlockTextLayer(project, blockId, layer, value, line));
  }

  addTextLine(blockId: BlockId, layer: 'items' | 'keywords', after?: number): void {
    this.run(`Add ${layer} line`, (project) => addBlockTextLine(project, blockId, layer, after));
  }

  removeTextLine(blockId: BlockId, layer: 'items' | 'keywords', line: number): void {
    this.run(`Remove ${layer} line`, (project) => removeBlockTextLine(project, blockId, layer, line));
  }

  resetBlockText(blockId: BlockId): void {
    const ok = this.run('Reset block text to template', (project) => resetBlockText(project, blockId));
    if (ok) this.notify({ kind: 'info', message: 'Block follows the global template again.' });
  }

  resetAllText(): void {
    const ok = this.run('Reset all text to template', (project) => resetAllBlockText(project));
    if (ok) this.notify({ kind: 'info', message: 'Every block follows the global template again.' });
  }

  importTemplateText(text: string, mode: 'keep' | 'discard' = 'keep'): boolean {
    const validation = parseTemplateJson(text);
    if (!validation.ok) {
      this.notify({ kind: 'error', message: validation.error.message, detail: validation.error.detail ?? validation.error.hint });
      return false;
    }
    this.run('Import text template', (project) =>
      applyGlobalTemplate(project, validation.template, { discardOverrides: mode === 'discard' }),
    );
    this.notify({
      kind: 'success',
      message: 'Text template imported',
      detail: [
        validation.warnings.join(' '),
        mode === 'discard' ? 'Local overrides were discarded for every block.' : 'Blocks with local edits kept their text.',
      ]
        .filter(Boolean)
        .join(' '),
    });
    return true;
  }

  setTemplate(template: TextTemplate): void {
    this.run('Edit global template', (project) => applyGlobalTemplate(project, template));
  }

  /* -------------------------------------------------------------- typography */

  patchGlobalTypography(layer: TextLayerKey, patch: Partial<TypographySet['layers'][TextLayerKey]>): void {
    this.run('Typography', (project) => ({
      ...project,
      settings: {
        ...project.settings,
        typography: {
          ...project.settings.typography,
          layers: { ...project.settings.typography.layers, [layer]: { ...project.settings.typography.layers[layer], ...patch } },
        },
      },
    }));
  }

  patchGlobalTextStyle(patch: { items?: Partial<TypographySet['items']>; keywords?: Partial<TypographySet['keywords']>; group?: Partial<TypographySet['group']> }): void {
    this.run('Text layout', (project) => ({
      ...project,
      settings: {
        ...project.settings,
        typography: {
          ...project.settings.typography,
          items: { ...project.settings.typography.items, ...(patch.items ?? {}) },
          keywords: { ...project.settings.typography.keywords, ...(patch.keywords ?? {}) },
          group: { ...project.settings.typography.group, ...(patch.group ?? {}) },
        },
      },
    }));
  }

  patchBlockTypography(blockId: BlockId, layer: TextLayerKey, patch: Partial<TypographySet['layers'][TextLayerKey]>): void {
    this.run('Block typography', (project) => patchBlockTypography(project, blockId, layer, patch));
  }

  /* ----------------------------------------------------------------- overlay */

  setGlobalOverlay(patch: Partial<Overlay>): void {
    this.run('Global overlay', (project) => ({
      ...project,
      settings: { ...project.settings, globalOverlay: { ...project.settings.globalOverlay, ...patch } },
    }));
  }

  setBlockOverlay(blockId: BlockId, overlay: Overlay | null): void {
    this.run('Block overlay', (project) => setBlockOverlay(project, blockId, overlay));
  }

  patchBlockOverlay(blockId: BlockId, patch: Partial<Overlay>): void {
    this.run('Block overlay', (project) => patchBlockOverlay(project, blockId, patch));
  }

  /* ----------------------------------------------------------------- preview */

  openPreview(fromIndex?: number): void {
    const index = fromIndex ?? Math.max(0, this.project.blocks.order.indexOf(this.ui.selectedBlockId ?? ''));
    const preview = this.project.preview;
    this.patchUi({
      mode: 'preview',
      previewIndex: index,
      previewPlaying: preview.autoplay && preview.navigation !== 'manual',
    });
  }

  closePreview(): void {
    this.patchUi({ mode: 'edit', previewPlaying: false });
  }

  previewStep(direction: 1 | -1): void {
    const total = this.project.blocks.order.length;
    if (!total) return;
    const current = this.ui.previewIndex;
    let next = current + direction;
    if (next < 0) next = this.project.preview.loop ? total - 1 : 0;
    if (next > total - 1) next = this.project.preview.loop ? 0 : total - 1;
    if (next === current) return;
    this.patchUi({ previewIndex: next, previewDirection: direction });
  }

  previewGoTo(index: number): void {
    const total = this.project.blocks.order.length;
    if (!total) return;
    const next = Math.max(0, Math.min(total - 1, index));
    this.patchUi({
      previewIndex: next,
      previewDirection: next >= this.ui.previewIndex ? 1 : -1,
    });
  }

  setPreviewPlaying(playing: boolean): void {
    this.patchUi({ previewPlaying: playing });
  }

  updatePreview(patch: Partial<PreviewSettings>): void {
    this.run('Preview settings', (project) => ({ ...project, preview: { ...project.preview, ...patch } }));
  }

  /** Dice inside preview → a normal project operation that lands in history (spec §60, §92). */
  randomizePreviewCurrent(): void {
    const blockId = this.project.blocks.order[this.ui.previewIndex];
    if (!blockId) return;
    this.randomizeBlock(blockId, true);
  }

  randomizeCurrentOrSelected(): void {
    const blockId = this.project.blocks.order[this.ui.previewIndex];
    const target = blockId ?? this.ui.selectedBlockId;
    if (!target) return;
    this.randomizeBlock(target, true);
  }

  /* -------------------------------------------------------------------- ui */

  setSection(section: SidebarSection): void {
    this.patchUi({ section, inspectorOpen: !this.ui.sidebarCollapsed ? true : this.ui.inspectorOpen });
  }

  toggleSidebar(): void {
    this.patchUi({ sidebarCollapsed: !this.ui.sidebarCollapsed });
  }

  setSearch(search: string): void {
    this.patchUi({ search });
  }

  setEditing(editing: ProjectState['ui']['editing']): void {
    this.patchUi({ editing });
  }

  setProjectName(name: string): void {
    this.run('Rename project', (project) => ({ ...project, meta: { ...project.meta, name } }));
  }

  updateSettings(patch: Partial<Project['settings']>): void {
    this.run('Project settings', (project) => ({ ...project, settings: { ...project.settings, ...patch } }));
    if (patch.thumbnailBudgetMB) this.images.setBudgetMB(patch.thumbnailBudgetMB);
    if (patch.historyLimit) this.history.setLimit(patch.historyLimit);
  }

  setGlobalBlockDefaults(patch: Partial<Project['settings']['blockDefaults']>): void {
    this.run('Block defaults', (project) => ({
      ...project,
      settings: { ...project.settings, blockDefaults: { ...project.settings.blockDefaults, ...patch } },
    }));
  }

  copyTextToAllBlocks(blockId: BlockId): void {
    const ok = this.run('Copy text to all blocks', (project) => copyTextToAllBlocksLogic(project, blockId));
    if (ok) this.notify({ kind: 'success', message: 'Text copied to every block' });
  }

  /** Global template editing (the single imported JSON, spec §16–19). */
  setTemplateLayer(layer: TextLayerKey, value: string, line?: number): void {
    this.run(`Template ${layer}`, (project) => {
      const template = { ...project.template };
      if (layer === 'title' || layer === 'subtitle') {
        template[layer] = value;
      } else {
        const list = [...template[layer]];
        if (line === undefined || line < 0) list.push(value);
        else list[line] = value;
        template[layer] = list;
      }
      return { ...project, template, meta: { ...project.meta, updatedAt: Date.now() } };
    });
  }

  addTemplateLine(layer: 'items' | 'keywords'): void {
    this.run(`Template ${layer} line`, (project) => ({
      ...project,
      template: { ...project.template, [layer]: [...project.template[layer], ''] },
    }));
  }

  removeTemplateLine(layer: 'items' | 'keywords', line: number): void {
    this.run(`Template ${layer} line`, (project) => {
      const list = [...project.template[layer]];
      list.splice(line, 1);
      return { ...project, template: { ...project.template, [layer]: list } };
    });
  }

  /** Assign a catalog image to a block (used by the image browser and favorites lists). */
  assignImage(blockId: BlockId, assetId: AssetId): void {
    const ok = this.run('Assign image', (project) => setBlockImage(project, blockId, assetId));
    if (ok) this.notify({ kind: 'success', message: 'Image assigned to the block' });
  }

  assignImageToSelected(assetId: AssetId): void {
    const blockId = this.ui.selectedBlockId ?? this.project.blocks.order[0];
    if (!blockId) {
      this.notify({ kind: 'warn', message: 'Create a block first.' });
      return;
    }
    this.assignImage(blockId, assetId);
  }

  /* ----------------------------------------------------------------- history */

  undo(): void {
    const result = this.history.undo(this.project);
    if (!result) {
      this.notify({ kind: 'info', message: 'Nothing to undo.' });
      return;
    }
    this.setProject(result.project);
    this.syncSelection();
    this.notify({ kind: 'info', message: `Undo · ${result.label}` });
  }

  redo(): void {
    const result = this.history.redo(this.project);
    if (!result) {
      this.notify({ kind: 'info', message: 'Nothing to redo.' });
      return;
    }
    this.setProject(result.project);
    this.syncSelection();
    this.notify({ kind: 'info', message: `Redo · ${result.label}` });
  }

  private syncSelection(): void {
    const { order } = this.project.blocks;
    if (!order.includes(this.ui.selectedBlockId ?? '')) {
      this.patchUi({ selectedBlockId: order[0] ?? null, editing: null });
    }
  }

  /* ----------------------------------------------------------------- project */

  newProject(name = 'Untitled preview'): void {
    this.history.reset();
    const project = createEmptyProject(name);
    this.refIndex = buildRefIndex(project);
    this.store.setState((prev) => ({ ...prev, project, ui: { ...prev.ui, saveStatus: 'clean', selectedBlockId: null, editing: null } }));
    void this.autosave.clear();
    this.notify({ kind: 'info', message: 'New project created.' });
  }

  exportProjectJson(): string {
    return projectToJson(this.project, true);
  }

  async saveProject(): Promise<void> {
    const json = this.exportProjectJson();
    const fileName = projectFileName(this.project);
    try {
      if (this.adapter.kind === 'electron') {
        const path = await (this.adapter as ElectronFileSystemAdapter).saveProjectDialog(fileName, json);
        if (!path) return;
        this.patchUi({ saveStatus: 'saved' });
        this.notify({ kind: 'success', message: 'Project saved', detail: path });
        return;
      }
      downloadTextFile(fileName, json);
      this.patchUi({ saveStatus: 'saved' });
      this.notify({ kind: 'success', message: `Project exported as ${fileName}`, detail: 'Images are not included — only references and metadata.' });
    } catch (err) {
      this.fail(err, 'Project could not be saved.');
    }
  }

  async openProject(): Promise<void> {
    try {
      if (this.adapter.kind === 'electron') {
        const result = await (this.adapter as ElectronFileSystemAdapter).openProjectDialog();
        if (!result) return;
        this.applyLoadedProject(result.content, result.path);
        return;
      }
      const text = await pickTextFile();
      if (text === null) return;
      this.applyLoadedProject(text, 'file');
    } catch (err) {
      this.fail(err, 'Project could not be loaded.', 'invalid-project');
    }
  }

  applyLoadedProject(text: string, sourceLabel: string): void {
    try {
      const report = loadProjectFromText(text);
      this.history.reset();
      this.refIndex = buildRefIndex(report.project);
      this.store.setState((prev) => ({
        ...prev,
        project: report.project,
        ui: {
          ...prev.ui,
          saveStatus: 'dirty',
          selectedBlockId: report.project.blocks.order[0] ?? null,
          editing: null,
        },
      }));
      this.notify({
        kind: 'success',
        message: `Project loaded from ${sourceLabel}`,
        detail: [
          `${report.project.blocks.order.length} blocks`,
          `${report.project.assets.length} assets`,
          `${report.project.stacks.length} stacks`,
          report.warnings.length ? `${report.warnings.length} warning(s): ${report.warnings.slice(0, 2).join(' ')}` : null,
          report.missingAssetIds.length ? `${report.missingAssetIds.length} missing reference(s) — relink the folder.` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      });
      // restore handles of previously dropped external files (browser)
      if (this.adapter.kind === 'browser') {
        void (this.adapter as BrowserFileSystemAdapter).restoreManualHandles();
      }
    } catch (err) {
      this.fail(err, 'Project could not be loaded.', 'invalid-project');
    }
  }

  /* ------------------------------------------------------------------ images */

  refFor(assetId: AssetId): StoredRef | null {
    const direct = this.refIndex.get(assetId);
    if (direct) return direct;
    const asset = assetIndex(this.project).get(assetId);
    if (!asset) return null;
    const ref = refForAsset(asset);
    this.refIndex.set(assetId, ref);
    return ref;
  }

  async resolveImage(assetId: AssetId | null | undefined, maxEdge: number): Promise<ImageSource> {
    if (!assetId) return { url: '' };
    const asset = assetIndex(this.project).get(assetId);
    if (!asset) return { url: '', unsupported: true, note: 'Asset is not part of this project.' };
    try {
      return await this.images.resolve(asset, maxEdge, this.refFor(assetId));
    } catch (err) {
      this.notify({
        kind: 'error',
        message: `Image “${asset.name}” could not be read`,
        detail: err instanceof Error ? err.message : String(err),
      });
      return { url: '', unsupported: true, note: 'Read error' };
    }
  }

  prefetchImage(assetId: AssetId | null | undefined, maxEdge: number): void {
    if (!assetId) return;
    const asset = assetIndex(this.project).get(assetId);
    if (!asset) return;
    this.images.prefetch(asset, maxEdge, this.refFor(assetId));
  }

  imageStats() {
    return this.images.stats();
  }

  /* --------------------------------------------------------------- hotkeys */

  installHotkeys(target: Window = window): () => void {
    const handler = (event: KeyboardEvent) => {
      const editing = this.ui.editing !== null;
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;

      if (mod && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        this.undo();
        return;
      }
      if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) {
        event.preventDefault();
        this.redo();
        return;
      }
      if (mod && key === 's') {
        event.preventDefault();
        void this.saveProject();
        return;
      }
      if (mod && key === 'o') {
        event.preventDefault();
        void this.openProject();
        return;
      }
      if (key === 'escape') {
        if (editing) {
          this.setEditing(null);
          return;
        }
        if (this.ui.mode === 'preview') {
          event.preventDefault();
          this.closePreview();
        }
        return;
      }
      if (this.ui.mode === 'preview') {
        if (key === 'arrowdown' || key === 'arrowright' || key === ' ') {
          event.preventDefault();
          this.previewStep(1);
        } else if (key === 'arrowup' || key === 'arrowleft') {
          event.preventDefault();
          this.previewStep(-1);
        } else if (key === 'r') {
          this.randomizePreviewCurrent();
        }
        return;
      }
      if (mod && key === 'b') {
        event.preventDefault();
        this.addBlock();
      }
    };
    target.addEventListener('keydown', handler);
    return () => target.removeEventListener('keydown', handler);
  }
}

/* ------------------------------------------------------------------ helpers */

function refKeyToAssetId(ref: StoredRef): AssetId {
  return `asset_${stableAssetId(ref.path || ref.key).slice(6)}`;
}

function pickAdapter(): FileSystemAdapter {
  if (typeof window !== 'undefined' && window.__shotComposer?.fs) {
    const electron = new ElectronFileSystemAdapter();
    if (electron.isAvailable()) return electron;
  }
  return new BrowserFileSystemAdapter();
}

function downloadTextFile(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function pickTextFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.oncancel = () => {
      document.body.removeChild(input);
      resolve(null);
    };
    input.click();
  });
}

/** Singleton used by the React tree. */
let controllerRef: AppController | null = null;

export function getController(): AppController {
  if (!controllerRef) controllerRef = new AppController();
  return controllerRef;
}

export function createAppController(options: ControllerOptions = {}): AppController {
  const controller = new AppController(options);
  controllerRef = controller;
  return controller;
}

export type { ImageSource, StoredRef };
