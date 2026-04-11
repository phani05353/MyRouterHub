import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { formatRate, formatBytes, formatShortTime } from '../utils/formatBytes';

const RANGES = [
  { label: '1h',  seconds: 3600,   bucket: 60   },
  { label: '6h',  seconds: 21600,  bucket: 300  },
  { label: '24h', seconds: 86400,  bucket: 600  },
  { label: '7d',  seconds: 604800, bucket: 3600 },
];

function HistoryChart({ mac }) {
  const [range, setRange] = useState(RANGES[0]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const now = Math.floor(Date.now() / 1000);
    const start = now - range.seconds;
    fetch(`/api/devices/${mac}/history?start=${start}&end=${now}&bucket=${range.bucket}`)
      .then((r) => r.json())
      .then((rows) => {
        if (!cancelled) setData(rows);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mac, range]);

  const formatted = data.map((d) => ({
    time: formatShortTime(d.bucket),
    rxRate: d.avgRxRate,
    txRate: d.avgTxRate,
  }));

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-400 font-medium">Usage History</span>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs rounded font-mono transition-colors ${
                range === r ? 'bg-brand text-white' : 'bg-surface-muted text-slate-400 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-600">Loading…</div>
      ) : formatted.length < 2 ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-600">
          Not enough data yet — history builds up over time.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={formatted} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="rxH" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="txH" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f472b6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#f472b6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#252a38" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tickFormatter={(v) => formatRate(v)} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={72} />
            <Tooltip
              formatter={(v, name) => [formatRate(v), name === 'rxRate' ? '↓ Download' : '↑ Upload']}
              contentStyle={{ background: '#181c25', border: '1px solid #252a38', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Legend formatter={(v) => v === 'rxRate' ? '↓ Download' : '↑ Upload'} wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="rxRate" stroke="#22d3ee" strokeWidth={2} fill="url(#rxH)" dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="txRate" stroke="#f472b6" strokeWidth={2} fill="url(#txH)" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function DeviceDetail({ client, history, onClose }) {
  if (!client) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg card z-10 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">{client.name}</h2>
            <p className="text-sm text-slate-500 font-mono">{client.mac}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-surface-muted/40 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-1">Download</p>
            <p className="text-xl font-bold text-rx font-mono">{formatRate(client.rxRate || 0)}</p>
          </div>
          <div className="bg-surface-muted/40 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-1">Upload</p>
            <p className="text-xl font-bold text-tx font-mono">{formatRate(client.txRate || 0)}</p>
          </div>
          <div className="bg-surface-muted/40 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-1">Total Downloaded</p>
            <p className="text-lg font-semibold font-mono">{formatBytes(client.totalRx || 0)}</p>
          </div>
          <div className="bg-surface-muted/40 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-1">Total Uploaded</p>
            <p className="text-lg font-semibold font-mono">{formatBytes(client.totalTx || 0)}</p>
          </div>
        </div>

        {/* Device info */}
        <div className="text-sm text-slate-400 space-y-1 mb-2">
          <div className="flex justify-between"><span>IP Address</span><span className="font-mono text-white">{client.ip || '—'}</span></div>
          {client.vendor && <div className="flex justify-between"><span>Vendor</span><span className="font-mono text-white">{client.vendor}</span></div>}
          {client.rssi && <div className="flex justify-between"><span>Signal</span><span className="font-mono text-white">{client.rssi} dBm</span></div>}
        </div>

        {/* History chart */}
        <HistoryChart mac={client.mac} />
      </div>
    </div>
  );
}
