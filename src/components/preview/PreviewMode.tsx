import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useProjectStore, actions } from '../../store/ProjectStore';
import type { Block, TextStyle } from '../../core/types';
import { TRANSITION_LABELS } from '../../core/types';
import { layerClass, transitionVars } from '../../core/preview/transitions';
import { IconDice, IconClose, IconStar, IconStarFilled, IconPause, IconPlay, IconSequence } from '../icons';
import { cn } from '../../utils/cn';

interface PreviewSlideProps {
  block: Block;
  textStyle: TextStyle;
  imageUrl: string | null;
}

/** Один слайд: картинка + затемнение + текст поверх */
function PreviewSlide({ block, textStyle, imageUrl }: PreviewSlideProps) {
  const overlay = block.overlay;

  return (
    <>
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
          <div className="flex h-full items-center justify-center text-white/20">Нет картинки</div>
        )}
      </div>

      {overlay.enabled && (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: overlay.color, opacity: overlay.opacity / 100 }}
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
    </>
  );
}

export function PreviewMode() {
  const {
    state,
    dispatch,
    previewIndex,
    closePreview,
    previewStep,
    previewGoTo,
    advanceBlock,
    resolveAssetUrl,
    ensureAssetUrl,
  } = useProjectStore();

  const [animating, setAnimating] = useState(false);
  const [on, setOn] = useState(false); // включает .pv-on → стартует CSS-переход
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [uiVisible, setUiVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);
  const autoTimer = useRef<number | null>(null);
  const lockNav = useRef(false);
  const lastIndex = useRef(previewIndex);

  const blocks = useMemo(
    () => state.blockOrder.map((id) => state.blocks[id]).filter((b): b is Block => !!b),
    [state.blockOrder, state.blocks]
  );
  const count = blocks.length;
  const preview = state.preview;
  const index = Math.max(0, Math.min(previewIndex, Math.max(0, count - 1)));
  const current = blocks[index] ?? null;
  const prevBlock = prevIndex != null ? blocks[prevIndex] ?? null : null;

  // URL картинок видимых слайдов
  useEffect(() => {
    for (const b of blocks) {
      if (b.imageAssetId) void ensureAssetUrl(b.imageAssetId);
    }
  }, [blocks, ensureAssetUrl]);

  /**
   * Подсветка .pv-on — это «спусковой крючок» CSS-перехода.
   * Важно: эффект обязан сработать и на ПЕРВОМ показе, иначе входящий слой
   * навсегда останется с opacity: 0 (класс pv-enter задаёт стартовое состояние).
   */
  useEffect(() => {
    setOn(false);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(raf);
  }, [index]);

  // Какой слайд показывать «уходящим» (только при смене, не на первом рендере)
  useEffect(() => {
    if (lastIndex.current === index) return;
    const dir: 1 | -1 = index > lastIndex.current ? 1 : -1;
    lastIndex.current = index;
    setDirection(dir);
    setPrevIndex(prevIndexOf(index, dir, count));
    setAnimating(true);

    const done = window.setTimeout(() => {
      setAnimating(false);
      setPrevIndex(null);
    }, Math.max(120, preview.transitionDuration));

    return () => window.clearTimeout(done);
  }, [index, count, preview.transitionDuration]);

  // Автоплее
  const shouldAuto =
    preview.autoplay &&
    (preview.navigationMode === 'auto' || preview.navigationMode === 'both');

  useEffect(() => {
    if (autoTimer.current) window.clearInterval(autoTimer.current);
    if (!shouldAuto || count <= 1) return;
    autoTimer.current = window.setInterval(
      () => previewStep(1),
      Math.max(600, preview.transitionDuration + preview.transitionDelay)
    );
    return () => {
      if (autoTimer.current) window.clearInterval(autoTimer.current);
    };
  }, [shouldAuto, count, preview.transitionDuration, preview.transitionDelay, previewStep]);

  // Показ/скрытие панели управления
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

  // Escape + колесо (стрелки и Alt+стрелки обрабатывает хранилище)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePreview();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePreview]);

  useEffect(() => {
    let acc = 0;
    let cool = false;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (cool || lockNav.current) return;
      acc += e.deltaY;
      if (Math.abs(acc) > 40) {
        previewStep(acc > 0 ? 1 : -1);
        acc = 0;
        cool = true;
        window.setTimeout(() => {
          cool = false;
        }, preview.transitionDuration + 120);
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [previewStep, preview.transitionDuration]);

  if (!current) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black text-white/50"
        style={{ backgroundColor: preview.background }}
      >
        Нет блоков
        <button className="ml-4 underline" onClick={closePreview}>
          Выход
        </button>
      </div>
    );
  }

  const currentUrl = resolveAssetUrl(current.imageAssetId);
  const prevUrl = prevBlock ? resolveAssetUrl(prevBlock.imageAssetId) : null;
  const isFav = current.imageAssetId
    ? current.favoriteAssetIds.includes(current.imageAssetId)
    : false;

  // Сколько картинок осталось в последовательном режиме
  const sequenceInfo = useMemo(() => {
    if (state.settings.randomMode !== 'sequential') return null;
    return actions.sequenceRemaining(state, current.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.randomMode, state.assets, state.folders, current.id, current.imageAssetId]);

  const frameStyle: CSSProperties =
    preview.fit === 'frame'
      ? {
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(100vw, calc(100vh * ' + current.dimensions.width / current.dimensions.height + '))',
          height: 'min(100vh, calc(100vw * ' + current.dimensions.height / current.dimensions.width + '))',
          boxShadow: '0 30px 80px rgba(0,0,0,.6)',
        }
      : { position: 'absolute', inset: 0 };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ backgroundColor: preview.background }}
      onMouseMove={showUi}
      onClick={showUi}
    >
      <div className="relative h-full w-full overflow-hidden" style={frameStyle}>
        {/* Уходящий слайд */}
        {prevBlock && animating && (
          <div
            className={cn(layerClass(preview.transitionType, 'leave', direction), on && 'pv-on')}
            style={transitionVars(preview, direction)}
          >
            <PreviewSlide
              block={prevBlock}
              textStyle={state.settings.textStyle}
              imageUrl={prevUrl}
            />
          </div>
        )}

        {/* Текущий слайд */}
        <div
          className={cn(layerClass(preview.transitionType, 'enter', direction), on && 'pv-on')}
          style={transitionVars(preview, direction)}
        >
          <PreviewSlide block={current} textStyle={state.settings.textStyle} imageUrl={currentUrl} />
        </div>
      </div>

      {/* Полоса прогресса автоплея */}
      {preview.showProgress && shouldAuto && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 h-0.5 bg-white/10">
          <div
            key={`${index}-${preview.transitionDelay}`}
            className="pv-progress-track h-full bg-emerald-400/80"
            style={{
              animationDuration: `${Math.max(600, preview.transitionDuration + preview.transitionDelay)}ms`,
            }}
          />
        </div>
      )}

      {/* Панель управления */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-40 transition-opacity duration-300',
          uiVisible ? 'opacity-100' : 'opacity-0'
        )}
      >
        {/* правый верх */}
        <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-2">
          {state.settings.randomMode === 'sequential' && (
            <span
              className="flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1.5 text-[11px] text-white/75 backdrop-blur-md"
              title="Последовательный режим: картинки идут по порядку, без повторов"
            >
              <IconSequence size={13} />
              {sequenceInfo ? `${sequenceInfo.left} / ${sequenceInfo.total}` : 'по порядку'}
            </span>
          )}

          {preview.showDice && (
            <button
              type="button"
              title="Следующая картинка (R)"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-md transition hover:bg-emerald-500/40 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                advanceBlock(current.id);
              }}
            >
              <IconDice size={16} />
            </button>
          )}

          <button
            type="button"
            title={isFav ? 'Убрать из избранного (F)' : 'В избранное (F)'}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full bg-black/50 backdrop-blur-md transition hover:bg-amber-400/40',
              isFav ? 'text-amber-300' : 'text-white/80'
            )}
            onClick={(e) => {
              e.stopPropagation();
              dispatch((s) => actions.toggleFavorite(s, current.id));
            }}
          >
            {isFav ? <IconStarFilled size={16} /> : <IconStar size={16} />}
          </button>

          <button
            type="button"
            title={shouldAuto ? 'Пауза (Space)' : 'Играть (Space)'}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-md transition hover:bg-white/20 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              dispatch((s) => actions.updatePreviewSettings(s, { autoplay: !s.preview.autoplay }));
            }}
          >
            {shouldAuto ? <IconPause size={15} /> : <IconPlay size={15} />}
          </button>

          <button
            type="button"
            title="Выход (Esc)"
            className="flex h-9 items-center gap-2 rounded-full bg-black/50 px-3 text-xs text-white/80 backdrop-blur-md transition hover:bg-black/70 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              closePreview();
            }}
          >
            <IconClose size={14} /> Выход
          </button>
        </div>

        {/* низ: навигация */}
        <div className="pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/45 px-4 py-2 backdrop-blur-md">
          <button
            type="button"
            className="text-white/70 transition hover:text-white"
            title="Предыдущий блок (←)"
            onClick={(e) => {
              e.stopPropagation();
              previewStep(-1);
            }}
          >
            ↑
          </button>
          <span className="min-w-[64px] text-center text-xs tabular-nums text-white/80">
            {index + 1} / {count}
          </span>
          <button
            type="button"
            className="text-white/70 transition hover:text-white"
            title="Следующий блок (→)"
            onClick={(e) => {
              e.stopPropagation();
              previewStep(1);
            }}
          >
            ↓
          </button>
        </div>

        {/* подпись перехода */}
        <div className="pointer-events-none absolute bottom-6 left-6 text-[10px] text-white/35">
          {TRANSITION_LABELS[preview.transitionType]} · {preview.transitionDuration}ms ·{' '}
          {preview.fit === 'fill' ? 'на весь экран' : `${current.dimensions.width}×${current.dimensions.height}`}
        </div>

        {/* точки */}
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
                previewGoTo(i);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Какой слайд показывать «уходящим» во время перехода */
function prevIndexOf(next: number, dir: 1 | -1, total: number): number | null {
  if (total <= 1) return null;
  const candidate = next - dir;
  if (candidate < 0 || candidate > total - 1) return null;
  return candidate;
}
