import React from 'react';
import clsx from 'clsx';
import SparkChart from './SparkChart';
import { formatRate, formatBytes } from '../utils/formatBytes';

const TYPE_LABEL = { '0': 'Wired', '1': '2.4 GHz', '2': '5 GHz', '3': '6 GHz' };
const TYPE_COLOR = {
  '0': 'text-slate-400 bg-slate-800/60 border-slate-700/50',
  '1': 'text-yellow-400 bg-yellow-400/10 border-yellow-500/20',
  '2': 'text-blue-400 bg-blue-400/10 border-blue-500/20',
  '3': 'text-violet-400 bg-violet-400/10 border-violet-500/20',
};
const TYPE_ICON_COLOR = {
  '0': 'text-slate-400', '1': 'text-yellow-400', '2': 'text-blue-400', '3': 'text-violet-400',
};

function DeviceIcon({ type }) {
  if (type === '0') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" d="M12 18.5h.01M8.5 15.5a5 5 0 017 0M5.5 12.5a9.5 9.5 0 0113 0M2.5 9.5a14 14 0 0119 0" />
    </svg>
  );
}

function StarIcon({ filled }) {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

export default function DeviceCard({ client, history, onClick, pinned, onTogglePin }) {
  const totalRx = client.totalRx || 0;
  const totalTx = client.totalTx || 0;
  const isActive = (client.rxRate || 0) + (client.txRate || 0) > 1024; // >1 KB/s

  return (
    <div className="relative group">
      {/* Pin button */}
      <button
        onClick={(e) => { e.stopPropagation(); onTogglePin(client.mac); }}
        className={clsx(
          'absolute top-2.5 right-2.5 z-10 p-1 rounded-md transition-all',
          pinned
            ? 'text-yellow-400 opacity-100'
            : 'text-slate-600 opacity-0 group-hover:opacity-100 hover:text-yellow-400'
        )}
        title={pinned ? 'Unpin device' : 'Pin device'}
      >
        <StarIcon filled={pinned} />
      </button>

      <button
        onClick={onClick}
        className={clsx(
          'w-full text-left rounded-xl border p-4 transition-all duration-200',
          'bg-surface-card hover:bg-surface-card/80',
          pinned
            ? 'border-yellow-500/30 shadow-[0_0_12px_rgba(234,179,8,0.08)]'
            : 'border-surface-border hover:border-brand/30 hover:shadow-[0_0_16px_rgba(59,130,246,0.08)]'
        )}
      >
        {/* Top row */}
        <div className="flex items-start justify-between mb-3 pr-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={clsx(
              'shrink-0 p-1.5 rounded-lg',
              TYPE_ICON_COLOR[client.type] || 'text-slate-400',
              'bg-surface-muted/60'
            )}>
              <DeviceIcon type={client.type} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold truncate text-sm text-slate-100 group-hover:text-brand transition-colors">
                {client.name}
              </p>
              <p className="text-xs text-slate-500 font-mono truncate">{client.ip}</p>
            </div>
          </div>

          <span className={clsx(
            'shrink-0 ml-2 text-[10px] px-2 py-0.5 rounded-full border font-medium',
            TYPE_COLOR[client.type] || TYPE_COLOR['0']
          )}>
            {TYPE_LABEL[client.type] || 'Unknown'}
          </span>
        </div>

        {/* Bandwidth rates */}
        <div className="flex gap-4 mb-3 font-mono text-sm">
          <div className="flex items-baseline gap-1">
            <span className="text-slate-500 text-xs">↓</span>
            <span className={clsx('font-semibold', isActive ? 'text-rx' : 'text-slate-400')}>
              {formatRate(client.rxRate || 0)}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-slate-500 text-xs">↑</span>
            <span className={clsx('font-semibold', isActive ? 'text-tx' : 'text-slate-400')}>
              {formatRate(client.txRate || 0)}
            </span>
          </div>
        </div>

        {/* Spark chart */}
        <SparkChart data={history} />

        {/* Totals row */}
        {(totalRx > 0 || totalTx > 0) && (
          <div className="flex gap-3 mt-2.5 text-[10px] text-slate-500 font-mono border-t border-surface-border/60 pt-2">
            <span className="flex items-center gap-1">
              <span className="text-rx/60">↓</span> {formatBytes(totalRx)}
            </span>
            <span className="flex items-center gap-1">
              <span className="text-tx/60">↑</span> {formatBytes(totalTx)}
            </span>
          </div>
        )}
      </button>
    </div>
  );
}
