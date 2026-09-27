import { memo, useCallback, useMemo, useState, type DragEvent } from 'react';
import type { Block, TextLayerKey, TextTemplate, TypographySet } from '../../core/types';
import { poolSize } from '../../core/selectors';
import { useAsset, useController, useThumbnail, useSelector } from '../hooks';
import { BlockText } from '../components/BlockText';
import { Icon } from '../components/Icon';
import { Chip } from '../components/primitives';

export interface BlockCardProps {
  block: Block;
  index: number;
  selected: boolean;
  maxEdge: number;
}

/**
 * One site section (spec §6, §63).
 * Layers: image → overlay → text → controls, in that z-order (spec §96).
 */
export const BlockCard = memo(function BlockCard({ block, index, selected, maxEdge }: BlockCardProps) {
  const controller = useController();
  const [dragOver, setDragOver] = useState(false);

  const assetId = block.imageAssetId;
  const thumb = useThumbnail(assetId, maxEdge);

  const text: TextTemplate = useSelector((s) => {
    const override = block.textOverride;
    const base = s.project.template;
    if (!override) return base;
    return {
      title: override.title ?? base.title,
      subtitle: override.subtitle ?? base.subtitle,
      items: override.items ?? base.items,
      keywords: override.keywords ?? base.keywords,
    };
  });

  const typo: TypographySet = useSelector((s) => {
    const base = s.project.settings.typography;
    const override = block.typographyOverride;
    if (!override) return base;
    const layers = { ...base.layers };
    if (override.layers) {
      for (const key of Object.keys(override.layers) as TextLayerKey[]) {
        const patch = override.layers[key];
        if (patch) layers[key] = { ...base.layers[key], ...patch };
      }
    }
    return {
      layers,
      items: { ...base.items, ...(override.items ?? {}) },
      keywords: { ...base.keywords, ...(override.keywords ?? {}) },
      group: { ...base.group, ...(override.group ?? {}) },
    };
  });

  const globalOverlay = useSelector((s) => s.project.settings.globalOverlay);
  const overlay = block.overlayOverride ?? globalOverlay;
  const favoriteCount = useSelector((s) => (s.project.favorites[block.id] ?? []).length);
  const isFavorite = useSelector((s) => (s.project.favorites[block.id] ?? []).includes(block.imageAssetId ?? ''));
  const pool = useSelector((s) => poolSize(s.project, s.project.blocks.byId[block.id] ?? block));
  const foldersSelected = block.selectedFolderIds.length;
  const folderTotal = useSelector((s) => s.project.folders.length);
  const editing = useSelector((s) => s.ui.editing);

  const asset = useAsset(assetId);
  const missing = useSelector((s) => Boolean(assetId && s.project.missingAssets.includes(assetId)));

  const ratio = block.width / block.height;
  const frameStyle = useMemo(
    () => ({
      aspectRatio: `${block.width} / ${block.height}`,
      width: '100%',
      maxWidth: `calc(76vh * ${ratio})`,
      margin: '0 auto',
    }),
    [block.width, block.height, ratio],
  );

  const onCommit = useCallback(
    (layer: TextLayerKey, value: string, line?: number) => controller.setTextValue(block.id, layer, value, line),
    [controller, block.id],
  );

  const onDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      // the workspace itself accepts drops (first block) — a drop on a card must not bubble twice
      event.stopPropagation();
      setDragOver(false);
      await controller.handleBlockDrop(block.id, event.dataTransfer);
    },
    [controller, block.id],
  );

  const imageSrc = thumb.url;
  const unsupported = thumb.unsupported;

  return (
    <div
      className={[
        'block-card',
        selected ? 'selected' : '',
        block.locked ? 'locked' : '',
        dragOver ? 'drag-over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseDown={() => !selected && controller.selectBlock(block.id)}
    >
      <div className="block-head">
        <span className="block-index tabular">#{String(index + 1).padStart(2, '0')}</span>
        <span className="block-meta">
          <span>{block.width}×{block.height}</span>
          <span className="dot" />
          <span>{foldersSelected ? `${foldersSelected}/${folderTotal || 0} folders` : `all folders (${folderTotal})`}</span>
          <span className="dot" />
          <span>pool {pool}</span>
          {asset ? (
            <>
              <span className="dot" />
              <span className="truncate" style={{ maxWidth: 260 }} title={asset.name}>
                {asset.name}
              </span>
            </>
          ) : null}
        </span>
        <span className="block-head-spacer" />
        {missing ? <Chip tone="warn">missing file</Chip> : null}
        {block.textOverride && Object.keys(block.textOverride).length ? <Chip tone="acc">text edited</Chip> : null}
        {block.useFavorites ? <Chip tone="gold">favorites only</Chip> : null}
        <Chip tone={favoriteCount ? 'gold' : 'default'}>
          <Icon name={favoriteCount ? 'star-filled' : 'star'} size={10} /> {favoriteCount}
        </Chip>
        {block.locked ? (
          <Chip tone="warn">
            <Icon name="lock" size={10} /> locked
          </Chip>
        ) : null}
      </div>

      <div
        className="frame"
        style={frameStyle}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {imageSrc ? (
          <img
            className="layer-image"
            src={imageSrc}
            alt={asset?.name ?? `Block ${index + 1}`}
            draggable={false}
            style={{ objectFit: block.imageFit, objectPosition: `${block.imagePosition.x}% ${block.imagePosition.y}%` }}
            decoding="async"
          />
        ) : unsupported ? (
          <div className="frame-unsupported">
            <div>
              <div>Unsupported format</div>
              <div className="dim" style={{ fontSize: 10, marginTop: 4 }}>
                {asset?.name} · {asset?.format?.toUpperCase()}
                <br />
                {thumb.note ?? 'Cannot decode here — metadata is preserved.'}
              </div>
            </div>
          </div>
        ) : (
          <div className="frame-empty">
            <div>
              <Icon name="images" size={18} />
              <div style={{ marginTop: 6 }}>{assetId ? 'loading…' : 'no image — randomize or drop a file'}</div>
            </div>
          </div>
        )}

        {overlay.enabled ? (
          <div
            className="frame-overlay"
            style={{ background: overlay.color, opacity: overlay.opacity }}
            data-role="overlay"
          />
        ) : null}

        <BlockText
          block={block}
          text={text}
          typo={typo}
          mode="edit"
          onCommit={onCommit}
          onEditingChange={(state) =>
            controller.setEditing(
              state ? { blockId: block.id, layer: state.layer, line: state.line } : null,
            )
          }
          onAddLine={(layer, after) => controller.addTextLine(block.id, layer, after)}
          onRemoveLine={(layer, line) => controller.removeTextLine(block.id, layer, line)}
        />

        {dragOver ? <div className="drop-veil">Drop image</div> : null}

        <div className="block-tools top">
          <button
            type="button"
            className={`btn icon round${block.locked ? ' active' : ''}`}
            title={block.locked ? 'Unlock block (excluded from Randomize All)' : 'Lock block (excluded from Randomize All)'}
            onClick={(e) => {
              e.stopPropagation();
              controller.toggleLock(block.id);
            }}
          >
            <Icon name={block.locked ? 'lock' : 'unlock'} />
          </button>
          <button
            type="button"
            className={`btn icon round gold${isFavorite ? ' active' : ''}`}
            title="Favorite for this block only"
            onClick={(e) => {
              e.stopPropagation();
              if (assetId) controller.toggleFavorite(block.id, assetId);
              else controller.addCurrentToFavorites(block.id);
            }}
          >
            <Icon name={isFavorite ? 'star-filled' : 'star'} />
          </button>
        </div>

        <div className="block-tools">
          <button
            type="button"
            className="btn icon round"
            title="Move up"
            onClick={(e) => {
              e.stopPropagation();
              controller.moveBlock(block.id, -1);
            }}
          >
            <Icon name="up" />
          </button>
          <button
            type="button"
            className="btn icon round"
            title="Move down"
            onClick={(e) => {
              e.stopPropagation();
              controller.moveBlock(block.id, 1);
            }}
          >
            <Icon name="down" />
          </button>
          <button
            type="button"
            className="btn icon round"
            title="Duplicate block"
            onClick={(e) => {
              e.stopPropagation();
              controller.duplicateBlock(block.id);
            }}
          >
            <Icon name="copy" />
          </button>
          <button
            type="button"
            className="btn icon round danger"
            title="Delete block"
            onClick={(e) => {
              e.stopPropagation();
              controller.deleteBlock(block.id);
            }}
          >
            <Icon name="trash" />
          </button>
          <button
            type="button"
            className="btn icon round primary"
            title="Randomize this block (works even when locked)"
            onClick={(e) => {
              e.stopPropagation();
              controller.randomizeBlock(block.id, true);
            }}
          >
            <Icon name="dice" />
          </button>
        </div>

        {editing?.blockId === block.id ? <div className="text-hint">editing text · Enter to save · Esc to cancel</div> : null}
      </div>
    </div>
  );
});
