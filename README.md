# Trail App

Trail App is a Vite, React, and TypeScript project for working with trail-race GPX files. The current app accepts a GPX upload, parses track points in the browser, calculates cumulative route distance with the Haversine formula, and logs the total distance in kilometers.

## Getting Started

Install dependencies:

```sh
npm install
```

Run the local development server:

```sh
npm run dev
```

Build the production bundle:

```sh
npm run build
```

Run ESLint:

```sh
npm run lint
```

## GPX Upload and Parsing

The app exposes a file input that accepts `.gpx` files. When a file is selected, the browser reads it as text and passes the XML string to `parseGpx`.

`parseGpx(xml)` uses `DOMParser` to parse the GPX document and extracts each `trkpt` element into a `TrackPoint`:

```ts
type TrackPoint = {
  lat: number;
  lon: number;
  ele: number;
};
```

For each point:

- `lat` comes from the `trkpt` latitude attribute.
- `lon` comes from the `trkpt` longitude attribute.
- `ele` comes from the nested `<ele>` element.

If the XML is invalid, parsing throws an error. The upload handler currently logs the parsed point count, the first parsed point, and the total route distance to the console.

## Cumulative Distances with Haversine

Distance calculations use two helper functions:

1. `haversine(a, b)` returns the distance in meters between two adjacent points.
2. `cumulativeDistances(points)` returns a running total array, so each index has the distance from the start to that track point.

The Haversine formula estimates the great-circle distance between two latitude/longitude pairs. The app uses Earth's mean radius in meters and converts latitude and longitude values from degrees to radians before calculating distance.

```ts
function haversine(a: TrackPoint, b: TrackPoint): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}
```

`cumulativeDistances(points)` returns a number array in meters. `distances[0]` is `0`, and each later entry adds the distance between the previous point and the current point.

```ts
function cumulativeDistances(points: TrackPoint[]): number[] {
  const distances = [0];

  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1] + haversine(points[i - 1], points[i]));
  }

  return distances;
}
```

Expected behavior:

- The first point has a distance of `0`.
- Every later array entry stores the total distance from the start of the track.
- The upload handler converts the last cumulative distance from meters to kilometers and logs it with two decimal places.
- Distances are measured horizontally from latitude/longitude. Elevation gain is stored separately and is not part of the Haversine distance.
- The current helper starts with `[0]`, so empty tracks should be guarded by the caller before reading the last distance.

## Project Structure

```text
src/
  App.tsx      GPX upload UI, parser, and distance helpers
  App.css      App-level styles
  index.css    Global styles
```

## Current Status

- GPX upload input exists.
- GPX XML parsing exists for `trkpt` latitude, longitude, and elevation.
- Invalid XML is detected and reported.
- Cumulative distance helpers are implemented.
- Total route distance is logged in kilometers after upload.
