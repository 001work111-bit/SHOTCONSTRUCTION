import { useRef, useState } from 'react';
import { searchAssets } from '../../../core/selectors';
import { stackDrift, stackSummary } from '../../../core/stacks';
import { favoriteCounts } from '../../../core/favorites';
import type { AssetId, Stack } from '../../../core/types';
import {
  useAsset,
  useBlock,
  useBlockMap,
  useBlockOrder,
  useController,
  useFavoritesMap,
  useFolders,
  useProject,
  useSelector,
  useThumbnail,
  useVirtualGrid,
  useVirtualWindow,
} from '../../hooks';
import { Btn, Chip, Empty, Field, KeyValue, Section, Switch, TextInput } from '../../components/primitives';
import { Icon } from '../../components/Icon';

/* ------------------------------------------------------------------ images -- */

function AssetTile({
  assetId,
  current,
  favorite,
  onAssign,
  onToggleFavorite,
}: {
  assetId: AssetId;
  current: boolean;
  favorite: boolean;
  onAssign: () => void;
  onToggleFavorite: () => void;
}) {
  const thumb = useThumbnail(assetId, 384);
  const name = useAsset(assetId)?.name ?? '';
  const missing = useSelector((s) => s.project.missingAssets.includes(assetId));
  return (
    <div
      className={`asset-tile${current ? ' current' : ''}${favorite ? ' in-favorites' : ''}`}
      title={`${name}${missing ? ' · missing file' : ''}`}
      onClick={onAssign}
      onDoubleClick={onToggleFavorite}
    >
      {thumb.url ? (
        <img src={thumb.url} alt={name} loading="lazy" decoding="async" />
      ) : (
        <div className="tile-placeholder">
          {thumb.unsupported ? <>unsupported<br />format</> : missing ? 'missing file' : '…'}
        </div>
      )}
      <span className="tile-star" onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}>
        <Icon name="star-filled" size={12} />
      </span>
      <span className="tile-label">{name}</span>
    </div>
  );
}

