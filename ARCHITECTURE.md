# Shot Composer — Architecture

Local-first visual constructor & randomizer of one-page-site imagery.
Browser first (no backend, no server DB), Electron-ready without rewriting the core.

---

## 1. Layer map

```
src/
  core/                 ← pure domain. No React, no DOM, no fetch. 100% unit-testable.
    types.ts            Data model (Asset, Folder, Block, Project, Stack, …)
    ids.ts              Stable id generation (never array index)
    rng.ts              Seeded RNG (mulberry32) → deterministic randomize possible later
    defaults.ts         Default JSON text template (+ reference screenshot typography)
    project.ts          Project factory
    blocks.ts           BlockManager: add / remove / reorder / resize / fit / position / text
    assets.ts           AssetManager: register assets, folder index, lookup
    favorites.ts        FavoritesManager (per block!, reference-only, never copies files)
    stacks.ts           StackManager: snapshot of images only, tolerant to deleted blocks
    randomizer.ts       Randomizer: pool resolution → pick. Single source of truth.
    templates.ts        TemplateManager: validate + apply global template / local overrides
    overlay.ts          OverlayManager: global default + per-block override
    history.ts          HistoryManager: atomic snapshot transactions + labels
    selectors.ts        Derived read models (memoizable)
    validation.ts       Project JSON validation + migration hooks
    store.ts            Framework-free observable store (immutable state, useSyncExternalStore)
    controller.ts       Application service layer — the ONLY entry point for UI actions
    errors.ts           Typed domain errors (never silent console.error)
  filesystem/
    adapter.ts          FileSystemAdapter contract (browser | electron)
    browser.ts          BrowserFileSystemAdapter (File System Access API + webkitdirectory fallback)
    electron.ts         ElectronFileSystemAdapter (window.__shotComposer.fs bridge contract)
    electronBridge.d.ts Type surface of the preload bridge
    formats.ts          Format support matrix (JPG PNG WebP GIF SVG AVIF BMP + TIFF/HEIC notes)
    thumbs.ts           Thumbnail pipeline: bitmap → OffscreenCanvas → blob URL, LRU budget
    idb.ts              Minimal IndexedDB wrapper (handles, thumb cache, autosave) — no deps
  persistence/
    serializer.ts       ProjectSerializer  → JSON (never embeds image bytes)
    loader.ts           ProjectLoader     → validate, migrate, rebuild, report problems
    autosave.ts         Debounced IndexedDB autosave with Saved / Saving / Unsaved status
  ui/                   ← React only. Reads selectors, dispatches controller actions.
    layout/  sidebar/  workspace/  inspector/  preview/  components/
electron/               Ready-to-run shell (main.cjs / preload.cjs) — optional
```

Hard rule enforced by layout: **no UI file imports a filesystem adapter directly.**
The controller owns adapters; React components only see plain data + actions.

```
UI ──dispatch──▶ Controller ──▶ core modules ──▶ new immutable ProjectState ──▶ Store ──▶ UI
                                  │
                                  └──▶ FileSystemAdapter (browser / electron)  ← swapped, never referenced by core
```

---

## 2. Data model

```ts
Project {
  version: 1
  metadata:   { id, name, createdAt, updatedAt }
  settings:   { globalOverlay, typography, imagePreset, historyLimit, … }
  folders:    Folder[]         // { id, name, path, parentId, assetIds[], imageCount }
  assets:     Asset[]          // { id, name, folderId, path, format, bytes, width?, height?, source }
  template:   TextTemplate     // the single imported JSON template
  blocks:     { order: string[], byId: Record<string, Block> }   // normalized — never index-as-id
  favorites:  Record<blockId, assetId[]>     // per-block, reference only
  stacks:     Stack[]          // { id, index, name, blockId → assetId | externalInput }
  preview:    PreviewSettings
  missingAssets: string[]
}
```

```ts
Block {
  id, order,
  aspect: '2:1' | … | 'custom', width, height,       // logical frame, physical file untouched
  imageAssetId | externalImage: Asset | null,          // dragged-in file outside the catalog
  selectedFolderIds[], locked, useFavorites,
  textOverride: Partial<TextTemplate> | null,          // local override over global template
  typographyOverride: Partial<TypographySet> | null,
  overlayOverride: Overlay | null,                     // null = inherit global
  imageFit: 'cover'|'contain'|'fill', imagePosition: {x,y}
}
```

