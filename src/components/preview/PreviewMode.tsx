import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useProjectStore, actions } from '../../store/ProjectStore';
import type { Block, TextStyle } from '../../core/types';
import { IconDice, IconClose } from '../icons';
import { cn } from '../../utils/cn';

function PreviewSlide({
  block,
  textStyle,
  imageUrl,
  active,
  dimmed,
}: {
  block: Block;
  textStyle: TextStyle;
  imageUrl: string | null;
  active: boolean;
  dimmed?: boolean;
}) {
  const overlay = block.overlay;

  return (
    <div
      className={cn('absolute inset-0', dimmed && 'pointer-events-none')}
      aria-hidden={!active}
    >
      <div className="absolute inset-0 bg-zinc-950">
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
          <div className="flex h-full items-center justify-center text-white/20">No image</div>
        )}
      </div>

      {overlay.enabled && (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: overlay.color,
            opacity: overlay.opacity / 100,
          }}
        />
      )}

      <div
        className="absolute inset-0 z-10 flex flex-col items-center justify-center px-10 text-center"
        style={{
          color: textStyle.color,
          opacity: textStyle.opacity / 100,
          textAlign: textStyle.align,
        }}
      >
        <div
          className="leading-none"
          style={{
            fontSize: `clamp(2rem, 6vw, ${textStyle.titleSize}px)`,
            fontWeight: textStyle.titleWeight,
            letterSpacing: `${textStyle.letterSpacing}px`,
            lineHeight: textStyle.lineHeight,
          }}
        >
          {block.text.title}
        </div>

        {block.text.subtitle && (
          <div
            className="mt-3 uppercase tracking-[0.25em]"
            style={{
              fontSize: `clamp(0.65rem, 1.3vw, ${textStyle.subtitleSize}px)`,
              fontWeight: textStyle.subtitleWeight,
              opacity: 0.85,
            }}
          >
            {block.text.subtitle}
          </div>
        )}

        {block.text.items.length > 0 && (
          <div
            className="mt-6 space-y-2 border-t border-white/25 pt-4"
            style={{ minWidth: 'min(360px, 50%)' }}
          >
            {block.text.items.map((item, i) => (
              <div
                key={i}
                className="uppercase tracking-wider"
                style={{
                  fontSize: `clamp(0.6rem, 1.1vw, ${textStyle.itemSize}px)`,
                  opacity: 0.8,
                }}
              >
                {item}
              </div>
            ))}
          </div>
        )}

        {block.text.categories && block.text.categories.length > 0 && (
          <div className="mt-8 space-y-1">
            {block.text.categories.map((cat, i) => (
              <div
                key={i}
                className="leading-tight"
                style={{
                  fontSize: `clamp(1.4rem, 4vw, ${textStyle.categorySize}px)`,
                  fontWeight: 300,
                  opacity: 0.72,
                }}
              >
                {cat}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PreviewMode() {
  const { state, dispatch, resolveAssetUrl, ensureAssetUrl } = useProjectStore();
  const [index, setIndex] = useState(0);
  const [uiVisible, setUiVisible] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const hideTimer = useRef<number | null>(null);
  const autoTimer = useRef<number | null>(null);
  const lockNav = useRef(false);

  const blocks = state.blockOrder
    .map((id) => state.blocks[id])
    .filter((b): b is Block => !!b);
  const count = blocks.length;
  const preview = state.preview;
  const current = blocks[index];

  // Ensure URLs
  useEffect(() => {
    for (const b of blocks) {
      if (b.imageAssetId) void ensureAssetUrl(b.imageAssetId);
    }
  }, [blocks, ensureAssetUrl]);

  const showUi = useCallback(() => {
    setUiVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 2500);
  }, []);

  useEffect(() => {
    showUi();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [showUi]);

  const goTo = useCallback(
    (next: number, dir: 1 | -1) => {
      if (lockNav.current || count === 0) return;
      let target = next;
      if (preview.loop) {
        if (target < 0) target = count - 1;
        if (target >= count) target = 0;
      } else {
        target = Math.max(0, Math.min(count - 1, target));
      }
      if (target === index) return;

      lockNav.current = true;
      setDirection(dir);
      setPrevIndex(index);
      setIndex(target);
      setAnimating(true);
      window.setTimeout(() => {
        setAnimating(false);
        setPrevIndex(null);
        lockNav.current = false;
      }, preview.transitionDuration);
    },
    [count, index, preview.loop, preview.transitionDuration]
  );

  const next = useCallback(() => goTo(index + 1, 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1, -1), [goTo, index]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dispatch((s) => actions.setMode(s, 'edit'));
        return;
      }
      if (preview.navigationMode === 'auto') return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, next, prev, preview.navigationMode]);

  // Wheel
  useEffect(() => {
    if (preview.navigationMode === 'auto') return;
    let acc = 0;
    let cool = false;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (cool) return;
      acc += e.deltaY;
      if (Math.abs(acc) > 40) {
        if (acc > 0) next();
        else prev();
        acc = 0;
        cool = true;
        window.setTimeout(() => {
          cool = false;
        }, preview.transitionDuration + 100);
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [next, prev, preview.navigationMode, preview.transitionDuration]);

  // Autoplay
  useEffect(() => {
    if (autoTimer.current) window.clearInterval(autoTimer.current);

    const shouldAuto =
      preview.navigationMode === 'auto' ||
      ((preview.navigationMode === 'both' || preview.navigationMode === 'manual') &&
        preview.autoplay);

    if (!shouldAuto) return;

    autoTimer.current = window.setInterval(() => {
      next();
    }, preview.transitionDelay + preview.transitionDuration);

    return () => {
      if (autoTimer.current) window.clearInterval(autoTimer.current);
    };
  }, [preview, next]);

  if (!current) {
    return (
      <div className="flex h-full items-center justify-center bg-black text-white/50">
        No blocks
        <button
          className="ml-4 underline"
          onClick={() => dispatch((s) => actions.setMode(s, 'edit'))}
        >
          Exit
        </button>
      </div>
    );
  }

  const duration = preview.transitionDuration;
  const easing = preview.easing;
  const type = preview.transitionType;

  const slideStyle = (role: 'current' | 'prev'): CSSProperties => {
    const base: CSSProperties = {
      transitionProperty: 'opacity, transform',
      transitionDuration: `${duration}ms`,
      transitionTimingFunction: easing,
    };

    if (!animating || prevIndex === null) {
      return {
        ...base,
        opacity: role === 'current' ? 1 : 0,
        transform: 'none',
        zIndex: role === 'current' ? 2 : 1,
      };
    }

    if (type === 'fade' || type === 'crossfade') {
      return {
        ...base,
        opacity: role === 'current' ? 1 : 0,
        zIndex: role === 'current' ? 2 : 1,
      };
    }

    // slide vertical
    if (role === 'prev') {
      return {
        ...base,
        opacity: 1,
        transform: `translateY(${direction > 0 ? '-100%' : '100%'})`,
        zIndex: 1,
      };
    }
    return {
      ...base,
      opacity: 1,
      transform: 'translateY(0)',
      zIndex: 2,
      // start off-screen via animation — use CSS animation trick with initial
    };
  };

  // For slide enter: need initial offset. Use key + class.
  const currentUrl = resolveAssetUrl(current.imageAssetId);
  const prevBlock = prevIndex != null ? blocks[prevIndex] : null;
  const prevUrl = prevBlock ? resolveAssetUrl(prevBlock.imageAssetId) : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black"
      onMouseMove={showUi}
      onClick={showUi}
    >
      <div className="relative h-full w-full overflow-hidden">
        {/* Previous slide during transition */}
        {prevBlock && animating && (
          <div className="absolute inset-0" style={slideStyle('prev')}>
            <PreviewSlide
              block={prevBlock}
              textStyle={state.settings.textStyle}
              imageUrl={prevUrl}
              active={false}
              dimmed
            />
          </div>
        )}

        {/* Current */}
        <div
          className="absolute inset-0"
          style={{
            ...slideStyle('current'),
            ...(type === 'slide' && animating
              ? {
                  animation: `${direction > 0 ? 'slideInUp' : 'slideInDown'} ${duration}ms ${easing}`,
                }
              : {}),
          }}
        >
          <PreviewSlide
            block={current}
            textStyle={state.settings.textStyle}
            imageUrl={currentUrl}
            active
          />
        </div>
      </div>

      {/* Chrome */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-40 transition-opacity duration-300',
          uiVisible ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-2">
          <button
            type="button"
            title="Randomize current block"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-md transition hover:bg-emerald-500/40 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              if (current) dispatch((s) => actions.randomizeBlock(s, current.id, true));
            }}
          >
            <IconDice size={16} />
          </button>
          <button
            type="button"
            title="Exit preview (Esc)"
            className="flex h-9 items-center gap-2 rounded-full bg-black/50 px-3 text-xs text-white/80 backdrop-blur-md transition hover:bg-black/70 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              dispatch((s) => actions.setMode(s, 'edit'));
            }}
          >
            <IconClose size={14} /> Exit
          </button>
        </div>

        <div className="pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/45 px-4 py-2 backdrop-blur-md">
          <button
            type="button"
            className="text-white/70 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
          >
            ↑
          </button>
          <span className="min-w-[64px] text-center text-xs tabular-nums text-white/80">
            {index + 1} / {count}
          </span>
          <button
            type="button"
            className="text-white/70 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
          >
            ↓
          </button>
        </div>

        {/* Dots */}
        <div className="pointer-events-auto absolute bottom-6 right-6 flex flex-col gap-1.5">
          {blocks.map((_, i) => (
            <button
              key={i}
              type="button"
              className={cn(
                'h-1.5 w-1.5 rounded-full transition',
                i === index ? 'bg-white' : 'bg-white/30 hover:bg-white/60'
              )}
              onClick={(e) => {
                e.stopPropagation();
                goTo(i, i > index ? 1 : -1);
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes slideInUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes slideInDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
