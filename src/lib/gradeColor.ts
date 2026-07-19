// Shared grade→color scale, used by BOTH the on-page chart and the share-card
// SVG so the two can never drift apart. Thresholds echo the product language:
// blues = descent, emerald = runnable, amber/orange = climbing, rose =
// power-hike territory (near the default 18% gate).
export function gradeColor(g: number): string {
  if (g > 0.15) return "#f43f5e"; // rose-500 — hike-steep
  if (g > 0.08) return "#fb923c"; // orange-400 — hard climb
  if (g > 0.03) return "#fbbf24"; // amber-400 — climb
  if (g < -0.08) return "#38bdf8"; // sky-400 — steep descent
  if (g < -0.03) return "#7dd3fc"; // sky-300 — descent
  return "#34d399"; // emerald-400 — flat / runnable
}
