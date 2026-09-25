/**
 * generate-icon.mjs — иконки приложения без внешних зависимостей.
 *
 * Рисует растр программно (скруглённые прямоугольники + сетка 3×2 как в воркспейсе),
 * сглаживание — рендер в 4x и box-downsample. На выходе:
 *   build/icon.png  (512×512, Linux/иконка окна)
 *   build/icon.ico  (16/24/32/48/64/128/256 — PNG-записи, формат Vista+)
 *
 * Использование: npm run electron:icon
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'build');

/* ----------------------------- растеризация ----------------------------- */

function roundedRectCoverage(px, py, rect, radius) {
  if (px < rect.x || px > rect.x + rect.w || py < rect.y || py > rect.y + rect.h) {
    return false;
  }
  const r = Math.max(0, Math.min(radius, rect.w / 2, rect.h / 2));
  const nearestX = Math.min(Math.max(px, rect.x + r), rect.x + rect.w - r);
  const nearestY = Math.min(Math.max(py, rect.y + r), rect.y + rect.h - r);
  return Math.hypot(px - nearestX, py - nearestY) <= r;
}

function mix(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
    a[3] + (b[3] - a[3]) * k,
  ];
}

/** src-over: обе точки [r,g,b,a], a в 0..255 */
function over(dst, src) {
  const sa = src[3] / 255;
  const da = dst[3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 0) return [0, 0, 0, 0];
  const k = 1 - sa;
  return [
    (src[0] * sa + dst[0] * da * k) / outA,
    (src[1] * sa + dst[1] * da * k) / outA,
    (src[2] * sa + dst[2] * da * k) / outA,
    outA * 255,
  ];
}

/**
 * @param {number} size сторона итогового изображения
 */
function renderIcon(size) {
  const SS = 4;
  const S = size * SS;
  const rgba = new Uint8ClampedArray(S * S * 4);

  const bg = { x: 0, y: 0, w: S, h: S };
  const bgRadius = S * 0.21;

  const pad = S * 0.15;
  const gap = S * 0.05;
  const cols = 3;
  const rows = 2;
  const cellW = (S - pad * 2 - gap * (cols - 1)) / cols;
  const cellH = (S - pad * 2 - gap * (rows - 1)) / rows;
  const cellRadius = Math.min(cellW, cellH) * 0.2;
  const highlight = 4; // нижний средний кадр — «выбранный» блок

  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        i: r * cols + c,
        x: pad + c * (cellW + gap),
        y: pad + r * (cellH + gap),
        w: cellW,
        h: cellH,
      });
    }
  }

  const topColor = [32, 36, 43, 255];
  const bottomColor = [10, 11, 13, 255];
  const rimColor = [255, 255, 255, 46];
  const emerald = [34, 211, 158, 255];
  const emeraldDeep = [6, 148, 106, 255];
  const glass = [255, 255, 255, 30];
  const cellStroke = [255, 255, 255, 70];
  const innerMark = [255, 255, 255, 220];

  for (let y = 0; y < S; y++) {
    const t = y / (S - 1);
    for (let x = 0; x < S; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let color = [0, 0, 0, 0];

      if (!roundedRectCoverage(px, py, bg, bgRadius)) {
        const idx = (y * S + x) * 4;
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
        continue;
      }

      color = over(color, mix(topColor, bottomColor, t));

      // светлая кромка по периметру подложки
      const edge = Math.max(1, S * 0.011);
      const inner = {
        x: bg.x + edge,
        y: bg.y + edge,
        w: bg.w - edge * 2,
        h: bg.h - edge * 2,
      };
      if (!roundedRectCoverage(px, py, inner, Math.max(0, bgRadius - edge))) {
        color = over(color, rimColor);
      }

      for (const cell of cells) {
        if (!roundedRectCoverage(px, py, cell, cellRadius)) continue;
        const band = Math.max(1, S * 0.007);
        const cellInner = {
          x: cell.x + band,
          y: cell.y + band,
          w: cell.w - band * 2,
          h: cell.h - band * 2,
        };
        const onCellEdge = !roundedRectCoverage(px, py, cellInner, Math.max(0, cellRadius - band));

        if (cell.i === highlight) {
          color = over(color, mix(emerald, emeraldDeep, (py - cell.y) / cell.h));
          // «галочка/кадр» внутри активного блока
          const mark = {
            x: cell.x + cell.w * 0.3,
            y: cell.y + cell.h * 0.36,
            w: cell.w * 0.4,
            h: cell.h * 0.28,
          };
          const markInner = {
            x: mark.x + band * 1.6,
            y: mark.y + band * 1.6,
            w: mark.w - band * 3.2,
            h: mark.h - band * 3.2,
          };
          if (roundedRectCoverage(px, py, mark, cellRadius * 0.5)) {
            color = over(
              color,
              roundedRectCoverage(px, py, markInner, cellRadius * 0.35)
                ? [255, 255, 255, 36]
                : innerMark
            );
          }
        } else {
          color = over(color, glass);
          if (onCellEdge) color = over(color, cellStroke);
        }
        break;
      }

      const idx = (y * S + x) * 4;
      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = color[3];
    }
  }

  // box-downsample SS×SS → size (в unpremultiplied виде)
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const idx = ((y * SS + sy) * S + (x * SS + sx)) * 4;
          const alpha = rgba[idx + 3] / 255;
          r += rgba[idx] * alpha;
          g += rgba[idx + 1] * alpha;
          b += rgba[idx + 2] * alpha;
          a += rgba[idx + 3];
        }
      }
      const n = SS * SS;
      const avgA = a / n;
      const o = (y * size + x) * 4;
      const div = avgA > 0 ? avgA / 255 : 1; // r,g,b накоплены уже умноженными на alpha
      out[o] = r / n / div;
      out[o + 1] = g / n / div;
      out[o + 2] = b / n / div;
      out[o + 3] = avgA;
    }
  }
  return { width: size, height: size, data: out };
}

/* ------------------------------- PNG/ICO -------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng({ width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // фильтр none
    Buffer.from(data.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO с PNG-записями (поддерживается Windows Vista+ и electron-builder) */
function encodeIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // тип 1 = иконка
  header.writeUInt16LE(count, 4);

  const entrySize = 16;
  const offsetStart = header.length + entrySize * count;
  let offset = offsetStart;
  const entries = [];
  const blobs = [];

  for (const { size, png } of images) {
    const entry = Buffer.alloc(entrySize);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0; // палитра
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(png);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...blobs]);
}

/* --------------------------------- main --------------------------------- */

mkdirSync(OUT_DIR, { recursive: true });

const pngLarge = encodePng(renderIcon(512));
writeFileSync(path.join(OUT_DIR, 'icon.png'), pngLarge);

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const images = icoSizes.map((size) => ({ size, png: encodePng(renderIcon(size)) }));
writeFileSync(path.join(OUT_DIR, 'icon.ico'), encodeIco(images));

console.log(
  [`✔ build/icon.png  ${pngLarge.length} байт (512×512)`,
   `✔ build/icon.ico  ${icoSizes.join('/')} px`].join('\n')
);
