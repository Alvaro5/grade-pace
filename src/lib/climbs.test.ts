import { describe, expect, it } from "vitest";
import { detectClimbs } from "./climbs";

// Build a profile from (km, ele) breakpoints, linearly interpolated at 10 m.
function profileOf(breaks: [number, number][]): { km: number; ele: number }[] {
  const out: { km: number; ele: number }[] = [];
  for (let b = 0; b < breaks.length - 1; b++) {
    const [k0, e0] = breaks[b];
    const [k1, e1] = breaks[b + 1];
    const steps = Math.max(1, Math.round(((k1 - k0) * 1000) / 10));
    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      out.push({ km: k0 + (k1 - k0) * f, ele: e0 + (e1 - e0) * f });
    }
  }
  out.push({ km: breaks[breaks.length - 1][0], ele: breaks[breaks.length - 1][1] });
  return out;
}

describe("detectClimbs", () => {
  it("finds a single clean triangle climb with exact bounds", () => {
    const p = profileOf([
      [0, 100],
      [1, 200],
      [2, 100],
    ]);
    const climbs = detectClimbs(p);
    expect(climbs).toHaveLength(1);
    expect(climbs[0].fromKm).toBeCloseTo(0, 3);
    expect(climbs[0].toKm).toBeCloseTo(1, 3);
    expect(climbs[0].gainM).toBeCloseTo(100, 3);
    expect(climbs[0].avgGrade).toBeCloseTo(0.1, 3);
  });

  it("merges a small dip inside a big climb (relative tolerance)", () => {
    // 300 up, 20 down, 300 up: at 300 m banked gain, dipTol = 30 > 20.
    const p = profileOf([
      [0, 0],
      [3, 300],
      [3.5, 280],
      [6.5, 580],
      [8, 400],
    ]);
    const climbs = detectClimbs(p);
    expect(climbs).toHaveLength(1);
    expect(climbs[0].gainM).toBeCloseTo(580, 1);
  });

  it("splits on a dip that exceeds the tolerance", () => {
    // 100 up, 40 down, 100 up: dipTol = max(10, 10) = 10 < 40 → two climbs.
    const p = profileOf([
      [0, 0],
      [1, 100],
      [1.5, 60],
      [2.5, 160],
      [3, 100],
    ]);
    const climbs = detectClimbs(p);
    expect(climbs).toHaveLength(2);
    expect(climbs[0].gainM).toBeCloseTo(100, 1);
    expect(climbs[1].gainM).toBeCloseTo(100, 1);
  });

  it("rejects rolling terrain below the gain and grade floors", () => {
    // ±8 m rolls on a gentle 2% drag: valley-to-peak is 26 m, under the
    // 30 m floor. Nothing a runner would call a climb.
    const breaks: [number, number][] = [];
    for (let k = 0; k <= 10; k += 0.5)
      breaks.push([k, 20 * k + (k % 1 === 0 ? 8 : -8)]);
    expect(detectClimbs(profileOf(breaks))).toHaveLength(0);
  });

  it("ends the climb at the FIRST sample of a summit plateau", () => {
    const p = profileOf([
      [0, 0],
      [1, 100],
      [1.5, 100], // flat top
      [2, 20],
    ]);
    const climbs = detectClimbs(p);
    expect(climbs).toHaveLength(1);
    expect(climbs[0].toKm).toBeCloseTo(1, 2);
  });

  it("emits a climb even when the course ends mid-ascent", () => {
    const p = profileOf([
      [0, 0],
      [1, 50],
    ]);
    const climbs = detectClimbs(p);
    expect(climbs).toHaveLength(1);
    expect(climbs[0].gainM).toBeCloseTo(50, 1);
  });

  it("counts only the tall walls in a mixed wall field", () => {
    // Alternating 25 m and 50 m walls: only the 50 m ones clear minGainM=30.
    const breaks: [number, number][] = [[0, 0]];
    let km = 0;
    for (let i = 0; i < 4; i++) {
      const h = i % 2 === 0 ? 25 : 50;
      km += 0.3;
      breaks.push([km, h]);
      km += 0.3;
      breaks.push([km, 0]);
    }
    const climbs = detectClimbs(profileOf(breaks));
    expect(climbs).toHaveLength(2);
    for (const c of climbs) expect(c.gainM).toBeGreaterThanOrEqual(45);
  });
});
