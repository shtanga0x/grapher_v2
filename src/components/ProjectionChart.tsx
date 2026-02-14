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

// Now = orange dashed; 1/3, 2/3, expiry = gradient (set per-line via SVG gradient)
const NOW_COLOR = '#FF6B35';
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

const CHART_MARGIN = { top: 20, right: 30, bottom: 50, left: 20 };
const GRID_STYLE = { strokeDasharray: '3 3', stroke: 'rgba(139, 157, 195, 0.1)' };
const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'rgba(19, 26, 42, 0.95)',
  border: '1px solid rgba(139, 157, 195, 0.3)',
  borderRadius: 8,
  padding: '10px 14px',
};
const REFERENCE_LINE_STYLE = { stroke: 'rgba(139, 157, 195, 0.5)', strokeDasharray: '5 5' };
const ACTIVE_DOT = { r: 4 };

// Line styles: [Now, 1/3, 2/3, Expiry]
const LINE_WIDTHS = [2, 1.5, 2, 2.5];
const LINE_OPACITIES = [1, 0.45, 0.7, 1];
const LINE_DASHES = ['6 3', undefined, undefined, undefined] as const;

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

/** Custom X-axis tick */
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
          fontSize={12}
          fontFamily="JetBrains Mono, monospace"
        >
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

/** Custom tooltip with BTC % change and P&L % return */
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

  const valueMap = new Map<string, number>();
  for (const entry of payload) {
    if (entry.name && entry.value != null) {
      valueMap.set(entry.name, entry.value);
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
        const pnlPct = totalEntryCost > 0 ? (pnl / totalEntryCost) * 100 : 0;
        const color = i === 0 ? NOW_COLOR : (pnl >= 0 ? GREEN : RED);
        return (
          <div key={label} style={{ color, fontSize: 13, padding: '2px 0' }}>
            {label}: {pnl.toFixed(4)} ({formatPct(pnlPct)})
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

  // Compute where y=0 falls as fraction from top (for SVG gradient)
  const zeroOffset = useMemo(() => {
    const [yMin, yMax] = yDomain;
    if (yMax <= yMin) return 0.5;
    const offset = yMax / (yMax - yMin);
    return Math.max(0, Math.min(1, offset));
  }, [yDomain]);

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

  // Gradient id suffix and stroke per line index
  const getStroke = (i: number) => (i === 0 ? NOW_COLOR : `url(#pnlGradient)`);

  return (
    <div>
      <ResponsiveContainer width="100%" minHeight={600}>
        <LineChart data={chartData} margin={CHART_MARGIN}>
          {/* SVG gradient for green (above 0) / red (below 0) */}
          <defs>
            <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GREEN} />
              <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor={GREEN} />
              <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor={RED} />
              <stop offset="100%" stopColor={RED} />
            </linearGradient>
          </defs>
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
            domain={yDomain}
            tickFormatter={formatYAxis}
            stroke="#8B9DC3"
            fontSize={13}
            label={{
              value: 'P&L',
              angle: -90,
              position: 'insideLeft',
              style: { fill: '#8B9DC3', fontSize: 14 },
            }}
          />
          <Tooltip content={renderTooltip} />
          <ReferenceLine
            y={0}
            stroke="rgba(139, 157, 195, 0.6)"
            strokeDasharray="3 3"
            label={{
              value: '0',
              position: 'left',
              fill: '#8B9DC3',
              fontSize: 15,
              fontWeight: 'bold',
            }}
          />
          <ReferenceLine
            x={currentCryptoPrice}
            {...REFERENCE_LINE_STYLE}
            label={{
              value: `Spot: $${currentCryptoPrice.toLocaleString()}`,
              position: 'top',
              fill: '#8B9DC3',
              fontSize: 13,
            }}
          />

          {curveLabels.map((label, i) => (
            <Line
              key={label}
              type="monotone"
              dataKey={label}
              name={label}
              stroke={getStroke(i)}
              strokeWidth={LINE_WIDTHS[i]}
              strokeDasharray={LINE_DASHES[i]}
              dot={false}
              activeDot={ACTIVE_DOT}
              connectNulls
              hide={hiddenCurves.has(i)}
              strokeOpacity={hiddenCurves.has(i) ? 0.15 : LINE_OPACITIES[i]}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Custom legend — fixed order */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, paddingTop: 12, flexWrap: 'wrap' }}>
        {curveLabels.map((label, i) => {
          const legendColor = i === 0 ? NOW_COLOR : '#8B9DC3';
          return (
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
              <div
                style={{
                  width: 16,
                  height: LINE_WIDTHS[i],
                  backgroundColor: legendColor,
                  borderRadius: 2,
                  borderTop: i === 0 ? `2px dashed ${NOW_COLOR}` : undefined,
                }}
              />
              <span style={{ color: '#8B9DC3', fontSize: 14 }}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
