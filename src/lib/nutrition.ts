// Race-nutrition planner: hourly intake targets applied to each leg of the
// pacing plan (start → R1 → … → finish). Pure module, no React.
//
// The model is deliberately simple — rate × leg duration. What to eat per
// hour is sports-science consensus territory (see DEFAULT_RATES); WHEN and
// HOW MUCH per leg is where a pacing plan adds real value, because leg
// durations come from the projected splits, not from distance alone.

export type NutritionRates = {
  carbsGPerH: number; // grams of carbohydrate per hour
  fluidMlPerH: number; // millilitres of fluid per hour
  sodiumMgPerH: number; // mg of ELEMENTAL sodium per hour (not salt mass)
  // Optional: 0/omitted = feature off. Guidance caps total intake around
  // 3-6 mg/kg per event; the UI hints to weight it toward the back half.
  caffeineMgPerH?: number;
};

// Defaults sit mid-band of the published guidance: carbs 60–90 g/h for
// ultra efforts (>90 only with a trained gut on glucose:fructose mixes),
// fluid 400–750 ml/h scaled to heat, sodium 300–600 mg/h for average
// sweaters — salty sweaters genuinely need up to ~1000+, hence the wide
// slider range in the UI. 1 g table salt ≈ 390 mg sodium.
export const DEFAULT_RATES: NutritionRates = {
  carbsGPerH: 70,
  fluidMlPerH: 500,
  sodiumMgPerH: 450,
};

export const KCAL_PER_G_CARB = 4;
export const GEL_CARBS_G = 25; // typical single gel

export type NutritionLeg = {
  fromKm: number;
  toKm: number;
  startSec: number; // projected elapsed time entering the leg
  endSec: number;
  durationSec: number;
  carbsG: number;
  kcal: number;
  fluidMl: number;
  sodiumMg: number;
  caffeineMg: number;
};

export type NutritionTotals = {
  durationSec: number;
  carbsG: number;
  kcal: number;
  fluidMl: number;
  sodiumMg: number;
  caffeineMg: number;
};

export type NutritionPlan = {
  legs: NutritionLeg[];
  totals: NutritionTotals;
  gels: number; // total carbs expressed in 25 g gel equivalents (fractional)
};

// aidStops: projected {km, eta-seconds} for each station, any order. Stops
// at/beyond the finish (possible from rounding near the last km) or before
// the start are dropped; near-duplicate ETAs (< 1 s apart) collapse so a
// zero-length leg can't appear.
export function computeNutrition(
  finishSec: number,
  totalKm: number,
  aidStops: { km: number; eta: number }[],
  rates: NutritionRates,
): NutritionPlan {
  const zero: NutritionTotals = {
    durationSec: 0,
    carbsG: 0,
    kcal: 0,
    fluidMl: 0,
    sodiumMg: 0,
    caffeineMg: 0,
  };
  if (!(finishSec > 0)) return { legs: [], totals: zero, gels: 0 };

  const bounds: { km: number; sec: number }[] = [{ km: 0, sec: 0 }];
  for (const s of [...aidStops].sort((a, b) => a.eta - b.eta)) {
    if (s.eta <= 0 || s.eta >= finishSec) continue;
    if (s.eta - bounds[bounds.length - 1].sec < 1) continue;
    bounds.push({ km: s.km, sec: s.eta });
  }
  bounds.push({ km: totalKm, sec: finishSec });

  const perLeg = (durationSec: number) => {
    const h = durationSec / 3600;
    const carbsG = rates.carbsGPerH * h;
    return {
      durationSec,
      carbsG,
      kcal: carbsG * KCAL_PER_G_CARB,
      fluidMl: rates.fluidMlPerH * h,
      sodiumMg: rates.sodiumMgPerH * h,
      caffeineMg: (rates.caffeineMgPerH ?? 0) * h,
    };
  };

  const legs: NutritionLeg[] = [];
  for (let i = 1; i < bounds.length; i++) {
    const from = bounds[i - 1];
    const to = bounds[i];
    legs.push({
      fromKm: from.km,
      toKm: to.km,
      startSec: from.sec,
      endSec: to.sec,
      ...perLeg(to.sec - from.sec),
    });
  }

  // Totals from the finish time directly — identical to the leg sum, since
  // the legs partition [0, finishSec], but immune to float dust.
  const totals = perLeg(finishSec);
  return { legs, totals, gels: totals.carbsG / GEL_CARBS_G };
}
