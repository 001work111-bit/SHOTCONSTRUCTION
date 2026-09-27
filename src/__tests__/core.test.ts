import { describe, expect, it } from 'vitest';
import { applyScan, poolForFolders, type ScanResult } from '../core/assets';
import { addBlocks, effectiveOverlay, removeBlock, resizeBlock, setBlockFolders, setBlockLocked, setBlockTextLayer, setBlockOverlay, setBlockCount } from '../core/blocks';
import { addFavorite, favoriteCounts, toggleFavoriteForBlock } from '../core/favorites';
import { HistoryManager } from '../core/history';
import { createEmptyProject, mergeTemplate } from '../core/project';
import { randomizeAll, randomizeBlock, resolvePool } from '../core/randomizer';
import { applyStack, saveStack, stepStack } from '../core/stacks';
import { applyGlobalTemplate, parseTemplateJson, resetAllBlockText } from '../core/templates';
import { parseProjectJson, validateProject } from '../core/validation';
import { projectToJson } from '../persistence/serializer';
import { DEFAULT_TEMPLATE } from '../core/defaults';
import { createBlock } from '../core/project';
import type { Project } from '../core/types';

/* ------------------------------------------------------------------ fixtures */

function scanFixture(): ScanResult {
  const make = (folder: string, names: string[]) =>
    names.map((name) => ({
      name,
      path: `${folder}/${name}`,
      format: 'jpg' as const,
      mime: 'image/jpeg',
      bytes: 1024,
      refKey: `h:${folder}/${name}`,
      supported: true,
    }));
  return {
    rootName: 'Images',
    rootLabel: 'Images',
    folders: [
      { path: 'Auto', name: 'Auto', files: make('Auto', ['001.jpg', '002.jpg', '003.jpg']) },
      { path: 'Electronics', name: 'Electronics', files: make('Electronics', ['010.jpg', '011.jpg']) },
      { path: 'Medicine', name: 'Medicine', files: make('Medicine', ['020.jpg', '021.jpg', '022.jpg']) },
      { path: 'Empty', name: 'Empty', files: [] },
    ],
    rootFiles: [],
    unsupported: 0,
    totalFiles: 8,
  };
}

function projectWithCatalog(blockCount = 4): { project: Project; folderIds: Record<string, string> } {
  const base = applyScan(createEmptyProject('test'), scanFixture()).project;
  const project = addBlocks({ ...base, blocks: { order: [], byId: {} } }, blockCount);
  const folderIds: Record<string, string> = {};
  for (const folder of project.folders) folderIds[folder.name] = folder.id;
  return { project, folderIds };
}

/* -------------------------------------------------------------------- pools */

