import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  parseGpx,
  cumulativeDistances,
  smoothElevation,
  elevationChange,
  gradients,
  computeSplits,
  type Split,
} from "./lib/pacing";

type Track = {
  distances: number[];
  grades: number[];
  distanceKm: number;
  gainM: number;
  profile: { km: number; ele: number }[];
};

const pad = (n: number) => String(n).padStart(2, "0");

const fmtClock = (s: number) => {
  const t = Math.round(s);
  return `${Math.floor(t / 3600)}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
};

const fmtPace = (s: number) => {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${pad(t % 60)}`;
};

const fmtGrade = (g: number) => `${g > 0 ? "+" : ""}${(g * 100).toFixed(0)}%`;

const gradeClass = (g: number) =>
  g > 0.005 ? "text-rose-400" : g < -0.005 ? "text-sky-400" : "text-zinc-400";

// "6:00" -> 360 seconds; falls back to 6:00 if unparseable
function parsePace(text: string): number {
  const [m, s] = text.split(":").map(Number);
  const sec = (m || 0) * 60 + (s || 0);
  return sec > 0 ? sec : 360;
}

const inputClass =
  "w-28 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-100 tabular-nums focus:border-emerald-500 focus:outline-none";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-xs uppercase tracking-wider text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex w-44 flex-col gap-1 text-sm">
      <span className="text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function SliderField({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex w-44 flex-col gap-1 text-sm">
      <span className="flex justify-between text-zinc-400">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-200">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-emerald-500"
      />
    </label>
  );
}

function GpxUpload() {
  const [track, setTrack] = useState<Track | null>(null);
  const [paceText, setPaceText] = useState("6:00");
  const [vam, setVam] = useState(750);
  const [hikeAbovePct, setHikeAbovePct] = useState(18);
  const [terrainFactor, setTerrainFactor] = useState(1.2);

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then((text) => {
        const points = parseGpx(text);
        const distances = cumulativeDistances(points);
        const smoothed = smoothElevation(points, 3);
        const grades = gradients(smoothed, distances);
        setTrack({
          distances,
          grades,
          distanceKm: distances[distances.length - 1] / 1000,
          gainM: elevationChange(smoothed).gain,
          profile: smoothed.map((p, i) => ({
            km: distances[i] / 1000,
            ele: p.ele,
          })),
        });
      })
      .catch((err) => console.error(err));
  }

  // Derive the plan from the parsed track + the effort inputs, so editing a
  // field recomputes without re-uploading. Cheap enough to run every render.
  const splits: Split[] = track
    ? computeSplits(
        track.distances,
        track.grades,
        parsePace(paceText),
        Math.max(1, vam),
        hikeAbovePct / 100,
        terrainFactor,
      )
    : [];
  const timeSec = splits.length ? splits[splits.length - 1].elapsedSec : 0;

  return (
    <>
      <input
        type="file"
        accept=".gpx"
        onChange={handleFile}
        className="block text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:font-medium file:text-white hover:file:bg-emerald-500"
      />

      {track && (
        <div className="mt-8 space-y-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Effort
            </h2>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-4">
              <Field label="Flat pace (min/km)">
                <input
                  value={paceText}
                  onChange={(e) => setPaceText(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <SliderField
                label="Hike VAM"
                display={`${vam} m/h`}
                value={vam}
                min={300}
                max={1200}
                step={50}
                onChange={setVam}
              />
              <SliderField
                label="Hike above"
                display={`${hikeAbovePct}%`}
                value={hikeAbovePct}
                min={5}
                max={40}
                step={1}
                onChange={setHikeAbovePct}
              />
              <SliderField
                label="Terrain factor"
                display={`×${terrainFactor.toFixed(2)}`}
                value={terrainFactor}
                min={1}
                max={1.5}
                step={0.05}
                onChange={setTerrainFactor}
              />
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart
                data={track.profile}
                margin={{ top: 5, right: 5, bottom: 0, left: -10 }}
              >
                <defs>
                  <linearGradient id="ele" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="km"
                  type="number"
                  domain={[0, "dataMax"]}
                  tickFormatter={(v: number) => v.toFixed(0)}
                  stroke="#71717a"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis
                  width={44}
                  stroke="#71717a"
                  fontSize={12}
                  tickLine={false}
                  tickFormatter={(v: number) => `${Math.round(v)}m`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#a1a1aa" }}
                  formatter={(v) => [`${Math.round(Number(v))} m`, "elevation"]}
                  labelFormatter={(v) => `km ${Number(v).toFixed(1)}`}
                />
                <Area
                  type="monotone"
                  dataKey="ele"
                  stroke="#34d399"
                  strokeWidth={2}
                  fill="url(#ele)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Distance" value={`${track.distanceKm.toFixed(2)} km`} />
            <StatCard label="Elevation gain" value={`${track.gainM.toFixed(0)} m`} />
            <StatCard label="Projected time" value={fmtClock(timeSec)} />
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-xs uppercase tracking-wider text-zinc-400">
                <th className="py-2 pr-4 text-left font-medium">km</th>
                <th className="py-2 pr-4 text-right font-medium">grade</th>
                <th className="py-2 pr-4 text-right font-medium">D+</th>
                <th className="py-2 pr-4 text-right font-medium">hike</th>
                <th className="py-2 pr-4 text-right font-medium">pace</th>
                <th className="py-2 text-right font-medium">elapsed</th>
              </tr>
            </thead>
            <tbody>
              {splits.map((s) => (
                <tr
                  key={s.km}
                  className="border-b border-zinc-800/70 tabular-nums text-zinc-200 hover:bg-zinc-900/40"
                >
                  <td className="py-1.5 pr-4">
                    {s.km}
                    {s.distanceKm < 0.95
                      ? ` (${s.distanceKm.toFixed(2)})`
                      : ""}
                  </td>
                  <td className={`py-1.5 pr-4 text-right ${gradeClass(s.grade)}`}>
                    {fmtGrade(s.grade)}
                  </td>
                  <td className="py-1.5 pr-4 text-right">{s.gainM.toFixed(0)} m</td>
                  <td className="py-1.5 pr-4 text-right">
                    {s.hikeFraction > 0 ? (
                      <span className="text-emerald-400">
                        {(s.hikeFraction * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-4 text-right">
                    {fmtPace(s.paceSecPerKm)}/km
                  </td>
                  <td className="py-1.5 text-right">{fmtClock(s.elapsedSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">Trail Pacing</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Grade-adjusted race plan from a GPX track
        </p>
        <div className="mt-6">
          <GpxUpload />
        </div>
      </div>
    </main>
  );
}

export default App;
