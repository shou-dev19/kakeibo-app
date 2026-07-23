import {
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CATEGORY_COLORS } from "../lib/categoryColors";
import { formatYen } from "../lib/format";

export interface PieDatum {
  name: string;
  value: number;
}

/** Donut chart with a currency tooltip. onSliceClick enables drilldown. */
export function CategoryPie({
  data,
  onSliceClick,
  height = 240,
  colorForName,
}: {
  data: PieDatum[];
  onSliceClick?: (name: string) => void;
  height?: number;
  colorForName?: (name: string) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="55%"
          outerRadius="85%"
          paddingAngle={1}
          onClick={
            onSliceClick
              ? (entry) => {
                  const name = (entry as unknown as PieDatum)?.name;
                  if (name) onSliceClick(name);
                }
              : undefined
          }
        >
          {data.map((datum, i) => (
            <Cell
              key={i}
              fill={colorForName?.(datum.name) ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
              cursor={onSliceClick ? "pointer" : "default"}
            />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => formatYen(v)} />
        <Legend
          verticalAlign="bottom"
          height={36}
          wrapperStyle={{ fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export interface LineDatum {
  label: string;
  value: number;
}

/** Single-series line chart (asset trend). */
export function TrendLine({
  data,
  height = 260,
}: {
  data: LineDatum[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10 }}
          minTickGap={24}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => `${Math.round(v / 10000)}万`}
          tick={{ fontSize: 10 }}
          width={40}
          tickLine={false}
        />
        <Tooltip formatter={(v: number) => formatYen(v)} />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#0d9488"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