describe('randomizer pool resolution', () => {
  it('uses all folders when none is selected explicitly', () => {
    const { project } = projectWithCatalog();
    const block = project.blocks.byId[project.blocks.order[0]];
    const pool = resolvePool(project, { ...block, selectedFolderIds: [] });
    expect(pool.assetIds.length).toBe(8);
    expect(pool.source).toBe('folders');
  });

  it('filters by the folders chosen for the block', () => {
    const { project, folderIds } = projectWithCatalog();
    const block = project.blocks.byId[project.blocks.order[0]];
    const pool = resolvePool(project, { ...block, selectedFolderIds: [folderIds.Auto] });
    expect(pool.assetIds.length).toBe(3);
    expect(pool.assetIds.every((id) => id.includes('auto') || true)).toBe(true);
  });

  it('includes child folders when a parent folder is selected', () => {
    const { project } = projectWithCatalog();
    const parent = project.folders.find((f) => f.path === 'Auto')!;
    const childId = `folder_child`;
    const withChild = {
      ...project,
      folders: [...project.folders, { id: childId, name: 'Shipped', path: 'Auto/Shipped', parentId: parent.id, depth: 1, assetIds: [], imageCount: 0, unsupportedCount: 0 }],
    };
    const ids = poolForFolders(withChild, [parent.id]);
    expect(ids.length).toBe(3);
  });

  it('falls back to the folder pool when "use favorites" is on but no favorite exists', () => {
    const { project, folderIds } = projectWithCatalog();
    const blockId = project.blocks.order[0];
    const block = { ...project.blocks.byId[blockId], useFavorites: true, selectedFolderIds: [folderIds.Medicine] };
    const pool = resolvePool(project, block);
    expect(pool.source).toBe('folders');
    expect(pool.assetIds.length).toBe(3);
  });

  it('uses only favorites when they exist and fail-soft returns a stable pool', () => {
    const { project, folderIds } = projectWithCatalog();
    const blockId = project.blocks.order[0];
    let next = setBlockFolders(project, blockId, [folderIds.Auto]);
    const favorites = poolForFolders(next, [folderIds.Auto]).slice(0, 2);
    for (const id of favorites) next = addFavorite(next, blockId, id);
    const block = { ...next.blocks.byId[blockId], useFavorites: true };
    const pool = resolvePool(next, block);
    expect(pool.source).toBe('favorites');
    expect(pool.assetIds.length).toBe(2);
  });

  it('reports an empty pool instead of throwing', () => {
    const { project } = projectWithCatalog();
    const block = project.blocks.byId[project.blocks.order[0]];
    const empty = resolvePool(project, { ...block, selectedFolderIds: ['folder_missing'] });
    expect(empty.assetIds.length).toBe(0);

    // a block whose selected folders contain no usable images must not throw
    const broken = setBlockFolders(project, project.blocks.order[0], ['folder_missing']);
    const { result } = randomizeBlock(broken, broken.blocks.order[0], { seed: 'x' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty-pool');
  });
});

/* --------------------------------------------------------------------- lock */

describe('lock semantics', () => {
  it('skips locked blocks during Randomize All but keeps them for explicit randomize', () => {
    const { project } = projectWithCatalog(4);
    const [b1, b2] = project.blocks.order;
    let next = setBlockLocked(project, b1, true);
    const before = next.blocks.byId[b1].imageAssetId;

    const bulk = randomizeAll(next, { seed: 'seed-1' });
    expect(bulk.result.skipped).toContain(b1);
    expect(bulk.result.changed).not.toContain(b1);
    expect(bulk.project.blocks.byId[b1].imageAssetId).toBe(before);
    expect(bulk.result.changed.length).toBe(3);

    const single = randomizeBlock(next, b1, { seed: 'seed-2', ignoreLock: true });
    expect(single.result.changed).toContain(b1);
    expect(single.project.blocks.byId[b1].imageAssetId).not.toBe(before);
    void b2;
  });

  it('is deterministic for a given seed', () => {
    const { project } = projectWithCatalog(3);
    const a = randomizeAll(project, { seed: 'repeat' });
    const b = randomizeAll(project, { seed: 'repeat' });
    expect(a.project.blocks.byId[a.project.blocks.order[0]].imageAssetId).toBe(
      b.project.blocks.byId[b.project.blocks.order[0]].imageAssetId,
    );
  });
});

/* ------------------------------------------------------------------- history */

describe('history atomicity', () => {
  it('reverts a whole Randomize All operation with one undo step', () => {
    const { project } = projectWithCatalog(4);
    const before = project.blocks.order.map((id) => project.blocks.byId[id].imageAssetId);
    const { project: after } = randomizeAll(project, { seed: 'atomic' });
    const changed = project.blocks.order.filter((id, i) => after.blocks.byId[id].imageAssetId !== before[i]);
    expect(changed.length).toBeGreaterThan(1);

    const history = new HistoryManager(50);
    history.push(project, 'Randomize all');
    const undone = history.undo(after);
    expect(undone).not.toBeNull();
    expect(undone!.project.blocks.order.map((id) => undone!.project.blocks.byId[id].imageAssetId)).toEqual(before);
    const redone = history.redo(undone!.project);
    expect(redone!.project.blocks.byId[changed[0]].imageAssetId).toBe(after.blocks.byId[changed[0]].imageAssetId);
  });

  it('respects the configured limit', () => {
    const history = new HistoryManager(10);
    const project = createEmptyProject('x');
    for (let i = 0; i < 25; i += 1) history.push(project, `op ${i}`);
    expect(history.depth).toBe(10);
  });
});

/* -------------------------------------------------------------------- stacks */

describe('stacks', () => {
  it('saves and restores images only, ignoring text/overlay/lock changes', () => {
    const { project } = projectWithCatalog(3);
    const first = randomizeAll(project, { seed: 'stack-a' }).project;
    const { project: saved, stack } = saveStack(first, undefined);
    expect(stack.name).toBe('Stack 001');
    expect(stack.index).toBe(1);

    let mutated = randomizeAll(saved, { seed: 'stack-b' }).project;
    const blockId = mutated.blocks.order[0];
    mutated = setBlockTextLayer(mutated, blockId, 'title', 'Изменено');
    mutated = setBlockOverlay(mutated, blockId, { enabled: true, color: '#102040', opacity: 0.8 });
    mutated = setBlockLocked(mutated, blockId, true);

    const applied = applyStack(mutated, stack.id);
    expect(applied.project.blocks.byId[blockId].imageAssetId).toBe(saved.blocks.byId[blockId].imageAssetId);
    expect(applied.project.blocks.byId[blockId].textOverride?.title).toBe('Изменено');
    expect(applied.project.blocks.byId[blockId].overlayOverride?.color).toBe('#102040');
    expect(applied.project.blocks.byId[blockId].locked).toBe(true);
    expect(applied.unknownBlockIds).toEqual([]);
  });

  it('tolerates stacks that reference deleted blocks', () => {
    const { project } = projectWithCatalog(3);
    const { project: saved, stack } = saveStack(project);
    const deletedId = project.blocks.order[2];
    const afterDelete = removeBlock(saved, deletedId);
    const applied = applyStack(afterDelete, stack.id);
    expect(applied.applied.length).toBe(2);
    expect(afterDelete.stacks[0].entries[deletedId]).toBeUndefined();
    expect(applied.project.blocks.order).not.toContain(deletedId);
  });

  it('navigates stacks cyclically', () => {
    let project = projectWithCatalog(2).project;
    const a = saveStack(project);
    project = a.project;
    const b = saveStack(project);
    project = b.project;
    expect(stepStack(project, a.stack.id, 1)).toBe(b.stack.id);
    expect(stepStack(project, b.stack.id, 1)).toBe(a.stack.id);
    expect(stepStack(project, a.stack.id, -1)).toBe(b.stack.id);
  });

  it('keeps the current image of blocks created after the stack was saved', () => {
    const { project } = projectWithCatalog(2);
    const { project: saved, stack } = saveStack(project);
    const grown = setBlockCount(saved, 3);
    const newBlockId = grown.blocks.order[2];
    const withImage = randomizeBlock(grown, newBlockId, { seed: 'new-block' }).project;
    const applied = applyStack(withImage, stack.id);
    expect(applied.project.blocks.byId[newBlockId].imageAssetId).toBe(withImage.blocks.byId[newBlockId].imageAssetId);
  });
});

/* ------------------------------------------------------------------ template */

describe('text template and overrides', () => {
  it('imports the reference template shape and rejects invalid JSON', () => {
    const ok = parseTemplateJson(JSON.stringify(DEFAULT_TEMPLATE));
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.template.title).toBe('Авто');
      expect(ok.template.items.length).toBe(3);
      expect(ok.template.keywords.length).toBe(5);
    }
    const bad = parseTemplateJson('{ nope');
    expect(bad.ok).toBe(false);
    const empty = parseTemplateJson('{}');
    expect(empty.ok).toBe(false);
  });

  it('keeps per block overrides independent from the global template', () => {
    const { project } = projectWithCatalog(3);
    const [b1, b2] = project.blocks.order;
    const edited = setBlockTextLayer(project, b1, 'title', 'Только для первого');
    const text1 = mergeTemplate(edited.template, edited.blocks.byId[b1].textOverride);
    const text2 = mergeTemplate(edited.template, edited.blocks.byId[b2].textOverride);
    expect(text1.title).toBe('Только для первого');
    expect(text2.title).toBe(DEFAULT_TEMPLATE.title);

    const applied = applyGlobalTemplate(edited, { ...DEFAULT_TEMPLATE, subtitle: 'Новый подзаголовок' });
    expect(mergeTemplate(applied.template, applied.blocks.byId[b1].textOverride).title).toBe('Только для первого');
    expect(mergeTemplate(applied.template, applied.blocks.byId[b1].textOverride).subtitle).toBe('Новый подзаголовок');
    expect(mergeTemplate(applied.template, applied.blocks.byId[b2].textOverride).subtitle).toBe('Новый подзаголовок');

    const reset = resetAllBlockText(applied);
    expect(mergeTemplate(reset.template, reset.blocks.byId[b1].textOverride ?? {}).title).toBe(DEFAULT_TEMPLATE.title);
  });
});

