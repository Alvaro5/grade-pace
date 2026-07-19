import { describe, expect, it } from "vitest";
import {
  computeNutrition,
  DEFAULT_RATES,
  GEL_CARBS_G,
} from "./nutrition";

const H = 3600;

describe("computeNutrition", () => {
  it("one leg covering the whole race when there are no aid stations", () => {
    const plan = computeNutrition(8 * H, 70, [], DEFAULT_RATES);
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0]).toMatchObject({ fromKm: 0, toKm: 70, startSec: 0 });
    expect(plan.legs[0].durationSec).toBe(8 * H);
    expect(plan.legs[0].carbsG).toBeCloseTo(8 * 70);
    expect(plan.legs[0].kcal).toBeCloseTo(8 * 70 * 4);
    expect(plan.legs[0].fluidMl).toBeCloseTo(8 * 500);
    expect(plan.legs[0].sodiumMg).toBeCloseTo(8 * 450);
  });

  it("partitions at station ETAs and the legs sum to the totals", () => {
    const stops = [
      { km: 17, eta: 2 * H },
      { km: 33, eta: 4 * H },
      { km: 47, eta: 5.5 * H },
    ];
    const plan = computeNutrition(8 * H, 70, stops, DEFAULT_RATES);
    expect(plan.legs).toHaveLength(4);
    expect(plan.legs.map((l) => l.fromKm)).toEqual([0, 17, 33, 47]);
    expect(plan.legs.map((l) => l.toKm)).toEqual([17, 33, 47, 70]);
    const sum = (k: "carbsG" | "fluidMl" | "sodiumMg" | "durationSec") =>
      plan.legs.reduce((s, l) => s + l[k], 0);
    expect(sum("durationSec")).toBeCloseTo(plan.totals.durationSec);
    expect(sum("carbsG")).toBeCloseTo(plan.totals.carbsG);
    expect(sum("fluidMl")).toBeCloseTo(plan.totals.fluidMl);
    expect(sum("sodiumMg")).toBeCloseTo(plan.totals.sodiumMg);
  });

  it("amounts scale with leg duration, not distance", () => {
    // Same distance split, very different durations (a slow climb leg).
    const plan = computeNutrition(
      6 * H,
      40,
      [{ km: 20, eta: 4 * H }],
      DEFAULT_RATES,
    );
    expect(plan.legs[0].carbsG).toBeCloseTo(4 * 70); // 4 h leg
    expect(plan.legs[1].carbsG).toBeCloseTo(2 * 70); // 2 h leg
  });

  it("drops stations at or beyond the finish and before the start", () => {
    const plan = computeNutrition(
      5 * H,
      50,
      [
        { km: 49.9, eta: 5 * H }, // exactly at finish → merged into last leg
        { km: 60, eta: 6 * H }, // beyond
        { km: 0, eta: 0 }, // at start
        { km: 25, eta: 2.5 * H }, // valid
      ],
      DEFAULT_RATES,
    );
    expect(plan.legs).toHaveLength(2);
    expect(plan.legs.map((l) => l.toKm)).toEqual([25, 50]);
  });

  it("collapses duplicate/near-duplicate ETAs and sorts unsorted stops", () => {
    const plan = computeNutrition(
      4 * H,
      40,
      [
        { km: 30, eta: 3 * H },
        { km: 10, eta: 1 * H },
        { km: 10.01, eta: 1 * H + 0.5 }, // <1 s after the previous → dropped
      ],
      DEFAULT_RATES,
    );
    expect(plan.legs.map((l) => l.fromKm)).toEqual([0, 10, 30]);
  });

  it("returns an empty plan for a zero or negative finish time", () => {
    for (const finish of [0, -5]) {
      const plan = computeNutrition(finish, 10, [], DEFAULT_RATES);
      expect(plan.legs).toEqual([]);
      expect(plan.totals.carbsG).toBe(0);
      expect(plan.gels).toBe(0);
    }
  });

  it("keeps short legs exact (no premature rounding in the lib)", () => {
    const plan = computeNutrition(
      4 * 60, // 4-minute race
      1,
      [],
      DEFAULT_RATES,
    );
    expect(plan.legs[0].carbsG).toBeCloseTo((70 * 4) / 60, 10);
  });

  it("expresses total carbs as 25 g gel equivalents", () => {
    const plan = computeNutrition(5 * H, 50, [], DEFAULT_RATES);
    expect(plan.gels).toBeCloseTo((5 * 70) / GEL_CARBS_G);
  });
});
