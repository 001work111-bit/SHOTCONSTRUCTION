import { beforeEach, describe, expect, it } from 'vitest';
import { AppController } from '../core/controller';
import type { ScanOutcome } from '../filesystem/adapter';
import type { FileSystemAdapter, StoredRef } from '../filesystem/adapter';
import { fileToAsset, type ScanResult, type ScannedFile, type ScannedFolder } from '../core/assets';

/**
 * End-to-end walk through the scenario of the brief (§106) using the real controller,
 * the real reducer modules and a stub file-system adapter.
 */

const FOLDERS: Record<string, number> = { Auto: 5, Electronics: 4, Medicine: 3, Chemistry: 4, Construction: 3 };

function fakeScan(): ScanOutcome {
  const folders: ScannedFolder[] = [];
  const refs: StoredRef[] = [];
  let total = 0;
  for (const [name, count] of Object.entries(FOLDERS)) {
    const files: ScannedFile[] = [];
    for (let i = 1; i <= count; i += 1) {
      const file = `${name}/${String(i).padStart(3, '0')}.jpg`;
      files.push({
        name: `${String(i).padStart(3, '0')}.jpg`,
        path: file,
        format: 'jpg',
        mime: 'image/jpeg',
        bytes: 2048 + i,
        refKey: `f:${file}`,
        supported: true,
      });
      refs.push({ kind: 'file', key: `f:${file}`, name: `${i}.jpg`, path: file, mime: 'image/jpeg', bytes: 2048 + i });
      total += 1;
    }
    folders.push({ path: name, name, files });
  }
  const root = { id: 'root_stub', name: 'Stub', label: 'Stub catalog', token: 'stub' };
  return {
    rootName: 'Stub',
    rootLabel: 'Stub catalog',
    folders,
    rootFiles: [],
    unsupported: 0,
    totalFiles: total,
    root,
    refs,
  };
}

class StubAdapter implements FileSystemAdapter {
  kind = 'browser' as const;
  capabilities = {
    directoryPicker: true,
    absolutePaths: false,
    persistedHandles: true,
    rescan: true,
    nativePaths: false,
    nativeDecoders: false,
  };
  isAvailable() {
    return true;
  }
  async pickDirectory(): Promise<ScanOutcome | null> {
    return fakeScan();
  }
  async registerBundledFiles(): Promise<ScanOutcome> {
    return fakeScan();
  }
  async rescan(): Promise<ScanOutcome | null> {
    return fakeScan();
  }
  async restoreLastRoot() {
    return null;
  }
  async requestAccess() {
    return true;
  }
  async openBlob() {
    return null;
  }
  async importDropped(files: File[]) {
    return files.map((file) => ({
      ref: { kind: 'manual' as const, key: `m:${file.name}`, name: file.name, path: file.name },
      name: file.name,
      path: file.name,
      format: 'jpg' as const,
      mime: 'image/jpeg',
      bytes: file.size,
      supported: true,
    }));
  }
  pathLabel(ref: StoredRef | null, fallback = '') {
    return ref?.path ?? fallback;
  }
  async persistRefs() {}
  async forgetRefs() {}
  describe() {
    return 'stub adapter';
  }
}

let controller: AppController;

beforeEach(() => {
  controller = new AppController({ adapter: new StubAdapter(), autoBootstrap: false });
});

