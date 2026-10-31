// Downloads one AI triptych (16:9, three panels) and writes the three frames the app shows.
//   node scripts/media/ingest.mjs <slug> <male|female> <image-url-or-file>
import { mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const [slug, sex, src] = process.argv.slice(2);
if (!slug || !["male", "female"].includes(sex) || !src) { console.error("uso: ingest.mjs <slug> <male|female> <url|archivo>"); process.exit(1); }
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const buf = /^https?:/.test(src) ? Buffer.from(await (await fetch(src)).arrayBuffer()) : readFileSync(src);
const { width, height } = await sharp(buf).metadata();
const third = Math.floor(width / 3), trim = Math.round(width * 0.006);
const dir = join(root, "public", "exercise-media", sex, slug); mkdirSync(dir, { recursive: true });
for (let i = 0; i < 3; i++) {
  const left = i * third + trim, w = third - 2 * trim;
  await sharp(buf).extract({ left, top: 0, width: w, height }).resize(420, 720, { fit: "cover" }).webp({ quality: 80 }).toFile(join(dir, `${i + 1}.webp`));
}
console.log(slug, sex, `${width}x${height}`, "ok");
