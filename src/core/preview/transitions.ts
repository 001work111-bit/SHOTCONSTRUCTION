import type { CSSProperties } from 'react';
import type { PreviewSettings, TransitionType } from '../types';
import { EASING_CSS } from '../types';

/**
 * transitions.ts — чистые хелперы переходов между слайдами превью.
 *
 * Здесь нет DOM: только имена CSS-классов и кастомные свойства.
 * Саму анимацию описывает src/index.css (классы .pv-*).
 *
 * Анимируем ТОЛЬКО opacity и transform — это не загружает CPU/GPU
 * и не вызывает «дёргания» на слабых машинах.
 */

export interface TransitionStyle extends CSSProperties {
  '--pv-duration': string;
  '--pv-easing': string;
  '--pv-direction': string;
}

/** CSS-переменные для слоя */
export function transitionVars(settings: PreviewSettings, direction: 1 | -1): TransitionStyle {
  return {
    '--pv-duration': `${settings.transitionDuration}ms`,
    '--pv-easing': EASING_CSS[settings.easing] ?? 'ease',
    '--pv-direction': String(direction),
  };
}

/** Класс слоя: pv-cross pv-enter pv-dir-next */
export function layerClass(
  transition: TransitionType,
  phase: 'enter' | 'leave',
  direction: 1 | -1
): string {
  return [
    'pv-layer',
    `pv-${transition}`,
    `pv-${phase}`,
    `pv-dir-${direction > 0 ? 'next' : 'prev'}`,
  ].join(' ');
}

/** Короткая подпись для UI */
export const TRANSITION_HINTS: Record<TransitionType, string> = {
  fade: 'Простое растворение',
  'slide-vertical': 'Сдвиг вверх/вниз',
  'slide-horizontal': 'Сдвиг влево/вправо',
  crossfade: 'Cross dissolve — кадры пересекаются',
  zoom: 'Лёгкий зум входящего кадра',
};
