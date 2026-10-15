// Generates the PWA icons (pixel-art Lotwheel) as PNGs with no dependencies.
//   npm run icons
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [18, 13, 16];
const BRASS = [184, 135, 58];
const DARK = [36, 26, 20];
const TYPES = [[154, 143, 128], [232, 220, 192], [143, 179, 200], [232, 100, 44], [47, 143, 157]];

// 32x32 logical pixel art.
function art() {
  const N = 32, px = [];
  const c = 15.5, R = 13.5, r = 3;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
      let col = BG;
      if (d <= R + 1.2 && d > R) col = BRASS;
      else if (d <= R) {
        if (d < r) col = BRASS;
        else {
          let a = Math.atan2(dx, -dy); // 0 at top, clockwise
          if (a < 0) a += Math.PI * 2;
          const seg = Math.floor(a / ((Math.PI * 2) / 10));
          const edge = (a % ((Math.PI * 2) / 10)) < 0.09;
          col = edge ? DARK : TYPES[seg % 5];
        }
      }
      // pointer at top
      if (y <= 3 && Math.abs(x - c) <= 3.5 - y) col = [243, 231, 201];
      px.push(col);
    }
  }
  return px;
}

function png(size) {
  const N = 32, scale = size / N, logical = art();
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const p = logical[Math.floor(y / scale) * N + Math.floor(x / scale)];
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = p[0]; raw[o + 1] = p[1]; raw[o + 2] = p[2];
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
for (const s of [192, 512]) writeFileSync(`public/icons/icon-${s}.png`, png(s));
console.log('icons written');
