import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const publicDir = path.resolve('public');
const iconsDir = path.join(publicDir, 'icons');

fs.mkdirSync(iconsDir, { recursive: true });

function crc32(buffer) {
  const table = crc32.table ??= (() => {
    const values = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let value = i;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      values[i] = value >>> 0;
    }
    return values;
  })();

  let value = 0xffffffff;
  for (const byte of buffer) {
    value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return output;
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function hexToRgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function mixRgb(a, b, t) {
  return [
    mix(a[0], b[0], t),
    mix(a[1], b[1], t),
    mix(a[2], b[2], t),
  ];
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function roundedRectCoverage(x, y, rect) {
  const { left, top, right, bottom, radius } = rect;
  if (x < left || x > right || y < top || y > bottom) return 0;

  const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  const distance = Math.hypot(x - cx, y - cy);
  return distance <= radius ? 1 : 0;
}

const bgTop = hexToRgb('#3b414b');
const bgMid = hexToRgb('#232831');
const bgBottom = hexToRgb('#0f1318');
const mark = hexToRgb('#ffffff');
const shadow = hexToRgb('#000000');
const tileRect = { left: 6, top: 5, right: 102, bottom: 103, radius: 24 };
const leftMark = [[43, 34], [25, 54], [43, 74]];
const rightMark = [[65, 34], [83, 54], [65, 74]];

function backgroundColor(x, y) {
  const t = Math.max(0, Math.min(1, (x * 0.63 + y - 11) / 162));
  let base = t < 0.48
    ? mixRgb(bgTop, bgMid, t / 0.48)
    : mixRgb(bgMid, bgBottom, (t - 0.48) / 0.52);
  const glowDistance = Math.hypot(x - 25, y - 13);
  const glow = Math.max(0, 1 - glowDistance / 82) * 0.18;
  base = mixRgb(base, hexToRgb('#ffffff'), glow);
  const lowerShade = Math.max(0, (y - 78) / 30) * 0.035;
  return mixRgb(base, shadow, lowerShade);
}

function distanceToSegment(x, y, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared));
  const px = a[0] + t * dx;
  const py = a[1] + t * dy;
  return Math.hypot(x - px, y - py);
}

function strokeCoverage(x, y, points, width) {
  const radius = width / 2;
  for (let i = 0; i < points.length - 1; i += 1) {
    if (distanceToSegment(x, y, points[i], points[i + 1]) <= radius) return 1;
  }

  return points.some(([px, py]) => Math.hypot(x - px, y - py) <= radius) ? 1 : 0;
}

function roundedRectSignedDistance(x, y, rect) {
  const { left, top, right, bottom, radius } = rect;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const halfWidth = (right - left) / 2 - radius;
  const halfHeight = (bottom - top) / 2 - radius;
  const qx = Math.abs(x - centerX) - halfWidth;
  const qy = Math.abs(y - centerY) - halfHeight;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function markCoverage(x, y, size) {
  const width = size <= 24 ? 9.8 : size <= 32 ? 9.2 : 8.5;
  return strokeCoverage(x, y, leftMark, width) || strokeCoverage(x, y, rightMark, width) ? 1 : 0;
}

function shadowCoverage(x, y) {
  const distance = roundedRectSignedDistance(x, y - 3.2, tileRect);
  if (distance <= 0) return 0;
  const falloff = Math.max(0, 1 - distance / 15);
  return falloff * falloff * 0.32;
}

function renderIcon(size) {
  const sampleCount = size <= 32 ? 5 : 4;
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;

      for (let sy = 0; sy < sampleCount; sy += 1) {
        for (let sx = 0; sx < sampleCount; sx += 1) {
          const vx = ((x + (sx + 0.5) / sampleCount) / size) * 108;
          const vy = ((y + (sy + 0.5) / sampleCount) / size) * 108;
          const tileAlpha = roundedRectCoverage(vx, vy, tileRect);
          const dropShadow = tileAlpha ? 0 : shadowCoverage(vx, vy);
          if (tileAlpha === 0 && dropShadow === 0) continue;

          const sampleAlpha = tileAlpha ? 1 : dropShadow;
          const symbol = tileAlpha && markCoverage(vx, vy, size);
          const color = symbol ? mark : tileAlpha ? backgroundColor(vx, vy) : shadow;
          alpha += sampleAlpha;
          red += color[0] * sampleAlpha;
          green += color[1] * sampleAlpha;
          blue += color[2] * sampleAlpha;
        }
      }

      const samples = sampleCount * sampleCount;
      const index = (y * size + x) * 4;
      if (alpha === 0) {
        rgba[index + 3] = 0;
      } else {
        rgba[index] = Math.round(red / alpha);
        rgba[index + 1] = Math.round(green / alpha);
        rgba[index + 2] = Math.round(blue / alpha);
        rgba[index + 3] = Math.round((alpha / samples) * 255);
      }
    }
  }

  return encodePng(size, size, rgba);
}

const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
const pngs = sizes.map((size) => ({ size, bytes: renderIcon(size) }));
const appIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 108 108">
  <defs>
    <linearGradient id="bg" x1="10" y1="6" x2="98" y2="104" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#3b414b"/>
      <stop offset="0.48" stop-color="#232831"/>
      <stop offset="1" stop-color="#0f1318"/>
    </linearGradient>
    <radialGradient id="glow" cx="25" cy="13" r="82" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="0.48" stop-color="#ffffff" stop-opacity="0.07"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="6" y="5" width="96" height="98" rx="24" fill="url(#bg)"/>
  <rect x="6" y="5" width="96" height="98" rx="24" fill="url(#glow)"/>
  <rect x="6.5" y="5.5" width="95" height="97" rx="23.5" fill="none" stroke="#ffffff" stroke-opacity="0.14"/>
  <g fill="none" stroke="#ffffff" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M43 34 L25 54 L43 74"/>
    <path d="M65 34 L83 54 L65 74"/>
  </g>
</svg>
`;

fs.writeFileSync(path.join(publicDir, 'remotelink-app.svg'), appIconSvg);

for (const { size, bytes } of pngs) {
  fs.writeFileSync(path.join(iconsDir, `remotelink-app-${size}.png`), bytes);
}

fs.writeFileSync(path.join(publicDir, 'remotelink-app.png'), pngs.find(({ size }) => size === 512).bytes);
fs.writeFileSync(path.join(publicDir, 'remotelink-app-256.png'), pngs.find(({ size }) => size === 256).bytes);

const icoPngs = pngs.filter(({ size }) => size <= 256);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoPngs.length, 4);

const entries = Buffer.alloc(16 * icoPngs.length);
let offset = 6 + entries.length;

icoPngs.forEach(({ size, bytes }, index) => {
  const entry = index * 16;
  entries[entry] = size === 256 ? 0 : size;
  entries[entry + 1] = size === 256 ? 0 : size;
  entries.writeUInt16LE(1, entry + 4);
  entries.writeUInt16LE(32, entry + 6);
  entries.writeUInt32LE(bytes.length, entry + 8);
  entries.writeUInt32LE(offset, entry + 12);
  offset += bytes.length;
});

fs.writeFileSync(path.join(publicDir, 'remotelink-app.ico'), Buffer.concat([
  header,
  entries,
  ...icoPngs.map(({ bytes }) => bytes),
]));
