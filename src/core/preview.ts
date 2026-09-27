import type { Block, PreviewSettings, PreviewTransition, Project } from './types';

/**
 * PreviewEngine (spec §51–60, §92).
 * Pure helpers only: the DOM/CSS side lives in ui/preview, timers in the React hook.
 * Preview never mutates the editor state — the single exception (randomize current block)
 * is routed through the controller and therefore lands in history.
 */

export interface PreviewFrame {
  index: number;
  total: number;
  block: Block | null;
}

export function previewFrame(project: Project, index: number): PreviewFrame {
  const total = project.blocks.order.length;
  if (!total) return { index: 0, total: 0, block: null };
  const safe = ((index % total) + total) % total;
  return { index: safe, total, block: project.blocks.byId[project.blocks.order[safe]] ?? null };
}

/** Navigation step with loop / clamp semantics (spec §57). */
export function stepPreviewIndex(
  project: Project,
  current: number,
  direction: 1 | -1,
  settings: PreviewSettings,
): number {
  const total = project.blocks.order.length;
  if (total <= 1) return 0;
  const next = current + direction;
  if (next < 0) return settings.loop ? total - 1 : 0;
  if (next > total - 1) return settings.loop ? 0 : total - 1;
  return next;
}

export function previewGoTo(project: Project, index: number): number {
  const total = project.blocks.order.length;
  if (!total) return 0;
  return Math.max(0, Math.min(total - 1, index));
}

export function autoplayDelay(settings: PreviewSettings): number {
  return Math.max(600, settings.duration + settings.delay);
}

export function canAutoPlay(settings: PreviewSettings): boolean {
  if (!settings.autoplay) return false;
  return settings.navigation === 'auto' || settings.navigation === 'auto-manual';
}

export function canManualNavigate(settings: PreviewSettings): boolean {
  return settings.navigation !== 'auto';
}

export interface TransitionDescriptor {
  transition: PreviewTransition;
  /** css custom properties for the animated layer */
  style: Record<string, string>;
}

/**
 * GPU friendly descriptors: only `opacity` and `transform` are animated (spec §99).
 */
export function describeTransition(settings: PreviewSettings, direction: 1 | -1): TransitionDescriptor {
  const base: Record<string, string> = {
    '--transition-duration': `${settings.duration}ms`,
    '--transition-easing': settings.easing,
    '--transition-direction': String(direction),
  };
  return { transition: settings.transition, style: base };
}

export function transitionClassName(settings: PreviewSettings, direction: 1 | -1, phase: 'enter' | 'leave'): string {
  return `pv-layer pv-${settings.transition} pv-${phase} pv-dir-${direction > 0 ? 'next' : 'prev'}`;
}

export function shouldShowDice(project: Project, block: Block | null): boolean {
  return Boolean(block && project.preview.showDice);
}

export function previewLabel(project: Project, index: number): string {
  const total = project.blocks.order.length;
  return `${Math.min(index + 1, total)} / ${total}`;
}
