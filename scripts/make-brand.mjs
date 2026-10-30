// Generates every brand asset from the ONE source image the owner supplied (brand/rutinia-logo-source.jpg):
//   node scripts/make-brand.mjs
//   public/brand/rutinia-logo.png   wordmark with transparent background (for dark UI)
//   public/brand/rutinia-mark.png   the "R" with the check, square, transparent
//   public/icons/*.png, src/app/favicon.ico   app icons, favicon (solid #050505 background)
//   public/og.png                   1200x630 social preview with the slogan
// The wordmark is raster (the source is a JPEG): there is no vector master, so these are sized for 2x displays.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const SRC = "brand/rutinia-logo-source.jpg";
const BG = { r: 5, g: 5, b: 5 };
export const SLOGAN = "Evolución en cada repetición";
mkdirSync("public/brand", { recursive: true }); mkdirSync("public/icons", { recursive: true });

// 1) Black background → transparency. The source is light on black, so alpha = brightest channel and the colour is
//    un-premultiplied; composited back over black it reproduces the original, over #050505 it is indistinguishable.
const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const rgba = Buffer.alloc(info.width * info.height * 4);
for (let i = 0, o = 0; i < data.length; i += 3, o += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2], a = Math.max(r, g, b);
  const alpha = a < 14 ? 0 : Math.min(255, Math.round(((a - 14) * 255) / 241));          // drops JPEG noise on the black
  if (alpha === 0) continue;
  rgba[o] = Math.min(255, Math.round((r * 255) / a)); rgba[o + 1] = Math.min(255, Math.round((g * 255) / a)); rgba[o + 2] = Math.min(255, Math.round((b * 255) / a)); rgba[o + 3] = alpha;
}
const full = sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } });

// 2) Bounding boxes (found from the alpha channel, not guessed): whole wordmark, and the "R" glyph with its check.
let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (rgba[(y * info.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
const pad = 24, box = { left: Math.max(0, x0 - pad), top: Math.max(0, y0 - pad), width: Math.min(info.width, x1 + pad) - Math.max(0, x0 - pad), height: Math.min(info.height, y1 + pad) - Math.max(0, y0 - pad) };
const wordmark = await full.clone().extract(box).png().toBuffer();
await sharp(wordmark).resize({ width: 800 }).png({ compressionLevel: 9 }).toFile("public/brand/rutinia-logo.png");

// The mark = the connected shape that contains the "R" stem (the R glyph and the check are one shape; the "u" is a separate one).
// Flood fill from a pixel inside the R stem on the alpha channel, keep only that shape, and crop to it.
const W = info.width, H = info.height;
const keep = new Uint8Array(W * H);
function fill(seed) {
  if (rgba[seed * 4 + 3] <= 60) throw new Error("seed is not inside the shape: the source image changed, re-check the geometry");
  const stack = [seed]; keep[seed] = 1;
  while (stack.length) { const p = stack.pop(), px = p % W, py = (p / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = px + dx, ny = py + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const q = ny * W + nx; if (!keep[q] && rgba[q * 4 + 3] > 60) { keep[q] = 1; stack.push(q); } } }
}
fill(((y0 + y1) >> 1) * W + x0 + 20);                                             // the R (white)
let greenSeed = -1; for (let i = 0; i < W * H && greenSeed < 0; i++) { const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3]; if (a > 240 && g > 220 && r < 60 && b < 160) greenSeed = i; }
fill(greenSeed);                                                                  // the check (green), a separate shape inside the R's bowl
let legSeed = -1; for (let x = x0 + 230; x < x0 + 320 && legSeed < 0; x++) { const i = (y1 - 15) * W + x; if (rgba[i * 4 + 3] > 240 && rgba[i * 4] > 240) legSeed = i; }
fill(legSeed);                                                                    // the R's diagonal leg: the check's glow gap detaches it from the bowl
const markPx = Buffer.from(rgba); let mx0 = W, my0 = H, mx1 = 0, my1 = 0;
for (let i = 0; i < W * H; i++) { if (keep[i]) { const x = i % W, y = (i / W) | 0; if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y; } else if (rgba[i * 4 + 3] && !isGlowOfMark(i)) markPx[i * 4 + 3] = 0; }
function isGlowOfMark(i) { const x = i % W, y = (i / W) | 0; for (let dy = -10; dy <= 10; dy += 5) for (let dx = -10; dx <= 10; dx += 5) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && keep[ny * W + nx]) return true; } return false; }   // keeps the soft glow around the check, drops the neighbouring letter
const g = 14, markBox = { left: Math.max(0, mx0 - g), top: Math.max(0, my0 - g), width: Math.min(W, mx1 + g) - Math.max(0, mx0 - g), height: Math.min(H, my1 + g) - Math.max(0, my0 - g) };
const mark = await sharp(markPx, { raw: { width: W, height: H, channels: 4 } }).extract(markBox).png().toBuffer();
const squareMark = async (size, scale) => sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: await sharp(mark).resize({ width: Math.round(size * scale), height: Math.round(size * scale), fit: "inside" }).png().toBuffer(), gravity: "center" }]).png().toBuffer();
await sharp(await squareMark(512, 0.86)).png({ compressionLevel: 9 }).toFile("public/brand/rutinia-mark.png");

// 3) App icons on the solid brand background (maskable keeps the mark inside the 80 % safe zone).
const iconOn = async (size, scale) => sharp({ create: { width: size, height: size, channels: 4, background: { ...BG, alpha: 1 } } }).composite([{ input: await squareMark(size, scale), gravity: "center" }]).png({ compressionLevel: 9 }).toBuffer();
for (const [f, size, scale] of [["icon-192.png", 192, 0.74], ["icon-512.png", 512, 0.74], ["icon-maskable-512.png", 512, 0.56], ["apple-touch-icon.png", 180, 0.72]]) writeFileSync(`public/icons/${f}`, await iconOn(size, scale));

// favicon.ico = a container of PNG images (16, 32, 48): valid since Windows Vista and supported by every current browser.
const sizes = [16, 32, 48]; const pngs = await Promise.all(sizes.map((s) => iconOn(s, 0.8)));
const head = Buffer.alloc(6 + 16 * sizes.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = head.length; sizes.forEach((s, i) => { const e = 6 + 16 * i; head[e] = s; head[e + 1] = s; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(off, e + 12); off += pngs[i].length; });
writeFileSync("src/app/favicon.ico", Buffer.concat([head, ...pngs]));

// 4) Social preview.
const logoW = 700, logoImg = await sharp(wordmark).resize({ width: logoW }).png().toBuffer(); const logoH = (await sharp(logoImg).metadata()).height;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><radialGradient id="g" cx="50%" cy="-8%" r="80%"><stop offset="0" stop-color="#00FF73" stop-opacity=".16"/><stop offset="1" stop-color="#050505" stop-opacity="0"/></radialGradient></defs>
  <rect width="1200" height="630" fill="#050505"/><rect width="1200" height="630" fill="url(#g)"/>
  <text x="600" y="${190 + logoH + 78}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="44" font-weight="600" fill="#FFFFFF">${SLOGAN}</text>
  <text x="600" y="${190 + logoH + 140}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#B5B5B5">Software para entrenadores personales · Prueba gratis 7 días</text></svg>`;
await sharp(Buffer.from(svg)).composite([{ input: logoImg, left: Math.round((1200 - logoW) / 2), top: 150 }]).png({ compressionLevel: 9, palette: true }).toFile("public/og.png");
console.log("brand assets written. wordmark box:", box, "mark box:", markBox);
