import { useState, useMemo, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { ProjectionPoint } from '../types';

const NOW_COLOR = '#FFB020';
const GREEN = '#22C55E';
const RED = '#EF4444';

interface ProjectionChartProps {
  curves: ProjectionPoint[][]; // 4 curves: now, 1/3, 2/3, expiry
  curveLabels: string[];
  currentCryptoPrice: number;
  cryptoSymbol: string;
  totalEntryCost: number;
}

interface ChartDataRow {
  cryptoPrice: number;
  [key: string]: number;
}

const CHART_MARGIN = { top: 20, right: 60, bottom: 50, left: 20 };
const GRID_STYLE = { strokeDasharray: '3 3', stroke: 'rgba(139, 157, 195, 0.1)' };
const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'rgba(19, 26, 42, 0.95)',
  border: '1px solid rgba(139, 157, 195, 0.3)',
  borderRadius: 8,
  padding: '10px 14px',
};
const REFERENCE_LINE_STYLE = { stroke: 'rgba(139, 157, 195, 0.5)', strokeDasharray: '5 5' };
const ACTIVE_DOT = { r: 4 };

// Line styles per curve index: [Now, 1/3, 2/3, Expiry]
const LINE_WIDTHS = [2, 1.5, 2, 2.5];
const LINE_OPACITIES = [1, 0.45, 0.7, 1];

function getTickIntervals(range: number): { major: number; minor: number } {
  if (range > 100000) return { major: 10000, minor: 1000 };
  if (range > 50000) return { major: 5000, minor: 1000 };
  if (range > 10000) return { major: 2000, minor: 500 };
  if (range > 5000) return { major: 1000, minor: 100 };
  if (range > 1000) return { major: 500, minor: 100 };
  return { major: 100, minor: 10 };
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

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
        <text y={22} textAnchor="middle" fill="#8B9DC3" fontSize={12} fontFamily="JetBrains Mono, monospace">
          ${value.toLocaleString()}
        </text>
      </g>
    );
  }

  return (
    <g transform={`translate(${x},${y})`}>
      <line y1={0} y2={4} stroke="rgba(139, 157, 195, 0.3)" strokeWidth={1} />
    </g>
  );
}

function CustomTooltipContent({
  active,
  payload,
  curveLabels,
  cryptoSymbol,
  hiddenCurves,
  currentCryptoPrice,
  totalEntryCost,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: number;
  curveLabels: string[];
  cryptoSymbol: string;
  hiddenCurves: Set<number>;
  currentCryptoPrice: number;
  totalEntryCost: number;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const cryptoPrice = payload[0]?.payload?.cryptoPrice;
  if (cryptoPrice == null) return null;

  const pricePct = ((cryptoPrice - currentCryptoPrice) / currentCryptoPrice) * 100;

  // Merge __pos / __neg keys back to base label
  const valueMap = new Map<string, number>();
  for (const entry of payload) {
    const name = entry.name as string;
    if (name && entry.value != null) {
      const baseName = name.replace(/__pos$|__neg$/, '');
      valueMap.set(baseName, entry.value);
    }
  }

  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ color: '#8B9DC3', marginBottom: 6, fontSize: 14 }}>
        {cryptoSymbol}: ${cryptoPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({formatPct(pricePct)})
      </div>
      {curveLabels.map((label, i) => {
        if (hiddenCurves.has(i)) return null;
        const pnl = valueMap.get(label);
        if (pnl == null) return null;
        const cost = pnl + totalEntryCost;
        const pnlPct = totalEntryCost > 0 ? (pnl / totalEntryCost) * 100 : 0;
        const pnlSign = pnl >= 0 ? '+' : '';
        const color = i === 0 ? NOW_COLOR : (pnl >= 0 ? GREEN : RED);
        return (
          <div key={label} style={{ color, fontSize: 13, padding: '2px 0' }}>
            {label}: {cost.toFixed(2)} / {pnlSign}{pnl.toFixed(2)} ({formatPct(pnlPct)})
          </div>
        );
      })}
    </div>
  );
}

