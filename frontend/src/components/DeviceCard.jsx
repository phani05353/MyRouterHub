import React from 'react';
import clsx from 'clsx';
import SparkChart from './SparkChart';
import { formatRate, formatBytes } from '../utils/formatBytes';

const TYPE_LABEL = { '0': 'Wired', '1': '2.4 GHz', '2': '5 GHz', '3': '6 GHz' };
const TYPE_COLOR = { '0': 'text-slate-400', '1': 'text-yellow-400', '2': 'text-blue-400', '3': 'text-violet-400' };

function DeviceIcon({ type }) {
  if (type === '0') {
    return (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" d="M12 18.5h.01M8.5 15.5a5 5 0 017 0M5.5 12.5a9.5 9.5 0 0113 0M2.5 9.5a14 14 0 0119 0" />
    </svg>
  );
}

export default function DeviceCard({ client, history, onClick }) {
  const totalRx = client.totalRx || 0;
  const totalTx = client.totalTx || 0;

  return (
    <button
      onClick={onClick}
      className="card w-full text-left hover:border-brand/50 transition-colors group cursor-pointer"
    >
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={clsx('shrink-0', TYPE_COLOR[client.type] || 'text-slate-400')}>
            <DeviceIcon type={client.type} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold truncate text-sm group-hover:text-brand transition-colors">
              {client.name}
            </p>
            <p className="text-xs text-slate-500 font-mono truncate">{client.ip}</p>
          </div>
        </div>

        <span className={clsx('badge shrink-0 ml-2', TYPE_COLOR[client.type] || 'text-slate-400', 'bg-surface-muted/50')}>
          {TYPE_LABEL[client.type] || 'Unknown'}
        </span>
      </div>

      {/* Bandwidth rates */}
      <div className="flex gap-4 mb-3 font-mono text-sm">
        <div>
          <span className="text-slate-500 text-xs">↓ </span>
          <span className="text-rx font-semibold">{formatRate(client.rxRate || 0)}</span>
        </div>
        <div>
          <span className="text-slate-500 text-xs">↑ </span>
          <span className="text-tx font-semibold">{formatRate(client.txRate || 0)}</span>
        </div>
      </div>

      {/* Spark chart */}
      <SparkChart data={history} />

      {/* Totals row */}
      {(totalRx > 0 || totalTx > 0) && (
        <div className="flex gap-4 mt-2 text-xs text-slate-500 font-mono">
          <span>Total ↓ {formatBytes(totalRx)}</span>
          <span>↑ {formatBytes(totalTx)}</span>
        </div>
      )}

      {/* MAC & vendor */}
      <div className="mt-2 text-xs text-slate-600 font-mono flex justify-between">
        <span>{client.mac}</span>
        {client.vendor && <span className="truncate ml-2 text-slate-500">{client.vendor}</span>}
      </div>
    </button>
  );
}
