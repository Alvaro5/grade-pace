// Watch-ready GPX export: the course as a track plus the plan's landmarks as
// waypoints (start, finish, and every aid station with its projected ETA in
// the name). Load it onto a Garmin/COROS and the plan rides on your wrist.
// Pure module: build a string, no DOM.

const escXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export type PlanGpxData = {
  title: string;
  // Resampled course, 10 m spacing; profile carries the smoothed elevations
  // and is parallel to coords.
  coords: { lat: number; lon: number }[];
  eles: number[];
  // Aid stations: metric km + a display name ("R1 · 17.0 km · ETA 1:52").
  aid: { km: number; name: string }[];
  startName: string;
  finishName: string;
};

// Watches choke on very dense tracks; ~2000 points describes a 70 km course
// at ~35 m spacing, plenty for navigation.
const MAX_TRACK_POINTS = 2000;

export function buildPlanGpx(d: PlanGpxData): string {
  const n = d.coords.length;
  if (n < 2) throw new Error("course too short to export");
  const stride = Math.max(1, Math.ceil(n / MAX_TRACK_POINTS));

  const wpt = (lat: number, lon: number, ele: number, name: string) =>
    `  <wpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${ele.toFixed(1)}</ele><name>${escXml(name)}</name></wpt>`;

  const waypoints: string[] = [
    wpt(d.coords[0].lat, d.coords[0].lon, d.eles[0] ?? 0, d.startName),
    ...d.aid.map((a) => {
      const idx = Math.min(n - 1, Math.max(0, Math.round((a.km * 1000) / 10)));
      return wpt(d.coords[idx].lat, d.coords[idx].lon, d.eles[idx] ?? 0, a.name);
    }),
    wpt(d.coords[n - 1].lat, d.coords[n - 1].lon, d.eles[n - 1] ?? 0, d.finishName),
  ];

  const pts: string[] = [];
  for (let i = 0; i < n; i += stride)
    pts.push(
      `      <trkpt lat="${d.coords[i].lat.toFixed(6)}" lon="${d.coords[i].lon.toFixed(6)}"><ele>${(d.eles[i] ?? 0).toFixed(1)}</ele></trkpt>`,
    );
  // Always keep the exact final point so the track ends at the finish.
  if ((n - 1) % stride !== 0)
    pts.push(
      `      <trkpt lat="${d.coords[n - 1].lat.toFixed(6)}" lon="${d.coords[n - 1].lon.toFixed(6)}"><ele>${(d.eles[n - 1] ?? 0).toFixed(1)}</ele></trkpt>`,
    );

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GradePace" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escXml(d.title)}</name></metadata>
${waypoints.join("\n")}
  <trk>
    <name>${escXml(d.title)}</name>
    <trkseg>
${pts.join("\n")}
    </trkseg>
  </trk>
</gpx>
`;
}
