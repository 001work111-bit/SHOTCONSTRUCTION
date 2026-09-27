import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { AppController } from '../core/controller';
import { assetIndex } from '../core/selectors';
import type { Asset, AssetId, Block, BlockId, ProjectState } from '../core/types';
import type { ImageSource } from '../filesystem/adapter';

const ControllerContext = createContext<AppController | null>(null);

export const ControllerProvider = ControllerContext.Provider;

export function useController(): AppController {
  const controller = useContext(ControllerContext);
  if (!controller) throw new Error('ControllerProvider is missing');
  return controller;
}

/**
 * Subscribe to a slice of the store. The selector result keeps a stable identity while
 * an equivalent value is produced, so components do not re-render needlessly (spec §98).
 */
export function useSelector<T>(
  selector: (state: ProjectState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const controller = useController();
  const ref = useRef<{ state: ProjectState; value: T } | null>(null);

  const getSnapshot = useCallback(() => {
    const state = controller.state;
    const previous = ref.current;
    if (previous && previous.state === state) return previous.value;
    const value = selector(state);
    if (previous && isEqual(previous.value, value)) {
      ref.current = { state, value: previous.value };
      return previous.value;
    }
    ref.current = { state, value };
    return value;
  }, [controller, selector, isEqual]);

  return useSyncExternalStore(controller.subscribe, getSnapshot, getSnapshot);
}

export function useProject() {
  return useSelector((s) => s.project);
}

export function useUi() {
  return useSelector((s) => s.ui);
}

/**
 * Subscribe to a single block. Components must never read `controller.project` during
 * render: the store only notifies what a selector actually returns, so an imperative read
 * silently goes stale (e.g. a Randomize All that changes images but never re-renders).
 */
export function useBlock(blockId: BlockId | null | undefined): Block | null {
  return useSelector((s) => (blockId ? s.project.blocks.byId[blockId] ?? null : null));
}

/** The whole normalized block map — re-renders on every block mutation. */
export function useBlockMap(): Record<BlockId, Block> {
  return useSelector((s) => s.project.blocks.byId);
}

export function useBlockOrder(): BlockId[] {
  return useSelector((s) => s.project.blocks.order);
}

export function useFavoritesMap(): Record<BlockId, AssetId[]> {
  return useSelector((s) => s.project.favorites);
}

export function useFolders() {
  return useSelector((s) => s.project.folders);
}

export function useTemplate() {
  return useSelector((s) => s.project.template);
}

/** O(1) asset lookup that stays reactive and never scans the catalog per render. */
export function useAsset(assetId: AssetId | null | undefined): Asset | null {
  return useSelector((s) => (assetId ? assetIndex(s.project).get(assetId) ?? null : null));
}

/** Resolve (and cache) a display URL for an asset through the ImageService. */
export function useThumbnail(assetId: AssetId | null | undefined, maxEdge: number): ImageSource & { loading: boolean } {
  const controller = useController();
  const [source, setSource] = useState<ImageSource>({ url: '' });
  const [loading, setLoading] = useState(Boolean(assetId));

  useEffect(() => {
    let cancelled = false;
    if (!assetId) {
      setSource({ url: '' });
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    controller
      .resolveImage(assetId, maxEdge)
      .then((result) => {
        if (cancelled) return;
        setSource(result);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSource({ url: '', unsupported: true, note: 'Could not load image' });
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [controller, assetId, maxEdge]);

  return { ...source, loading };
}

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((prev) => (Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height }));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

export interface VirtualWindow {
  start: number;
  end: number;
  totalHeight: number;
  offsetOf: (index: number) => number;
  measure: (index: number, node: HTMLElement | null) => void;
  virtual: boolean;
}

/**
 * Dynamic-height virtualization used by the block workspace, folder lists and stacks.
 * Small collections are rendered directly (measuring them costs more than painting them).
 */
export function useVirtualWindow(options: {
  count: number;
  containerRef: React.RefObject<HTMLElement>;
  estimate?: number;
  overscan?: number;
  threshold?: number;
  deps?: unknown[];
}): VirtualWindow {
  const { count, containerRef, estimate = 300, overscan = 3, threshold = 24 } = options;
  const heights = useRef<number[]>([]);
  const nodes = useRef<(HTMLElement | null)[]>([]);
  const [version, setVersion] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);

  const virtual = count > threshold;
  /**
   * Before the first measurement the viewport is 0 — trusting it would render the whole
   * collection (a 100k catalog would freeze the tab). Until then only a small head window
   * is mounted; the effect measures the container right after mount.
   */
  const measured = viewport > 0;

  const reset = useCallback(() => {
    heights.current = [];
    nodes.current = [];
  }, []);

  useEffect(() => {
    if (!virtual) return;
    const node = containerRef.current;
    if (!node) return;
    const onScroll = () => setScrollTop(node.scrollTop);
    node.addEventListener('scroll', onScroll, { passive: true });
    setScrollTop(node.scrollTop);
    setViewport(node.clientHeight);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => setViewport(node.clientHeight)) : null;
    observer?.observe(node);
    return () => {
      node.removeEventListener('scroll', onScroll);
      observer?.disconnect();
    };
  }, [containerRef, virtual]);

  useEffect(() => {
    reset();
    setVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, ...(options.deps ?? [])]);

  const measure = useCallback((index: number, node: HTMLElement | null) => {
    nodes.current[index] = node;
    if (!node) return;
    const next = node.offsetHeight;
    if (heights.current[index] === next) return;
    heights.current[index] = next;
    setVersion((v) => v + 1);
  }, []);

  const { offsets, totalHeight } = useMemo(() => {
    const arr: number[] = new Array(count);
    let acc = 0;
    for (let i = 0; i < count; i += 1) {
      arr[i] = acc;
      acc += heights.current[i] ?? estimate;
    }
    return { offsets: arr, totalHeight: acc };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, estimate, version]);

  const offsetOf = useCallback(
    (index: number) => offsets[Math.max(0, Math.min(count - 1, index))] ?? 0,
    [offsets, count],
  );

  let start = 0;
  let end = count;
  if (virtual && !measured) {
    end = Math.min(count, Math.max(overscan + 2, 4));
  } else if (virtual) {
    start = 0;
    for (let i = 0; i < count; i += 1) {
      const bottom = (offsets[i] ?? 0) + (heights.current[i] ?? estimate);
      if (bottom >= scrollTop) {
        start = Math.max(0, i - overscan);
        break;
      }
    }
    end = count;
    for (let i = start; i < count; i += 1) {
      if ((offsets[i] ?? 0) > scrollTop + viewport) {
        end = Math.min(count, i + overscan);
        break;
      }
    }
  } else if (!virtual) {
    end = count;
  }

  return { start, end, totalHeight, offsetOf, measure, virtual };
}

/** Fixed-size grid virtualization for asset tiles (spec §69–70). */
export function useVirtualGrid(options: {
  count: number;
  containerRef: React.RefObject<HTMLElement>;
  minTile?: number;
  gap?: number;
  overscanRows?: number;
}): { start: number; end: number; totalHeight: number; columns: number; tile: number; virtual: boolean; rowHeight: number } {
  const { count, containerRef, minTile = 84, gap = 6, overscanRows = 3 } = options;
  const [width, setWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => {
      setWidth(node.clientWidth);
      setViewport(node.clientHeight);
      setScrollTop(node.scrollTop);
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(node);
    return () => {
      node.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [containerRef]);

  const measured = width > 0;
  const safeWidth = measured ? width : minTile * 2;
  const columns = Math.max(2, Math.floor((safeWidth + gap) / (minTile + gap)));
  const tile = Math.max(24, (safeWidth - gap * (columns - 1)) / columns);
  const rowHeight = tile + gap;
  const rows = Math.max(1, Math.ceil(count / columns));
  const totalHeight = rows * rowHeight;
  const virtual = rows > 40;

  let startRow = 0;
  let endRow = rows;
  if (virtual && !measured) {
    // only the first few rows exist until the container has been observed
    endRow = Math.min(rows, 3);
  } else if (virtual) {
    startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows);
    endRow = Math.min(rows, Math.ceil((scrollTop + viewport) / rowHeight) + overscanRows);
  }

  return { start: startRow * columns, end: Math.min(count, endRow * columns), totalHeight, columns, tile, virtual, rowHeight };
}

/** Preview autoplay ticker (spec §55–57). */
export function useAutoplay(active: boolean, delayMs: number, onTick: () => void, deps: unknown[] = []): void {
  const callback = useRef(onTick);
  callback.current = onTick;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => callback.current(), Math.max(500, delayMs));
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, delayMs, ...deps]);
}

/** Throttled wheel navigation for the preview. */
export function useWheelNavigation(
  active: boolean,
  onStep: (direction: 1 | -1) => void,
  throttleMs = 420,
): (event: React.WheelEvent) => void {
  const last = useRef(0);
  return useCallback(
    (event: React.WheelEvent) => {
      if (!active) return;
      const now = Date.now();
      if (now - last.current < throttleMs) return;
      if (Math.abs(event.deltaY) < 8) return;
      last.current = now;
      onStep(event.deltaY > 0 ? 1 : -1);
    },
    [active, onStep, throttleMs],
  );
}

/** Detects pointer movement to reveal the preview chrome (spec §54). */
export function useMouseActivity(timeoutMs = 2200): boolean {
  const [active, setActive] = useState(true);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onMove = () => {
      setActive(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setActive(false), timeoutMs);
    };
    window.addEventListener('mousemove', onMove);
    onMove();
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (timer) clearTimeout(timer);
    };
  }, [timeoutMs]);
  return active;
}
