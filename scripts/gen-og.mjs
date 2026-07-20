// Rasterize the social card + icons. X/Twitter require a raster og:image —
// an SVG og:image will not unfurl. sharp ships prebuilt libvips, so no system
// image libraries are needed.
//
// The og card IS the product's share card, rendered from the bundled example
// course through the real engine pipeline — so the link preview always shows
// what the app actually produces today (colored profile, honest range), and
// can't silently drift from the product.
//
// Usage: npx tsx scripts/gen-og.mjs
// (tsx, not plain node — the engine uses extensionless relative TS imports.)
// Produces: public/og.png (1200x630), public/apple-touch-icon.png (180x180)
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Window } from "happy-dom";

const win = new Window();
globalThis.DOMParser = win.DOMParser;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");

const {
  parseGpx,
  cumulativeDistances,
  resampleEven,
  smoothElevationByDistance,
  cumulativeGain,
  gradients,
  computeSplits,
  finishRange,
} = await import("../src/lib/pacing.ts");
const { buildShareCardSvg } = await import("../src/lib/shareCard.ts");

// Mirror App.tsx's pipeline and defaults exactly (10 m resample, 30 m smooth,
// 5 m D+ threshold, 6:00/km, VAM 750, gate 18%, terrain ×1.04 — the measured
// default — uncalibrated range).
const points = parseGpx(
  readFileSync(join(pub, "example-imperial-trail.gpx"), "utf8"),
);
const resampled = resampleEven(points, cumulativeDistances(points), 10);
const dists = resampled.dists;
const smoothed = smoothElevationByDistance(resampled.points, dists, 30);
const grades = gradients(smoothed, dists);
const splits = computeSplits(dists, grades, 360, 750, 0.18, 1.04);
const timeSec = splits[splits.length - 1].elapsedSec;
const totalKm = dists[dists.length - 1] / 1000;
const range = finishRange(timeSec, false);
const hikeMeters = splits.reduce(
  (sum, s) => sum + s.hikeFraction * s.distanceKm * 1000,
  0,
);

const svg = buildShareCardSvg({
  title: "Imperial Trail",
  distanceKm: totalKm,
  gainM: cumulativeGain(
    smoothed.map((p) => p.ele),
    5,
  ),
  timeSec,
  rangeLowSec: range.lowSec,
  rangeHighSec: range.highSec,
  hikePct: (hikeMeters / (totalKm * 1000)) * 100,
  avgPaceSecPerKm: timeSec / totalKm,
  profile: smoothed.map((p, i) => ({ km: dists[i] / 1000, ele: p.ele })),
  siteUrl: "gradepace.vercel.app",
  hikeAboveGrade: 0.18,
});

await sharp(Buffer.from(svg)).png().toFile(join(pub, "og.png"));
console.log("wrote public/og.png (1200x630)");

await sharp(readFileSync(join(pub, "favicon.svg")))
  .resize(180, 180)
  .png()
  .toFile(join(pub, "apple-touch-icon.png"));
console.log("wrote public/apple-touch-icon.png (180x180)");

// PWA install icons, from the same favicon source. The "any" icons keep the
// rounded-square design; the maskable one is full-bleed dark with the mark
// inside the safe zone (the platform mask crops the edges).
for (const size of [192, 512]) {
  await sharp(readFileSync(join(pub, "favicon.svg")), { density: 300 })
    .resize(size, size)
    .png()
    .toFile(join(pub, `pwa-${size}.png`));
  console.log(`wrote public/pwa-${size}.png`);
}
const inner = Math.round(512 * 0.72);
const mark = await sharp(readFileSync(join(pub, "favicon.svg")), {
  density: 300,
})
  .resize(inner, inner)
  .png()
  .toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#18181b" },
})
  .composite([{ input: mark, gravity: "centre" }])
  .png()
  .toFile(join(pub, "pwa-maskable-512.png"));
console.log("wrote public/pwa-maskable-512.png");
