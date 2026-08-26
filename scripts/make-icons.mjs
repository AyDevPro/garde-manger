// Génère les icônes PWA sans dépendance : encodeur PNG minimal + dessin manuel.
// Motif repris de l'écran de connexion : carré arrondi orange, cadre sombre au centre.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public');
const ORANGE = [0xf5, 0xa6, 0x23];
const DARK = [0x14, 0x10, 0x05];
const BLACK = [0x00, 0x00, 0x00];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // 8 bits par canal
  ihdr[9] = 6;   // RGBA
  // Une ligne = 1 octet de filtre (0 = aucun) + les pixels.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Distance signée à un rectangle arrondi — sert d'anticrénelage. */
const roundedRectSd = (x, y, cx, cy, halfW, halfH, r) => {
  const dx = Math.abs(x - cx) - (halfW - r);
  const dy = Math.abs(y - cy) - (halfH - r);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - r;
};

function drawIcon(size, { maskable = false, bg = null } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  // Une icône "maskable" doit tenir dans la zone sûre (80 % du carré).
  const plate = maskable ? size * 0.4 : size * 0.5;
  const plateR = plate * 0.44;
  const inner = plate * 0.4;
  const innerR = inner * 0.3;
  const stroke = Math.max(2, size * 0.05);

  const blend = (i, color, a) => {
    for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] * (1 - a) + color[k] * a);
    px[i + 3] = Math.round(px[i + 3] * (1 - a) + 255 * a);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const fx = x + 0.5, fy = y + 0.5;
      if (bg) blend(i, bg, 1);

      const dPlate = roundedRectSd(fx, fy, c, c, plate, plate, plateR);
      blend(i, ORANGE, Math.min(1, Math.max(0, 0.5 - dPlate)));

      // Cadre sombre : anneau entre deux rectangles arrondis concentriques.
      const dOuter = roundedRectSd(fx, fy, c, c, inner, inner, innerR);
      const dInner = roundedRectSd(fx, fy, c, c, inner - stroke, inner - stroke, Math.max(1, innerR - stroke));
      const ring = Math.min(Math.min(1, Math.max(0, 0.5 - dOuter)), Math.min(1, Math.max(0, 0.5 + dInner)));
      blend(i, DARK, ring);
    }
  }
  return encodePng(size, size, px);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'icon-192.png'), drawIcon(192, { bg: BLACK }));
writeFileSync(join(OUT, 'icon-512.png'), drawIcon(512, { bg: BLACK }));
writeFileSync(join(OUT, 'icon-512-maskable.png'), drawIcon(512, { maskable: true, bg: ORANGE.map((v, i) => [0x2a, 0x1c, 0x05][i]) }));
// iOS ignore la transparence : fond opaque obligatoire.
writeFileSync(join(OUT, 'apple-touch-icon.png'), drawIcon(180, { bg: BLACK }));
writeFileSync(join(OUT, 'favicon.svg'), Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
  `<rect width="64" height="64" rx="14" fill="#F5A623"/>` +
  `<rect x="22" y="22" width="20" height="20" rx="5" fill="none" stroke="#141005" stroke-width="4"/></svg>`, 'utf8'));
console.log('icônes écrites dans', OUT);
