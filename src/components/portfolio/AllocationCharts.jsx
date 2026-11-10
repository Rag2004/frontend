import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from 'recharts';
import { Skeleton } from '../ui/Skeleton';
import { cleanStrategyName } from './utils/formatters';

const CHART_COLORS = ['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa', '#f472b6', '#94a3b8', '#2dd4bf', '#fb923c'];

function ChartCard({ title, children, loading }) {
  return (
    <div className="pf-inst-card p-3 min-h-[200px] flex flex-col">
      <div className="pf-inst-section-title mb-2">{title}</div>
      {loading ? <Skeleton className="flex-1 min-h-[160px]" /> : (
        <div className="flex-1 min-h-[160px]">{children}</div>
      )}
    </div>
  );
}

function TreemapContent({ depth, x, y, width, height, index, name, value }) {
  if (depth < 1) return null;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={CHART_COLORS[index % CHART_COLORS.length]}
        stroke="var(--pf-border)"
        strokeWidth={1}
        rx={2}
        opacity={0.85}
      />
      {width > 48 && height > 24 && (
        <text x={x + 4} y={y + 14} fill="#e2e8f0" fontSize={10} fontFamily="monospace">
          {name?.length > 12 ? `${name.slice(0, 10)}…` : name}
        </text>
      )}
      {width > 48 && height > 36 && (
        <text x={x + 4} y={y + 28} fill="#94a3b8" fontSize={9} fontFamily="monospace">
          ₹{Math.round(value).toLocaleString('en-IN')}
        </text>
      )}
    </g>
  );
}

function buildChartData(strategies, deployable) {
  const rows = (strategies || []).map((s) => {
    const lots = Number(s.recommended_lots) || 0;
    const margin = Number(s.margin_per_lot) || 180_000;
    // Capital allocation is exact lot multiples (lots × margin), not weight × deployable.
    const capital = Number(s.allocated_capital) || lots * margin;
    const wt = (Number(s.weight_pct) || 0) / 100;
    const sharpeContrib = wt * (Number(s.sharpe) || 0);
    const riskContrib = wt * Math.abs(Number(s.max_drawdown) || Number(s.volatility) || 0);
    return {
      id: s.strategy_id,
      name: cleanStrategyName(s.strategy_id),
      symbol: s.symbol || 'OTHER',
      weight: Number(s.weight_pct) || 0,
      capital,
      lots,
      sharpeContrib,
      riskContrib,
    };
  }).filter((r) => r.lots > 0 || r.capital > 0);

  const pieData = [...rows].sort((a, b) => b.weight - a.weight);
  const top = pieData.slice(0, 8);
  const otherWt = pieData.slice(8).reduce((s, r) => s + r.weight, 0);
  const pieSlices = otherWt > 0
    ? [...top, { name: 'Other', weight: otherWt, id: '__other__' }]
    : top;

  const treemapChildren = rows.map((r) => ({
    name: r.name,
    size: Math.max(r.capital, 1),
    symbol: r.symbol,
  }));

  return {
    treemap: [{ name: 'Portfolio', children: treemapChildren }],
    pie: pieSlices.map((r) => ({ name: r.name, value: r.weight })),
    sharpe: [...rows].sort((a, b) => b.sharpeContrib - a.sharpeContrib).slice(0, 10),
    risk: [...rows].sort((a, b) => b.riskContrib - a.riskContrib).slice(0, 10),
  };
}

const tooltipStyle = {
  background: 'var(--pf-card)',
  border: '1px solid var(--pf-border)',
  borderRadius: 6,
  fontSize: 11,
  fontFamily: 'monospace',
};

export function AllocationCharts({ strategies, deployable, loading }) {
  const data = useMemo(() => buildChartData(strategies, deployable), [strategies, deployable]);

  if (!loading && !strategies?.length) {
    return (
      <div className="pf-inst-card p-6 text-center text-sm text-pf-muted">
        No allocation data to chart.
      </div>
    );
  }

  return (
    <div className="pf-inst-charts-grid" role="region" aria-label="Allocation charts">
      <ChartCard title="Capital allocation" loading={loading}>
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data.treemap}
            dataKey="size"
            stroke="var(--pf-border)"
            content={<TreemapContent />}
          />
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Weight distribution" loading={loading}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data.pie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={1}>
              {data.pie.map((entry) => (
                <Cell key={entry.name} fill={CHART_COLORS[data.pie.indexOf(entry) % CHART_COLORS.length]} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Weight']} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Sharpe contribution" loading={loading}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.sharpe} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={72} tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="sharpeContrib" fill="#38bdf8" radius={[0, 2, 2, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Risk contribution" loading={loading}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.risk} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={72} tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="riskContrib" fill="#f59e0b" radius={[0, 2, 2, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
