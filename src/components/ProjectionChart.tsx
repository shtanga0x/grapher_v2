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
  curveLabels: string[]; // e.g. ["Now (168h)", "1/3 to expiry (112h)", ...]
  currentCryptoPrice: number;
  cryptoSymbol: string;
}

interface ChartDataRow {
  cryptoPrice: number;
  [key: string]: number;
}

const CHART_MARGIN = { top: 20, right: 30, bottom: 20, left: 20 };
const GRID_STYLE = { strokeDasharray: '3 3', stroke: 'rgba(139, 157, 195, 0.1)' };
const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(19, 26, 42, 0.95)',
  border: '1px solid rgba(139, 157, 195, 0.3)',
  borderRadius: 8,
};
const LEGEND_WRAPPER_STYLE = { paddingTop: 20, cursor: 'pointer' };
const REFERENCE_LINE_STYLE = { stroke: 'rgba(139, 157, 195, 0.5)', strokeDasharray: '5 5' };
const ACTIVE_DOT = { r: 4 };

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

  // Compute Y domain from visible curves
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

  // Generate major ticks (every 1000) and minor ticks (every 100)
  const { majorTicks, minorTicks } = useMemo(() => {
    if (chartData.length === 0) return { majorTicks: [], minorTicks: [] };
    const min = chartData[0].cryptoPrice;
    const max = chartData[chartData.length - 1].cryptoPrice;
    const range = max - min;

    // Determine tick intervals based on range
    let majorInterval: number;
    let minorInterval: number;
    if (range > 100000) { majorInterval = 10000; minorInterval = 1000; }
    else if (range > 50000) { majorInterval = 5000; minorInterval = 1000; }
    else if (range > 10000) { majorInterval = 1000; minorInterval = 100; }
    else if (range > 5000) { majorInterval = 500; minorInterval = 100; }
    else if (range > 1000) { majorInterval = 100; minorInterval = 10; }
    else { majorInterval = 50; minorInterval = 10; }

    const majors: number[] = [];
    const minors: number[] = [];
    const start = Math.ceil(min / minorInterval) * minorInterval;
    for (let v = start; v <= max; v += minorInterval) {
      if (v % majorInterval === 0) {
        majors.push(v);
      } else {
        minors.push(v);
      }
    }
    return { majorTicks: majors, minorTicks: minors };
  }, [chartData]);

  const formatXAxis = useCallback(
    (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    []
  );

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

  // Sort legend items to match our curveLabels order (Recharts sorts alphabetically otherwise)
  const legendSorter = useCallback((item: { value?: string }) => {
    const idx = curveLabels.indexOf(item.value || '');
    return idx >= 0 ? idx : 999;
  }, [curveLabels]);

  if (chartData.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" minHeight={600}>
      <LineChart data={chartData} margin={CHART_MARGIN}>
        <CartesianGrid {...GRID_STYLE} />
        {/* Minor ticks — small marks, no labels */}
        <XAxis
          xAxisId="minor"
          dataKey="cryptoPrice"
          ticks={minorTicks}
          tickFormatter={() => ''}
          tickSize={4}
          stroke="rgba(139, 157, 195, 0.3)"
          tickLine={{ stroke: 'rgba(139, 157, 195, 0.3)' }}
          axisLine={false}
        />
        {/* Major ticks — labeled */}
        <XAxis
          xAxisId="major"
          dataKey="cryptoPrice"
          ticks={majorTicks}
          tickFormatter={formatXAxis}
          stroke="#8B9DC3"
          fontSize={12}
          tickMargin={10}
          tickSize={8}
          label={{
            value: `${cryptoSymbol} Price`,
            position: 'insideBottom',
            offset: -10,
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
          xAxisId="major"
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
            xAxisId="major"
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
