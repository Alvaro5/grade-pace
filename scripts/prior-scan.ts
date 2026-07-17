// Throwaway analysis: which course-derivable signal predicts the measured
// terrain factor? Candidates, all computed AFTER the app's own pipeline
// (resample 10 m → smooth 30 m), so the prior sees exactly what the app sees:
//  - eleRoughness: mean |Δgrade| between adjacent 10 m segments (elevation
//    texture; risk: contaminated by GPS-vs-DEM elevation source differences)
//  - steepFrac: fraction of distance with |grade| > 12% (modeled by Minetti,
//    so may not explain the residual factor)
//  - bearingRate: mean |Δbearing| in degrees per 10 m step (horizontal
//    twistiness — singletrack turns, road is straight; elevation-source-free)
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Window } from "happy-dom";

const win = new Window();
(globalThis as unknown as { DOMParser: typeof win.DOMParser }).DOMParser =
  win.DOMParser;

const {
  parseGpx,
  cumulativeDistances,
  resampleEven,
  smoothElevationByDistance,
  gradients,
} = await import("../src/lib/pacing.ts");

// Measured factors (moving-time fit, this session). null = no real timing.
const MEASURED: Record<string, number | null> = {
  "run_quais.gpx": 0.993,
  "run_pajariel_ponferrada.gpx": 1.013,
  "run_bois_de_boulogne.gpx": 1.062,
  "run_campagne.gpx": 1.08,
};

const bearing = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return (Math.atan2(y, x) * 180) / Math.PI;
};

console.log(
  `${"file".padEnd(28)} ${"eleRough".padStart(9)} ${"steepFrac".padStart(10)} ${"bearRate".padStart(9)} ${"factor".padStart(7)}`,
);

for (const file of process.argv.slice(2)) {
  const name = basename(file);
  try {
    const points = parseGpx(readFileSync(file, "utf8"));
    const resampled = resampleEven(points, cumulativeDistances(points), 10);
    const dists = resampled.dists;
    const smoothed = smoothElevationByDistance(resampled.points, dists, 30);
    const grades = gradients(smoothed, dists);

    let dg = 0;
    for (let i = 1; i < grades.length; i++) dg += Math.abs(grades[i] - grades[i - 1]);
    const eleRough = dg / (grades.length - 1);

    let steepM = 0;
    for (let i = 0; i < grades.length; i++)
      if (Math.abs(grades[i]) > 0.12) steepM += dists[i + 1] - dists[i];
    const steepFrac = steepM / dists[dists.length - 1];

    let db = 0;
    let n = 0;
    const pts = resampled.points;
    for (let i = 2; i < pts.length; i++) {
      let d = bearing(pts[i - 1], pts[i]) - bearing(pts[i - 2], pts[i - 1]);
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      db += Math.abs(d);
      n++;
    }
    const bearRate = db / n;

    const f = MEASURED[name];
    console.log(
      `${name.padEnd(28)} ${eleRough.toFixed(4).padStart(9)} ${steepFrac.toFixed(3).padStart(10)} ${bearRate.toFixed(2).padStart(9)} ${(f ? f.toFixed(3) : "—").padStart(7)}`,
    );
  } catch (e) {
    console.log(`${name.padEnd(28)} ERROR ${(e as Error).message}`);
  }
}
