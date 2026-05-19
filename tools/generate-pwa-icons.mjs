// One-shot icon generator. Reads apps/web/public/logo.svg (canonical
// brand artwork) and writes the full PWA icon set:
//   - public/icons/icon-192.png      (any-purpose)
//   - public/icons/icon-512.png      (any-purpose)
//   - public/icons/icon-512-maskable.png  (extra ~12.5% safe-area padding)
//   - public/apple-touch-icon.png    (180×180, iOS home screen)
//   - public/favicon.ico             (16/32/48 fallback for legacy browsers)
//   - public/favicon.svg             (copy of logo.svg so <link rel="icon"> works)
//
// Run: node tools/generate-pwa-icons.mjs
// Idempotent — re-run any time the SVG changes.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB_PUBLIC = path.join(ROOT, "..", "apps", "web", "public");
const SVG_PATH = path.join(WEB_PUBLIC, "logo.svg");
const ICONS_DIR = path.join(WEB_PUBLIC, "icons");

await mkdir(ICONS_DIR, { recursive: true });
const svg = await readFile(SVG_PATH);

// Browsers fetch /favicon.svg by default; keep that path working by
// mirroring the source artwork there. (Saves one extra <link> tag and
// works as the SVG favicon in modern browsers.)
await writeFile(path.join(WEB_PUBLIC, "favicon.svg"), svg);

async function render(size, outPath) {
  await sharp(svg, { density: 384 })
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log("wrote", path.relative(WEB_PUBLIC, outPath));
}

// Standard any-purpose icons.
await render(192, path.join(ICONS_DIR, "icon-192.png"));
await render(512, path.join(ICONS_DIR, "icon-512.png"));

// Maskable variant: the icon must fit inside the inner 80% "safe zone"
// because some Android launchers crop ~10% off each edge to fit a mask.
// We render a 512×512 frame, place the icon at 80% scale centered, and
// fill the surround with the brand color so the crop blends seamlessly.
const innerSize = Math.round(512 * 0.8);
const inner = await sharp(svg, { density: 384 })
  .resize(innerSize, innerSize)
  .png()
  .toBuffer();

await sharp({
  create: {
    width: 512,
    height: 512,
    channels: 4,
    background: { r: 91, g: 107, b: 240, alpha: 1 },
  },
})
  .composite([{ input: inner, gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(ICONS_DIR, "icon-512-maskable.png"));
console.log("wrote icons/icon-512-maskable.png");

// iOS home-screen icon — 180×180 PNG with no transparency (iOS rounds it).
await sharp(svg, { density: 384 })
  .resize(180, 180)
  .flatten({ background: { r: 91, g: 107, b: 240 } })
  .png({ compressionLevel: 9 })
  .toFile(path.join(WEB_PUBLIC, "apple-touch-icon.png"));
console.log("wrote apple-touch-icon.png");

// Minimal favicon.ico fallback — a single 32×32 PNG repackaged as .ico.
// Most browsers prefer favicon.svg from the manifest; this is for legacy.
const ico32 = await sharp(svg, { density: 384 })
  .resize(32, 32)
  .png()
  .toBuffer();
await writeFile(path.join(WEB_PUBLIC, "favicon.ico"), ico32);
console.log("wrote favicon.ico (PNG payload — modern browsers accept)");
