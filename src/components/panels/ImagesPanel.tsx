import { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore, actions } from '../../store/ProjectStore';
import {
  Button,
  Section,
  Input,
  Checkbox,
  Divider,
  EmptyState,
  Badge,
} from '../ui/primitives';
import { IconFolder, IconSearch, IconStar, IconStarFilled, IconExport, IconSequence } from '../icons';
import type { ID } from '../../core/types';
import { useThumb } from '../../filesystem/thumbs';
import { cn } from '../../utils/cn';

const TILE = 104; // px, высота строки сетки
const OVERSCAN = 2; // строки запаса сверху/снизу

interface AssetTileProps {
  assetId: ID;
  index: number;
  filename: string;
  favorite: boolean;
  current: boolean;
  missing: boolean;
  unsupported: boolean;
  onAssign: () => void;
  onToggleFavorite: () => void;
}

function AssetTile({
  assetId,
  index,
  filename,
  favorite,
  current,
  missing,
  unsupported,
  onAssign,
  onToggleFavorite,
}: AssetTileProps) {
  const { thumbs } = useProjectStore();
  const thumb = useThumb(thumbs, assetId, 192);

  return (
    <div
      data-media-tile={index + 1}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-md border bg-black/40 transition',
        current ? 'border-emerald-500/70 ring-1 ring-emerald-500/30' : 'border-white/10 hover:border-white/25'
      )}
      style={{ height: TILE - 8 }}
      onClick={onAssign}
      onDoubleClick={onToggleFavorite}
      title={`${filename}\nклик — назначить блоку · двойной клик — в избранное`}
    >
      {thumb.url ? (
        <img
          src={thumb.url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-1 text-center text-[9px] leading-tight text-white/25">
          {unsupported ? 'формат не поддерживается' : missing ? 'файл недоступен' : thumb.loading ? '…' : 'нет превью'}
        </div>
      )}

      {/* индекс картинки внутри текущей выборки */}
      <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] font-semibold tabular-nums text-white/80">
        {index}
      </span>

      {/* звёздочка «в избранное» */}
      <span
        className={cn(
          'absolute right-1 top-1 rounded p-0.5 transition',
          favorite ? 'text-amber-300' : 'text-white/40 opacity-0 group-hover:opacity-100 hover:text-amber-300'
        )}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        title={favorite ? 'Убрать из избранного' : 'В избранное'}
      >
        {favorite ? <IconStarFilled size={13} /> : <IconStar size={13} />}
      </span>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent px-1 pb-0.5 pt-2 text-[9px] text-white/75">
        {filename}
      </div>
    </div>
  );
}

/** Простое оконное виртуальное окно: рисуем только видимые строки */
function useVirtualRows(count: number, columns: number, rowHeight: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(420);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const onScroll = () => setScrollTop(node.scrollTop);
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setViewport(entry.contentRect.height);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const rows = Math.max(1, Math.ceil(count / columns));
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const last = Math.min(rows, Math.ceil((scrollTop + viewport) / rowHeight) + OVERSCAN);

  return { ref, first, last, totalHeight: rows * rowHeight };
}

