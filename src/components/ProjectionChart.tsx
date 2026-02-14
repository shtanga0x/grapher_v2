import { useMemo, useCallback } from 'react';
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
const CURVE_LABELS = ['Now', '1/3 to expiry', '2/3 to expiry', 'At expiry'];

interface ProjectionChartProps {
  curves: ProjectionPoint[][]; // 4 curves: now, 1/3, 2/3, expiry
  currentCryptoPrice: number;
  numStrikes: number;
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
const LEGEND_WRAPPER_STYLE = { paddingTop: 20 };
const REFERENCE_LINE_STYLE = { stroke: 'rgba(139, 157, 195, 0.5)', strokeDasharray: '5 5' };
const ACTIVE_DOT = { r: 4 };

export function ProjectionChart({
  curves,
  currentCryptoPrice,
  numStrikes,
  cryptoSymbol,
}: ProjectionChartProps) {
  // Build unified chart data: each row has cryptoPrice + one key per curve
  const chartData = useMemo(() => {
    if (curves.length === 0 || curves[0].length === 0) return [];

    const data: ChartDataRow[] = curves[0].map((point, i) => {
      const row: ChartDataRow = { cryptoPrice: point.cryptoPrice };
      for (let c = 0; c < curves.length; c++) {
        if (curves[c][i]) {
          row[CURVE_LABELS[c]] = curves[c][i].constructionCost;
        }
      }
      return row;
    });

    return data;
  }, [curves]);

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
    (label: number) => `${cryptoSymbol} Price: $${label.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    [cryptoSymbol]
  );

  if (chartData.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" minHeight={600}>
      <LineChart data={chartData} margin={CHART_MARGIN}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis
          dataKey="cryptoPrice"
          tickFormatter={formatXAxis}
          stroke="#8B9DC3"
          fontSize={12}
          tickMargin={10}
          label={{
            value: `${cryptoSymbol} Price`,
            position: 'insideBottom',
            offset: -10,
            style: { fill: '#8B9DC3' },
          }}
        />
        <YAxis
          domain={[0, numStrikes]}
          tickFormatter={formatYAxis}
          stroke="#8B9DC3"
          fontSize={12}
          label={{
            value: 'Construction Cost',
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
        />
        <ReferenceLine
          x={currentCryptoPrice}
          {...REFERENCE_LINE_STYLE}
          label={{
            value: `Current: $${currentCryptoPrice.toLocaleString()}`,
            position: 'top',
            fill: '#8B9DC3',
            fontSize: 12,
          }}
        />

        {CURVE_LABELS.map((label, i) => (
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
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
