import { isDesktopRuntime } from './api';

const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';

/**
 * Оболочка приложения (браузер / Electron) до первого рендера.
 *
 * Шрифты Google Loading подключаются асинхронно и только когда есть сеть:
 * в десктопной версии на Windows приложение должно стартовать мгновенно и
 * без интернета, а блокирующий <link> в <head> этого не позволяет.
 */
export function initShellChrome(): void {
  const root = document.documentElement;
  root.dataset.shell = isDesktopRuntime() ? 'desktop' : 'web';

  const load = () => {
    if (document.getElementById('shot-webfont')) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const link = document.createElement('link');
    link.id = 'shot-webfont';
    link.rel = 'stylesheet';
    link.href = GOOGLE_FONTS_HREF;
    // Не должно ничему мешать, если сеть есть, но CDN недоступен
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  };

  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void })
    .requestIdleCallback;
  if (typeof ric === 'function') ric(load, { timeout: 1500 });
  else window.setTimeout(load, 300);
}