### Four independent concepts (spec §"самое важное")

| Concept | Meaning | Stored as |
|---|---|---|
| **Asset** | a physical picture on disk | metadata row; bytes stay in the file/handle |
| **Block** | one site section using one picture | `imageAssetId` reference only |
| **Favorite** | liked picture **for one specific block** | `favorites[blockId] = assetId[]` |
| **Stack** | saved image combination of all blocks | `{ blockId → assetId }` map |

Text: `GLOBAL TEMPLATE → copied initially into every block → each block may override its own copy`.
Randomization never touches text, favorites, lock, folders, overlay or stacks; a stack restores **images only**.

---

## 3. State model

Single immutable root: `ProjectState = { project, ui }` where `ui` is transient
(selection, active panel, preview index, status). Only `project` is serialized/undone.

Mutable access goes through `HistoryManager.transaction(label, mutator)`:

* mutator returns a new project (immutable updates → structural sharing, no deep clone of 100k assets);
* history keeps `undo: {label, project}[]` / `redo: …` capped by `settings.historyLimit` (default 120);
* **atomicity by construction**: `Randomize All` performs exactly one transaction, so `Ctrl+Z`
  reverts all 15 blocks at once (spec §47).

Undo/redo never enters history from: selection, panel switches, thumbnail loads, scan progress.

---

## 4. Module responsibilities

| Module | Responsibility | Never does |
|---|---|---|
| `FolderScanner` (in adapter) | walk root recursively, group by folder, count images, report empty/unsupported | decode all images |
| `AssetManager` | register metadata, index by folder, resolve paths, mark missing/unsupported | hold image bytes |
| `Randomizer` | `folder filter → favorites filter → drop invalid → pick (seeded)`; `randomizeBlock` / `randomizeAll` (skips locked) | own state, own RNG instance per block |
| `FavoritesManager` | add/remove/toggle per block, counters | copy files |
| `StackManager` | save (auto-numbered), apply (images only), navigate, tolerate removed block ids | randomize |
| `TemplateManager` | validate imported JSON, apply to one/all blocks, reset overrides | store per-block copies of the template object |
| `OverlayManager` | resolve effective overlay (`override ?? global`) | — |
| `PreviewEngine` | order, transition config, index/direction state machine, autoplay, nav mode | mutate project (except explicit randomize-current-block, which routes through the controller) |
| `ProjectSerializer/Loader` | JSON in/out, version + schema validation, relink of moved folders | embed images |
| `FileSystemAdapter` | folder pick, rescan, permission, file→URL, drop import | leak into core |

---

## 5. Filesystem abstraction (spec §40, §109–111)

```ts
interface FileSystemAdapter {
  kind: 'browser' | 'electron';
  capabilities: { directoryPicker, absolutePaths, persistence, rescan, dnd };
  isAvailable(): boolean;
  pickDirectory(): Promise<ScanRoot | null>;          // user gesture required
  rescan(root: ScanRoot): Promise<FolderScanResult>;  // re-read after files changed
  requestAccess(root): Promise<boolean>;              // re-grant after reload
  getFileHandleRef(folderId, assetId): StoredRef | null;
  loadPreview(ref, { maxEdge }): Promise<ImageSource>; // object URL + dimensions
  importDroppedFiles(files: File[]): Promise<DroppedAsset[]>;
  pathLabel(ref): string;                             // 'Images/Auto/001.jpg' | 'C:\\…' in Electron
}
```

* **Browser**: `showDirectoryPicker()` (Chromium) → recursive `dirHandle.entries()`,
  handles persisted in IndexedDB, `queryPermission/requestPermission` on reload.
  Fallback: `<input type="file" webkitdirectory>` (metadata + `File` objects, no handle → relink after reload).
  TIFF/HEIC/HEIF are recognised and shown as *Unsupported format* with file info instead of breaking (§25).
* **Electron**: same interface implemented over `window.__shotComposer.fs` (preload bridge:
  `scanDirectory`, `readFile`, `absolutePath`, `watch`, native dialogs). Real implementation,
  activated only when the bridge exists — the browser build is untouched (§110).

