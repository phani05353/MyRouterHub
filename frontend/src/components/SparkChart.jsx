import React from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { formatRate } from '../utils/formatBytes';

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-card border border-surface-border rounded px-2 py-1 text-xs">
      <div className="text-rx">↓ {formatRate(payload[0]?.value ?? 0)}</div>
      <div className="text-tx">↑ {formatRate(payload[1]?.value ?? 0)}</div>
    </div>
  );
};

export default function SparkChart({ data }) {
  if (!data || data.length < 2) {
    return <div className="h-12 flex items-center justify-center text-xs text-slate-600">Collecting data…</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f472b6" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#f472b6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={[0, 'auto']} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="rxRate" stroke="#22d3ee" strokeWidth={1.5} fill="url(#rxGrad)" dot={false} isAnimationActive={false} />
        <Area type="monotone" dataKey="txRate" stroke="#f472b6" strokeWidth={1.5} fill="url(#txGrad)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
