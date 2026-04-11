import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatRate } from '../utils/formatBytes';

export default function TotalBandwidth({ clients, history, wanRates }) {
  const aggregated = useMemo(() => {
    if (!history || Object.keys(history).length === 0) return [];

    const tsSet = new Set();
    for (const pts of Object.values(history)) pts.forEach((p) => tsSet.add(p.ts));
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

  const totalRx = clients.reduce((s, c) => s + (c.rxRate || 0), 0);
  const totalTx = clients.reduce((s, c) => s + (c.txRate || 0), 0);
  const activeDevices = clients.filter((c) => (c.rxRate || 0) + (c.txRate || 0) > 1024).length;
  const wanRx = wanRates?.rxRate || 0;
  const wanTx = wanRates?.txRate || 0;
  const hasWan = wanRx > 0 || wanTx > 0;

  return (
    <div className="bg-surface-card border border-surface-border rounded-2xl p-4 overflow-hidden relative">
      {/* Subtle background glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand/5 via-transparent to-transparent pointer-events-none" />

      <div className="relative">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">LAN Traffic <span className="normal-case text-slate-600">(all devices)</span></p>
            <div className="flex items-baseline gap-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono text-rx">{formatRate(totalRx)}</span>
                <span className="text-xs text-slate-500">↓</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono text-tx">{formatRate(totalTx)}</span>
                <span className="text-xs text-slate-500">↑</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Active</p>
            <p className="text-lg font-bold text-slate-200">{activeDevices}<span className="text-xs text-slate-500 font-normal ml-1">/ {clients.length}</span></p>
          </div>
        </div>

        {/* WAN internet row */}
        <div className="flex items-center gap-3 mb-3 py-2 px-3 bg-surface-muted/20 border border-surface-border/40 rounded-xl">
          <div className="flex items-center gap-1.5 shrink-0">
            <svg className="w-3 h-3 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" strokeLinecap="round"/>
            </svg>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Internet (WAN)</span>
          </div>
          <div className="flex items-baseline gap-3 font-mono text-sm">
            <span className={hasWan ? 'text-rx' : 'text-slate-600'}>↓ {formatRate(wanRx)}</span>
            <span className={hasWan ? 'text-tx' : 'text-slate-600'}>↑ {formatRate(wanTx)}</span>
          </div>
          {!hasWan && <span className="text-[10px] text-slate-600 italic ml-auto">updating…</span>}
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={80}>
          <AreaChart data={aggregated} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="rxT" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="txT" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f472b6" stopOpacity={0.2} />
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
            <Area type="monotone" dataKey="rxRate" stroke="#22d3ee" strokeWidth={1.5} fill="url(#rxT)" dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="txRate" stroke="#f472b6" strokeWidth={1.5} fill="url(#txT)" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
