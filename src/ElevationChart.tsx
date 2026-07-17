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
export default function ElevationChart({
  profile,
  units = "metric",
}: {
  profile: { km: number; ele: number }[];
  units?: "metric" | "imperial";
}) {
  const imperial = units === "imperial";
  // Convert the data itself (not just tick labels) so axis ticks land on
  // round numbers in the displayed unit.
  const data = imperial
    ? profile.map((p) => ({ km: p.km / 1.609344, ele: p.ele * 3.28084 }))
    : profile;
  const eleUnit = imperial ? "ft" : "m";
  const distUnit = imperial ? "mi" : "km";
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
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
          formatter={(v) => [`${Math.round(Number(v))} ${eleUnit}`, "elevation"]}
          labelFormatter={(v) => `${distUnit} ${Number(v).toFixed(1)}`}
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
  );
}
