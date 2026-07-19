import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Split out of App.tsx solely so Recharts (~500 kB of the bundle, by far the
// heaviest dependency) loads as its own async chunk via React.lazy — the page
// paints and is interactive before the chart library arrives.

// Color scale for the stroke, by grade. Thresholds echo the product language:
// green = runnable, amber shades = climbing, rose = power-hike territory
// (near the default 18% gate), blues = descent.
function gradeColor(g: number): string {
  if (g > 0.15) return "#f43f5e"; // rose-500 — hike-steep
  if (g > 0.08) return "#fb923c"; // orange-400 — hard climb
  if (g > 0.03) return "#fbbf24"; // amber-400 — climb
  if (g < -0.08) return "#38bdf8"; // sky-400 — steep descent
  if (g < -0.03) return "#7dd3fc"; // sky-300 — descent
  return "#34d399"; // emerald-400 — flat / runnable
}

export default function ElevationChart({
  profile,
  units = "metric",
}: {
  profile: { km: number; ele: number }[];
  units?: "metric" | "imperial";
}) {
  const imperial = units === "imperial";
  const eleUnit = imperial ? "ft" : "m";
  const distUnit = imperial ? "mi" : "km";
  const totalKm = profile.length
    ? profile[profile.length - 1].km - profile[0].km
    : 0;

  // Grade at each point over a ±100 m window (metric profile, BEFORE unit
  // conversion — ft/mi would skew the ratio). The window steadies the colors;
  // per-10m grades flicker between bands.
  const gradeAt = (i: number) => {
    const w = 10; // samples ≈ ±100 m on the 10 m grid
    const a = Math.max(0, i - w);
    const b = Math.min(profile.length - 1, i + w);
    const dKm = profile[b].km - profile[a].km;
    return dKm > 0 ? (profile[b].ele - profile[a].ele) / (dKm * 1000) : 0;
  };

  // Convert the data itself (not just tick labels) so axis ticks land on
  // round numbers in the displayed unit. Grade rides along for the tooltip.
  const data = profile.map((p, i) => ({
    km: imperial ? p.km / 1.609344 : p.km,
    ele: imperial ? p.ele * 3.28084 : p.ele,
    grade: gradeAt(i),
  }));

  // Grade-colored stroke: a horizontal gradient with a stop per sampled point.
  // ~150 stops keeps the SVG light even for a 7000-point resampled track.
  const step = Math.max(1, Math.floor(profile.length / 150));
  const stops: { off: number; color: string }[] = [];
  if (totalKm > 0) {
    for (let i = 0; i < profile.length; i += step) {
      stops.push({
        off: (profile[i].km - profile[0].km) / totalKm,
        color: gradeColor(data[i].grade),
      });
    }
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="ele" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradeStroke" x1="0" y1="0" x2="1" y2="0">
            {stops.map((s, i) => (
              <stop
                key={i}
                offset={`${(s.off * 100).toFixed(2)}%`}
                stopColor={s.color}
              />
            ))}
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
          width={52}
          stroke="#71717a"
          fontSize={12}
          tickLine={false}
          tickFormatter={(v: number) => `${Math.round(v)}${eleUnit}`}
        />
        <Tooltip
          contentStyle={{
            background: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "#a1a1aa" }}
          formatter={(v, _name, item) => {
            const g = (item?.payload as { grade?: number })?.grade ?? 0;
            const pct = `${g > 0 ? "+" : ""}${(g * 100).toFixed(0)}%`;
            return [`${Math.round(Number(v))} ${eleUnit} · ${pct}`, "elevation"];
          }}
          labelFormatter={(v) => `${distUnit} ${Number(v).toFixed(1)}`}
        />
        <Area
          type="monotone"
          dataKey="ele"
          stroke="url(#gradeStroke)"
          strokeWidth={2.5}
          fill="url(#ele)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
