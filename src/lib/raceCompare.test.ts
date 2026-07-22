import { describe, expect, it } from "vitest";
import { compareRace, type PlanForComparison } from "./raceCompare";
import type { TrackPoint } from "./pacing";

// A synthetic 10 km course: straight north, one point every 100 m. The
// recording runs at `pace` sec/km with optional distance stretch and an
// optional dead stop (pausedAtKm for pausedSec, zero distance covered).
function recording(opts: {
  km?: number;
  paceSecPerKm?: number;
  stretch?: number; // 1.03 = GPS reads 3% long
  pausedAtKm?: number;
  pausedSec?: number;
}): TrackPoint[] {
  const km = opts.km ?? 10;
  const pace = opts.paceSecPerKm ?? 360;
  const stretch = opts.stretch ?? 1;
  const pts: TrackPoint[] = [];
  const stepKm = 0.1 * stretch; // physical distance per step after stretch
  const n = Math.round(km / 0.1);
  let t = 1_700_000_000_000;
  for (let i = 0; i <= n; i++) {
    const kmHere = i * stepKm;
    pts.push({
      // 111.194 km/degree matches the engine's Haversine radius, so the
      // fixture's nominal distances survive the round-trip.
      lat: 48.4 + kmHere / 111.194,
      lon: 2.6,
      ele: 100,
      time: t,
    });
    t += 0.1 * pace * 1000; // time advances per PLANNED 100 m
    if (
      opts.pausedAtKm !== undefined &&
      Math.abs(i * 0.1 - opts.pausedAtKm) < 0.049
    )
      t += (opts.pausedSec ?? 0) * 1000;
  }
  return pts;
}

// Plan: 10 buckets of 1 km at 360 s each (no dwell for simplicity).
const PLAN: PlanForComparison = {
  bucketEndKm: Array.from({ length: 10 }, (_, i) => i + 1),
  predictedAdjSec: Array.from({ length: 10 }, (_, i) => (i + 1) * 360),
  totalKm: 10,
};

describe("compareRace", () => {
  it("shows ~zero drift when the race matches the plan exactly", () => {
    const c = compareRace(recording({}), PLAN)!;
    expect(c.coverage).toBe("full");
    expect(c.finishSec).toBeCloseTo(3600, 0);
    for (const r of c.rows) expect(Math.abs(r.deltaSec!)).toBeLessThan(2);
  });

  it("normalizes away a +3% GPS distance overage", () => {
    const c = compareRace(recording({ stretch: 1.03 }), PLAN)!;
    expect(c.coverage).toBe("full");
    expect(c.recordedKm).toBeCloseTo(10.3, 1);
    // Absolute alignment would show ~+11 s/km of fake lateness; normalized
    // stays near zero.
    for (const r of c.rows) expect(Math.abs(r.deltaSec!)).toBeLessThan(5);
  });

  it("marks a short recording as partial with trailing nulls", () => {
    const c = compareRace(recording({ km: 6 }), PLAN)!;
    expect(c.coverage).toBe("partial");
    expect(c.rows[5].actualSec).not.toBeNull();
    expect(c.rows[9].actualSec).toBeNull();
    expect(c.rows[9].deltaSec).toBeNull();
    expect(c.finishSec).toBeGreaterThan(0);
  });

  it("keeps a paused-watch gap in elapsed, excludes it from moving, and locates it", () => {
    const c = compareRace(
      recording({ pausedAtKm: 5, pausedSec: 600 }),
      PLAN,
    )!;
    expect(c.finishSec).toBeCloseTo(4200, 0); // 3600 + 600
    expect(c.movingSec).toBeLessThan(3700); // pause filtered
    // Drift steps by ~600 at km 5 and the worst stretch brackets it.
    const before = c.rows[3].deltaSec!;
    const after = c.rows[6].deltaSec!;
    expect(after - before).toBeGreaterThan(550);
    expect(c.worstStretch!.lostSec).toBeGreaterThan(400);
    expect(c.worstStretch!.fromKm).toBeLessThanOrEqual(6);
    expect(c.worstStretch!.toKm).toBeGreaterThanOrEqual(5);
  });

  it("survives a backwards timestamp without negative splits", () => {
    const pts = recording({});
    pts[50] = { ...pts[50], time: pts[49].time! - 5_000 };
    const c = compareRace(pts, PLAN)!;
    for (let i = 1; i < c.rows.length; i++)
      expect(c.rows[i].actualSec!).toBeGreaterThanOrEqual(
        c.rows[i - 1].actualSec!,
      );
  });

  it("refuses an untimed or partially timed recording", () => {
    const pts = recording({});
    delete pts[10].time;
    expect(compareRace(pts, PLAN)).toBeNull();
  });
});
