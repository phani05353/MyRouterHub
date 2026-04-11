import React from 'react';
import clsx from 'clsx';

export default function Header({ connected, routerConnected, routerError }) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-surface-card">
      <div className="flex items-center gap-3">
        {/* Logo / title */}
        <svg className="w-7 h-7 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
        <h1 className="text-xl font-bold tracking-tight">RouterHub</h1>
        <span className="text-surface-muted text-sm font-mono hidden sm:block">ASUS AX6600</span>
      </div>

      <div className="flex items-center gap-4">
        {/* Router connection status */}
        <div className="flex items-center gap-2 text-sm">
          <span
            className={clsx(
              'inline-block w-2 h-2 rounded-full',
              routerConnected ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-red-500'
            )}
          />
          <span className={routerConnected ? 'text-emerald-400' : 'text-red-400'}>
            {routerConnected ? 'Router Online' : routerError ? 'Router Error' : 'Connecting…'}
          </span>
        </div>

        {/* WS connection status */}
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span
            className={clsx(
              'inline-block w-1.5 h-1.5 rounded-full',
              connected ? 'bg-slate-400' : 'bg-slate-600'
            )}
          />
          {connected ? 'Live' : 'Offline'}
        </div>
      </div>
    </header>
  );
}