export function ImagesPanel() {
  const controller = useController();
  const search = useSelector((s) => s.ui.search);
  const assetIds = useSelector((s) => s.project.assets.length);
  const folders = useFolders();
  const order = useBlockOrder();
  const blockMap = useBlockMap();
  const favoritesMap = useFavoritesMap();
  const missingCount = useSelector((s) => s.project.missingAssets.length);
  const selectedBlockId = useSelector((s) => s.ui.selectedBlockId);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyDisplayable, setOnlyDisplayable] = useState(true);

  const gridRef = useRef<HTMLDivElement | null>(null);

  const filtered = useSelector((s) => {
    const base = searchAssets(s.project, {
      search: s.ui.search,
      folderId: folderId,
      onlyDisplayable,
    });
    if (!onlyMissing) return base;
    return base.filter((id) => s.project.missingAssets.includes(id));
  });

  const grid = useVirtualGrid({ count: filtered.length, containerRef: gridRef, minTile: 84, gap: 6 });
  const currentAssetId = useSelector((s) => (s.ui.selectedBlockId ? s.project.blocks.byId[s.ui.selectedBlockId]?.imageAssetId ?? null : null));
  const favorites = useSelector((s) => (s.ui.selectedBlockId ? s.project.favorites[s.ui.selectedBlockId] ?? [] : []));

  const rows = grid.virtual ? Math.ceil(filtered.length / grid.columns) : Math.ceil(filtered.length / grid.columns);
  const visibleIds = filtered.slice(grid.start, grid.end);

  const fileInput = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <Section title="Catalog">
        <div className="btn-row">
          <Btn icon="folder-open" onClick={() => void controller.loadFolder()}>Load folder</Btn>
          <Btn icon="refresh" onClick={() => void controller.rescanCatalog()}>Rescan</Btn>
          <Btn icon="grid" onClick={() => void controller.loadDemoCatalog()}>Demo</Btn>
          <Btn icon="plus" onClick={() => fileInput.current?.click()} title="Add single images from disk (referenced, never copied)">Add files</Btn>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/*"
          style={{ display: 'none' }}
          onChange={async (event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length) await controller.importDroppedFiles(files);
          }}
        />
        <div className="panel-note">
          {assetIds} files · {folders.length} folders
          {missingCount ? ` · ${missingCount} missing` : ''}
        </div>
        {missingCount ? (
          <div className="btn-row" style={{ marginTop: 6 }}>
            <Btn icon="link" onClick={() => void controller.relinkFolder(folders[0]?.id ?? '')}>Relink folder…</Btn>
          </div>
        ) : null}
      </Section>

      <Section title="Search">
        <TextInput value={search} placeholder="Search by file or folder name…" onCommit={(value) => controller.setSearch(value)} />
        <div className="row between" style={{ marginTop: 6 }}>
          <Switch checked={onlyDisplayable} label="only displayable" onChange={setOnlyDisplayable} />
          <Switch checked={onlyMissing} label="missing only" onChange={setOnlyMissing} />
        </div>
      </Section>

      <Section title={`Folders (${folders.length})`}>
        <div
          className={folderId === null ? 'list-row active' : 'list-row'}
          onClick={() => setFolderId(null)}
        >
          <Icon name="images" size={12} />
          <span className="folder-name">All folders</span>
          <span className="folder-count">{assetIds}</span>
        </div>
        {folders.map((folder) => (
          <div
            key={folder.id}
            className={folderId === folder.id ? 'list-row active' : 'list-row'}
            style={{ paddingLeft: 6 + folder.depth * 10 }}
            title={folder.path}
            onClick={() => setFolderId(folder.id)}
          >
            <Icon name="folder" size={12} />
            <span className="folder-name truncate">{folder.name}</span>
            <span className="folder-count">{folder.imageCount}</span>
            {folder.unsupportedCount ? <span className="chip warn">{folder.unsupportedCount} unsupported</span> : null}
          </div>
        ))}
        {!folders.length ? <Empty>No folders loaded yet.</Empty> : null}
      </Section>

      <Section
        title={`Images (${filtered.length})`}
        right={
          selectedBlockId ? (
            <span className="dim" style={{ fontSize: 10 }}>
              click = assign to block #{order.indexOf(selectedBlockId) + 1} · double click = favorite
            </span>
          ) : (
            <span className="dim" style={{ fontSize: 10 }}>select a block to assign</span>
          )
        }
      >
        <div
          ref={gridRef}
          className="asset-grid virtual"
          style={{ height: grid.virtual ? Math.min(520, grid.totalHeight) : undefined, overflowY: grid.virtual ? 'auto' : undefined }}
        >
          {!filtered.length ? <Empty>No images match the current filter.</Empty> : null}
          {grid.virtual ? (
            <div style={{ height: grid.totalHeight, position: 'relative' }}>
              {visibleIds.map((id, i) => {
                const absolute = grid.start + i;
                const row = Math.floor(absolute / grid.columns);
                const col = absolute % grid.columns;
                return (
                  <div
                    key={id}
                    style={{
                      position: 'absolute',
                      top: row * grid.rowHeight,
                      left: col * (grid.tile + 6),
                      width: grid.tile,
                      height: grid.tile,
                    }}
                  >
                    <AssetTile
                      assetId={id}
                      current={id === currentAssetId}
                      favorite={favorites.includes(id)}
                      onAssign={() => controller.assignImageToSelected(id)}
                      onToggleFavorite={() =>
                        selectedBlockId ? controller.toggleFavorite(selectedBlockId, id) : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            visibleIds.map((id) => (
              <AssetTile
                key={id}
                assetId={id}
                current={id === currentAssetId}
                favorite={favorites.includes(id)}
                onAssign={() => controller.assignImageToSelected(id)}
                onToggleFavorite={() => (selectedBlockId ? controller.toggleFavorite(selectedBlockId, id) : undefined)}
              />
            ))
          )}
        </div>
        {rows > 12 ? <div className="panel-note">Virtualized list — only visible tiles are decoded.</div> : null}
      </Section>

      <Section title="Selected block">
        {selectedBlockId ? (
          <KeyValue
            rows={[
              ['block', `#${order.indexOf(selectedBlockId) + 1}`],
              ['current', blockMap[selectedBlockId]?.imageAssetId?.slice(-10) ?? '—'],
              ['favorites', String((favoritesMap[selectedBlockId] ?? []).length)],
            ]}
          />
        ) : (
          <div className="panel-note">No block selected — click a block in the workspace.</div>
        )}
      </Section>
    </>
  );
}

/* --------------------------------------------------------------- favorites -- */

