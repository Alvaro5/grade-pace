// Post-race accuracy check: overlay what actually happened on what the plan
// predicted. Pure module; consumes the RAW timed points of the recorded race
// (never the resampled geometry) and the plan's dwell-adjusted cumulative
// times as plain arrays, so it needs no knowledge of dwell logic.
//
// Comparison is WALL ELAPSED on both sides: the plan's side already contains
// aid-station dwell, the actual side is timestamps first-to-last. Paused-
// watch gaps deliberately stay in: they surface as a step in the drift
// series, which is exactly the "lost 12 minutes at km 42" signal a runner
// wants. Moving time is reported separately so the stop overhead is visible.

import {
  cumulativeDistances,
  movingTimeSec,
  type TrackPoint,
} from "./pacing";

export type ComparisonRow = {
  km: number; // plan bucket index (display bucket #)
  predictedSec: number;
  actualSec: number | null; // null past the end of a partial recording
  deltaSec: number | null;
};

export type RaceComparison = {
  finishSec: number; // wall elapsed, first to last timestamp
  movingSec: number; // stops filtered (STOPPED_SPEED_MS)
  recordedKm: number;
  coverage: "full" | "partial" | "mismatch";
  rows: ComparisonRow[];
  // The contiguous ~10% of the course where the gap to the plan grew most
  // (negative lostSec = the runner GAINED there).
  worstStretch: { fromKm: number; toKm: number; lostSec: number } | null;
};

export type PlanForComparison = {
  bucketEndKm: number[]; // cumulative course km at each bucket end
  predictedAdjSec: number[]; // dwell-adjusted cumulative elapsed, parallel
  totalKm: number;
};

// Recorded GPS distance runs 2-3% long on real courses; inside this band we
// align by FRACTION of the total so the runner isn't shown "behind" purely
// from GPS overage. Outside it, absolute distance is the honest fallback.
const NORMALIZE_MIN = 0.92;
const NORMALIZE_MAX = 1.08;

export function compareRace(
  recorded: TrackPoint[],
  plan: PlanForComparison,
): RaceComparison | null {
  if (recorded.length < 2 || plan.bucketEndKm.length === 0) return null;
  // All-or-nothing timing, like calibration: a partially-timed file can't
  // anchor a comparison.
  if (recorded.some((p) => typeof p.time !== "number")) return null;
  const moving = movingTimeSec(recorded);
  if (moving === null) return null;

  const dists = cumulativeDistances(recorded);
  const recordedM = dists[dists.length - 1];
  if (!(recordedM > 0)) return null;

  // Cumulative elapsed, clamped nondecreasing so a backwards timestamp
  // can't produce a negative split.
  const elapsed = new Array<number>(recorded.length).fill(0);
  for (let i = 1; i < recorded.length; i++) {
    const dt = (recorded[i].time! - recorded[i - 1].time!) / 1000;
    elapsed[i] = elapsed[i - 1] + Math.max(0, dt);
  }
  const finishSec = elapsed[elapsed.length - 1];

  // Elapsed at a given recorded distance, interpolated; duplicate distances
  // (stopped clusters) resolve to the LATER timestamp, matching the plan's
  // dwell-after-arrival convention.
  let cursor = 0;
  const elapsedAtM = (m: number): number => {
    if (m <= 0) return 0;
    if (m >= recordedM) return finishSec;
    while (cursor < dists.length - 1 && dists[cursor + 1] <= m) cursor++;
    while (cursor > 0 && dists[cursor] > m) cursor--;
    const d0 = dists[cursor];
    const d1 = dists[cursor + 1];
    if (d1 === d0) return elapsed[cursor + 1];
    const f = (m - d0) / (d1 - d0);
    return elapsed[cursor] + f * (elapsed[cursor + 1] - elapsed[cursor]);
  };

  const ratio = recordedM / 1000 / plan.totalKm;
  const coverage: RaceComparison["coverage"] =
    ratio < NORMALIZE_MIN
      ? "partial"
      : ratio > NORMALIZE_MAX
        ? "mismatch"
        : "full";
  const normalize = coverage === "full";

  const rows: ComparisonRow[] = plan.bucketEndKm.map((endKm, i) => {
    const queryM = normalize
      ? (endKm / plan.totalKm) * recordedM
      : endKm * 1000;
    const actualSec =
      queryM <= recordedM + 1 ? elapsedAtM(Math.min(queryM, recordedM)) : null;
    return {
      km: i + 1,
      predictedSec: plan.predictedAdjSec[i],
      actualSec,
      deltaSec: actualSec === null ? null : actualSec - plan.predictedAdjSec[i],
    };
  });

  // Worst stretch: sliding window over the drift series.
  const deltas = rows
    .filter((r) => r.deltaSec !== null)
    .map((r) => ({ km: r.km, delta: r.deltaSec! }));
  let worstStretch: RaceComparison["worstStretch"] = null;
  if (deltas.length >= 2) {
    const win = Math.max(2, Math.ceil(deltas.length * 0.1));
    let best = -Infinity;
    for (let i = 0; i + win < deltas.length + 1 && i + win - 1 < deltas.length; i++) {
      const j = Math.min(deltas.length - 1, i + win - 1);
      const growth = deltas[j].delta - deltas[i].delta;
      if (growth > best) {
        best = growth;
        worstStretch = {
          fromKm: deltas[i].km,
          toKm: deltas[j].km,
          lostSec: growth,
        };
      }
    }
  }

  return {
    finishSec,
    movingSec: moving,
    recordedKm: recordedM / 1000,
    coverage,
    rows,
    worstStretch,
  };
}
