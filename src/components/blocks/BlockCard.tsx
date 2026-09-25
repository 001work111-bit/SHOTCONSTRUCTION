import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { cn } from '../../utils/cn';
import type { Block, TextContent, TextStyle } from '../../core/types';
import {
  IconDice,
  IconLock,
  IconUnlock,
  IconStar,
  IconStarFilled,
  IconWarning,
} from '../icons';
import { useProjectStore, actions } from '../../store/ProjectStore';

interface BlockCardProps {
  block: Block;
  selected: boolean;
  textStyle: TextStyle;
  imageUrl: string | null;
  missing?: boolean;
  onSelect: () => void;
}

function InlineEditable({
  value,
  className,
  style,
  onCommit,
  multiline = false,
}: {
  value: string;
  className?: string;
  style?: CSSProperties;
  onCommit: (v: string) => void;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing]);

  const commit = () => {
    const text = ref.current?.innerText ?? draft;
    setEditing(false);
    if (text !== value) onCommit(text);
  };

  if (!editing) {
    return (
      <div
        className={cn('cursor-text rounded px-1 hover:bg-white/10', className)}
        style={style}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
      >
        {value || '\u00A0'}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn('rounded px-1 outline outline-1 outline-white/40', className)}
      style={style}
      contentEditable
      suppressContentEditableWarning
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (!multiline && e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
        if (e.key === 'Escape') {
          setEditing(false);
          setDraft(value);
          if (ref.current) ref.current.innerText = value;
        }
        e.stopPropagation();
      }}
    >
      {value}
    </div>
  );
}