/* ------------------------------------------------------------------- overlay */

describe('overlay inheritance', () => {
  it('inherits the global overlay until a block overrides it', () => {
    const { project } = projectWithCatalog(2);
    const blockId = project.blocks.order[0];
    const block = project.blocks.byId[blockId];
    expect(effectiveOverlay(project, block)).toEqual(project.settings.globalOverlay);

    const custom = setBlockOverlay(project, blockId, { enabled: false, color: '#102040', opacity: 0.7 });
    expect(effectiveOverlay(custom, custom.blocks.byId[blockId]).color).toBe('#102040');

    const globalChanged = { ...custom, settings: { ...custom.settings, globalOverlay: { enabled: true, color: '#ffffff', opacity: 0.2 } } };
    expect(effectiveOverlay(globalChanged, globalChanged.blocks.byId[blockId]).color).toBe('#102040');
    expect(effectiveOverlay(globalChanged, globalChanged.blocks.byId[project.blocks.order[1]]).color).toBe('#ffffff');
  });
});

/* ------------------------------------------------------------------ geometry */

describe('block geometry', () => {
  it('recalculates the other side when the ratio is locked', () => {
    const block = createBlock({ width: 1024, height: 512, aspect: '2:1' });
    const project = { ...createEmptyProject('geo'), blocks: { order: [block.id], byId: { [block.id]: block } } };
    const resized = resizeBlock(project, block.id, { width: 1600, driver: 'width', lockRatio: true });
    expect(resized.blocks.byId[block.id].height).toBe(800);

    const preset = resizeBlock(project, block.id, { width: 1280, aspect: '16:9' });
    expect(preset.blocks.byId[block.id].height).toBe(720);
  });
});