describe('scenario: catalog → blocks → randomize → lock → favorites → stacks → undo → save/load', () => {
  it('walks the whole flow', async () => {
    // 1–6: load the catalog, folders are detected and grouped
    await controller.loadDemoCatalog();
    expect(controller.project.folders.length).toBe(5);
    const folderNames = controller.project.folders.map((f) => f.name);
    expect(folderNames).toEqual(['Auto', 'Chemistry', 'Construction', 'Electronics', 'Medicine']);
    expect(controller.project.assets.length).toBe(19);

    // blocks were created automatically on first catalog load
    expect(controller.project.blocks.order.length).toBe(6);

    // 7: choose folders for block 01 (only the Auto folder)
    const autoFolder = controller.project.folders.find((f) => f.name === 'Auto')!;
    const block1 = controller.project.blocks.order[0];
    let historyBefore = controller.history.depth;
    controller.setBlockFolders(block1, [autoFolder.id]);
    expect(controller.history.depth).toBe(historyBefore + 1);

    // 8: randomize block 01 → only Auto images
    controller.randomizeBlock(block1, true);
    const block1Asset = controller.project.assets.find((a) => a.id === controller.project.blocks.byId[block1].imageAssetId);
    expect(block1Asset?.folderId).toBe(autoFolder.id);

    // 9–12: Randomize all, then lock block 02 and verify it is skipped
    controller.randomizeAll();
    const block2 = controller.project.blocks.order[1];
    controller.toggleLock(block2);
    const lockedImage = controller.project.blocks.byId[block2].imageAssetId;
    const historyDepthBeforeBulk = controller.history.depth;
    controller.randomizeAll();
    expect(controller.project.blocks.byId[block2].imageAssetId).toBe(lockedImage);
    expect(controller.history.depth).toBe(historyDepthBeforeBulk + 1); // bulk = one entry

    // 13–17: favorites for block 01, then randomize inside favorites only
    controller.selectBlock(block1);
    controller.addCurrentToFavorites(block1);
    const currentId = controller.project.blocks.byId[block1].imageAssetId as string;
    const autoAssets = controller.project.assets.filter((a) => a.folderId === autoFolder.id).map((a) => a.id);
    const others = autoAssets.filter((id) => id !== currentId).slice(0, 2);
    expect(others.length).toBe(2);
    others.forEach((id) => controller.toggleFavorite(block1, id));
    expect(controller.project.favorites[block1].length).toBe(3);
    // the same picture is a favorite for block 01 and not for block 02 (per-block scoping)
    expect(controller.project.favorites[controller.project.blocks.order[1]]).toBeUndefined();

    controller.setUseFavorites(block1, true);
    for (let i = 0; i < 5; i += 1) controller.randomizeBlock(block1, true);
    const finalImage = controller.project.blocks.byId[block1].imageAssetId as string;
    expect(controller.project.favorites[block1]).toContain(finalImage);

    // 18–22: two stacks, switch back, images restored, everything else untouched
    controller.setBlockOverlay(block1, { enabled: true, color: '#123456', opacity: 0.7 });
    controller.saveStack();
    const stack1 = controller.project.stacks[0];
    const snapshot1 = stack1.entries[block1].assetId;

    controller.randomizeAll();
    controller.saveStack();
    const stack2 = controller.project.stacks[1];
    expect(controller.project.stacks.length).toBe(2);

    controller.applyStack(stack1.id);
    expect(controller.project.blocks.byId[block1].imageAssetId).toBe(snapshot1);
    expect(controller.project.blocks.byId[block1].overlayOverride?.color).toBe('#123456');
    expect(controller.project.blocks.byId[block2].locked).toBe(true);

    controller.applyStack(stack2.id);
    expect(controller.project.blocks.byId[block1].imageAssetId).toBe(stack2.entries[block1].assetId);

    // 23–27: inline text edit is local, undo restores it, redo re-applies it
    controller.setTextValue(block1, 'title', 'Только первый блок');
    const block2TitleBefore = controller.project.blocks.byId[block2].textOverride;
    expect(controller.project.blocks.byId[block1].textOverride?.title).toBe('Только первый блок');
    expect(controller.project.blocks.byId[block2].textOverride).toBe(block2TitleBefore);

    controller.undo();
    expect(controller.project.blocks.byId[block1].textOverride?.title).not.toBe('Только первый блок');
    controller.redo();
    expect(controller.project.blocks.byId[block1].textOverride?.title).toBe('Только первый блок');

    // 28–31: preview navigation does not touch editor state
    const imagesBefore = controller.project.blocks.order.map((id) => controller.project.blocks.byId[id].imageAssetId);
    controller.openPreview();
    expect(controller.ui.mode).toBe('preview');
    controller.previewStep(1);
    controller.previewStep(1);
    expect(controller.ui.previewIndex).toBe(2);
    controller.randomizePreviewCurrent();
    expect(controller.project.blocks.order.map((id) => controller.project.blocks.byId[id].imageAssetId)).not.toEqual(imagesBefore);
    controller.undo();
    expect(controller.project.blocks.order.map((id) => controller.project.blocks.byId[id].imageAssetId)).toEqual(imagesBefore);
    controller.closePreview();
    expect(controller.ui.mode).toBe('edit');

    // 32: dropped external image becomes a manual asset and is used by the block
    const dropped = await controller.importDroppedFiles([new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' })]);
    expect(dropped.length).toBe(1);
    expect(controller.project.assets.some((a) => a.source === 'manual')).toBe(true);
    controller.assignImage(block1, dropped[0].id);
    expect(controller.project.blocks.byId[block1].imageAssetId).toBe(dropped[0].id);
    expect(controller.project.blocks.byId[block1].imageAssetId).toBe(controller.project.assets.find((a) => a.source === 'manual')!.id);

    // 33–35: export and reload the project — state is restored
    const json = controller.exportProjectJson();
    const fresh = new AppController({ adapter: new StubAdapter(), autoBootstrap: false });
    fresh.applyLoadedProject(json, 'test');
    expect(fresh.project.blocks.order).toEqual(controller.project.blocks.order);
    expect(fresh.project.stacks.length).toBe(2);
    expect(fresh.project.favorites[block1]?.length).toBe(controller.project.favorites[block1].length);
    expect(fresh.project.blocks.byId[block1].textOverride?.title).toBe('Только первый блок');
    expect(fresh.project.blocks.byId[block2].locked).toBe(true);
    expect(fresh.project.template.title).toBe('Авто');
  });
});

describe('error handling', () => {
  it('reports an empty pool instead of throwing when a block has no usable folder', () => {
    const project = controller.project;
    expect(project.blocks.order.length).toBe(0);
    controller.randomizeAll();
    const toasts = controller.ui.toasts;
    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts[toasts.length - 1].message).toMatch(/nothing to change/i);
  });

  it('rejects a corrupt project file with a typed error and keeps the current project', async () => {
    await controller.loadDemoCatalog();
    const before = controller.project.blocks.order.length;
    controller.applyLoadedProject('{ this is not json', 'test');
    expect(controller.project.blocks.order.length).toBe(before);
    expect(controller.ui.toasts.some((t) => t.kind === 'error')).toBe(true);
  });

  it('rejects an invalid text template without breaking the project', () => {
    const before = controller.project.template.title;
    const ok = controller.importTemplateText('{ "nope": 1 }');
    expect(ok).toBe(false);
    expect(controller.project.template.title).toBe(before);
  });

  it('ignores stack entries of deleted blocks', async () => {
    await controller.loadDemoCatalog();
    controller.randomizeAll();
    controller.saveStack();
    const stack = controller.project.stacks[0];
    const removed = controller.project.blocks.order[2];
    controller.deleteBlock(removed);
    controller.applyStack(stack.id);
    expect(controller.project.blocks.order).not.toContain(removed);
    expect(controller.project.blocks.order.length).toBe(5);
  });
});

describe('helpers', () => {
  it('maps scanned files to stable asset ids', () => {
    const asset = fileToAsset(
      { name: '001.jpg', path: 'Auto/001.jpg', format: 'jpg', mime: 'image/jpeg', bytes: 10, refKey: 'f:Auto/001.jpg', supported: true },
      'folder_x',
    );
    expect(asset.id.startsWith('asset_')).toBe(true);
    expect(asset.folderId).toBe('folder_x');
  });
});
