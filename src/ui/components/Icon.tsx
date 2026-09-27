import type { CSSProperties } from 'react';

/**
 * Inline SVG icon set (no external assets — the file also has to render offline).
 * Stroke based, 16px grid, currentColor.
 */
export type IconName =
  | 'project'
  | 'blocks'
  | 'images'
  | 'text'
  | 'overlay'
  | 'random'
  | 'favorites'
  | 'stacks'
  | 'preview'
  | 'settings'
  | 'dice'
  | 'lock'
  | 'unlock'
  | 'star'
  | 'star-filled'
  | 'trash'
  | 'copy'
  | 'up'
  | 'down'
  | 'plus'
  | 'folder'
  | 'folder-open'
  | 'search'
  | 'undo'
  | 'redo'
  | 'save'
  | 'open'
  | 'close'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'collapse'
  | 'expand'
  | 'play'
  | 'pause'
  | 'drag'
  | 'warn'
  | 'info'
  | 'refresh'
  | 'link'
  | 'check'
  | 'external'
  | 'grid'
  | 'reset';

const PATHS: Record<IconName, JSX.Element> = {
  project: <path d="M2.5 5.2A1.2 1.2 0 0 1 3.7 4h3l1.3 1.6h4.3A1.2 1.2 0 0 1 13.5 6.8v4A1.2 1.2 0 0 1 12.3 12H3.7A1.2 1.2 0 0 1 2.5 10.8z" />,
  blocks: (
    <>
      <rect x="2.4" y="2.6" width="11.2" height="4.2" rx="1" />
      <rect x="2.4" y="9.2" width="11.2" height="4.2" rx="1" />
    </>
  ),
  images: (
    <>
      <rect x="2.4" y="3" width="11.2" height="10" rx="1.2" />
      <circle cx="6" cy="6.6" r="1" />
      <path d="M3 11.6l3-3 2.2 2.2 1.8-1.6 2 1.6" />
    </>
  ),
  text: (
    <>
      <path d="M3 4.2h10" />
      <path d="M8 4.2v7.6" />
      <path d="M5.6 11.8h4.8" />
    </>
  ),
  overlay: (
    <>
      <rect x="2.4" y="3" width="11.2" height="10" rx="1.2" />
      <path d="M8.6 3.4l4.6 4.4-4.6 4.4" />
    </>
  ),
  random: (
    <>
      <rect x="2.6" y="2.6" width="10.8" height="10.8" rx="2.4" />
      <circle cx="5.9" cy="5.9" r=".9" fill="currentColor" stroke="none" />
      <circle cx="10.1" cy="10.1" r=".9" fill="currentColor" stroke="none" />
      <circle cx="10.1" cy="5.9" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  favorites: <path d="M8 3l1.6 3.3 3.6.5-2.6 2.5.6 3.6L8 11.2l-3.2 1.7.6-3.6L2.8 6.8l3.6-.5z" />,
  stacks: (
    <>
      <path d="M8 2.8l5.4 2.6L8 8 2.6 5.4z" />
      <path d="M2.6 8.4L8 11l5.4-2.6" />
      <path d="M2.6 11.4L8 14l5.4-2.6" />
    </>
  ),
  preview: (
    <>
      <rect x="2.2" y="3" width="11.6" height="8" rx="1.2" />
      <path d="M8 13.2v-2" />
      <path d="M6 13.4h4" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 2.4v1.4M8 12.2v1.4M2.4 8h1.4M12.2 8h1.4M4.1 4.1l1 1M10.9 10.9l1 1M11.9 4.1l-1 1M5.1 10.9l-1 1" />
    </>
  ),
  dice: (
    <>
      <rect x="2.6" y="2.6" width="10.8" height="10.8" rx="2.6" />
      <circle cx="5.9" cy="5.9" r=".85" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r=".85" fill="currentColor" stroke="none" />
      <circle cx="10.1" cy="10.1" r=".85" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <rect x="3.6" y="7" width="8.8" height="6" rx="1.2" />
      <path d="M5.8 7V5.4a2.2 2.2 0 0 1 4.4 0V7" />
    </>
  ),
  unlock: (
    <>
      <rect x="3.6" y="7" width="8.8" height="6" rx="1.2" />
      <path d="M5.8 7V5.4a2.2 2.2 0 0 1 4.2-.7" />
    </>
  ),
  star: <path d="M8 3l1.6 3.3 3.6.5-2.6 2.5.6 3.6L8 11.2l-3.2 1.7.6-3.6L2.8 6.8l3.6-.5z" />,
  'star-filled': <path d="M8 3l1.6 3.3 3.6.5-2.6 2.5.6 3.6L8 11.2l-3.2 1.7.6-3.6L2.8 6.8l3.6-.5z" fill="currentColor" />,
  trash: (
    <>
      <path d="M3.6 5h8.8" />
      <path d="M6.2 5V3.6h3.6V5" />
      <path d="M4.6 5l.6 7.2h5.6L11.4 5" />
    </>
  ),
  copy: (
    <>
      <rect x="5.4" y="5.4" width="7.2" height="7.2" rx="1.2" />
      <path d="M3.4 10V4.2A1.2 1.2 0 0 1 4.6 3H10" />
    </>
  ),
  up: <path d="M8 12.4V3.8M4.6 7.2L8 3.8l3.4 3.4" />,
  down: <path d="M8 3.6v8.6M4.6 8.8L8 12.2l3.4-3.4" />,
  plus: <path d="M8 3.4v9.2M3.4 8h9.2" />,
  folder: <path d="M2.6 5.4A1.2 1.2 0 0 1 3.8 4.2h2.8l1.2 1.5h4.4a1.2 1.2 0 0 1 1.2 1.2v3.9a1.2 1.2 0 0 1-1.2 1.2H3.8a1.2 1.2 0 0 1-1.2-1.2z" />,
  'folder-open': (
    <>
      <path d="M2.6 5.4A1.2 1.2 0 0 1 3.8 4.2h2.8l1.2 1.5h3.4" />
      <path d="M2.6 6.6h11L12.4 12H3.8z" />
    </>
  ),
  search: (
    <>
      <circle cx="7.2" cy="7.2" r="3.4" />
      <path d="M9.8 9.8l3 3" />
    </>
  ),
  undo: <path d="M6 4.6L3.2 7.4 6 10.2M3.4 7.4h5.4a3.4 3.4 0 0 1 0 6.8H7" />,
  redo: <path d="M10 4.6l2.8 2.8L10 10.2M12.6 7.4H7.2a3.4 3.4 0 0 0 0 6.8H9" />,
  save: (
    <>
      <path d="M3.4 3.4h7.4l2 2v7.2h-9.4z" />
      <path d="M5.6 3.4v3.4h4.2V3.4" />
      <path d="M5.4 12.6V9.4h5.2v3.2" />
    </>
  ),
  open: <path d="M3.4 12.6V4.4a1 1 0 0 1 1-1h4l1.2 1.6h2.8a1 1 0 0 1 1 1v6.6z" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  'chevron-left': <path d="M9.8 3.6L5.4 8l4.4 4.4" />,
  'chevron-right': <path d="M6.2 3.6L10.6 8l-4.4 4.4" />,
  'chevron-down': <path d="M3.6 6.2L8 10.6l4.4-4.4" />,
  collapse: <path d="M10 3.6L5.6 8l4.4 4.4M13 3.6v8.8" />,
  expand: <path d="M6 3.6L10.4 8 6 12.4M3 3.6v8.8" />,
  play: <path d="M5.4 3.6l7 4.4-7 4.4z" />,
  pause: <path d="M5.6 3.8v8.4M10.4 3.8v8.4" />,
  drag: (
    <>
      <circle cx="6" cy="5" r=".8" fill="currentColor" stroke="none" />
      <circle cx="6" cy="8" r=".8" fill="currentColor" stroke="none" />
      <circle cx="6" cy="11" r=".8" fill="currentColor" stroke="none" />
      <circle cx="10" cy="5" r=".8" fill="currentColor" stroke="none" />
      <circle cx="10" cy="8" r=".8" fill="currentColor" stroke="none" />
      <circle cx="10" cy="11" r=".8" fill="currentColor" stroke="none" />
    </>
  ),
  warn: (
    <>
      <path d="M8 2.8l6 10.4H2z" />
      <path d="M8 6.4v3" />
      <circle cx="8" cy="11.3" r=".6" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 7.4v3.4" />
      <circle cx="8" cy="5.3" r=".65" fill="currentColor" stroke="none" />
    </>
  ),
  refresh: <path d="M13 8a5 5 0 1 1-1.6-3.7M13.2 3v2.6h-2.6" />,
  link: <path d="M6.6 9.4l2.8-2.8M6.2 5.4l1-1a2.4 2.4 0 0 1 3.4 3.4l-1 1M9.8 10.6l-1 1a2.4 2.4 0 0 1-3.4-3.4l1-1" />,
  check: <path d="M3.6 8.4l2.8 2.8 6-6.4" />,
  external: (
    <>
      <path d="M6.4 4.4H4.2a1 1 0 0 0-1 1v6.4a1 1 0 0 0 1 1h6.4a1 1 0 0 0 1-1v-2.2" />
      <path d="M9.4 3.2h3.4v3.4M12.6 3.4L7.8 8.2" />
    </>
  ),
  grid: (
    <>
      <rect x="2.6" y="2.6" width="4.6" height="4.6" rx="1" />
      <rect x="8.8" y="2.6" width="4.6" height="4.6" rx="1" />
      <rect x="2.6" y="8.8" width="4.6" height="4.6" rx="1" />
      <rect x="8.8" y="8.8" width="4.6" height="4.6" rx="1" />
    </>
  ),
  reset: <path d="M3.4 8a4.6 4.6 0 1 0 1.4-3.3M3.2 3.4v2.4h2.4" />,
};

export function Icon({
  name,
  size = 14,
  strokeWidth = 1.4,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
