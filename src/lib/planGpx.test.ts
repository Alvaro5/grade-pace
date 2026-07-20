// @vitest-environment happy-dom
// happy-dom supplies DOMParser so the round-trip check can use the app's own
// GPX parser: what we export must be importable by ourselves.
import { describe, expect, it } from "vitest";
import { buildPlanGpx } from "./planGpx";
import { parseGpx, parseGpxWaypoints } from "./pacing";

const N = 500; // 5 km at 10 m spacing
const COORDS = Array.from({ length: N }, (_, i) => ({
  lat: 48.4 + i * 0.00009,
  lon: 2.6,
}));
const ELES = Array.from({ length: N }, (_, i) => 100 + Math.sin(i / 40) * 20);

const DATA = {
  title: 'Imperial <Trail> & "friends"',
  coords: COORDS,
  eles: ELES,
  aid: [
    { km: 2, name: "R1 · 2.0 km · ETA 0:12" },
    { km: 4, name: "R2 · 4.0 km · ETA 0:25" },
  ],
  startName: "Start · 8:00",
  finishName: "Finish",
};

describe("buildPlanGpx", () => {
  it("round-trips through the app's own parser", () => {
    const xml = buildPlanGpx(DATA);
    const points = parseGpx(xml);
    expect(points.length).toBeGreaterThan(100);
    // Track starts and ends exactly at the course endpoints.
    expect(points[0].lat).toBeCloseTo(COORDS[0].lat, 5);
    expect(points[points.length - 1].lat).toBeCloseTo(
      COORDS[N - 1].lat,
      5,
    );
    // Start + 2 aid + finish waypoints, names intact.
    const wpts = parseGpxWaypoints(xml);
    expect(wpts).toHaveLength(4);
    expect(wpts.map((w) => w.name)).toEqual([
      "Start · 8:00",
      "R1 · 2.0 km · ETA 0:12",
      "R2 · 4.0 km · ETA 0:25",
      "Finish",
    ]);
  });

  it("escapes XML in titles and names", () => {
    const xml = buildPlanGpx(DATA);
    expect(xml).toContain("Imperial &lt;Trail&gt; &amp; &quot;friends&quot;");
    expect(xml).not.toContain("<Trail>");
  });

  it("caps the track density for watch friendliness", () => {
    const big = {
      ...DATA,
      coords: Array.from({ length: 7000 }, (_, i) => ({
        lat: 48.4 + i * 0.00001,
        lon: 2.6,
      })),
      eles: Array.from({ length: 7000 }, () => 100),
    };
    const xml = buildPlanGpx(big);
    const count = (xml.match(/<trkpt /g) ?? []).length;
    expect(count).toBeLessThanOrEqual(2001);
    expect(count).toBeGreaterThan(1500);
  });

  it("throws on a degenerate course", () => {
    expect(() =>
      buildPlanGpx({ ...DATA, coords: [COORDS[0]], eles: [100] }),
    ).toThrow();
  });
});
