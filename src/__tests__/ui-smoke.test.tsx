// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { AppController } from '../core/controller';
import { App } from '../ui/App';
import type { FileSystemAdapter, ScanOutcome, StoredRef } from '../filesystem/adapter';
import type { ScanResult, ScannedFile, ScannedFolder } from '../core/assets';

/**
 * DOM smoke test: mounts the real React tree against the real controller with a stub adapter.
 * It catches invalid hooks, missing components, broken panels and preview wiring.
 */

function fakeScan(): ScanOutcome {
  const folders: ScannedFolder[] = [];
  const refs: StoredRef[] = [];
  for (const [name, count] of Object.entries({ Auto: 3, Electronics: 3, Medicine: 2 })) {
    const files: ScannedFile[] = [];
    for (let i = 1; i <= count; i += 1) {
      const path = `${name}/${String(i).padStart(3, '0')}.jpg`;
      files.push({ name: `${i}.jpg`, path, format: 'jpg', mime: 'image/jpeg', bytes: 1000 + i, refKey: `f:${path}`, supported: true });
      refs.push({ kind: 'file', key: `f:${path}`, name: `${i}.jpg`, path, mime: 'image/jpeg', bytes: 1000 + i });
    }
    folders.push({ path: name, name, files });
  }
  return {
    rootName: 'Stub',
    rootLabel: 'Stub',
    folders,
    rootFiles: [],
    unsupported: 0,
    totalFiles: 8,
    root: { id: 'root', name: 'Stub', label: 'Stub', token: 'stub' },
    refs,
  };
}

class StubAdapter implements FileSystemAdapter {
  kind = 'browser' as const;
  capabilities = { directoryPicker: false, absolutePaths: false, persistedHandles: false, rescan: true, nativePaths: false, nativeDecoders: false };
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
  async importDropped() {
    return [];
  }
  pathLabel(ref: StoredRef | null, fallback = '') {
    return ref?.path ?? fallback;
  }
  async persistRefs() {}
  async forgetRefs() {}
  describe() {
    return 'stub';
  }
}

function installShims() {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  if (!('createObjectURL' in URL)) {
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:stub', writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, writable: true });
  }
  (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  (globalThis as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0) as unknown as number;
  (globalThis as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

async function flush(times = 3) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root;
let controller: AppController;

beforeEach(() => {
  installShims();
  container = document.createElement('div');
  document.body.appendChild(container);
  controller = new AppController({ adapter: new StubAdapter(), autoBootstrap: false });
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('UI smoke', () => {
  it('renders the shell, loads the catalog and shows blocks', async () => {
    await act(async () => {
      root.render(<App controller={controller} />);
    });
    expect(container.querySelector('.header')).toBeTruthy();
    expect(container.querySelector('.sidebar')).toBeTruthy();
    expect(container.querySelector('.status-bar')).toBeTruthy();

    await act(async () => {
      await controller.loadDemoCatalog();
    });
    await flush();

    expect(container.querySelectorAll('.block-card').length).toBe(6);
    expect(container.textContent).toContain('Randomize all');
    expect(container.querySelector('.block-index')?.textContent).toBe('#01');
  });

  it('randomizes, locks and reports through the workspace controls', async () => {
    await act(async () => {
      root.render(<App controller={controller} />);
      await controller.loadDemoCatalog();
    });
    await flush();

    const randomizeButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Randomize all'));
    expect(randomizeButton).toBeTruthy();
    await act(async () => {
      randomizeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    const withImage = controller.project.blocks.order.filter((id) => controller.project.blocks.byId[id].imageAssetId);
    expect(withImage.length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/blocks? updated/);

    // Regression guard: the store must actually reach the block cards.
    // Reading `controller.project` imperatively during render left the workspace stale —
    // Randomize All changed the state while every card kept its previous image.
    const metas = Array.from(container.querySelectorAll('.block-card .block-meta')).map((el) => el.textContent ?? '');
    expect(metas.length).toBe(6);
    expect(metas.every((text) => /\.jpg/.test(text))).toBe(true);
  });

  it('switches sidebar sections and opens the preview overlay', async () => {
    await act(async () => {
      root.render(<App controller={controller} />);
      await controller.loadDemoCatalog();
    });
    await flush();

    const navButtons = Array.from(container.querySelectorAll('.sidebar-nav .nav-item'));
    const favoritesNav = navButtons.find((b) => b.textContent?.includes('Favorites'));
    await act(async () => {
      favoritesNav?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();
    expect(controller.ui.section).toBe('favorites');
    expect(container.textContent).toContain('Favorites per block');

    await act(async () => {
      controller.openPreview();
    });
    await flush();
    expect(container.querySelector('.preview')).toBeTruthy();
    expect(container.textContent).toContain('Exit preview');

    await act(async () => {
      controller.closePreview();
    });
    await flush();
    expect(container.querySelector('.preview')).toBeNull();
  });

  it('virtualizes a large asset grid instead of mounting every tile', async () => {
    await act(async () => {
      root.render(<App controller={controller} />);
    });

    // 5 000 assets in 25 folders — regression guard for the "render everything on the
    // first pass before the container is measured" bug that froze the renderer
    await act(async () => {
      const folders = [];
      let total = 0;
      for (let f = 0; f < 25; f += 1) {
        const name = `Set${String(f + 1).padStart(2, '0')}`;
        const files = [];
        for (let i = 0; i < 200; i += 1) {
          const path = `${name}/shot_${i}.jpg`;
          files.push({ name: `shot_${i}.jpg`, path, format: 'jpg' as const, mime: 'image/jpeg', bytes: 1000, refKey: `f:${path}`, supported: true });
          total += 1;
        }
        folders.push({ path: name, name, files });
      }
      (controller as unknown as { applyScanOutcome: (o: unknown, l: string) => void }).applyScanOutcome(
        {
          rootName: 'Big',
          rootLabel: 'Big',
          folders,
          rootFiles: [],
          unsupported: 0,
          totalFiles: total,
          root: { id: 'r', name: 'Big', label: 'Big', token: 'r' },
          refs: [],
        },
        'Synthetic',
      );
    });
    await flush();

    await act(async () => {
      controller.setSection('images');
    });
    await flush();

    const tiles = container.querySelectorAll('.asset-tile').length;
    const nodes = container.querySelectorAll('*').length;
    expect(controller.project.assets.length).toBe(5000);
    expect(container.textContent).toContain('Images (5000)');
    expect(tiles).toBeGreaterThan(0);
    expect(tiles).toBeLessThan(80);
    expect(nodes).toBeLessThan(3000);
  });

  it('keeps the sidebar collapsed state and workspace scroll independent', async () => {
    await act(async () => {
      root.render(<App controller={controller} />);
    });
    const collapse = container.querySelector('.sidebar-collapse');
    await act(async () => {
      collapse?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.sidebar.collapsed')).toBeTruthy();
    await act(async () => {
      collapse?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.sidebar.collapsed')).toBeNull();
    expect(container.querySelectorAll('.sidebar-body, .workspace, .inspector').length).toBe(3);
  });
});