export function ImagesPanel() {
  const { state, dispatch, loadFolder, loadDemo, thumbs, exportFavorites, resolveAssetUrl } =
    useProjectStore();
  const [search, setSearch] = useState('');
  const [folderId, setFolderId] = useState<ID | null>(null); // null = все папки
  const [onlyDisplayable, setOnlyDisplayable] = useState(true);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(3);

  const selected = state.selectedBlockId ? state.blocks[state.selectedBlockId] : null;
  const selectedBlockNumber = selected
    ? state.blockOrder.indexOf(selected.id) + 1
    : 0;

  const folders = useMemo(() => Object.values(state.folders), [state.folders]);

  const favoriteIds = useMemo(
    () => new Set(selected?.favoriteAssetIds ?? []),
    [selected?.favoriteAssetIds]
  );

  // Ширина сетки → число колонок
  useEffect(() => {
    const node = gridRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setColumns(Math.max(2, Math.floor(w / (TILE + 6))));
      }
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.values(state.assets).filter((asset) => {
      if (folderId && asset.folderId !== folderId) return false;
      if (onlyMissing && !asset.missing) return false;
      if (!onlyMissing && onlyDisplayable && (asset.unsupported || asset.missing)) return false;
      if (onlyFavorites && !favoriteIds.has(asset.id)) return false;
      if (!q) return true;
      const folderName = asset.folderId ? state.folders[asset.folderId]?.name ?? '' : '';
      return asset.filename.toLowerCase().includes(q) || folderName.toLowerCase().includes(q);
    });
  }, [state.assets, state.folders, folderId, onlyMissing, onlyDisplayable, onlyFavorites, favoriteIds, search]);

  const virtual = useVirtualRows(filtered.length, columns, TILE);
  const visible = filtered.slice(virtual.first * columns, virtual.last * columns);

  const folderCount = (id: ID | null) =>
    id === null
      ? Object.keys(state.assets).length
      : state.folders[id]?.assetIds.length ?? 0;

  const totalFavorites = useMemo(() => {
    let total = 0;
    for (const id of state.blockOrder) {
      total += state.blocks[id]?.favoriteAssetIds.length ?? 0;
    }
    return total;
  }, [state.blockOrder, state.blocks]);

  const assign = (assetId: ID) => {
    if (!selected) {
      dispatch((s) => ({
        state: s,
        message: { level: 'warning', text: 'Сначала выберите блок' },
        recordHistory: false,
      }));
      return;
    }
    void resolveAssetUrl(assetId);
    dispatch((s) => actions.setBlockImage(s, selected.id, assetId));
  };

  const toggleFavorite = (assetId: ID) => {
    if (!selected) {
      dispatch((s) => ({
        state: s,
        message: { level: 'warning', text: 'Сначала выберите блок' },
        recordHistory: false,
      }));
      return;
    }
    const has = selected.favoriteAssetIds.includes(assetId);
    dispatch((s) =>
      actions.updateBlockFavorite(s, selected.id, assetId, !has)
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        <Button variant="primary" className="flex-1" onClick={() => void loadFolder()}>
          <IconFolder size={14} /> Загрузить папку
        </Button>
        <Button
          title="Открыть встроенный демо-набор картинок — можно попробовать всё без своих файлов"
          onClick={() => void loadDemo()}
        >
          <IconSequence size={13} /> Демо
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => void exportFavorites()}
          disabled={totalFavorites === 0}
          title="Сохранить все избранные картинки в папку"
        >
          <IconExport size={14} /> Экспорт ★
        </Button>
      </div>

      {folders.length === 0 ? (
        <EmptyState title="Нет загруженных папок" hint="Загрузите папку, чтобы выбрать картинки" />
      ) : (
        <>
          {/* Поиск */}
          <div className="relative">
            <IconSearch
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-white/30"
            />
            <Input
              className="pl-7"
              placeholder="поиск по файлу или папке…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Папки */}
          <Section title={`Папки (${folders.length})`}>
            <div className="max-h-40 space-y-0.5 overflow-y-auto rounded border border-white/8 p-1">
              <button
                type="button"
                onClick={() => setFolderId(null)}
                className={cn(
                  'flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition',
                  folderId === null ? 'bg-emerald-500/15 text-white' : 'text-white/70 hover:bg-white/6'
                )}
              >
                <span className="flex items-center gap-1.5">
                  <IconFolder size={12} /> Все папки
                </span>
                <Badge>{folderCount(null)}</Badge>
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => setFolderId(folder.id === folderId ? null : folder.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition',
                    folderId === folder.id
                      ? 'bg-emerald-500/15 text-white'
                      : 'text-white/70 hover:bg-white/6'
                  )}
                >
                  <span className="truncate">📁 {folder.name}</span>
                  <Badge>{folderCount(folder.id)}</Badge>
                </button>
              ))}
            </div>
          </Section>

          {/* Фильтры */}
          <div className="space-y-1">
            <Checkbox
              checked={onlyDisplayable}
              onChange={setOnlyDisplayable}
              label="только показываемые"
            />
            <Checkbox checked={onlyMissing} onChange={setOnlyMissing} label="только отсутствующие" />
            <Checkbox
              checked={onlyFavorites}
              onChange={setOnlyFavorites}
              label={`только избранное (${favoriteIds.size})`}
            />
          </div>

          <Divider />

          {/* Сетка картинок */}
          <Section
            title={`Картинки (${filtered.length})`}
            action={
              <span className="text-[10px] text-white/35">
                {folderId
                  ? `папка «${state.folders[folderId]?.name}» · индекс 1…${filtered.length}`
                  : `все папки · индекс 1…${filtered.length}`}
              </span>
            }
          >
            <div className="mb-1.5 text-[10px] text-white/40">
              {selectedBlockNumber > 0
                ? `клик — назначить блоку #${selectedBlockNumber} · двойной клик — в избранное`
                : 'выделите блок, чтобы назначать картинки'}
            </div>

            {filtered.length === 0 ? (
              <div className="py-4 text-center text-[10px] text-white/30">Ничего не найдено</div>
            ) : (
              <div
                ref={(node) => {
                  gridRef.current = node;
                  virtual.ref.current = node;
                }}
                className="overflow-y-auto overscroll-contain rounded border border-white/8 p-1"
                style={{ height: 340 }}
              >
                <div style={{ height: virtual.totalHeight, position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      top: virtual.first * TILE,
                      left: 0,
                      right: 0,
                      display: 'grid',
                      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                      gap: 6,
                    }}
                  >
                    {visible.map((asset, i) => {
                      const absolute = virtual.first * columns + i;
                      return (
                        <AssetTile
                          key={asset.id}
                          assetId={asset.id}
                          index={absolute + 1}
                          filename={asset.filename}
                          favorite={favoriteIds.has(asset.id)}
                          current={selected?.imageAssetId === asset.id}
                          missing={!!asset.missing}
                          unsupported={!!asset.unsupported}
                          onAssign={() => assign(asset.id)}
                          onToggleFavorite={() => toggleFavorite(asset.id)}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-1 text-[9px] text-white/25">
              Виртуализированный список — декодируются только видимые миниатюры
              {thumbs ? ` · в кэше ${thumbs.stats().entries}` : ''}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
