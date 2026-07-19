// Dev harness: render the share card to PNG outside the browser so visual
// changes can be eyeballed without a running app. Mirrors App.tsx's data prep.
//
// Usage: npx tsx scripts/render-card-preview.mjs <course.gpx> <out.png>
// (tsx, not plain node — shareCard.ts uses extensionless relative imports.)
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { Window } from "happy-dom";

const win = new Window();
globalThis.DOMParser = win.DOMParser;

const {
  parseGpx,
  cumulativeDistances,
  resampleEven,
  smoothElevationByDistance,
  cumulativeGain,
  gradients,
  computeSplits,
} = await import("../src/lib/pacing.ts");
const { buildShareCardSvg } = await import("../src/lib/shareCard.ts");

const points = parseGpx(readFileSync(process.argv[2], "utf8"));
const resampled = resampleEven(points, cumulativeDistances(points), 10);
const dists = resampled.dists;
const smoothed = smoothElevationByDistance(resampled.points, dists, 30);
const grades = gradients(smoothed, dists);
const splits = computeSplits(dists, grades, 360, 750, 0.18, 1);
const timeSec = splits[splits.length - 1].elapsedSec;
const totalKm = dists[dists.length - 1] / 1000;

const svg = buildShareCardSvg({
  title: "Imperial Trail",
  distanceKm: totalKm,
  gainM: cumulativeGain(smoothed.map((p) => p.ele), 5),
  timeSec,
  rangeLowSec: timeSec * 0.92,
  rangeHighSec: timeSec * 1.1,
  hikePct: 1,
  avgPaceSecPerKm: timeSec / totalKm,
  profile: smoothed.map((p, i) => ({ km: dists[i] / 1000, ele: p.ele })),
  siteUrl: "gradepace.vercel.app",
});

await sharp(Buffer.from(svg)).png().toFile(process.argv[3]);
console.log("wrote", process.argv[3]);