export function FavoritesPanel() {
  const controller = useController();
  const counters = useSelector((s) => favoriteCounts(s.project));
  const order = useBlockOrder();
  const blockMap = useBlockMap();
  const selectedBlockId = useSelector((s) => s.ui.selectedBlockId);
  const block = useBlock(selectedBlockId);
  const favorites = useSelector((s) => (s.ui.selectedBlockId ? s.project.favorites[s.ui.selectedBlockId] ?? [] : []));
  const listRef = useRef<HTMLDivElement | null>(null);
  const { start, end, offsetOf, totalHeight, measure, virtual } = useVirtualWindow({
    count: favorites.length,
    containerRef: listRef,
    estimate: 46,
    threshold: 30,
    deps: [selectedBlockId, favorites.length],
  });

  return (
    <>
      <Section
        title="Favorites per block"
        right={<span className="dim" style={{ fontSize: 10 }}>total {Object.values(counters).reduce((a, b) => a + b, 0)}</span>}
      >
        {!order.length ? (
          <Empty>No blocks yet.</Empty>
        ) : (
          order.map((id, index) => {
            const count = counters[id] ?? 0;
            const locked = blockMap[id]?.locked;
            return (
              <div key={id} className={`list-row${id === selectedBlockId ? ' active' : ''}`} onClick={() => controller.selectBlock(id)}>
                <span className="mono tabular dim">#{String(index + 1).padStart(2, '0')}</span>
                <span style={{ flex: 1 }} className="truncate">
                  {blockMap[id]?.imageAssetId ? 'image set' : 'empty'}
                </span>
                {locked ? <Icon name="lock" size={11} /> : null}
                <Chip tone={count ? 'gold' : 'default'}>
                  <Icon name={count ? 'star-filled' : 'star'} size={10} /> {count}
                </Chip>
                <span className="row-actions">
                  <Btn
                    icon="star"
                    variant="ghost"
                    title="Add the current image of this block"
                    onClick={(e) => {
                      e.stopPropagation();
                      controller.addCurrentToFavorites(id);
                    }}
                  />
                </span>
              </div>
            );
          })
        )}
      </Section>

      <Section title={block ? `Favorites of block #${order.indexOf(block.id) + 1}` : 'Favorites'}>
        {!block ? (
          <Empty>Select a block to manage its favorites.</Empty>
        ) : (
          <>
            <div className="row between" style={{ marginBottom: 8 }}>
              <Switch checked={block.useFavorites} label="use favorites in randomize" onChange={(value) => controller.setUseFavorites(block.id, value)} />
            </div>
            <div className="btn-row" style={{ marginBottom: 8 }}>
              <Btn icon="star" onClick={() => controller.addCurrentToFavorites(block.id)}>Add current</Btn>
              <Btn icon="copy" onClick={() => controller.copyFavoritesToAll(block.id)}>Copy to all</Btn>
              <Btn icon="trash" variant="danger" onClick={() => controller.clearFavorites(block.id)}>Clear</Btn>
            </div>
            {!favorites.length ? (
              <Empty>
                No favorites for this block yet.
                <div className="panel-note">Favorites are per block: the same picture can be a favorite for block 1 and not for block 2.</div>
              </Empty>
            ) : (
              <div ref={listRef} style={{ maxHeight: 420, overflowY: 'auto', position: virtual ? 'relative' : undefined, height: virtual ? totalHeight : undefined }}>
                {favorites.slice(start, end).map((assetId, i) => (
                  <div
                    key={assetId}
                    ref={(node) => measure(start + i, node)}
                    className="list-row"
                    style={virtual ? { position: 'absolute', top: offsetOf(start + i), left: 0, right: 0 } : undefined}
                    onClick={() => controller.assignImage(block.id, assetId)}
                  >
                    <FavoriteThumb assetId={assetId} />
                    <FavoriteRowName assetId={assetId} />
                    <span className="row-actions">
                      <Btn
                        icon="trash"
                        variant="ghost"
                        title="Remove from favorites"
                        onClick={(e) => {
                          e.stopPropagation();
                          controller.removeFavorite(block.id, assetId);
                        }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Section>
    </>
  );
}

function FavoriteRowName({ assetId }: { assetId: AssetId }) {
  const asset = useAsset(assetId);
  return (
    <span className="truncate" style={{ flex: 1 }}>
      {asset?.name ?? assetId}
    </span>
  );
}

function FavoriteThumb({ assetId }: { assetId: AssetId }) {
  const thumb = useThumbnail(assetId, 192);
  return (
    <span style={{ width: 32, height: 22, borderRadius: 4, overflow: 'hidden', background: '#0b0d10', flex: 'none', display: 'grid', placeItems: 'center' }}>
      {thumb.url ? <img src={thumb.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="images" size={12} />}
    </span>
  );
}

/* ------------------------------------------------------------------ stacks -- */

export function StacksPanel() {
  const controller = useController();
  const project = useProject();
  const stacks = useSelector((s) => s.project.stacks);
  const drift = useSelector((s) => (controller.activeStackId ? stackDrift(s.project, controller.activeStackId) : 0));
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <>
      <Section
        title={`Stacks (${stacks.length})`}
        right={
          <span className="row tight">
            <Btn icon="chevron-left" title="Previous stack" onClick={() => controller.stepStack(-1)} />
            <Btn icon="chevron-right" title="Next stack" onClick={() => controller.stepStack(1)} />
          </span>
        }
      >
        <div className="btn-row">
          <Btn icon="plus" variant="primary" onClick={() => controller.saveStack()}>Save current combination</Btn>
        </div>
        <div className="panel-note">
          A stack stores one image reference per block. Applying it restores images only — text, overlay, folders, favorites and locks stay as they are.
        </div>
        {drift ? <div className="panel-note">Current page differs from the active stack in {drift} block(s).</div> : null}
      </Section>

      <Section title="Saved combinations">
        {!stacks.length ? (
          <Empty>
            No stacks yet.
            <div className="panel-note">Randomize until you like the page, then press “Save current combination”.</div>
          </Empty>
        ) : (
          stacks.map((stack: Stack) => (
            <div
              key={stack.id}
              className={`list-row${controller.activeStackId === stack.id ? ' active' : ''}`}
              onClick={() => {
                controller.activeStackId = stack.id;
                controller.applyStack(stack.id, { silent: true });
              }}
            >
              <span className="mono tabular dim">{String(stack.index).padStart(3, '0')}</span>
              {editingId === stack.id ? (
                <TextInput
                  value={stack.name}
                  onCommit={(value) => {
                    controller.renameStack(stack.id, value);
                    setEditingId(null);
                  }}
                />
              ) : (
                <span className="truncate" style={{ flex: 1 }}>
                  {stack.name}
                </span>
              )}
              <span className="dim" style={{ fontSize: 10 }}>
                {stackSummary(project, stack)}
              </span>
              <span className="row-actions">
                <Btn
                  icon="text"
                  variant="ghost"
                  title="Rename"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(stack.id);
                  }}
                />
                <Btn
                  icon="copy"
                  variant="ghost"
                  title="Duplicate"
                  onClick={(e) => {
                    e.stopPropagation();
                    controller.duplicateStack(stack.id);
                  }}
                />
                <Btn
                  icon="trash"
                  variant="ghost"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    controller.deleteStack(stack.id);
                  }}
                />
              </span>
            </div>
          ))
        )}
      </Section>

      <Section title="Navigation">
        <div className="row tight">
          {stacks.map((stack, i) => (
            <button
              key={stack.id}
              type="button"
              className={`btn${controller.activeStackId === stack.id ? ' active' : ''}`}
              title={stack.name}
              onClick={() => {
                controller.activeStackId = stack.id;
                controller.applyStack(stack.id, { silent: true });
              }}
            >
              {String(i + 1).padStart(3, '0')}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}