export function BlockCard({
  block,
  selected,
  textStyle,
  imageUrl,
  missing,
  onSelect,
}: BlockCardProps) {
  const { dispatch, dropFileOnBlock, ensureAssetUrl } = useProjectStore();
  const [dragOver, setDragOver] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (block.imageAssetId) void ensureAssetUrl(block.imageAssetId);
  }, [block.imageAssetId, ensureAssetUrl]);

  const overlay = block.overlay;
  const isFav =
    block.imageAssetId != null && block.favoriteAssetIds.includes(block.imageAssetId);
  const favCount = block.favoriteAssetIds.length;

  const { width, height } = block.dimensions;
  const aspect = width / height;

  const updateText = useCallback(
    (partial: Partial<TextContent>) => {
      dispatch((s) => actions.updateBlockText(s, block.id, partial));
    },
    [dispatch, block.id]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      dropFileOnBlock(block.id, file);
    }
  };

  return (
    <div
      className={cn(
        'group relative w-full overflow-hidden rounded-lg border transition-all',
        selected
          ? 'border-emerald-500/60 ring-1 ring-emerald-500/30'
          : 'border-white/10 hover:border-white/20',
        dragOver && 'border-sky-400 ring-2 ring-sky-400/40'
      )}
      style={{ aspectRatio: `${aspect}` }}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* Image */}
      <div className="absolute inset-0 bg-zinc-900">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full"
            style={{
              objectFit: block.imageFit,
              objectPosition: `${block.imagePosition.x}% ${block.imagePosition.y}%`,
            }}
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/25">
            {missing ? (
              <>
                <IconWarning size={28} />
                <span className="text-xs">Missing asset</span>
              </>
            ) : (
              <>
                <span className="text-sm">No image</span>
                <span className="text-[10px]">Drop image or randomize</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Overlay */}
      {overlay.enabled && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: overlay.color,
            opacity: overlay.opacity / 100,
          }}
        />
      )}

      {/* Text layer */}
      <div
        className="absolute inset-0 z-10 flex flex-col items-center justify-center px-8 py-6 text-center"
        style={{
          color: textStyle.color,
          opacity: textStyle.opacity / 100,
          textAlign: textStyle.align,
        }}
      >
        <InlineEditable
          value={block.text.title}
          onCommit={(title) => updateText({ title })}
          className="leading-none"
          style={{
            fontSize: `clamp(1.5rem, 5vw, ${textStyle.titleSize}px)`,
            fontWeight: textStyle.titleWeight,
            letterSpacing: `${textStyle.letterSpacing}px`,
            lineHeight: textStyle.lineHeight,
          }}
        />

        {block.text.subtitle && (
          <InlineEditable
            value={block.text.subtitle}
            onCommit={(subtitle) => updateText({ subtitle })}
            className="mt-2 uppercase tracking-[0.2em]"
            style={{
              fontSize: `clamp(0.6rem, 1.2vw, ${textStyle.subtitleSize}px)`,
              fontWeight: textStyle.subtitleWeight,
              opacity: 0.85,
            }}
          />
        )}

        {block.text.items.length > 0 && (
          <div className="mt-4 space-y-1.5 border-t border-white/20 pt-3" style={{ minWidth: '40%' }}>
            {block.text.items.map((item, i) => (
              <InlineEditable
                key={i}
                value={item}
                onCommit={(v) => {
                  const items = [...block.text.items];
                  items[i] = v;
                  updateText({ items });
                }}
                className="uppercase tracking-wider"
                style={{
                  fontSize: `clamp(0.55rem, 1vw, ${textStyle.itemSize}px)`,
                  opacity: 0.8,
                }}
              />
            ))}
          </div>
        )}

        {block.text.categories && block.text.categories.length > 0 && (
          <div className="mt-5 space-y-0.5">
            {block.text.categories.map((cat, i) => (
              <InlineEditable
                key={i}
                value={cat}
                onCommit={(v) => {
                  const categories = [...(block.text.categories ?? [])];
                  categories[i] = v;
                  updateText({ categories });
                }}
                className="leading-tight"
                style={{
                  fontSize: `clamp(1.1rem, 3.5vw, ${textStyle.categorySize}px)`,
                  fontWeight: 300,
                  opacity: 0.75,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Editor chrome */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-20 flex items-center justify-between px-2.5 py-2 transition-opacity',
          hovered || selected ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white/80 backdrop-blur-sm">
            #{String(block.order + 1).padStart(2, '0')}
          </span>
          {block.locked && (
            <span className="rounded bg-amber-500/30 px-1.5 py-0.5 text-[10px] text-amber-200 backdrop-blur-sm">
              LOCKED
            </span>
          )}
          {block.useFavorites && (
            <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] text-amber-200 backdrop-blur-sm">
              FAV POOL
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Favorites counter */}
          <button
            type="button"
            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
            className={cn(
              'flex items-center gap-1 rounded bg-black/55 px-1.5 py-1 text-white/80 backdrop-blur-sm transition hover:bg-black/70',
              isFav && 'text-amber-300'
            )}
            onClick={(e) => {
              e.stopPropagation();
              dispatch((s) => actions.toggleFavorite(s, block.id));
            }}
          >
            {isFav ? <IconStarFilled size={13} /> : <IconStar size={13} />}
            <span className="text-[10px] tabular-nums">{favCount}</span>
          </button>

          <button
            type="button"
            title={block.locked ? 'Unlock' : 'Lock'}
            className="rounded bg-black/55 p-1.5 text-white/80 backdrop-blur-sm transition hover:bg-black/70"
            onClick={(e) => {
              e.stopPropagation();
              dispatch((s) => actions.toggleLock(s, block.id));
            }}
          >
            {block.locked ? <IconLock size={13} /> : <IconUnlock size={13} />}
          </button>

          <button
            type="button"
            title="Randomize block"
            className="rounded bg-black/55 p-1.5 text-white/80 backdrop-blur-sm transition hover:bg-emerald-500/40 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              dispatch((s) => actions.randomizeBlock(s, block.id, true));
            }}
          >
            <IconDice size={13} />
          </button>
        </div>
      </div>

      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-sky-500/20">
          <span className="rounded-full bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-black">
            Drop image
          </span>
        </div>
      )}
    </div>
  );
}
