import React from 'react';
import clsx from 'clsx';

export default function Header({ connected, routerConnected, routerError }) {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-surface-border bg-surface-card/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand/10 border border-brand/20">
          <svg className="w-5 h-5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight leading-none">RouterHub</h1>
          <p className="text-[10px] text-slate-500 leading-none mt-0.5">Network Monitor</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Router connection status */}
        <div className={clsx(
          'flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-colors',
          routerConnected
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-red-500/30 bg-red-500/10 text-red-400'
        )}>
          <span className={clsx(
            'w-1.5 h-1.5 rounded-full',
            routerConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
          )} />
          {routerConnected ? 'Router Online' : routerError ? 'Router Error' : 'Connecting…'}
        </div>

        {/* WS live indicator */}
        <div className={clsx(
          'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-colors',
          connected
            ? 'border-slate-600 bg-slate-800/50 text-slate-400'
            : 'border-slate-700 text-slate-600'
        )}>
          <span className={clsx('w-1.5 h-1.5 rounded-full', connected ? 'bg-slate-400' : 'bg-slate-600')} />
          {connected ? 'Live' : 'Offline'}
        </div>
      </div>
    </header>
  );
}