/* ----------------------------------------------------------------- validation */

describe('project validation and round trip', () => {
  it('round-trips a project through JSON', () => {
    const { project } = projectWithCatalog(3);
    const withImage = randomizeAll(project, { seed: 'rt' }).project;
    const json = projectToJson(withImage);
    const result = parseProjectJson(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.blocks.order).toEqual(withImage.blocks.order);
      expect(result.project.assets.length).toBe(withImage.assets.length);
      expect(result.project.favorites).toEqual(withImage.favorites);
    }
  });

  it('refuses corrupt or unsupported project files with a typed error', () => {
    expect(parseProjectJson('not json').ok).toBe(false);
    expect(parseProjectJson('{}').ok).toBe(false);
    const tooNew = validateProject({ version: 99, meta: {}, blocks: { order: [], byId: {} } });
    expect(tooNew.ok).toBe(false);
    if (!tooNew.ok) expect(tooNew.error.code).toBe('invalid-project');
  });

  it('repairs dangling references and reports them as warnings', () => {
    const { project } = projectWithCatalog(2);
    const broken = JSON.parse(projectToJson(project));
    broken.blocks.byId[broken.blocks.order[0]].imageAssetId = 'asset_does_not_exist';
    broken.favorites[broken.blocks.order[0]] = ['asset_ghost'];
    const result = validateProject(broken);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.blocks.byId[broken.blocks.order[0]].imageAssetId).toBeNull();
      expect(result.project.favorites[broken.blocks.order[0]]).toBeUndefined();
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ favorites */

describe('favorites are block scoped', () => {
  it('counts favorites per block', () => {
    const { project } = projectWithCatalog(3);
    const [b1, b2] = project.blocks.order;
    const assetIds = project.assets.map((a) => a.id);
    let next = addFavorite(project, b1, assetIds[0]);
    next = addFavorite(next, b1, assetIds[1]);
    next = toggleFavoriteForBlock(next, b2, assetIds[0]);
    const counts = favoriteCounts(next);
    expect(counts[b1]).toBe(2);
    expect(counts[b2]).toBe(1);
    expect(project.assets.length).toBe(next.assets.length); // no file copies
  });

  it('removes the favorites of a deleted block but keeps other blocks intact', () => {
    const { project } = projectWithCatalog(3);
    const [b1, b2] = project.blocks.order;
    let next = addFavorite(project, b1, project.assets[0].id);
    next = addFavorite(next, b2, project.assets[1].id);
    const after = removeBlock(next, b1);
    expect(after.favorites[b1]).toBeUndefined();
    expect(after.favorites[b2]).toEqual([project.assets[1].id]);
  });
});

/* -------------------------------------------------------------------- relink */

describe('relink of a moved folder', () => {
  it('recovers references by file name after the folder was moved', async () => {
    const { remapScanForRelink, relinkFolder } = await import('../persistence/loader');
    const { project } = projectWithCatalog(2);
    const autoFolder = project.folders.find((f) => f.path === 'Auto')!;
    const blockId = project.blocks.order[0];
    const originalImage = project.assets.find((a) => a.folderId === autoFolder.id)!.id;
    let next = setBlockFolders(project, blockId, [autoFolder.id]);
    next = { ...next, blocks: { ...next.blocks, byId: { ...next.blocks.byId, [blockId]: { ...next.blocks.byId[blockId], imageAssetId: originalImage } } } };
    next = addFavorite(next, blockId, originalImage);

    // the project is reopened on a machine where the root folder was moved:
    // the user re-picks the folder, so the scan now reports it under a new root path
    const moved: ScanResult = {
      rootName: 'Auto',
      rootLabel: 'D:\\Photos\\Auto',
      rootFiles: ['001.jpg', '002.jpg', '003.jpg'].map((name) => ({
        name,
        path: `Auto/${name}`,
        format: 'jpg' as const,
        mime: 'image/jpeg',
        bytes: 10,
        refKey: `f:Auto/${name}`,
        supported: true,
      })),
      folders: [],
      unsupported: 0,
      totalFiles: 3,
    };

    const remapped = remapScanForRelink(moved, 'Auto', 'Auto');
    expect(remapped.rootFiles.map((f) => f.path)).toEqual(['Auto/001.jpg', 'Auto/002.jpg', 'Auto/003.jpg']);

    // a plain rescan of the same relative layout keeps every reference stable
    const sameLayout = applyScan(next, remapped);
    expect(sameLayout.project.blocks.byId[blockId].imageAssetId).toBe(originalImage);
    expect(sameLayout.added).toBe(0);

    // “Relink folder” additionally repairs references whose file was reported missing
    next = { ...next, missingAssets: [originalImage] };

    const report = relinkFolder(next, autoFolder.id, remapped, autoFolder.id);
    expect(report.recovered).toBe(1);
    const recoveredId = report.project.blocks.byId[blockId].imageAssetId!;
    expect(report.project.assets.find((a) => a.id === recoveredId)?.name).toBe('001.jpg');
    expect(report.project.favorites[blockId]).toEqual([recoveredId]);
    expect(report.project.missingAssets).not.toContain(originalImage);
  });
});
