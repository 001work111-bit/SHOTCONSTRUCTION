# Verification

Everything below was executed against the real application — the browser build, a production
build of it, and a synthetic 20 000-file catalog. No mocks are involved in the runtime paths:
the demo catalog ships real JPEGs that go through the same decode/thumbnail/randomize pipeline
as a scanned folder.

## 1. Automated tests — `npm test` (35 passing)

| Suite | What it locks down |
|---|---|
| `src/__tests__/core.test.ts` (24) | pool resolution (folder filter, parent→child inheritance, favorites override, empty-pool reporting), deterministic seeded picking, lock semantics (bulk skips / explicit single-block overrides), history atomicity + limit, stacks (images-only restore, deleted blocks, navigation, blocks created after the save), template import & per-block override isolation, overlay inheritance, geometry (ratio lock, presets), project validation (corrupt file, dangling references, missing ids), favorites scoping, relink of a moved folder |
| `src/__tests__/controller.test.ts` (6) | the whole §106 scenario through the real controller: catalog → folders per block → randomize → lock → favorites → stacks → apply → inline text → undo/redo → preview → drop → export/import; plus corrupt-project, invalid-template and deleted-block-stack handling |
| `src/__tests__/ui-smoke.test.tsx` (5) | the React tree renders with the real controller (jsdom): shell, catalog load, 6 block cards, Randomize All reaching the DOM, sidebar sections, preview overlay mount/unmount, sidebar collapse, and the 5 000-asset grid virtualization guard |

## 2. Browser QA — `node tools/qa-scenario.mjs` (34 checks, 0 console errors)

Drives the production build with real user-level interactions: folder restriction, Randomize
Selected/All, lock skipping, single-step undo of a bulk operation, per-block favorites +
badge counter, favorites-only randomization, stack save/restore without touching lock/text,
inline editing + undo/redo, external file drop (real `DataTransfer`) + undo, autosave after a
reload, export/import round trip, preview (no `contenteditable`, dice, arrow navigation, Esc),
corrupt JSON rejection, invalid template rejection. Result: **all PASS, `CONSOLE_ERRORS []`**.

## 3. Large catalogs — `node tools/bench-catalog.mjs`

Synthetic catalogs (identical to what the folder scanner produces), 40 blocks, Chromium:

| Metric | 4 000 files | 19 980 files |
|---|---|---|
| catalog import (metadata only) | 18 ms | 43 ms |
| **Randomize All** (40 blocks) | 24 ms | **58–197 ms** |
| Undo of that bulk operation | < 1 ms | 2–4 ms |
| Redo | < 1 ms | 4–5 ms |
| Project export (JSON) | 8 ms | 34–48 ms (6.9 MB) |
| asset filtering / search step | 0.16 ms | 0.9–2.2 ms |
| JS heap after the operations | — | ~33 MB |
| DOM nodes with the Images panel open | — | 1 136 (16 tiles mounted) |

The UI stays responsive because: metadata is read without decoding anything, thumbnails are
produced only for visible tiles through a 3-slot decode queue, the cache is byte-budgeted with
an LRU, the grid and the block list are virtualized, and every list reads O(1) lookup tables
instead of scanning the catalog per item.

## 4. Bugs found by this verification and fixed

1. **`App` read the store without a provider** — every `useSelector` in the shell threw.
   The provider now wraps the whole tree (`ui/App.tsx`).
2. **`useSyncExternalStore` lost its `this`** — `controller.subscribe` was passed as a method
   reference; it is now an arrow property.
3. **Randomize All was O(assets²)** — the pool filter scanned the asset array per candidate
   (22 s on 20 k files). Replaced with lookup tables built once per operation
   (`randomizer.createLookup`) and a memoized asset index: 58–197 ms.
4. **The renderer froze when the Images panel opened with a large catalog** — the virtual grid
   trusted a viewport of `0` before its first measurement and mounted *every* tile (React then
   looped on ~20 000 `div.asset-tile` nodes). Both virtual hooks now mount a small head window
   until the container has been measured. Verified for 3 k / 20 k catalogs.
5. **Drop on a block was fired twice** — the drop bubbled to the workspace handler, registering
   the file as two assets and breaking undo. The card now stops propagation.
6. **Autosave could lose the last actions on reload** — the write is debounced; it is now
   flushed on `pagehide` / `beforeunload` / `visibilitychange`.
7. **Components read `controller.project` imperatively during render**, so a Randomize All
   changed the state without re-rendering the workspace (masked by React StrictMode in dev,
   visible in the production build). All reads now go through subscription hooks
   (`useBlock`, `useBlockMap`, `useFavoritesMap`, `useFolders`, `useTemplate`, `useAsset`), and
   `ui-smoke.test.tsx` contains a regression assertion that fails if an imperative read returns.
8. **Relink produced wrong paths** for the `<input webkitdirectory>` convention
   (`Root/Folder/file` → `Folder/Folder/file`); the remap now normalises both scanner
   conventions, covered by a test.

## 5. Known limitations (explicit, not hidden)

* **TIFF / HEIC / HEIF** cannot be decoded by browsers. They are imported with full metadata and
  rendered as “Unsupported format” with the file details; the Electron adapter decodes them
  through `sharp` when it is installed. The app never breaks on them.
* **Handles after a reload** (Chromium): folder access needs one click to re-grant permission
  (“Reconnect folder” in the Project panel). The Electron adapter has no such restriction.
* **Externally dropped images** are referenced by name/path. They are listed as `source: manual`
  in the project JSON and are not portable between machines (the UI says so).
* **Undo history** is a snapshot stack bounded by `settings.historyLimit` (default 120).
  Deep operations are cheap thanks to structural sharing, but undoing 100 steps repeatedly is
  not a hot path and was not optimised.
* **Preview transitions** are CSS-only (opacity/transform, GPU friendly). Very long autoplay
  runs with `zoom` on a 4 K screen were not benchmarked.
