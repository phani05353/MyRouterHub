import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { formatRate, formatBytes, formatShortTime, formatDate } from '../utils/formatBytes';

const RATE_RANGES = [
  { label: '1h',  seconds: 3600,   bucket: 60,    dateFormat: 'time' },
  { label: '6h',  seconds: 21600,  bucket: 300,   dateFormat: 'time' },
  { label: '24h', seconds: 86400,  bucket: 600,   dateFormat: 'time' },
  { label: '7d',  seconds: 604800, bucket: 3600,  dateFormat: 'time' },
];

const DAILY_RANGES = [
  { label: '7d',  days: 7  },
  { label: '30d', days: 30 },
];

const TOOLTIP_STYLE = {
  background: '#181c25',
  border: '1px solid #252a38',
  borderRadius: 8,
  fontSize: 12,
};

function RangeButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded-lg font-mono transition-colors ${
        active
          ? 'bg-brand text-white shadow-[0_0_8px_rgba(59,130,246,0.3)]'
          : 'bg-surface-muted/60 text-slate-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

function RateChart({ mac }) {
  const [range, setRange] = useState(RATE_RANGES[0]);
  const [data, setData]   = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const now = Math.floor(Date.now() / 1000);
    const start = now - range.seconds;
    fetch(`/api/devices/${mac}/history?start=${start}&end=${now}&bucket=${range.bucket}`)
      .then((r) => r.json())
      .then((rows) => { if (!cancelled) setData(rows); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mac, range]);

  const formatted = data.map((d) => ({
    time: formatShortTime(d.bucket),
    rxRate: d.avgRxRate,
    txRate: d.avgTxRate,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bandwidth Rate</span>
        <div className="flex gap-1">
          {RATE_RANGES.map((r) => (
            <RangeButton key={r.label} label={r.label} active={range === r} onClick={() => setRange(r)} />
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-36 flex items-center justify-center text-xs text-slate-600">Loading…</div>
      ) : formatted.length < 2 ? (
        <div className="h-36 flex items-center justify-center text-xs text-slate-600">
          Not enough data yet — history builds up over time.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={144}>
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
            <CartesianGrid strokeDasharray="3 3" stroke="#252a38" vertical={false} />
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tickFormatter={(v) => formatRate(v)} tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} width={68} />
            <Tooltip
              formatter={(v, name) => [formatRate(v), name === 'rxRate' ? '↓ Download' : '↑ Upload']}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Legend formatter={(v) => v === 'rxRate' ? '↓ Download' : '↑ Upload'} wrapperStyle={{ fontSize: 10 }} />
            <Area type="monotone" dataKey="rxRate" stroke="#22d3ee" strokeWidth={1.5} fill="url(#rxH)" dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="txRate" stroke="#f472b6" strokeWidth={1.5} fill="url(#txH)" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function DailyChart({ mac }) {
  const [range, setRange] = useState(DAILY_RANGES[0]);
  const [data, setData]   = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/devices/${mac}/daily?days=${range.days}`)
      .then((r) => r.json())
      .then((rows) => {
        if (cancelled) return;
        // rxBytes/txBytes = SUM(rate) * 60s per sample — convert to MB
        const formatted = rows.map((d) => ({
          date: formatDate(d.day),
          rxMB: parseFloat((d.rxBytes / (1024 * 1024)).toFixed(1)),
          txMB: parseFloat((d.txBytes / (1024 * 1024)).toFixed(1)),
        }));
        setData(formatted);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mac, range]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Daily Usage (MB)</span>
        <div className="flex gap-1">
          {DAILY_RANGES.map((r) => (
            <RangeButton key={r.label} label={r.label} active={range === r} onClick={() => setRange(r)} />
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-36 flex items-center justify-center text-xs text-slate-600">Loading…</div>
      ) : data.length < 2 ? (
        <div className="h-36 flex items-center justify-center text-xs text-slate-600">
          Not enough data yet — needs at least 2 days of history.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={144}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#252a38" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} unit=" MB" />
            <Tooltip
              formatter={(v, name) => [`${v} MB`, name === 'rxMB' ? '↓ Download' : '↑ Upload']}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Legend formatter={(v) => v === 'rxMB' ? '↓ Download' : '↑ Upload'} wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="rxMB" fill="#22d3ee" fillOpacity={0.8} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="txMB" fill="#f472b6" fillOpacity={0.8} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function DeviceDetail({ client, history, onClose }) {
  if (!client) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full sm:max-w-xl bg-surface-card border border-surface-border rounded-t-2xl sm:rounded-2xl z-10 max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Drag handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-surface-muted" />
        </div>

        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {client.connectionType === 'wired'
                    ? <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4" strokeLinecap="round"/></>
                    : <path strokeLinecap="round" d="M12 18.5h.01M8.5 15.5a5 5 0 017 0M5.5 12.5a9.5 9.5 0 0113 0M2.5 9.5a14 14 0 0119 0"/>
                  }
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">{client.name}</h2>
                <p className="text-xs text-slate-500 font-mono">{client.mac}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1 mt-0.5">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Live stats */}
          <div className="grid grid-cols-2 gap-2.5 mb-5">
            <div className="bg-rx/5 border border-rx/15 rounded-xl p-3">
              <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Download</p>
              <p className="text-xl font-bold text-rx font-mono">{formatRate(client.rxRate || 0)}</p>
            </div>
            <div className="bg-tx/5 border border-tx/15 rounded-xl p-3">
              <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Upload</p>
              <p className="text-xl font-bold text-tx font-mono">{formatRate(client.txRate || 0)}</p>
            </div>
            <div className="bg-surface-muted/30 border border-surface-border/60 rounded-xl p-3">
              <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Total Downloaded</p>
              <p className="text-base font-semibold font-mono text-slate-200">{formatBytes(client.totalRx || 0)}</p>
            </div>
            <div className="bg-surface-muted/30 border border-surface-border/60 rounded-xl p-3">
              <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Total Uploaded</p>
              <p className="text-base font-semibold font-mono text-slate-200">{formatBytes(client.totalTx || 0)}</p>
            </div>
          </div>

          {/* Device info */}
          <div className="bg-surface-muted/20 border border-surface-border/60 rounded-xl p-3 mb-5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">IP Address</span>
              <span className="font-mono text-slate-200">{client.ip || '—'}</span>
            </div>
            {client.vendor && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Vendor</span>
                <span className="font-mono text-slate-200">{client.vendor}</span>
              </div>
            )}
            {client.rssi && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Signal</span>
                <span className="font-mono text-slate-200">{client.rssi} dBm</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Connection</span>
              <span className="font-mono text-slate-200">
                {{ wired: 'Wired', wifi: 'Wi-Fi', mesh: 'Mesh' }[client.connectionType] || 'Wired'}
              </span>
            </div>
          </div>

          {/* Rate history chart */}
          <div className="mb-5">
            <RateChart mac={client.mac} />
          </div>

          {/* Daily usage chart */}
          <div>
            <DailyChart mac={client.mac} />
          </div>
        </div>
      </div>
    </div>
  );
}
