import { useCallback, useEffect, useRef, useState } from 'react';
import { autoplayDelay, canAutoPlay, canManualNavigate, previewFrame } from '../../core/preview';
import { effectiveOverlayOf } from '../../core/selectors';
import type { Project } from '../../core/types';
import { useAutoplay, useController, useMouseActivity, useThumbnail, useWheelNavigation } from '../hooks';
import { BlockText } from '../components/BlockText';
import { Icon } from '../components/Icon';

/**
 * PREVIEW MODE (spec §51–60).
 * No editor chrome, no contenteditable: the page is rendered exactly as a real one-page site.
 * Transitions use only opacity/transform so they stay on the compositor (spec §99).
 */
export function PreviewOverlay() {
  const controller = useController();
  const project = useProjectSafe();
  const settings = project.preview;
  const ui = controller.ui;
  const index = Math.max(0, Math.min(ui.previewIndex, Math.max(0, project.blocks.order.length - 1)));
  const frame = previewFrame(project, index);

  const [previous, setPrevious] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const lastIndex = useRef(index);

  useEffect(() => {
    const from = lastIndex.current;
    if (from === index) return;
    lastIndex.current = index;
    setDirection(index > from ? 1 : -1);
    setPrevious(from);
    setAnimating(false);
    const raf = requestAnimationFrame(() => setAnimating(true));
    const timer = setTimeout(() => {
      setPrevious(null);
      setAnimating(false);
    }, settings.duration + 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, settings.duration]);

  const showChrome = useMouseActivity(2400);
  const manual = canManualNavigate(settings);
  const step = useCallback((delta: 1 | -1) => controller.previewStep(delta), [controller]);
  const onWheel = useWheelNavigation(manual, step);

  const playing = canAutoPlay(settings) && ui.previewPlaying;
  useAutoplay(playing, autoplayDelay(settings), () => controller.previewStep(1), [index, settings.loop]);

  const total = frame.total;
  const block = frame.block;

  return (
    <div className="preview" style={{ background: settings.background }} onWheel={onWheel} onClick={() => step(1)}>
      <div className="preview-stage">
        {previous !== null ? (
          <PreviewLayer
            key={`prev-${previous}`}
            project={project}
            index={previous}
            role="leave"
            animating={animating}
            direction={direction}
          />
        ) : null}
        {block ? (
          <PreviewLayer key={`cur-${index}`} project={project} index={index} role="enter" animating={false} direction={direction} />
        ) : (
          <div className="pv-empty">No blocks to preview. Create blocks in the editor first.</div>
        )}
      </div>

      <div className={`preview-ui${showChrome ? ' visible' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="pv-top">
          <button
            type="button"
            className="btn pv-btn"
            title={playing ? 'Pause autoplay' : 'Start autoplay'}
            onClick={() => controller.setPreviewPlaying(!playing)}
            disabled={!canAutoPlay(settings)}
          >
            <Icon name={playing ? 'pause' : 'play'} /> {playing ? 'Pause' : 'Autoplay'}
          </button>
          <button type="button" className="btn pv-btn" title="Exit preview (Esc)" onClick={() => controller.closePreview()}>
            <Icon name="close" /> Exit preview
          </button>
        </div>

        {settings.showDice && block ? (
          <button
            type="button"
            className="btn pv-btn pv-dice"
            title="Randomize the current block (goes into the undo history)"
            onClick={() => controller.randomizePreviewCurrent()}
          >
            <Icon name="dice" size={16} />
          </button>
        ) : null}

        <div className="pv-bottom">
          <button type="button" className="btn pv-btn icon" title="Previous" onClick={() => step(-1)}>
            <Icon name="chevron-left" />
          </button>
          {total > 1 ? (
            <div className="pv-dots">
              {project.blocks.order.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  className={`pv-dot${i === index ? ' active' : ''}`}
                  title={`Block ${i + 1}`}
                  onClick={() => controller.previewGoTo(i)}
                />
              ))}
            </div>
          ) : null}
          <span className="pv-counter">
            {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
          <button type="button" className="btn pv-btn icon" title="Next" onClick={() => step(1)}>
            <Icon name="chevron-right" />
          </button>
        </div>

        {settings.showProgress && playing ? (
          <div className="pv-progress">
            <span key={`${index}-${settings.delay}`} style={{ animation: `pv-progress ${autoplayDelay(settings)}ms linear` }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PreviewLayer({
  project,
  index,
  role,
  animating,
  direction,
}: {
  project: Project;
  index: number;
  role: 'enter' | 'leave';
  animating: boolean;
  direction: 1 | -1;
}) {
  const frame = previewFrame(project, index);
  const block = frame.block;
  const settings = project.preview;
  const overlay = block ? effectiveOverlayOf(project, block) : null;
  const thumb = useThumbnail(block?.imageAssetId ?? null, 2048);

  const classes = [`pv-layer`, `pv-${settings.transition}`];
  if (role === 'enter' || !animating) classes.push(role === 'leave' ? 'pv-enter' : `${role}`);
  if (role === 'leave' && animating) classes.push('pv-leave', `pv-leave-${direction > 0 ? 'next' : 'prev'}`);
  if (role === 'enter') classes.push(`pv-enter-${direction > 0 ? 'next' : 'prev'}`);

  const style = {
    '--transition-duration': `${settings.duration}ms`,
    '--transition-easing': settings.easing,
  } as React.CSSProperties;

  const fitFrame = settings.fit === 'frame' && block;
  const frameBox = fitFrame
    ? {
        width: `min(100%, calc(100vh * ${(block as NonNullable<typeof block>).width / (block as NonNullable<typeof block>).height}))`,
        height: `min(100vh, calc(100vw * ${(block as NonNullable<typeof block>).height / (block as NonNullable<typeof block>).width}))`,
      }
    : undefined;

  return (
    <div className={classes.filter(Boolean).join(' ')} style={style}>
      <div className="pv-frame" style={fitFrame ? { display: 'grid', placeItems: 'center' } : undefined}>
        <div className="pv-frame" style={fitFrame ? { ...frameBox, position: 'relative', inset: 'auto' } : undefined}>
          {thumb.url ? (
            <img
              src={thumb.url}
              alt=""
              draggable={false}
              style={{ objectFit: block?.imageFit ?? 'cover', objectPosition: `${block?.imagePosition.x ?? 50}% ${block?.imagePosition.y ?? 50}%` }}
            />
          ) : (
            <div className="pv-empty">
              {thumb.unsupported ? 'Unsupported format — the block keeps its metadata' : block?.imageAssetId ? 'loading…' : 'empty block'}
            </div>
          )}
          {overlay?.enabled ? <div className="frame-overlay" style={{ background: overlay.color, opacity: overlay.opacity }} /> : null}
          {block ? (
            <BlockText
              block={block}
              text={resolveText(project, block.id)}
              typo={resolveTypography(project, block.id)}
              mode="preview"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* helpers that mirror the selectors without subscribing to the store twice */

function useProjectSafe() {
  // preview subscribes to the whole project on purpose: it is a single full-screen surface
  return useControllerProject();
}

function useControllerProject(): Project {
  const controller = useController();
  const project = controller.project;
  const [, force] = useState(0);
  useEffect(() => controller.subscribe(() => force((v) => v + 1)), [controller]);
  return project;
}

function resolveText(project: Project, blockId: string) {
  const block = project.blocks.byId[blockId];
  const base = project.template;
  if (!block?.textOverride) return base;
  return {
    title: block.textOverride.title ?? base.title,
    subtitle: block.textOverride.subtitle ?? base.subtitle,
    items: block.textOverride.items ?? base.items,
    keywords: block.textOverride.keywords ?? base.keywords,
  };
}

function resolveTypography(project: Project, blockId: string) {
  const block = project.blocks.byId[blockId];
  const base = project.settings.typography;
  if (!block?.typographyOverride) return base;
  const layers = { ...base.layers };
  if (block.typographyOverride.layers) {
    for (const key of Object.keys(block.typographyOverride.layers) as (keyof typeof layers)[]) {
      const patch = block.typographyOverride.layers[key];
      if (patch) layers[key] = { ...base.layers[key], ...patch };
    }
  }
  return {
    layers,
    items: { ...base.items, ...(block.typographyOverride.items ?? {}) },
    keywords: { ...base.keywords, ...(block.typographyOverride.keywords ?? {}) },
    group: { ...base.group, ...(block.typographyOverride.group ?? {}) },
  };
}