export function ProjectionChart({
  curves,
  curveLabels,
  currentCryptoPrice,
  cryptoSymbol,
  totalEntryCost,
}: ProjectionChartProps) {
  const [hiddenCurves, setHiddenCurves] = useState<Set<number>>(new Set());

  const chartData = useMemo(() => {
    if (curves.length === 0 || curves[0].length === 0) return [];

    // First pass: split pos/neg
    const data = curves[0].map((point, i) => {
      const row: ChartDataRow = { cryptoPrice: point.cryptoPrice };
      for (let c = 0; c < curves.length; c++) {
        if (curves[c][i]) {
          const pnl = curves[c][i].pnl;
          if (c === 0) {
            row[curveLabels[c]] = pnl;
          } else {
            if (pnl >= 0) {
              row[`${curveLabels[c]}__pos`] = pnl;
            } else {
              row[`${curveLabels[c]}__neg`] = pnl;
            }
          }
        }
      }
      return row;
    });

    // Second pass: bridge sign changes with green so lines stay connected
    for (let i = 0; i < data.length - 1; i++) {
      for (let c = 1; c < curves.length; c++) {
        const posKey = `${curveLabels[c]}__pos`;
        const negKey = `${curveLabels[c]}__neg`;
        const hasPosNow = posKey in data[i];
        const hasPosNext = posKey in data[i + 1];
        const hasNegNow = negKey in data[i];
        const hasNegNext = negKey in data[i + 1];

        // Negative → positive: include the negative point in green to bridge
        if (hasNegNow && hasPosNext) {
          data[i][posKey] = data[i][negKey];
        }
        // Positive → negative: include the negative point in green to bridge
        if (hasPosNow && hasNegNext) {
          data[i + 1][posKey] = data[i + 1][negKey];
        }
      }
    }

    return data;
  }, [curves, curveLabels]);

  const { yDomain, yTicks } = useMemo(() => {
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
    const domain: [number, number] = [min - pad, max + pad];

    // Generate ~7 evenly spaced ticks, always including 0
    const range = domain[1] - domain[0];
    const rawStep = range / 6;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const nice = [1, 2, 2.5, 5, 10].find((n) => n * magnitude >= rawStep) ?? 10;
    const step = nice * magnitude;

    const ticks: number[] = [0];
    for (let v = step; v <= domain[1]; v += step) ticks.push(Math.round(v * 1000) / 1000);
    for (let v = -step; v >= domain[0]; v -= step) ticks.push(Math.round(v * 1000) / 1000);
    ticks.sort((a, b) => a - b);

    return { yDomain: domain, yTicks: ticks };
  }, [curves, hiddenCurves]);

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

  const formatYAxisCost = useCallback((v: number) => (v + totalEntryCost).toFixed(2), [totalEntryCost]);
  const formatYAxisPnl = useCallback((v: number) => v.toFixed(2), []);

  const handleLegendClick = useCallback((idx: number) => {
    setHiddenCurves((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  const renderTick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => (
      <CustomXTick {...props} majorInterval={majorInterval} minorInterval={minorInterval} />
    ),
    [majorInterval, minorInterval]
  );

  const renderTooltip = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => (
      <CustomTooltipContent
        {...props}
        curveLabels={curveLabels}
        cryptoSymbol={cryptoSymbol}
        hiddenCurves={hiddenCurves}
        currentCryptoPrice={currentCryptoPrice}
        totalEntryCost={totalEntryCost}
      />
    ),
    [curveLabels, cryptoSymbol, hiddenCurves, currentCryptoPrice, totalEntryCost]
  );

  if (chartData.length === 0) return null;

  return (
    <div>
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
          />
          <YAxis
            yAxisId="left"
            orientation="left"
            domain={yDomain}
            ticks={yTicks}
            tickFormatter={formatYAxisCost}
            stroke="#8B9DC3"
            fontSize={13}
            label={{
              value: 'Cost',
              angle: -90,
              position: 'insideLeft',
              style: { fill: '#8B9DC3', fontSize: 14 },
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={yDomain}
            ticks={yTicks}
            tickFormatter={formatYAxisPnl}
            stroke="#8B9DC3"
            fontSize={13}
            label={{
              value: 'P&L',
              angle: 90,
              position: 'insideRight',
              style: { fill: '#8B9DC3', fontSize: 14 },
            }}
          />
          <Tooltip content={renderTooltip} />
          <ReferenceLine
            yAxisId="left"
            y={0}
            stroke="rgba(139, 157, 195, 0.6)"
            strokeDasharray="3 3"
          />
          <ReferenceLine
            yAxisId="left"
            x={currentCryptoPrice}
            {...REFERENCE_LINE_STYLE}
            label={{
              value: `Spot: $${currentCryptoPrice.toLocaleString()}`,
              position: 'top',
              fill: '#8B9DC3',
              fontSize: 13,
            }}
          />

          {/* Now line: yellowish-orange, dashed */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey={curveLabels[0]}
            name={curveLabels[0]}
            stroke={NOW_COLOR}
            strokeWidth={LINE_WIDTHS[0]}
            strokeDasharray="6 3"
            dot={false}
            activeDot={ACTIVE_DOT}
            connectNulls
            hide={hiddenCurves.has(0)}
            strokeOpacity={hiddenCurves.has(0) ? 0.15 : LINE_OPACITIES[0]}
          />

          {/* 1/3, 2/3, Expiry: split into green (>=0) and red (<0) lines */}
          {[1, 2, 3].map((i) => [
            <Line
              key={`${curveLabels[i]}__pos`}
              yAxisId="left"
              type="monotone"
              dataKey={`${curveLabels[i]}__pos`}
              name={`${curveLabels[i]}__pos`}
              stroke={GREEN}
              strokeWidth={LINE_WIDTHS[i]}
              dot={false}
              activeDot={ACTIVE_DOT}
              connectNulls={false}
              hide={hiddenCurves.has(i)}
              strokeOpacity={hiddenCurves.has(i) ? 0.15 : LINE_OPACITIES[i]}
              legendType="none"
            />,
            <Line
              key={`${curveLabels[i]}__neg`}
              yAxisId="left"
              type="monotone"
              dataKey={`${curveLabels[i]}__neg`}
              name={`${curveLabels[i]}__neg`}
              stroke={RED}
              strokeWidth={LINE_WIDTHS[i]}
              dot={false}
              activeDot={ACTIVE_DOT}
              connectNulls={false}
              hide={hiddenCurves.has(i)}
              strokeOpacity={hiddenCurves.has(i) ? 0.15 : LINE_OPACITIES[i]}
              legendType="none"
            />,
          ])}
        </LineChart>
      </ResponsiveContainer>

      {/* Custom legend — fixed order */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, paddingTop: 12, flexWrap: 'wrap' }}>
        {curveLabels.map((label, i) => (
          <div
            key={label}
            onClick={() => handleLegendClick(i)}
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: hiddenCurves.has(i) ? 0.3 : 1,
            }}
          >
            {i === 0 ? (
              <div style={{ width: 16, height: 0, borderTop: `2px dashed ${NOW_COLOR}` }} />
            ) : (
              <div style={{ display: 'flex', width: 16, height: LINE_WIDTHS[i] }}>
                <div style={{ flex: 1, backgroundColor: GREEN, borderRadius: '2px 0 0 2px' }} />
                <div style={{ flex: 1, backgroundColor: RED, borderRadius: '0 2px 2px 0' }} />
              </div>
            )}
            <span style={{ color: '#8B9DC3', fontSize: 14 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