Thumbnail pipeline (§70–71): `metadata first → thumbnail when visible → full image when needed`.
Decode uses `createImageBitmap` with a 1-slot concurrency queue, drawn into `OffscreenCanvas`
(after the first element-visible tile request), converted to a blob URL, cached in an LRU
budgeted by bytes (default 48 MB) and revoked on eviction. Dimensions are resolved lazily and
patched back into asset metadata; a 100k catalog is never decoded and never rendered unvirtualized.

Virtualization: one `useVirtualList` hook (`ui/components`) drives the asset grid, folder list,
favorites and stack lists, and the block workspace — only visible rows exist in the DOM.

---

## 6. Component tree

```
<App>
 ├─ <Header>            project name, Save/Load, Undo/Redo, autosave status, Edit|Preview switch
 ├─ <div.shell>
 │   ├─ <Sidebar>       collapsible (⟨ / ⟩), own scroll, sections:
 │   │                   Project · Blocks · Images · Text · Overlay · Random · Favorites · Stacks · Preview · Settings
 │   ├─ <Workspace>     own scroll, vertical block list (virtualized), drag&drop target, ✎ inline text
 │   └─ <Inspector>     context of selection (block) or of the active sidebar section
 └─ <StatusBar>         counts, stack position, missing assets, toasts
<PreviewOverlay>        full-screen, no editor chrome, transitions, ESC to exit
```

Block card layers follow the required z-order: image(0) → overlay(1) → text(2) → controls(3).

---

## 7. Requirement conflicts found, and the decisions taken

| # | Conflict / gap | Decision (architecturally safe) |
|---|---|---|
| 1 | §90 "Lock permits manual randomize" vs §32 "locked = excluded" | Locked blocks are skipped by *bulk* operations. An explicit per-block action (dice on the card, inspector, preview dice) overrides lock and is labelled "lock ignored for this action". |
| 2 | §36 Use-Favorites with an empty favorite list | Falls back to the folder pool and reports it in the UI/status line (never fails, §107). |
| 3 | §43 stack restores "images only" vs §78 deleted blocks | Stack apply writes only `blockId → image`; unknown ids are collected and reported as a warning. |
| 4 | §14 logical block size vs real file size | Frame size lives on the Block; assets keep their own intrinsic `width/height`. Nothing is ever written to disk (§86). |
| 5 | §35 favorites must not duplicate files | Implemented as id references; the Favorites panel is a virtual view. |
| 6 | §50 autosave vs §48 explicit save | Autosave (IndexedDB) is a crash-recovery snapshot and is never presented as an export. Export/Import JSON stays the source of truth. |
| 7 | §3 browser-only vs §59 real-site preview | Preview renders the same DOM as the exported look; the block frame is scaled to the viewport via a `--frame-scale` CSS variable so typography scales like a real hero at 2:1. |
| 8 | §94 "full typography editor optional" | Implemented, but minimal: per-layer font size/weight/color/opacity/align/line-height/tracking/case + group anchor, editable inline and in the inspector. |
| 9 | §38 external drag into a browser | Files dropped outside the catalog are registered as `source: 'manual'` assets with an object URL + name/size; Electron keeps the absolute path. Marked as *external* so the JSON export notes it as non-portable. |
| 10 | §73 determinism | Every randomize call takes an optional seed; the controller stores the last seed per operation so combinations are reproducible later without exposing UI yet. |

---

## 8. Verification

See `VERIFICATION.md` for the executed test matrix, browser QA run, large-catalog benchmarks
(20 000 files: catalog import 43 ms, Randomize All 58–197 ms for 40 blocks, undo 2 ms, ~33 MB
heap) and the bugs this process found and fixed — including the O(assets²) randomize pool, the
virtualization freeze on first paint, the double drop handling and the stale-read reactivity
bug that only showed up in the production build.


`npm run test` — Vitest suites over the pure core: pool resolution (folder filter, favorites
filter, fallback), lock semantics in bulk ops, stack save/apply/navigation with deleted blocks,
history atomicity (bulk op undone in one step), serializer round-trip, invalid-JSON rejection,
template override isolation, overlay inheritance.

`npm run build` — `tsc -b` (strict) + production Vite build.

The end-to-end scenario of spec §106 is executed manually in the running app (folder scan →
blocks → folders per block → randomize → lock → favorites → stacks → inline text → undo/redo →
preview → drop → save/load).
