import type { AssetFormat } from './types';

/**
 * Format support matrix (spec §25).
 *
 * `supported` = the pipeline can turn the bytes into a bitmap (browser level).
 * Everything else is still imported as metadata and shown as "Unsupported format"
 * with the file details — never breaking the catalog.
 */
export interface FormatInfo {
  format: AssetFormat;
  mime: string;
  /** decodable by the browser raster pipeline */
  supported: boolean;
  /** vector: dimension probing differs, `fill` behaves differently */
  vector?: boolean;
  note?: string;
}

export const FORMAT_TABLE: FormatInfo[] = [
  { format: 'jpg', mime: 'image/jpeg', supported: true },
  { format: 'jpeg', mime: 'image/jpeg', supported: true },
  { format: 'png', mime: 'image/png', supported: true },
  { format: 'webp', mime: 'image/webp', supported: true },
  { format: 'gif', mime: 'image/gif', supported: true },
  { format: 'svg', mime: 'image/svg+xml', supported: true, vector: true, note: 'Scalable vector' },
  { format: 'avif', mime: 'image/avif', supported: true, note: 'Chrome / Edge / Safari 16+' },
  { format: 'bmp', mime: 'image/bmp', supported: true, note: 'Mostly supported, may vary per browser' },
  {
    format: 'tiff',
    mime: 'image/tiff',
    supported: false,
    note: 'Browsers cannot decode TIFF. Imported as metadata only — convert to PNG/JPG/WebP.',
  },
  {
    format: 'heic',
    mime: 'image/heic',
    supported: false,
    note: 'HEIC/HEIF needs a native codec (available in the Electron build via sharp).',
  },
  {
    format: 'heif',
    mime: 'image/heif',
    supported: false,
    note: 'HEIC/HEIF needs a native codec (available in the Electron build via sharp).',
  },
  { format: 'unknown', mime: 'application/octet-stream', supported: false, note: 'Unknown file type' },
];

const BY_EXT = new Map<string, FormatInfo>();
for (const info of FORMAT_TABLE) {
  if (info.format !== 'unknown') BY_EXT.set(info.format, info);
}
BY_EXT.set('tif', FORMAT_TABLE.find((f) => f.format === 'tiff') as FormatInfo);

export function formatFromName(name: string): FormatInfo {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  return BY_EXT.get(ext) ?? BY_EXT.get(ext === 'jpe' ? 'jpeg' : '') ?? FORMAT_TABLE[FORMAT_TABLE.length - 1];
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** File extensions the scanner is interested in at all (images + metadata-only formats). */
export const SCAN_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'jpe', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp', 'tif', 'tiff', 'heic', 'heif',
]);

export function isDisplayable(format: AssetFormat): boolean {
  const info = BY_EXT.get(format);
  return info ? info.supported : false;
}

export function formatNote(format: AssetFormat): string | undefined {
  return BY_EXT.get(format)?.note;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDimensions(width?: number, height?: number): string {
  if (!width || !height) return 'size unknown';
  return `${width} × ${height}`;
}

export function formatAspect(width?: number, height?: number): string {
  if (!width || !height) return '';
  const ratio = width / height;
  const candidates: [string, number][] = [
    ['2:1', 2], ['16:9', 16 / 9], ['16:10', 1.6], ['3:2', 1.5], ['4:3', 4 / 3], ['1:1', 1], ['9:16', 9 / 16],
  ];
  for (const [label, value] of candidates) {
    if (Math.abs(value - ratio) < 0.01) return label;
  }
  return ratio.toFixed(2) + ':1';
}
