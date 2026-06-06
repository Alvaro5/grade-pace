import "./App.css";

type TrackPoint = {
  lat: number;
  lon: number;
  ele: number;
};

function parseGpx(xml: string): TrackPoint[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Not a valid GPX/XML file");
  }
  const trkpts = doc.querySelectorAll("trkpt");
  return Array.from(trkpts).map((pt) => ({
    lat: Number(pt.getAttribute("lat")),
    lon: Number(pt.getAttribute("lon")),
    ele: Number(pt.querySelector("ele")?.textContent),
  }));
}

function haversine(a: TrackPoint, b: TrackPoint): number {
  const R = 6371000; // Earth's mean radius in meters
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

function cumulativeDistances(points: TrackPoint[]): number[] {
  const distances = [0]; // first point is the start: 0 meters in
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1] + haversine(points[i - 1], points[i]));
  }
  return distances;
}

function GpxUpload() {
  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then((text) => {
        const points = parseGpx(text);
        const distances = cumulativeDistances(points);
        const totalKm = distances[distances.length - 1] / 1000;
        console.log(`Parsed ${points.length} points`, points[0]);
        console.log(`Total distance: ${totalKm.toFixed(2)} km`);
      })
      .catch((err) => console.error(err));
  }
  return <input type="file" accept=".gpx" onChange={handleFile} />;
}

function App() {
  return (
    <>
      <section id="center">
        <div className="hero"></div>
        <div>
          <h1>Get started</h1>
          <GpxUpload />
        </div>
      </section>
    </>
  );
}

export default App;
