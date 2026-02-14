import { useState, useMemo, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { ProjectionPoint } from '../types';

const CURVE_COLORS = ['#00D1FF', '#FF6B35', '#22C55E', '#A78BFA'];

interface ProjectionChartProps {
  curves: ProjectionPoint[][]; // 4 curves: now, 1/3, 2/3, expiry
  curveLabels: string[];
  currentCryptoPrice: number;
  cryptoSymbol: string;
}

interface ChartDataRow {
  cryptoPrice: number;
  [key: string]: number;
}

const CHART_MARGIN = { top: 20, right: 30, bottom: 40, left: 20 };
const GRID_STYLE = { strokeDasharray: '3 3', stroke: 'rgba(139, 157, 195, 0.1)' };
const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(19, 26, 42, 0.95)',
  border: '1px solid rgba(139, 157, 195, 0.3)',
  borderRadius: 8,
};
const LEGEND_WRAPPER_STYLE = { paddingTop: 20, cursor: 'pointer' };
const REFERENCE_LINE_STYLE = { stroke: 'rgba(139, 157, 195, 0.5)', strokeDasharray: '5 5' };
const ACTIVE_DOT = { r: 4 };

function getTickIntervals(range: number): { major: number; minor: number } {
  if (range > 100000) return { major: 10000, minor: 1000 };
  if (range > 50000) return { major: 5000, minor: 1000 };
  if (range > 10000) return { major: 2000, minor: 500 };
  if (range > 5000) return { major: 1000, minor: 100 };
  if (range > 1000) return { major: 500, minor: 100 };
  return { major: 100, minor: 10 };
}

/** Custom X-axis tick that renders major ticks with labels and minor ticks as small marks */
function CustomXTick(props: {
  x: number;
  y: number;
  payload: { value: number };
  majorInterval: number;
  minorInterval: number;
}) {
  const { x, y, payload, majorInterval } = props;
  const value = payload.value;
  const isMajor = value % majorInterval === 0;

  if (isMajor) {
    return (
      <g transform={`translate(${x},${y})`}>
        <line y1={0} y2={8} stroke="#8B9DC3" strokeWidth={1} />
        <text
          y={22}
          textAnchor="middle"
          fill="#8B9DC3"
          fontSize={11}
          fontFamily="JetBrains Mono, monospace"
        >
          ${value.toLocaleString()}
        </text>
      </g>
    );
  }

  // Minor tick — small mark only
  return (
    <g transform={`translate(${x},${y})`}>
      <line y1={0} y2={4} stroke="rgba(139, 157, 195, 0.3)" strokeWidth={1} />
    </g>
  );
}

export function ProjectionChart({
  curves,
  curveLabels,
  currentCryptoPrice,
  cryptoSymbol,
}: ProjectionChartProps) {
  const [hiddenCurves, setHiddenCurves] = useState<Set<number>>(new Set());

  const chartData = useMemo(() => {
    if (curves.length === 0 || curves[0].length === 0) return [];

    return curves[0].map((point, i) => {
      const row: ChartDataRow = { cryptoPrice: point.cryptoPrice };
      for (let c = 0; c < curves.length; c++) {
        if (curves[c][i]) {
          row[curveLabels[c]] = curves[c][i].pnl;
        }
      }
      return row;
    });
  }, [curves, curveLabels]);

  const yDomain = useMemo(() => {
    let min = 0;
    let max = 0;
    for (let c = 0; c < curves.length; c++) {
      if (hiddenCurves.has(c)) continue;
      for (const pt of curves[c]) {
        if (pt.pnl < min) min = pt.pnl;
        if (pt.pnl > max) max = pt.pnl;
      }
    }
    const pad = Math.max(0.1, (max - min) * 0.1);
    return [min - pad, max + pad];
  }, [curves, hiddenCurves]);

  // Generate all tick positions (both major and minor)
  const { allTicks, majorInterval, minorInterval, xDomain } = useMemo(() => {
    if (chartData.length === 0) return { allTicks: [], majorInterval: 1000, minorInterval: 100, xDomain: [0, 1] };
    const min = chartData[0].cryptoPrice;
    const max = chartData[chartData.length - 1].cryptoPrice;
    const range = max - min;
    const { major, minor } = getTickIntervals(range);

    const ticks: number[] = [];
    const start = Math.ceil(min / minor) * minor;
    for (let v = start; v <= max; v += minor) {
      ticks.push(v);
    }
    return { allTicks: ticks, majorInterval: major, minorInterval: minor, xDomain: [min, max] };
  }, [chartData]);

  const formatYAxis = useCallback((v: number) => v.toFixed(2), []);

  const tooltipFormatter = useCallback(
    (value: number, name: string) => [value.toFixed(4), name],
    []
  );

  const tooltipLabelFormatter = useCallback(
    (label: number) => `${cryptoSymbol}: $${label.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    [cryptoSymbol]
  );

  const handleLegendClick = useCallback((entry: { value?: string }) => {
    if (!entry.value) return;
    const idx = curveLabels.indexOf(entry.value);
    if (idx === -1) return;
    setHiddenCurves((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, [curveLabels]);

  const legendSorter = useCallback((item: { value?: string }) => {
    const idx = curveLabels.indexOf(item.value || '');
    return idx >= 0 ? idx : 999;
  }, [curveLabels]);

  // Memoize the custom tick renderer with intervals baked in
  const renderTick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => (
      <CustomXTick {...props} majorInterval={majorInterval} minorInterval={minorInterval} />
    ),
    [majorInterval, minorInterval]
  );

  if (chartData.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" minHeight={600}>
      <LineChart data={chartData} margin={CHART_MARGIN}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis
          dataKey="cryptoPrice"
          type="number"
          domain={xDomain}
          ticks={allTicks}
          tick={renderTick}
          stroke="#8B9DC3"
          tickLine={false}
          interval={0}
          label={{
            value: `${cryptoSymbol} Price`,
            position: 'insideBottom',
            offset: -30,
            style: { fill: '#8B9DC3' },
          }}
        />
        <YAxis
          domain={yDomain}
          tickFormatter={formatYAxis}
          stroke="#8B9DC3"
          fontSize={12}
          label={{
            value: 'P&L',
            angle: -90,
            position: 'insideLeft',
            style: { fill: '#8B9DC3' },
          }}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={tooltipFormatter}
          labelFormatter={tooltipLabelFormatter}
        />
        <Legend
          layout="horizontal"
          align="center"
          verticalAlign="bottom"
          wrapperStyle={LEGEND_WRAPPER_STYLE}
          onClick={handleLegendClick}
          itemSorter={legendSorter}
        />
        <ReferenceLine
          y={0}
          stroke="rgba(139, 157, 195, 0.4)"
          strokeDasharray="3 3"
        />
        <ReferenceLine
          x={currentCryptoPrice}
          {...REFERENCE_LINE_STYLE}
          label={{
            value: `Spot: $${currentCryptoPrice.toLocaleString()}`,
            position: 'top',
            fill: '#8B9DC3',
            fontSize: 12,
          }}
        />

        {curveLabels.map((label, i) => (
          <Line
            key={label}
            type="monotone"
            dataKey={label}
            name={label}
            stroke={CURVE_COLORS[i]}
            strokeWidth={i === 3 ? 3 : 2}
            strokeDasharray={i === 3 ? '6 3' : undefined}
            dot={false}
            activeDot={ACTIVE_DOT}
            connectNulls
            hide={hiddenCurves.has(i)}
            strokeOpacity={hiddenCurves.has(i) ? 0.2 : 1}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
