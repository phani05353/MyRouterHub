import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatRate } from '../utils/formatBytes';

export default function TotalBandwidth({ clients, history }) {
  // Aggregate all clients' history into a total bandwidth time series
  const aggregated = useMemo(() => {
    if (!history || Object.keys(history).length === 0) return [];

    // Collect all timestamps across all devices
    const tsSet = new Set();
    for (const pts of Object.values(history)) {
      pts.forEach((p) => tsSet.add(p.ts));
    }
    const timestamps = Array.from(tsSet).sort();

    return timestamps.map((ts) => {
      let totalRx = 0, totalTx = 0;
      for (const pts of Object.values(history)) {
        const pt = pts.find((p) => p.ts === ts);
        if (pt) { totalRx += pt.rxRate; totalTx += pt.txRate; }
      }
      return { ts, rxRate: totalRx, txRate: totalTx };
    });
  }, [history]);

  // Current totals
  const totalRx = clients.reduce((s, c) => s + (c.rxRate || 0), 0);
  const totalTx = clients.reduce((s, c) => s + (c.txRate || 0), 0);

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-sm text-slate-300">Total Network Traffic</h2>
        <div className="flex gap-4 font-mono text-sm">
          <span className="text-rx">↓ {formatRate(totalRx)}</span>
          <span className="text-tx">↑ {formatRate(totalTx)}</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={aggregated} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rxT" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="txT" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f472b6" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#f472b6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#252a38" vertical={false} />
          <XAxis hide />
          <YAxis hide domain={[0, 'auto']} />
          <Tooltip
            formatter={(v, name) => [formatRate(v), name === 'rxRate' ? '↓ Total Download' : '↑ Total Upload']}
            contentStyle={{ background: '#181c25', border: '1px solid #252a38', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#94a3b8' }}
          />
          <Area type="monotone" dataKey="rxRate" stroke="#22d3ee" strokeWidth={2} fill="url(#rxT)" dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="txRate" stroke="#f472b6" strokeWidth={2} fill="url(#txT)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
